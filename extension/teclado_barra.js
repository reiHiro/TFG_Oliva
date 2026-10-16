// Las teclas que se escriben en un campo de la barra (la explicación, el
// minuto a mano, los controles de Modo lectura...) no tienen que llegar a la
// página: un reproductor de video las tomaría como atajos (espacio pausa,
// "k", "f", "m", flechas y números lo controlan).
// content_script.js corta la subida del evento en la raíz de la barra (fase
// de burbuja), pero eso no alcanza si la página escucha en fase de captura,
// que corre antes de que el evento entre a la barra. Este script corre en
// document_start, antes que cualquier script de la página, así que su
// listener en captura sobre window es el primero de todos.
// Cuando el evento nace en un campo de la barra:
//   - corta el evento original para todos (stopImmediatePropagation): ni la
//     página ni nada más lo ve. No llama a preventDefault, así que escribir,
//     el dictado, los métodos de entrada y los lectores de pantalla siguen
//     igual (beforeinput, input y composition son eventos aparte).
//   - les reenvía una copia al campo, que no sale del Shadow DOM (composed:
//     false), para que los manejadores propios de la barra (Escape cierra el
//     panel, Enter en el minuto a mano...) corran igual. Si alguno cancela la
//     copia, se cancela también el original.
// Qué es un campo de la barra lo decide content_script.js (campoDeLaBarra),
// que comparte el espacio global de la extensión con este script; la página
// no lo ve. Mientras no haya barra, no hace nada.
// Solo en la página principal: la barra no existe dentro de los iframes.
// Segundo uso, el foco de línea (HU-005): mientras está activo, las flechas
// arriba y abajo mueven la franja y no le llegan a la página (no hacen
// scroll ni mueven un video). Por ser el primer listener también le gana a
// los reproductores que escuchan en captura. Si la tecla es para la franja
// lo decide content_script.js (teclaDeLaFranja), que la mueve; con la opción
// apagada contesta que no y la tecla sigue como siempre.

(() => {
  const CAMPO_DE_LA_BARRA = Symbol.for('apoyos-educativos.campoDeLaBarra');
  const TECLA_DE_LA_FRANJA = Symbol.for('apoyos-educativos.teclaDeLaFranja');

  // Devuelve true si el evento era de un campo de la barra (y ya lo atendió).
  const reenviarALaBarra = (evento) => {
    const campoDeLaBarra = globalThis[CAMPO_DE_LA_BARRA];
    if (typeof campoDeLaBarra !== 'function') return false;
    const campo = campoDeLaBarra(evento);
    if (!campo) return false;

    evento.stopImmediatePropagation();
    const copia = new KeyboardEvent(evento.type, {
      key: evento.key,
      code: evento.code,
      location: evento.location,
      repeat: evento.repeat,
      isComposing: evento.isComposing,
      ctrlKey: evento.ctrlKey,
      shiftKey: evento.shiftKey,
      altKey: evento.altKey,
      metaKey: evento.metaKey,
      bubbles: true,
      cancelable: true,
      composed: false,
    });
    campo.dispatchEvent(copia);
    if (copia.defaultPrevented) evento.preventDefault();
    return true;
  };

  const alPresionarTecla = (evento) => {
    if (!evento.isTrusted || reenviarALaBarra(evento)) return;
    const teclaDeLaFranja = globalThis[TECLA_DE_LA_FRANJA];
    if (typeof teclaDeLaFranja === 'function' && teclaDeLaFranja(evento)) {
      evento.stopImmediatePropagation();
      evento.preventDefault();
    }
  };

  for (const tipo of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(tipo, alPresionarTecla, true);
  }
})();
