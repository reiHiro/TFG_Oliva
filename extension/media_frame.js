// HU-018: lee en qué segundo va el video o audio de la página, para la cita
// "Citar este momento" de la producción propia.
// Corre en todos los frames (all_frames en el manifest) porque el reproductor
// suele estar en un iframe de otro sitio (un video de YouTube embebido), y
// content_script.js, que corre solo en la página principal, no puede mirar
// adentro de un iframe de otro origen.
// Es inerte: no toca la página, no escucha eventos de la página, no guarda
// nada y no hace ningún pedido. Lo único que hace es contestar un mensaje de
// background.js, y lo único que contesta es un número (los segundos). Si el
// frame no tiene un video o audio que sirva, no contesta nada: así responde
// el frame que sí lo tiene.

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  // Solo pedidos del service worker de esta misma extensión (que no viene
  // de ninguna pestaña).
  if (mensaje?.tipo !== 'leerMomentoMedio' || remitente.id !== chrome.runtime.id || remitente.tab) {
    return false;
  }

  const medios = Array.from(document.querySelectorAll('video, audio'))
    .filter((medio) => Number.isFinite(medio.currentTime));
  // Primero se pregunta por lo que está sonando ahora (soloReproduciendo);
  // si en ningún frame hay nada, por lo que quedó en pausa ya empezado.
  const medio = mensaje.soloReproduciendo === true
    ? medios.find((candidato) => !candidato.paused && !candidato.ended)
    : medios.find((candidato) => candidato.currentTime > 0);
  if (!medio) {
    return false;
  }

  responder(Math.floor(medio.currentTime));
  return false;
});
