// Cálculos puros de los apoyos de lectura (HU-005): no tocan el DOM ni la
// página, así que se prueban con Node (pruebas/lectura_calculos.test.js).
// En la extensión el manifest carga este archivo antes que content_script.js
// y queda en globalThis.ApoyosLectura, dentro del espacio de la extensión
// (la página no lo ve). En Node se exporta con module.exports.

(function (global) {
  const limitar = (valor, minimo, maximo) => Math.min(Math.max(valor, minimo), maximo);

  // ---------------------------------------------------------------------
  // Foco de línea
  // ---------------------------------------------------------------------

  const ALTO_LINEA_POR_DEFECTO = 24;
  const ALTO_LINEA_MINIMO = 12;
  const ALTO_LINEA_MAXIMO = 96;

  // Alto de una línea en píxeles a partir del line-height y el font-size
  // calculados (getComputedStyle: "27px", "normal"...). "normal" es más o
  // menos 1,2 veces la letra. Si no se entiende, el valor por defecto.
  function altoDeLinea(lineHeight, fontSize) {
    let alto = parseFloat(lineHeight);
    if (!(alto > 0)) {
      const letra = parseFloat(fontSize);
      alto = letra > 0 ? letra * 1.2 : ALTO_LINEA_POR_DEFECTO;
    }
    return limitar(alto, ALTO_LINEA_MINIMO, ALTO_LINEA_MAXIMO);
  }

  // La franja visible: { arriba, alto } en píxeles desde el borde superior
  // de la ventana, centrada en centroY y sin salirse de la ventana.
  function calcularFranja({ centroY, lineas, altoLinea, altoVentana }) {
    const alto = Math.min(Math.round(Math.max(1, lineas) * altoLinea), Math.max(0, altoVentana));
    const arriba = Math.round(limitar(centroY - alto / 2, 0, altoVentana - alto));
    return { arriba, alto };
  }

  // Nuevo centro después de mover la franja una línea con las flechas
  // (direccion: -1 sube, 1 baja). No sale de la ventana.
  function moverFranja({ centroY, direccion, altoLinea, altoVentana }) {
    return limitar(centroY + Math.sign(direccion) * altoLinea, 0, altoVentana);
  }

  // ---------------------------------------------------------------------
  // Lectura en voz alta y resaltado de la palabra leída
  // El texto que se lee se arma con los nodos de texto de la página, uno
  // por trozo, más un salto de línea entre bloques (texto de origen). Cada
  // fragmento que se manda a la voz guarda, para cada uno de sus caracteres,
  // de qué posición del texto de origen salió: así la posición que avisa el
  // evento boundary se puede llevar de vuelta a un nodo de la página.
  // ---------------------------------------------------------------------

  // Chrome corta los enunciados largos a los ~15 s, así que el texto se
  // divide en fragmentos cortos que se encolan uno detrás de otro.
  const LARGO_FRAGMENTO = 200;
  const FIN_DE_ORACION = /[.!?;:]$/;

  // Une los trozos en un solo texto; inicios[i] es dónde empieza el trozo i.
  function armarTextoOrigen(trozos) {
    const inicios = [];
    let largo = 0;
    for (const trozo of trozos) {
      inicios.push(largo);
      largo += trozo.length;
    }
    return { texto: trozos.join(''), inicios };
  }

  // { trozo, desplazamiento } del carácter "indice" del texto de origen, o
  // null si está fuera. Los trozos vacíos no se eligen nunca.
  function ubicarEnTrozos({ texto, inicios }, indice) {
    if (!Number.isInteger(indice) || indice < 0 || indice >= texto.length) return null;
    let bajo = 0;
    let alto = inicios.length - 1;
    while (bajo < alto) {
      const medio = (bajo + alto + 1) >> 1;
      if (inicios[medio] <= indice) bajo = medio;
      else alto = medio - 1;
    }
    return { trozo: bajo, desplazamiento: indice - inicios[bajo] };
  }

  // Fragmentos para la voz: [{ texto, origen }]. Se corta en oraciones (después
  // de . ! ? ; : o en un salto de línea) que se juntan hasta LARGO_FRAGMENTO
  // caracteres; una oración más larga se corta por palabras. Los espacios
  // seguidos quedan en uno. origen[i] es la posición en el texto de origen del
  // carácter i del fragmento, o -1 en los espacios que unen palabras.
  function dividirEnFragmentos(texto, largo = LARGO_FRAGMENTO) {
    const oraciones = [];
    let oracion = [];
    let finAnterior = 0;
    for (const coincidencia of texto.matchAll(/\S+/g)) {
      const ultima = oracion[oracion.length - 1];
      const separacion = texto.slice(finAnterior, coincidencia.index);
      if (ultima && (separacion.includes('\n') || FIN_DE_ORACION.test(ultima.texto))) {
        oraciones.push(oracion);
        oracion = [];
      }
      oracion.push({ texto: coincidencia[0], inicio: coincidencia.index });
      finAnterior = coincidencia.index + coincidencia[0].length;
    }
    if (oracion.length > 0) oraciones.push(oracion);

    const largoDe = (palabras) => palabras.reduce((suma, palabra) => suma + palabra.texto.length, 0) + palabras.length - 1;
    const grupos = [];
    let actual = [];
    let largoActual = 0;
    const agregar = (palabras, largoPalabras) => {
      if (actual.length > 0 && largoActual + 1 + largoPalabras > largo) {
        grupos.push(actual);
        actual = [];
        largoActual = 0;
      }
      largoActual += (actual.length > 0 ? 1 : 0) + largoPalabras;
      actual.push(...palabras);
    };
    for (const palabras of oraciones) {
      const largoOracion = largoDe(palabras);
      if (largoOracion <= largo) {
        agregar(palabras, largoOracion);
      } else {
        for (const palabra of palabras) agregar([palabra], palabra.texto.length); // oración muy larga: por palabras
      }
    }
    if (actual.length > 0) grupos.push(actual);

    return grupos.map((palabras) => {
      const origen = [];
      palabras.forEach((palabra, indice) => {
        if (indice > 0) origen.push(-1);
        for (let i = 0; i < palabra.texto.length; i++) origen.push(palabra.inicio + i);
      });
      return { texto: palabras.map((palabra) => palabra.texto).join(' '), origen };
    });
  }

  // La palabra que avisa el evento boundary dentro del texto del fragmento:
  // { inicio, fin } (fin no incluido) o null. Si la voz no manda charLength
  // (o manda 0), la palabra llega hasta el próximo espacio. Si charIndex cae
  // en un espacio, se toma la palabra siguiente.
  function palabraEnPosicion(texto, charIndex, charLength) {
    if (!Number.isInteger(charIndex) || charIndex < 0 || charIndex >= texto.length) return null;
    let inicio = charIndex;
    while (inicio < texto.length && /\s/.test(texto[inicio])) inicio++;
    if (inicio >= texto.length) return null;
    let fin;
    if (Number.isInteger(charLength) && charLength > 0 && inicio === charIndex) {
      fin = Math.min(texto.length, inicio + charLength);
    } else {
      fin = inicio;
      while (fin < texto.length && !/\s/.test(texto[fin])) fin++;
    }
    return { inicio, fin };
  }

  // Lleva [inicio, fin) del fragmento al texto de origen: { inicio, fin } o
  // null. Los espacios que unen palabras (-1) de las puntas no cuentan.
  function rangoEnOrigen(origen, inicio, fin) {
    while (inicio < fin && !(origen[inicio] >= 0)) inicio++;
    while (fin > inicio && !(origen[fin - 1] >= 0)) fin--;
    if (inicio >= fin) return null;
    return { inicio: origen[inicio], fin: origen[fin - 1] + 1 };
  }

  const api = {
    ALTO_LINEA_POR_DEFECTO,
    altoDeLinea,
    calcularFranja,
    moverFranja,
    LARGO_FRAGMENTO,
    armarTextoOrigen,
    ubicarEnTrozos,
    dividirEnFragmentos,
    palabraEnPosicion,
    rangoEnOrigen,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    global.ApoyosLectura = api;
  }
})(globalThis);
