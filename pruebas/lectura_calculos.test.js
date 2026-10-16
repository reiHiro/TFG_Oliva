// Pruebas de extension/lectura_calculos.js, sin librerías.
// Se corren desde la carpeta del proyecto con:
//   node --test pruebas/

const { test } = require('node:test');
const assert = require('node:assert/strict');
const calculos = require('../extension/lectura_calculos.js');

// ---------------------------------------------------------------------
// Foco de línea
// ---------------------------------------------------------------------

test('altoDeLinea: usa el line-height en píxeles', () => {
  assert.equal(calculos.altoDeLinea('27px', '18px'), 27);
});

test('altoDeLinea: "normal" es 1,2 veces la letra', () => {
  assert.equal(calculos.altoDeLinea('normal', '20px'), 24);
});

test('altoDeLinea: sin datos usa el valor por defecto', () => {
  assert.equal(calculos.altoDeLinea('', ''), calculos.ALTO_LINEA_POR_DEFECTO);
  assert.equal(calculos.altoDeLinea(undefined, undefined), calculos.ALTO_LINEA_POR_DEFECTO);
});

test('altoDeLinea: queda entre 12 y 96 píxeles', () => {
  assert.equal(calculos.altoDeLinea('2px', '2px'), 12);
  assert.equal(calculos.altoDeLinea('400px', '16px'), 96);
});

test('calcularFranja: centrada en el puntero', () => {
  assert.deepEqual(
    calculos.calcularFranja({ centroY: 300, lineas: 3, altoLinea: 20, altoVentana: 800 }),
    { arriba: 270, alto: 60 },
  );
});

test('calcularFranja: 1 y 5 líneas', () => {
  assert.equal(calculos.calcularFranja({ centroY: 300, lineas: 1, altoLinea: 24, altoVentana: 800 }).alto, 24);
  assert.equal(calculos.calcularFranja({ centroY: 300, lineas: 5, altoLinea: 24, altoVentana: 800 }).alto, 120);
});

test('calcularFranja: no se sale por arriba ni por abajo', () => {
  assert.deepEqual(
    calculos.calcularFranja({ centroY: 5, lineas: 3, altoLinea: 20, altoVentana: 800 }),
    { arriba: 0, alto: 60 },
  );
  assert.deepEqual(
    calculos.calcularFranja({ centroY: 799, lineas: 3, altoLinea: 20, altoVentana: 800 }),
    { arriba: 740, alto: 60 },
  );
});

test('calcularFranja: más alta que la ventana ocupa la ventana', () => {
  assert.deepEqual(
    calculos.calcularFranja({ centroY: 100, lineas: 5, altoLinea: 96, altoVentana: 300 }),
    { arriba: 0, alto: 300 },
  );
});

test('moverFranja: una línea por flecha, sin salir de la ventana', () => {
  assert.equal(calculos.moverFranja({ centroY: 300, direccion: 1, altoLinea: 24, altoVentana: 800 }), 324);
  assert.equal(calculos.moverFranja({ centroY: 300, direccion: -1, altoLinea: 24, altoVentana: 800 }), 276);
  assert.equal(calculos.moverFranja({ centroY: 10, direccion: -1, altoLinea: 24, altoVentana: 800 }), 0);
  assert.equal(calculos.moverFranja({ centroY: 790, direccion: 1, altoLinea: 24, altoVentana: 800 }), 800);
});

// ---------------------------------------------------------------------
// Lectura en voz alta y resaltado de la palabra leída
// ---------------------------------------------------------------------

// Lleva una palabra del boundary hasta { trozo, desplazamiento } de inicio
// y de fin (fin incluido), como lo hace content_script.js con los nodos.
function ubicarPalabra(origen, fragmento, charIndex, charLength) {
  const palabra = calculos.palabraEnPosicion(fragmento.texto, charIndex, charLength);
  const enOrigen = palabra && calculos.rangoEnOrigen(fragmento.origen, palabra.inicio, palabra.fin);
  if (!enOrigen) return null;
  return {
    desde: calculos.ubicarEnTrozos(origen, enOrigen.inicio),
    hasta: calculos.ubicarEnTrozos(origen, enOrigen.fin - 1),
    texto: origen.texto.slice(enOrigen.inicio, enOrigen.fin),
  };
}

test('armarTextoOrigen y ubicarEnTrozos: posición en cada trozo', () => {
  const origen = calculos.armarTextoOrigen(['Hola ', 'mun', 'do', '\n', 'Fin']);
  assert.equal(origen.texto, 'Hola mundo\nFin');
  assert.deepEqual(origen.inicios, [0, 5, 8, 10, 11]);
  assert.deepEqual(calculos.ubicarEnTrozos(origen, 0), { trozo: 0, desplazamiento: 0 });
  assert.deepEqual(calculos.ubicarEnTrozos(origen, 6), { trozo: 1, desplazamiento: 1 });
  assert.deepEqual(calculos.ubicarEnTrozos(origen, 9), { trozo: 2, desplazamiento: 1 });
  assert.deepEqual(calculos.ubicarEnTrozos(origen, 13), { trozo: 4, desplazamiento: 2 });
  assert.equal(calculos.ubicarEnTrozos(origen, 14), null);
  assert.equal(calculos.ubicarEnTrozos(origen, -1), null);
});

test('ubicarEnTrozos: saltea los trozos vacíos', () => {
  const origen = calculos.armarTextoOrigen(['ab', '', '', 'cd']);
  assert.deepEqual(calculos.ubicarEnTrozos(origen, 2), { trozo: 3, desplazamiento: 0 });
});

test('dividirEnFragmentos: une espacios y guarda de dónde sale cada carácter', () => {
  const fragmentos = calculos.dividirEnFragmentos('  Hola   mundo. ');
  assert.equal(fragmentos.length, 1);
  assert.equal(fragmentos[0].texto, 'Hola mundo.');
  assert.deepEqual(fragmentos[0].origen, [2, 3, 4, 5, -1, 9, 10, 11, 12, 13, 14]);
});

test('dividirEnFragmentos: junta oraciones hasta el largo máximo', () => {
  const textos = calculos.dividirEnFragmentos('Uno dos. Tres cuatro. Cinco.', 20).map((f) => f.texto);
  assert.deepEqual(textos, ['Uno dos.', 'Tres cuatro. Cinco.']);
});

test('dividirEnFragmentos: un salto de línea corta la oración', () => {
  const textos = calculos.dividirEnFragmentos('Título\nPrimer párrafo', 10).map((f) => f.texto);
  assert.deepEqual(textos, ['Título', 'Primer', 'párrafo']);
});

test('dividirEnFragmentos: una oración más larga que el máximo se corta por palabras', () => {
  const fragmentos = calculos.dividirEnFragmentos('aaaa bbbb cccc dddd', 9);
  assert.deepEqual(fragmentos.map((f) => f.texto), ['aaaa bbbb', 'cccc dddd']);
  assert.equal(fragmentos[1].origen[0], 10);
});

test('dividirEnFragmentos: con el largo por defecto ningún fragmento pasa de 200', () => {
  const texto = Array.from({ length: 60 }, (_, i) => `Oración número ${i} del texto.`).join(' ');
  const fragmentos = calculos.dividirEnFragmentos(texto);
  assert.ok(fragmentos.length > 1);
  for (const fragmento of fragmentos) {
    assert.ok(fragmento.texto.length <= calculos.LARGO_FRAGMENTO);
    assert.equal(fragmento.origen.length, fragmento.texto.length);
  }
});

test('dividirEnFragmentos: texto vacío o solo espacios no da fragmentos', () => {
  assert.deepEqual(calculos.dividirEnFragmentos(''), []);
  assert.deepEqual(calculos.dividirEnFragmentos(' \n\t '), []);
});

test('palabraEnPosicion: con charLength', () => {
  assert.deepEqual(calculos.palabraEnPosicion('Hola mundo', 5, 5), { inicio: 5, fin: 10 });
});

test('palabraEnPosicion: sin charLength llega hasta el próximo espacio', () => {
  assert.deepEqual(calculos.palabraEnPosicion('Hola mundo lindo', 5, undefined), { inicio: 5, fin: 10 });
  assert.deepEqual(calculos.palabraEnPosicion('Hola mundo lindo', 5, 0), { inicio: 5, fin: 10 });
});

test('palabraEnPosicion: en un espacio toma la palabra siguiente', () => {
  assert.deepEqual(calculos.palabraEnPosicion('Hola mundo', 4, 1), { inicio: 5, fin: 10 });
});

test('palabraEnPosicion: posiciones inválidas dan null', () => {
  assert.equal(calculos.palabraEnPosicion('Hola', 4, 1), null);
  assert.equal(calculos.palabraEnPosicion('Hola', -1, 1), null);
  assert.equal(calculos.palabraEnPosicion('Hola', undefined, 1), null);
  assert.equal(calculos.palabraEnPosicion('Hola   ', 4, 1), null);
});

test('rangoEnOrigen: no cuenta los espacios que unen palabras', () => {
  const origen = [2, 3, -1, 9, 10];
  assert.deepEqual(calculos.rangoEnOrigen(origen, 0, 2), { inicio: 2, fin: 4 });
  assert.deepEqual(calculos.rangoEnOrigen(origen, 2, 5), { inicio: 9, fin: 11 });
  assert.equal(calculos.rangoEnOrigen(origen, 2, 3), null);
});

test('de punta a punta: palabra repartida en dos nodos ("mari" + "posas")', () => {
  const origen = calculos.armarTextoOrigen(['Las ', 'mari', 'posas', ' vuelan.', '\n', 'Fin.']);
  const [fragmento] = calculos.dividirEnFragmentos(origen.texto);
  assert.equal(fragmento.texto, 'Las mariposas vuelan. Fin.');
  const ubicada = ubicarPalabra(origen, fragmento, 4, 9);
  assert.equal(ubicada.texto, 'mariposas');
  assert.deepEqual(ubicada.desde, { trozo: 1, desplazamiento: 0 });
  assert.deepEqual(ubicada.hasta, { trozo: 2, desplazamiento: 4 });
});

test('de punta a punta: palabra repartida en tres nodos y sin charLength', () => {
  const origen = calculos.armarTextoOrigen(['El ', 'f', 'oto', 'n', ' brilla']);
  const [fragmento] = calculos.dividirEnFragmentos(origen.texto);
  const ubicada = ubicarPalabra(origen, fragmento, 3, undefined);
  assert.equal(ubicada.texto, 'foton');
  assert.deepEqual(ubicada.desde, { trozo: 1, desplazamiento: 0 });
  assert.deepEqual(ubicada.hasta, { trozo: 3, desplazamiento: 0 });
});

test('de punta a punta: después del salto entre bloques y en el segundo fragmento', () => {
  const origen = calculos.armarTextoOrigen(['Primero dos.', '\n', '  Tercero   cuarto.']);
  const fragmentos = calculos.dividirEnFragmentos(origen.texto, 12);
  assert.deepEqual(fragmentos.map((f) => f.texto), ['Primero dos.', 'Tercero', 'cuarto.']);
  const ubicada = ubicarPalabra(origen, fragmentos[2], 0, 6);
  assert.equal(ubicada.texto, 'cuarto');
  assert.deepEqual(ubicada.desde, { trozo: 2, desplazamiento: 12 });
});
