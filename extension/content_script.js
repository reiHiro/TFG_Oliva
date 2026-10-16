// Content script: solo se activa si la URL trae "#apoyos=<actividad_id>.<token>"
// (lo agrega actividad_abrir.php). Nunca hace fetch al backend: le pide el
// detalle de la actividad a background.js. La única excepción es el beacon
// de respaldo al salir de la pestaña con la Tarea en curso.
// Segundo modo, para el docente: con "#vista-previa-lectura" (lo agrega el
// botón "Vista previa del modo lectura" del formulario de actividad) muestra
// solo la vista de lectura limpia, sin barra, sin token y sin hablar con
// background.js ni con el backend (crearVistaPrevia).
// La barra es un panel fijo al borde derecho, de todo el alto: clase, materia y
// título arriba, la fila de apoyos debajo y el panel del apoyo activo en un
// área con scroll propio. Se puede cerrar y reabrir sin perder el estado.
// HU-005: "Leer en voz alta" y "Modo lectura" (tamaño, espaciado, tipografía
// OpenDyslexic, alto contraste, filtro para daltonismo y foco de línea).
// HU-007: tercer apoyo "Tarea" con los pasos de la actividad, un botón para
// empezarla, un cronómetro y un botón para finalizarla. Antes de empezar se
// avisa que no se puede salir de la pestaña: si sale con la Tarea en curso,
// se finaliza sola.
// HU-008: registra el tiempo en foco y cada activación de un apoyo, salvo
// cuando la tarea ya está finalizada.
// HU-006: cuarto apoyo "Glosario": resalta palabras de glosario.json y
// muestra su definición, pictograma y un sinónimo más simple en una tarjeta
// dentro del Shadow DOM.
// Devolución: mensajes del docente, con los no leídos en rojo sobre el botón.
// HU-011: teclado y ARIA en toda la barra: foco visible, apoyos como botones
// con aria-pressed, Escape cierra el panel abierto, la tarjeta del glosario
// se maneja con teclado y la barra no atrapa el foco (no es un modal).
// HU-017: "Mi clase": las actividades de la misma clase asignadas al
// estudiante, para pasar de una a otra sin volver al panel web.
// HU-018: "¿Por qué?" en los pasos de la Tarea ya respondidos: muestra la
// justificación del docente, que se pide recién en ese momento, y deja fija
// la respuesta de ese paso. Y "producción propia": si la actividad la pide,
// en cada paso el estudiante justifica de una sola manera (produccion_modo):
// cita un fragmento del material (lo toma de lo que tiene seleccionado, o lo
// arrastra o pega desde el material; no se tipea), o justifica con sus
// palabras en un campo donde no se puede pegar, o, si el material es un
// video o audio, cita el momento en que va ("Citar este momento", que lee
// media_frame.js también dentro de iframes, o el minuto escrito a mano) y
// cuenta qué se dice o se ve.

(() => {
  const coincidencia = location.hash.match(/[#&]apoyos=(\d+)\.([\w-]+\.[\w-]+)/);
  // Si la URL trae las dos marcas gana la de la actividad: el recorrido del
  // estudiante no cambia.
  const esVistaPrevia = !coincidencia && /[#&]vista-previa-lectura(?:$|[&=])/.test(location.hash);
  if (!coincidencia && !esVistaPrevia) {
    return;
  }

  // En la vista previa no hay actividad ni token: quedan en null y nada los usa.
  const actividadId = coincidencia ? Number(coincidencia[1]) : null;
  const token = coincidencia ? coincidencia[2] : null;

  if (esVistaPrevia) {
    // Recién cuando termina de ejecutarse este archivo: las constantes de
    // más abajo todavía no existen.
    queueMicrotask(crearVistaPrevia);
  } else {
    chrome.runtime.sendMessage({ tipo: 'obtenerDetalle', actividadId, token })
      .then((respuesta) => {
        if (respuesta?.ok && respuesta.cuerpo?.actividad) {
          crearBarra(respuesta.cuerpo.actividad);
        } else if (respuesta?.status === 401) {
          crearBarraError('No se pudo verificar el acceso a esta actividad. Volvé a abrirla desde tu panel.');
        } else {
          crearBarraError(respuesta?.cuerpo?.error || 'No se pudo cargar la actividad.');
        }
      })
      .catch(() => crearBarraError('No se pudo comunicar con la extensión.'));
  }

  // ---------------------------------------------------------------------
  // Contenedor con Shadow DOM: los estilos de la página no entran y los
  // de la barra no salen. Se cuelga de <html> (no de <body>) para que no
  // quede incluido en el texto que se lee ni en las reglas del modo lectura.
  // ---------------------------------------------------------------------

  const COLOR_PRINCIPAL = '#1B5E3F';
  const COLOR_FOCO = '#f0b400';

  const ESTILOS_BARRA = `
    * { box-sizing: border-box; }
    /* Panel fijo al borde derecho, de todo el alto. Se superpone a la página
       (no la empuja). Encabezado y fila de apoyos quedan quietos; solo el
       área de contenido tiene scroll. El ancho lo cambia el tirador
       (crearTirador) con la variable --ancho-barra; 420px es el mínimo. */
    .barra {
      position: fixed;
      top: 0;
      right: 0;
      width: var(--ancho-barra, 420px);
      max-width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background: #fff;
      color: #1f2328;
      border-left: 1px solid #d0d7de;
      box-shadow: -6px 0 24px rgba(0, 0, 0, .18);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: left;
      letter-spacing: normal;
      z-index: 2; /* por encima del foco de línea */
    }
    .barra[hidden] { display: none; }
    /* Tirador para agrandar el panel: el borde izquierdo, que mira a la
       página. La franja sobresale un poco para que sea fácil de agarrar. */
    .tirador {
      position: absolute;
      top: 0;
      bottom: 0;
      left: -6px;
      width: 12px;
      cursor: ew-resize;
      touch-action: none;
      z-index: 2;
    }
    .tirador::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 4px;
      width: 4px;
      height: 48px;
      margin-top: -24px;
      border-radius: 2px;
      background: #adb5bd;
    }
    .tirador:hover::after, .tirador.arrastrando::after, .tirador:focus-visible::after { background: ${COLOR_PRINCIPAL}; }
    .encabezado {
      flex: none;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 14px 12px 12px 16px;
      background: ${COLOR_PRINCIPAL};
      color: #fff;
    }
    .encabezado-textos { flex: 1; min-width: 0; }
    .clase { margin: 0 0 2px; font-size: 18px; font-weight: 600; overflow-wrap: anywhere; }
    .etiqueta {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .04em;
      margin: 0 0 2px;
    }
    .titulo {
      font-size: 14px;
      font-weight: 400;
      margin: 0;
      opacity: .9;
      overflow-wrap: anywhere;
    }
    .encabezado button.cerrar-panel {
      flex: none;
      width: 32px;
      height: 32px;
      padding: 0;
      font-size: 22px;
      line-height: 1;
      font-weight: 400;
      background: transparent;
      border-color: transparent;
      color: #fff;
    }
    .encabezado button.cerrar-panel:hover { background: rgba(255, 255, 255, .15); filter: none; }
    .apoyos {
      flex: none;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #d0d7de;
      background: #f6f8fa;
    }
    .apoyos button {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 4px;
      min-width: 0;
      padding: 8px 2px 6px;
      font-size: 12px;
      line-height: 1.2;
      font-weight: 600;
      background: #fff;
      color: ${COLOR_PRINCIPAL};
    }
    .apoyos button svg { flex: none; }
    .apoyos button .boton-texto { overflow-wrap: anywhere; text-align: center; }
    .apoyos button[aria-pressed="true"] {
      background: ${COLOR_PRINCIPAL};
      color: #fff;
    }
    .contenido {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 14px 16px 20px;
    }
    .contenido > .aviso[hidden] { display: none; }
    .contenido > .aviso-inicial { margin-bottom: 12px; }
    .contenido > .aviso-inicial:empty { display: none; }
    button.reabrir {
      position: fixed;
      top: 16px;
      right: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 10px 0 0 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
      z-index: 2; /* por encima de la vista de lectura limpia y del foco de línea */
    }
    .error { margin: 0; color: #842029; }
    .botones { display: flex; flex-wrap: wrap; gap: 8px; }
    button {
      flex: 1 1 auto;
      font: inherit;
      font-weight: 600;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid ${COLOR_PRINCIPAL};
      background: ${COLOR_PRINCIPAL};
      color: #fff;
      cursor: pointer;
    }
    button:hover { filter: brightness(1.1); }
    /* Foco visible (HU-011): anillo amarillo de acento con un borde oscuro a
       cada lado, para que se distinga tanto sobre el blanco del panel (donde
       el amarillo solo no contrasta) como sobre el verde del encabezado y de
       los apoyos activos. El radio de verdadero/falso está oculto: el anillo
       va en su label. */
    :is(button, input, select, a, [tabindex="0"]):focus-visible,
    .pasos .btn-check:focus-visible + label.btn {
      outline: 3px solid ${COLOR_FOCO};
      outline-offset: 2px;
      box-shadow: 0 0 0 7px #1f2328;
    }
    /* Texto solo para lectores de pantalla (oculto a la vista). */
    .solo-lector {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    button:disabled { opacity: .5; cursor: not-allowed; }
    button.secundario, button[aria-expanded="true"], button[aria-pressed="true"] {
      background: #fff;
      color: ${COLOR_PRINCIPAL};
    }
    .panel { display: grid; gap: 12px; }
    .panel[hidden] { display: none; }
    .control label { display: flex; justify-content: space-between; font-weight: 500; margin-bottom: 4px; }
    .valor { color: #59636e; font-weight: 400; }
    input[type="range"] { width: 100%; accent-color: ${COLOR_PRINCIPAL}; margin: 0; }
    .control select {
      width: 100%;
      font: inherit;
      padding: 7px 8px;
      border: 1px solid #adb5bd;
      border-radius: 6px;
      background: #fff;
      color: #1f2328;
    }
    .control .aviso { margin-top: 4px; font-size: 12px; }
    .control .aviso[hidden] { display: none; }
    .interruptor { display: flex; align-items: center; justify-content: space-between; font-weight: 500; cursor: pointer; }
    .interruptor input { appearance: none; width: 40px; height: 22px; border-radius: 11px; background: #adb5bd; position: relative; cursor: pointer; margin: 0; }
    .interruptor input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
    .interruptor input:checked { background: ${COLOR_PRINCIPAL}; }
    .interruptor input:checked::after { left: 21px; }
    .tarea-encabezado { display: flex; justify-content: space-between; align-items: baseline; }
    .tarea-subtitulo { margin: 0; font-weight: 600; }
    .pasos { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .pasos > li { display: flex; gap: 6px; align-items: flex-start; }
    .pasos > li > fieldset { flex: 1; min-width: 0; }
    .numero-paso { flex: none; min-width: 22px; font-weight: 700; color: ${COLOR_PRINCIPAL}; }
    .pasos label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; overflow-wrap: anywhere; }
    .pasos input { width: 18px; height: 18px; margin: 1px 0 0; flex: none; accent-color: ${COLOR_PRINCIPAL}; cursor: pointer; }
    .pasos input:disabled { cursor: progress; }
    .pasos fieldset { border: 0; margin: 0; padding: 0; min-width: 0; display: grid; gap: 4px; }
    .pasos legend { padding: 0; margin-bottom: 4px; font-weight: 500; overflow-wrap: anywhere; }
    .pasos fieldset.respondido legend { color: #59636e; }
    .pasos fieldset label { padding-left: 26px; }
    /* Verdadero o falso: patrón "toggle buttons" de Bootstrap (input.btn-check
       + label.btn). La barra no carga Bootstrap, así que van acá sus reglas. */
    .opciones-vf { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .pasos .btn-check { position: absolute; clip: rect(0, 0, 0, 0); pointer-events: none; }
    .pasos fieldset label.btn {
      justify-content: center;
      padding: 10px 8px;
      font-weight: 600;
      border: 1px solid ${COLOR_PRINCIPAL};
      border-radius: 6px;
      background: #fff;
      color: ${COLOR_PRINCIPAL};
    }
    .pasos label.btn:hover { background: #e8f1ec; }
    .btn-check:checked + label.btn { background: ${COLOR_PRINCIPAL}; color: #fff; }
    .btn-check:disabled + label.btn { cursor: progress; opacity: .65; }
    /* Tarea sin empezar o finalizada: los pasos se ven pero no se pueden marcar. */
    .pasos.bloqueada label, .pasos.bloqueada input:disabled { cursor: default; }
    .pasos.bloqueada .btn-check:disabled + label.btn { cursor: default; }
    .pasos.bloqueada .btn-check:not(:checked) + label.btn:hover { background: #fff; }
    /* HU-018: paso con la justificación ya vista: la respuesta no se cambia más. */
    .pasos fieldset.bloqueado label, .pasos fieldset.bloqueado input:disabled { cursor: default; }
    .pasos fieldset.bloqueado .btn-check:disabled + label.btn { cursor: default; }
    .pasos fieldset.bloqueado .btn-check:not(:checked) + label.btn:hover { background: #fff; }
    .pasos .por-que { justify-self: start; margin-top: 4px; padding: 4px 10px; }
    .pasos .justificacion {
      margin: 4px 0 0;
      padding: 6px 8px;
      border-left: 3px solid ${COLOR_PRINCIPAL};
      background: #f3f7f5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .pasos .justificacion[hidden] { display: none; }
    .pasos .justificacion strong { display: block; }
    /* HU-018: producción propia de un paso (cita del material y explicación). */
    .produccion {
      display: grid;
      gap: 6px;
      margin-top: 6px;
      padding: 8px;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      background: #fafbfc;
    }
    .pasos fieldset .produccion label { display: block; padding-left: 0; font-weight: 600; cursor: default; }
    .produccion textarea {
      width: 100%;
      font: inherit;
      padding: 6px 8px;
      border: 1px solid #adb5bd;
      border-radius: 6px;
      background: #fff;
      color: #1f2328;
      resize: vertical;
    }
    .produccion textarea[readonly] { background: #f1f3f5; }
    /* Crecen con lo escrito hasta un máximo (y aprovechan el ancho ganado
       al agrandar el panel); después tienen scroll. */
    .produccion textarea { field-sizing: content; min-height: 4.5em; max-height: 45vh; }
    .produccion textarea[rows="1"] { min-height: 0; }
    .produccion textarea:focus-visible {
      outline: 3px solid ${COLOR_FOCO};
      outline-offset: 2px;
      box-shadow: 0 0 0 7px #1f2328;
    }
    .produccion button { justify-self: start; padding: 4px 10px; }
    /* El minuto escrito a mano (material en video o audio). */
    .momento-manual { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .pasos fieldset .produccion .momento-manual label { flex: 1 0 100%; font-weight: 400; }
    .momento-manual button { flex: none; }
    .produccion input[type="text"] {
      width: 7em;
      height: auto;
      margin: 0;
      font: inherit;
      padding: 4px 6px;
      border: 1px solid #adb5bd;
      border-radius: 6px;
      background: #fff;
      color: #1f2328;
      cursor: text;
    }
    .produccion input[type="text"]:disabled { background: #f1f3f5; cursor: default; }
    .produccion .pie { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    .produccion .aviso { font-size: 12px; }
    .produccion .aviso:empty { display: none; }
    .aviso { margin: 0; color: #59636e; }
    .estado-tarea { display: grid; gap: 8px; }
    .estado-tarea[hidden], .confirmacion[hidden], button[hidden] { display: none; }
    .estado-tarea:focus { outline: none; }
    .realizada { margin: 0; font-weight: 600; color: ${COLOR_PRINCIPAL}; }
    .confirmacion { display: grid; gap: 8px; padding: 10px; border: 1px solid ${COLOR_FOCO}; border-radius: 6px; background: #fff8e1; }
    .confirmacion p { margin: 0; font-weight: 500; }
    /* Diálogos modales (abrirDialogo): el fondo tapa toda la página y el
       cuadro queda centrado, también con el panel cerrado. */
    .dialogo-fondo {
      position: fixed;
      inset: 0;
      z-index: 2; /* por encima de todo, también de la vista de lectura limpia */
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(0, 0, 0, .5);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: left;
      letter-spacing: normal;
    }
    .dialogo {
      display: grid;
      gap: 12px;
      width: 380px;
      max-width: 100%;
      padding: 16px;
      background: #fff;
      color: #1f2328;
      border: 2px solid ${COLOR_PRINCIPAL};
      border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .3);
    }
    .dialogo-titulo { margin: 0; font-size: 16px; font-weight: 600; }
    .dialogo-texto { margin: 0; }
    /* Vista de lectura limpia: tapa la página a la izquierda de la barra
       (o toda la pantalla si la barra está cerrada). El encabezado queda
       quieto y el artículo tiene scroll propio. */
    .vista-lectura {
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      right: min(var(--ancho-barra, 420px), 100vw);
      display: flex;
      flex-direction: column;
      background: #fff;
      color: #1f2328;
      font: 18px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      text-align: left;
      letter-spacing: normal;
    }
    .vista-lectura[hidden] { display: none; }
    .barra[hidden] ~ .vista-lectura, .vista-lectura.vista-previa { right: 0; }
    /* Cartel de la vista previa del docente. */
    .vista-cartel {
      padding: 4px 10px;
      border-radius: 999px;
      background: ${COLOR_FOCO};
      color: #1f2328;
      font-weight: 700;
    }
    .vista-encabezado {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid #d0d7de;
      font-size: 14px;
    }
    .vista-nombre { font-weight: 600; color: ${COLOR_PRINCIPAL}; }
    .vista-encabezado button { flex: none; }
    .vista-desplazable { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    .vista-articulo { max-width: 44em; margin: 0 auto; padding: 24px 32px 72px; overflow-wrap: break-word; }
    .vista-titulo { margin: 0 0 .6em; font-size: 1.9em; line-height: 1.25; }
    .vista-titulo:focus { outline: none; }
    .vista-cuerpo :is(h2, h3, h4, h5, h6) { margin: 1.4em 0 .5em; line-height: 1.3; }
    .vista-cuerpo h2 { font-size: 1.45em; }
    .vista-cuerpo h3 { font-size: 1.2em; }
    .vista-cuerpo :is(h4, h5, h6) { font-size: 1.05em; }
    .vista-cuerpo :is(p, ul, ol, dl, blockquote, pre, table) { margin: 0 0 1em; }
    .vista-cuerpo img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
    .vista-cuerpo figure { margin: 0 0 1.2em; }
    .vista-cuerpo figcaption { margin-top: .4em; font-size: .85em; color: #59636e; text-align: center; }
    .vista-cuerpo a { color: ${COLOR_PRINCIPAL}; text-decoration: underline; }
    .vista-cuerpo blockquote { margin-left: 0; padding-left: 1em; border-left: 4px solid #d0d7de; color: #424a53; }
    .vista-cuerpo pre { overflow-x: auto; padding: 12px; border-radius: 6px; background: #f6f8fa; font-size: .85em; }
    .vista-cuerpo table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
    .vista-cuerpo :is(th, td) { padding: 6px 10px; border: 1px solid #d0d7de; text-align: left; }
    .vista-cuerpo hr { margin: 1.5em 0; border: 0; border-top: 1px solid #d0d7de; }
    /* Foco de línea: dos sombras, arriba y abajo de la franja visible. Tapan
       la página y la vista de lectura limpia, pero no el panel, la tarjeta
       del glosario ni los diálogos (z-index 2). No reciben el mouse: los
       clics y la selección pasan a la página. */
    .foco-linea { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
    .foco-linea[hidden] { display: none; }
    .foco-sombra { position: absolute; left: 0; right: 0; background: rgba(0, 0, 0, .6); }
    .foco-arriba { top: 0; border-bottom: 2px solid ${COLOR_FOCO}; }
    .foco-abajo { bottom: 0; border-top: 2px solid ${COLOR_FOCO}; }
    @media (prefers-reduced-motion: no-preference) {
      .foco-sombra { transition: height .08s ease-out, top .08s ease-out; }
    }
    /* Palabra que se está leyendo en la vista de lectura limpia (la de la
       página tiene su propia regla: crearResaltadoLectura). */
    ::highlight(apoyos-educativos-lectura) { background-color: #ffd33d; color: #1f2328; }
    .control-vista { display: grid; gap: 8px; }
    .control-vista .aviso:empty { display: none; }
    .temporizador { display: flex; align-items: baseline; gap: 8px; }
    .reloj { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .tarjeta {
      position: fixed;
      width: 260px;
      max-width: calc(100vw - 16px);
      background: #fff;
      color: #1f2328;
      border: 2px solid ${COLOR_PRINCIPAL};
      border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .22);
      font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      padding: 10px 12px;
      text-align: left;
      letter-spacing: normal;
      z-index: 2; /* por encima del foco de línea */
    }
    .tarjeta[hidden] { display: none; }
    .tarjeta-encabezado { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .pictograma { font-size: 36px; line-height: 1; }
    .tarjeta-palabra { margin: 0; font-size: 16px; font-weight: 600; flex: 1; overflow-wrap: anywhere; }
    .tarjeta-definicion { margin: 0; }
    .tarjeta-sinonimo { margin: 8px 0 0; padding-top: 8px; border-top: 1px solid #d0d7de; }
    .tarjeta-sinonimo strong { color: ${COLOR_PRINCIPAL}; }
    .tarjeta-sinonimo[hidden] { display: none; }
    .tarjeta button.cerrar { flex: none; padding: 2px 8px; background: #fff; color: ${COLOR_PRINCIPAL}; }
    .no-leidos {
      position: absolute;
      top: -6px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: #d1242f;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      text-align: center;
    }
    .no-leidos[hidden] { display: none; }
    .mensajes { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .mensajes li { border-left: 3px solid #d0d7de; padding-left: 8px; }
    .mensajes li.nuevo { border-left-color: #d1242f; }
    .mensaje-fecha { display: flex; gap: 6px; font-size: 12px; color: #59636e; margin-bottom: 2px; }
    .mensaje-nuevo { color: #d1242f; font-weight: 600; }
    .mensaje-texto { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .actividades-clase { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .actividades-clase[hidden], .finalizadas-titulo[hidden] { display: none; }
    .finalizadas-titulo { margin: 4px 0 0; font-weight: 600; color: #59636e; }
    .actividad-clase {
      display: grid;
      gap: 4px;
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      background: #fff;
      color: #1f2328;
      font-weight: 400;
      text-align: left;
    }
    button.actividad-clase:hover { filter: none; border-color: ${COLOR_PRINCIPAL}; }
    .actividad-clase.actual { border-color: ${COLOR_PRINCIPAL}; border-left-width: 4px; }
    .actividad-clase.finalizada { background: #f6f8fa; color: #59636e; }
    .actividad-titulo { font-weight: 600; overflow-wrap: anywhere; }
    .actividad-datos { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: #59636e; }
    .insignia { padding: 1px 8px; border-radius: 10px; background: #eaeef2; color: #1f2328; font-weight: 600; }
    .insignia.en-curso { background: #fff3cd; color: #664d03; }
    .insignia.aqui { background: ${COLOR_PRINCIPAL}; color: #fff; }
  `;

  // El elemento que cuelga de <html> y su Shadow DOM con los estilos, sin
  // nada adentro: lo usan la barra y la vista previa del docente.
  function crearRaiz() {
    const host = document.createElement('apoyos-educativos-barra');
    // Estilos inline con !important: le ganan a cualquier regla de la página sobre el host.
    // El host no ocupa lugar: el panel y el botón para reabrirlo son
    // position: fixed dentro del Shadow DOM, así que con el panel cerrado
    // la página se puede usar entera.
    const posicion = {
      all: 'initial',
      position: 'fixed',
      top: '0',
      right: '0',
      'z-index': '2147483647',
      display: 'block',
    };
    for (const [propiedad, valor] of Object.entries(posicion)) {
      host.style.setProperty(propiedad, valor, 'important');
    }

    const raiz = host.attachShadow({ mode: 'closed' });
    const estilos = document.createElement('style');
    estilos.textContent = ESTILOS_BARRA;
    raiz.appendChild(estilos);
    aislarTecladoDeLosCampos(raiz);

    document.documentElement.appendChild(host);
    return { host, raiz };
  }

  // ---------------------------------------------------------------------
  // Teclas escritas en un campo de la barra: no tienen que llegar a la página.
  // Los eventos de teclado cruzan el Shadow DOM y la página los recibe con el
  // host como origen; como el host no parece un campo de texto, un
  // reproductor (YouTube, Vimeo) los toma como atajos: espacio pausa, "k",
  // "f", "m", flechas y números lo controlan.
  // Dos capas:
  //   1) En la raíz, en fase de burbuja: los manejadores de la barra (Escape
  //      cierra el panel, Enter en el minuto a mano...) ya corrieron, y se
  //      corta la subida hacia el host, document y window. Cubre a las
  //      páginas que escuchan en burbuja.
  //   2) Para las que escuchan en captura (antes de que el evento entre a la
  //      barra), teclado_barra.js escucha en captura sobre window desde
  //      document_start, o sea antes que cualquier script de la página. Para
  //      saber si el origen es un campo de la barra (desde afuera del Shadow
  //      DOM cerrado no se ve) usa campoDeLaBarra, que se publica acá en el
  //      espacio global de la extensión (la página no lo ve).
  // Nunca se llama a preventDefault: escribir, el dictado, los métodos de
  // entrada, el corrector y los lectores de pantalla siguen igual.
  // Campos: textarea, input (texto, rango, casillas, radios), select,
  // contenido editable y el tirador para agrandar el panel (sus flechas
  // moverían el video). Los botones no: la tecla que los activa se procesa
  // en la barra y no escribe nada.
  // ---------------------------------------------------------------------

  const TECLAS = ['keydown', 'keypress', 'keyup'];
  const CAMPO_DE_LA_BARRA = Symbol.for('apoyos-educativos.campoDeLaBarra');

  function esCampoDeLaBarra(elemento) {
    return elemento instanceof HTMLElement
      && (elemento.matches('textarea, input, select, [role="separator"]') || elemento.isContentEditable);
  }

  function aislarTecladoDeLosCampos(raiz) {
    for (const tipo of TECLAS) {
      raiz.addEventListener(tipo, (evento) => {
        if (esCampoDeLaBarra(evento.composedPath()[0])) evento.stopPropagation();
      });
    }
    // Para teclado_barra.js: el campo de la barra donde nació el evento, o
    // null. Desde window el evento llega con el host como target.
    globalThis[CAMPO_DE_LA_BARRA] = (evento) => {
      if (evento.target !== raiz.host) return null;
      const activo = raiz.activeElement;
      return esCampoDeLaBarra(activo) ? activo : null;
    };
  }

  function crearContenedor() {
    const { raiz } = crearRaiz();

    const barra = document.createElement('section');
    barra.className = 'barra';
    barra.id = 'barra-apoyos';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Apoyos educativos');

    const encabezado = crearElemento('div', 'encabezado');
    const textos = crearElemento('div', 'encabezado-textos');
    const contenido = crearElemento('div', 'contenido');
    encabezado.append(textos, crearCierre(barra, raiz));
    barra.append(crearTirador(barra, raiz), encabezado);
    raiz.appendChild(barra);

    return { barra, raiz, textos, contenido };
  }

  // Tirador para agrandar el panel (no achicarlo: el ancho del CSS es el
  // mínimo; el máximo es la ventana menos un margen). Arrastrando con el
  // mouse o el dedo: pointer events con setPointerCapture, así el arrastre
  // no se traba al pasar sobre un iframe (un video embebido) ni le saca el
  // foco a la ventana (el control de salida de la Tarea no lo nota). Doble
  // clic vuelve al mínimo. Con teclado: flechas izquierda y derecha (con
  // Mayús, de a pasos más grandes), Inicio y Fin. El ancho va en la
  // variable --ancho-barra del host, que usan el panel y la vista de lectura
  // limpia (que se acomoda a su izquierda). No se guarda entre páginas y no
  // registra métricas.
  const ANCHO_MINIMO_BARRA = 420; // el de .barra en ESTILOS_BARRA
  const MARGEN_MAXIMO_BARRA = 48;
  const PASO_TECLADO_BARRA = 24;

  function crearTirador(barra, raiz) {
    const tirador = crearElemento('div', 'tirador');
    tirador.tabIndex = 0;
    tirador.setAttribute('role', 'separator');
    tirador.setAttribute('aria-orientation', 'vertical');
    tirador.setAttribute('aria-label', 'Cambiar tamaño del panel');
    tirador.setAttribute('aria-controls', barra.id);

    const maximo = () => Math.max(ANCHO_MINIMO_BARRA, window.innerWidth - MARGEN_MAXIMO_BARRA);
    let ancho = ANCHO_MINIMO_BARRA;
    const fijar = (valor) => {
      ancho = Math.round(Math.min(Math.max(valor, ANCHO_MINIMO_BARRA), maximo()));
      raiz.host.style.setProperty('--ancho-barra', `${ancho}px`, 'important');
      tirador.setAttribute('aria-valuemin', String(ANCHO_MINIMO_BARRA));
      tirador.setAttribute('aria-valuemax', String(maximo()));
      tirador.setAttribute('aria-valuenow', String(ancho));
      tirador.setAttribute('aria-valuetext', `${ancho} píxeles de ancho`);
    };
    fijar(ANCHO_MINIMO_BARRA);

    // El panel está a la derecha: llevar el borde a la izquierda lo agranda.
    let inicio = null;
    const terminar = () => {
      inicio = null;
      tirador.classList.remove('arrastrando');
    };
    tirador.addEventListener('pointerdown', (evento) => {
      if (evento.button !== 0) return;
      evento.preventDefault(); // que no seleccione texto mientras arrastra
      tirador.setPointerCapture(evento.pointerId);
      inicio = { x: evento.clientX, ancho };
      tirador.classList.add('arrastrando');
    });
    tirador.addEventListener('pointermove', (evento) => {
      if (inicio) fijar(inicio.ancho + (inicio.x - evento.clientX));
    });
    tirador.addEventListener('pointerup', (evento) => {
      if (tirador.hasPointerCapture(evento.pointerId)) tirador.releasePointerCapture(evento.pointerId);
      terminar();
    });
    tirador.addEventListener('pointercancel', terminar);
    tirador.addEventListener('lostpointercapture', terminar);
    tirador.addEventListener('dblclick', () => fijar(ANCHO_MINIMO_BARRA));

    tirador.addEventListener('keydown', (evento) => {
      const paso = evento.shiftKey ? PASO_TECLADO_BARRA * 4 : PASO_TECLADO_BARRA;
      const destinos = {
        ArrowLeft: ancho + paso,
        ArrowRight: ancho - paso,
        Home: ANCHO_MINIMO_BARRA,
        End: maximo(),
      };
      if (!(evento.key in destinos)) return;
      evento.preventDefault();
      fijar(destinos[evento.key]);
    });

    // Si la ventana se achica, el panel no puede quedar más ancho que el máximo.
    window.addEventListener('resize', () => fijar(ancho));
    return tirador;
  }

  // Botón X del encabezado y botón para reabrir el panel. Cerrar solo oculta
  // el panel: todo lo de adentro (pasos, cronómetro, ajustes) sigue igual.
  function crearCierre(barra, raiz) {
    const botonCerrar = crearElemento('button', 'cerrar-panel', '×');
    botonCerrar.type = 'button';
    botonCerrar.setAttribute('aria-label', 'Cerrar panel de apoyos');

    const botonReabrir = crearElemento('button', 'reabrir');
    botonReabrir.type = 'button';
    botonReabrir.hidden = true;
    botonReabrir.setAttribute('aria-controls', barra.id);
    botonReabrir.setAttribute('aria-expanded', 'false');
    botonReabrir.append(crearIcono(ICONOS.apoyos), crearElemento('span', '', 'Apoyos'));
    raiz.appendChild(botonReabrir);

    botonCerrar.addEventListener('click', () => {
      barra.hidden = true;
      botonReabrir.hidden = false;
      botonReabrir.focus();
    });
    botonReabrir.addEventListener('click', () => {
      botonReabrir.hidden = true;
      barra.hidden = false;
      botonCerrar.focus();
    });
    return botonCerrar;
  }

  // Íconos de 20×20 dibujados con trazos (sin archivos ni librerías).
  const ICONOS = {
    leer: ['M3 7.5h3l4-3.5v12l-4-3.5H3z', 'M13 7a4 4 0 0 1 0 6', 'M15.5 4.5a7.5 7.5 0 0 1 0 11'],
    modo: ['M2.5 15.5l4-11 4 11', 'M4 11.5h5', 'M12.5 15.5l2.75-7 2.75 7', 'M13.4 13.2h3.7'],
    glosario: ['M3 4.5c2.5-1 5-1 7 .5v11c-2-1.5-4.5-1.5-7-.5z', 'M17 4.5c-2.5-1-5-1-7 .5v11c2-1.5 4.5-1.5 7-.5z'],
    tarea: ['M3 5l1.5 1.5L7 4', 'M3 10.5L4.5 12 7 9.5', 'M3 16l1.5 1.5L7 15', 'M10 5.5h7', 'M10 11h7', 'M10 16.5h7'],
    devolucion: ['M2.5 4.5h15v11h-15z', 'M2.5 4.5l7.5 6 7.5-6'],
    clase: ['M3 3.5h6v6h-6z', 'M11 3.5h6v6h-6z', 'M3 11.5h6v6h-6z', 'M11 11.5h6v6h-6z'],
    apoyos: ['M12.5 4l-6 6 6 6'],
  };

  function crearIcono(trazos) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    for (const [atributo, valor] of Object.entries({
      viewBox: '0 0 20 20', width: '20', height: '20', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    })) {
      svg.setAttribute(atributo, valor);
    }
    for (const d of trazos) {
      const trazo = document.createElementNS(ns, 'path');
      trazo.setAttribute('d', d);
      svg.appendChild(trazo);
    }
    return svg;
  }

  // Botón de la fila de apoyos: ícono arriba y texto abajo. El texto va en
  // su propio span. Los seis de la fila son botones de prender/apagar: el
  // estado va en aria-pressed (y el estilo de "activo" sale de ahí), y el
  // texto no cambia, para que el lector de pantalla no lea, por ejemplo,
  // "Detener, presionado".
  function crearBotonApoyo(icono, texto) {
    const boton = crearElemento('button');
    boton.type = 'button';
    boton.setAttribute('aria-pressed', 'false');
    boton.append(crearIcono(icono), crearElemento('span', 'boton-texto', texto));
    return boton;
  }

  function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  // Diálogo modal de la barra, para lo que el estudiante tiene que leer y
  // responder sí o sí. Va en el Shadow DOM, fuera del panel, así se ve
  // aunque el panel esté cerrado. role="alertdialog" con aria-modal: el
  // lector anuncia el título y el texto al abrirse. El foco queda atrapado
  // entre sus botones (Tab y Mayús+Tab dan la vuelta) y arranca en el botón
  // con foco: true. Escape responde valorEscape. Devuelve una promesa con el
  // valor del botón elegido; quien llama decide adónde vuelve el foco.
  // Hay uno solo a la vez: abrir otro cierra el anterior con su valorEscape.
  let numeroDialogo = 0;
  let cerrarDialogoAbierto = null;

  function abrirDialogo(raiz, { titulo, texto, botones, valorEscape }) {
    if (cerrarDialogoAbierto) cerrarDialogoAbierto();

    return new Promise((resolver) => {
      const id = 'dialogo-' + (++numeroDialogo);
      const fondo = crearElemento('div', 'dialogo-fondo');
      const dialogo = crearElemento('div', 'dialogo');
      dialogo.setAttribute('role', 'alertdialog');
      dialogo.setAttribute('aria-modal', 'true');

      const elementoTitulo = crearElemento('h2', 'dialogo-titulo', titulo);
      elementoTitulo.id = id + '-titulo';
      const elementoTexto = crearElemento('p', 'dialogo-texto', texto);
      elementoTexto.id = id + '-texto';
      dialogo.setAttribute('aria-labelledby', elementoTitulo.id);
      dialogo.setAttribute('aria-describedby', elementoTexto.id);

      // Si la ventana vuelve a tener el foco con el diálogo abierto (por
      // ejemplo el aviso de que la Tarea se finalizó), el foco vuelve a él.
      const alVolverElFoco = () => {
        if (!dialogo.contains(raiz.activeElement)) botonInicial.focus();
      };

      const cerrar = (valor) => {
        cerrarDialogoAbierto = null;
        window.removeEventListener('focus', alVolverElFoco);
        fondo.remove();
        resolver(valor);
      };

      const fila = crearElemento('div', 'botones');
      const elementos = botones.map(({ texto: textoBoton, valor, secundario }) => {
        const boton = crearElemento('button', secundario ? 'secundario' : '', textoBoton);
        boton.type = 'button';
        boton.addEventListener('click', () => cerrar(valor));
        fila.append(boton);
        return boton;
      });
      const botonInicial = elementos[Math.max(0, botones.findIndex(({ foco }) => foco))];

      dialogo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') {
          evento.preventDefault();
          evento.stopPropagation();
          cerrar(valorEscape);
        } else if (evento.key === 'Tab') {
          evento.preventDefault();
          const actual = elementos.indexOf(raiz.activeElement);
          const paso = evento.shiftKey ? -1 : 1;
          elementos[(Math.max(0, actual) + paso + elementos.length) % elementos.length].focus();
        }
      });
      // Un clic en el fondo no cierra el diálogo ni le saca el foco.
      fondo.addEventListener('mousedown', (evento) => {
        if (evento.target === fondo) evento.preventDefault();
      });

      dialogo.append(elementoTitulo, elementoTexto, fila);
      fondo.append(dialogo);
      raiz.appendChild(fondo);
      cerrarDialogoAbierto = () => cerrar(valorEscape);
      window.addEventListener('focus', alVolverElFoco);
      botonInicial.focus();
    });
  }

  function crearBarraError(mensaje) {
    const { barra, textos, contenido } = crearContenedor();
    textos.append(crearElemento('p', 'etiqueta', 'Apoyos educativos'));
    contenido.append(crearElemento('p', 'error', mensaje));
    barra.append(contenido);
  }

  function crearBotonPanel(icono, texto, idPanel) {
    const boton = crearBotonApoyo(icono, texto);
    boton.setAttribute('aria-controls', idPanel);
    return boton;
  }

  function crearBarra(actividad) {
    const { barra, raiz, textos, contenido } = crearContenedor();

    const botonLeer = crearBotonApoyo(ICONOS.leer, 'Leer en voz alta');

    const botonModo = crearBotonPanel(ICONOS.modo, 'Modo lectura', 'panel-modo-lectura');
    const botonTarea = crearBotonPanel(ICONOS.tarea, 'Tarea', 'panel-tarea');

    const botonGlosario = crearBotonApoyo(ICONOS.glosario, 'Glosario');

    const devolucion = crearPanelDevolucion();

    // HU-017: la Tarea se arma más abajo; se le pregunta recién al tocar una tarjeta.
    const miClase = crearPanelMiClase(raiz, (texto) => tarea.confirmarSalida(texto));

    const botones = crearElemento('div', 'apoyos');
    botones.setAttribute('role', 'group');
    botones.setAttribute('aria-label', 'Apoyos');
    botones.append(botonLeer, botonModo, botonGlosario, botonTarea, devolucion.boton, miClase.boton);

    // Antes de pedir la finalización se manda el tiempo en foco que quedaba
    // juntado (y se espera la respuesta): después el backend ya lo rechaza.
    // Una vez finalizada no se registran más métricas de esta actividad.
    // Con la Tarea en curso, ocultar la pestaña la finaliza: ese camino se
    // lleva el tiempo pendiente (tomarFocoPendiente) y lo manda junto con la
    // finalización, así que el contador no lo envía por su cuenta.
    let tarea = null;
    const foco = iniciarTiempoEnFoco(() => tarea?.enCurso() === true);
    const vista = crearVistaLectura(raiz);
    const focoLinea = crearFocoLinea(raiz);
    const panelModo = crearPanelModoLectura(vista, focoLinea);
    tarea = crearPanelTarea(actividad, {
      raiz,
      antesDeFinalizar: () => foco.enviar(),
      tomarFocoPendiente: () => foco.tomarPendiente(),
      alFinalizar: () => { metricasActivas = false; },
    });
    vista.conectarEnlaces((evento, enlace) => tarea.revisarEnlace(evento, enlace));

    // Encabezado: la clase y su materia ("5° A · Biología"; la materia es
    // opcional) y debajo el título de la actividad, que sigue siendo el h2
    // del panel. El lector de pantalla no lee el "·": oye "Clase 5° A,
    // materia Biología" (texto oculto a la vista; el visible va con aria-hidden).
    // textContent: los nombres y el título no se interpretan como HTML.
    const claseNombre = actividad.clase?.nombre?.trim();
    const claseMateria = actividad.clase?.materia?.trim();
    if (claseNombre) {
      const visible = crearElemento('span', '', claseMateria ? `${claseNombre} · ${claseMateria}` : claseNombre);
      visible.setAttribute('aria-hidden', 'true');
      const hablado = crearElemento('span', 'solo-lector',
        claseMateria ? `Clase ${claseNombre}, materia ${claseMateria}` : `Clase ${claseNombre}`);
      const clase = crearElemento('p', 'clase');
      clase.append(visible, hablado);
      textos.append(clase);
    }
    textos.append(crearElemento('h2', 'titulo', actividad.titulo));

    // Lo que se ve en el área de contenido cuando no hay ningún panel abierto.
    const sinPanel = crearElemento('p', 'aviso', 'Elegí un apoyo de la fila de arriba.');

    // Aviso de la apertura por defecto en modo lectura (abrirVistaPorDefecto);
    // vacío no se ve. Siempre está, para que el lector de pantalla lo anuncie.
    const avisoInicial = crearElemento('p', 'aviso aviso-inicial');
    avisoInicial.setAttribute('role', 'status');

    contenido.append(avisoInicial, sinPanel, panelModo, tarea.panel, devolucion.panel, miClase.panel);
    barra.append(botones, contenido);

    configurarLectura(botonLeer);
    configurarGlosario(botonGlosario, raiz);

    // Se muestra un panel por vez en el área de contenido.
    // Cerrar la tarea solo la oculta: el cronómetro sigue corriendo.
    // "apoyo" es lo que se registra en las métricas cada vez que se abre;
    // la Tarea no lo lleva porque no es un apoyo (no se registra como uso).
    // La Devolución no es un apoyo: no se registra, y al abrirse recarga los
    // mensajes y marca los no leídos ("alAbrir"). Mi clase tampoco: al abrirse
    // vuelve a pedir la lista.
    const panelTarea = { boton: botonTarea, panel: tarea.panel };
    const paneles = [
      { boton: botonModo, panel: panelModo, apoyo: 'modo_lectura' },
      panelTarea,
      { boton: devolucion.boton, panel: devolucion.panel, alAbrir: devolucion.alAbrir },
      { boton: miClase.boton, panel: miClase.panel, alAbrir: miClase.alAbrir },
    ];

    const cerrarTodos = () => {
      for (const { boton, panel } of paneles) {
        panel.hidden = true;
        boton.setAttribute('aria-pressed', 'false');
      }
      sinPanel.hidden = false;
    };

    // Solo muestra el panel: no registra métricas ni llama a "alAbrir".
    const mostrarPanel = ({ boton, panel }) => {
      panel.hidden = false;
      sinPanel.hidden = true;
      contenido.scrollTop = 0;
      boton.setAttribute('aria-pressed', 'true');
    };

    for (const entrada of paneles) {
      const { boton, panel, apoyo, alAbrir } = entrada;
      boton.addEventListener('click', () => {
        const abrir = panel.hidden;
        cerrarTodos();
        if (abrir) {
          mostrarPanel(entrada);
          if (apoyo) registrarMetrica({ tipo: 'apoyo', apoyo });
          if (alAbrir) alAbrir();
        }
      });
    }

    // La barra arranca con la Tarea a la vista. No es un clic: no mueve el
    // foco de la página, no registra nada y el tiempo sigue empezando recién
    // con «Empezar».
    mostrarPanel(panelTarea);

    if (actividad.modo_lectura_inicial === true) abrirVistaPorDefecto(vista, avisoInicial);

    barra.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      const abierto = paneles.find(({ panel }) => !panel.hidden);
      if (abierto) {
        cerrarTodos();
        abierto.boton.focus();
      }
    });
  }

  // Vista previa del modo lectura para el docente ("#vista-previa-lectura"):
  // la misma vista de lectura limpia, con la misma extracción, el mismo
  // saneamiento y los mismos ajustes (en sus valores por defecto: no hay
  // controles), y nada más. No arma la barra, así que no hay Tarea, ni
  // tiempo en foco, ni métricas, ni vigilancia de foco, y no manda ningún
  // mensaje a background.js: no hay pedidos al backend ni se usa un token.
  // Al cerrarla se saca todo y queda la página original.
  function crearVistaPrevia() {
    const { host, raiz } = crearRaiz();
    const vista = crearVistaLectura(raiz, { vistaPrevia: true });
    vista.avisarAlCerrar(() => host.remove());
    if (vista.abrir({ avisar: false })) return;

    // Sin texto principal: se avisa con un diálogo y la página no se toca.
    abrirDialogo(raiz, {
      titulo: 'Vista previa del docente',
      texto: SIN_TEXTO_PRINCIPAL,
      botones: [{ texto: 'Cerrar', valor: true, foco: true }],
      valorEscape: true,
    }).then(() => host.remove());
  }

  // El docente puede marcar la actividad para que abra en modo lectura
  // (modo_lectura_inicial): la vista de lectura limpia se abre sola al
  // armarse la barra. Es la misma vista de siempre: el estudiante la cierra
  // cuando quiere, y no afecta el tiempo en foco ni la Tarea.
  // Si la cierra no se vuelve a abrir sola mientras siga en esta pestaña
  // (tampoco al recargar): se recuerda en sessionStorage por actividad. Es
  // el sessionStorage de la página, así que vale para esta pestaña; no se
  // usa chrome.storage porque pediría un permiso nuevo.
  // Hay páginas que terminan de armar su contenido tarde: si la primera
  // extracción falla se reintenta una vez, y si tampoco, queda la página
  // original con un aviso en la barra.
  const REINTENTO_VISTA_MS = 1500;

  function abrirVistaPorDefecto(vista, avisoInicial) {
    const clave = 'apoyos-educativos:vista-cerrada:' + actividadId;
    // Hay páginas que no dejan usar sessionStorage: ahí no se recuerda nada.
    const yaLaCerro = () => {
      try {
        return sessionStorage.getItem(clave) === '1';
      } catch {
        return false;
      }
    };
    vista.avisarAlCerrar(() => {
      try {
        sessionStorage.setItem(clave, '1');
      } catch {
        // Sin sessionStorage: al recargar se vuelve a abrir.
      }
    });

    const intentar = (quedaReintento) => {
      // Mientras se esperaba, el estudiante pudo abrirla (o abrirla y cerrarla) a mano.
      if (vista.abierta() || yaLaCerro()) return;
      if (vista.abrir({ avisar: false })) return;
      if (quedaReintento) {
        setTimeout(() => intentar(false), REINTENTO_VISTA_MS);
      } else {
        avisoInicial.textContent = SIN_TEXTO_PRINCIPAL + ' Se muestra la página original.';
      }
    };
    intentar(true);
  }

  // ---------------------------------------------------------------------
  // Métricas de uso (HU-008). Se envían por background.js y sin esperar la
  // respuesta: si fallan, el estudiante no ve ningún error y la barra sigue.
  // Con la tarea finalizada no se envía nada; los apoyos siguen funcionando.
  // ---------------------------------------------------------------------

  let metricasActivas = true;

  // Devuelve una promesa que se resuelve cuando el backend respondió (bien o
  // mal); casi siempre se ignora, salvo al finalizar la tarea.
  function registrarMetrica(metrica) {
    if (!metricasActivas) return Promise.resolve();
    try {
      return chrome.runtime.sendMessage({ tipo: 'registrarMetrica', metrica, token }).catch(() => {});
    } catch {
      // La extensión se recargó y este content script quedó desconectado.
      return Promise.resolve();
    }
  }

  // Cuenta un segundo por tick solo si la pestaña está visible. Se envía
  // al juntar 30 segundos o al ocultarse la pestaña; nunca se envía 0.
  // Convive con la finalización por salida de la Tarea: mientras
  // tareaEnCurso() es true, al ocultarse la pestaña no envía nada, porque la
  // finalización se lleva lo pendiente con tomarPendiente() y lo registra
  // antes de finalizar (después el backend ya no acepta métricas).
  const FOCO_ENVIO_SEGUNDOS = 30;

  function iniciarTiempoEnFoco(tareaEnCurso) {
    let segundos = 0;

    const enviar = () => {
      if (segundos < 1) return Promise.resolve();
      const envio = registrarMetrica({ tipo: 'foco', segundos });
      segundos = 0;
      return envio;
    };

    setInterval(() => {
      if (!metricasActivas || document.visibilityState !== 'visible') return;
      segundos++;
      if (segundos >= FOCO_ENVIO_SEGUNDOS) enviar();
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !tareaEnCurso()) enviar();
    });

    // Devuelve los segundos juntados y los pone en cero, sin enviarlos.
    const tomarPendiente = () => {
      const pendiente = segundos;
      segundos = 0;
      return pendiente;
    };

    return { enviar, tomarPendiente };
  }

  // ---------------------------------------------------------------------
  // Leer en voz alta (Web Speech API)
  // El texto se arma recorriendo los nodos de texto del contenido principal
  // (recogerTextoParaLeer), sin tocar la página: así cada carácter que se
  // lee sabe de qué nodo salió y se puede resaltar la palabra que se está
  // leyendo. Los cálculos (fragmentos y posiciones) están en
  // lectura_calculos.js.
  // ---------------------------------------------------------------------

  // Lo que no se lee nunca. La barra cuelga de <html>, pero por las dudas.
  const NO_SE_LEE = 'script, style, noscript, template, apoyos-educativos-barra';

  // El elemento cuyo texto se lee: la vista de lectura limpia si está
  // abierta (se lee lo que se está viendo) o el contenido principal.
  function elementoParaLeer() {
    return elementoDeLaVista() || document.querySelector('article') || document.querySelector('main') || document.body;
  }

  // Texto de origen de la lectura: { texto, inicios, nodos }, con un trozo
  // por nodo de texto visible (nodos[i] es su nodo) y un salto de línea
  // (nodo null) entre bloques y en cada <br>, como en innerText. Donde los
  // espacios no se respetan (white-space normal) cada espacio, tabulación o
  // salto se cambia por un espacio: el largo no cambia, así las posiciones
  // siguen siendo las del nodo.
  function recogerTextoParaLeer(raizTexto) {
    const estilos = new Map();
    const estilo = (elemento) => {
      if (!estilos.has(elemento)) estilos.set(elemento, getComputedStyle(elemento));
      return estilos.get(elemento);
    };
    const esBloque = (elemento) => {
      const display = estilo(elemento).display;
      return !display.startsWith('inline') && display !== 'contents';
    };
    const bloqueDe = (nodo) => {
      for (let elemento = nodo.parentElement; elemento && elemento !== raizTexto; elemento = elemento.parentElement) {
        if (esBloque(elemento)) return elemento;
      }
      return raizTexto;
    };

    const recorrido = document.createTreeWalker(raizTexto, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(nodo) {
        if (nodo.nodeType === Node.TEXT_NODE) {
          const padre = nodo.parentElement;
          return nodo.nodeValue && padre && estilo(padre).visibility === 'visible'
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
        // Lo que no se ve (display: none) no se lee, con todo lo que tiene adentro.
        if (nodo.matches(NO_SE_LEE) || (typeof nodo.checkVisibility === 'function' && !nodo.checkVisibility())) {
          return NodeFilter.FILTER_REJECT;
        }
        return nodo.localName === 'br' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    const trozos = [];
    const nodos = [];
    let bloqueAnterior = null;
    while (recorrido.nextNode()) {
      const nodo = recorrido.currentNode;
      if (nodo.nodeType !== Node.TEXT_NODE) { // <br>
        trozos.push('\n');
        nodos.push(null);
        continue;
      }
      const bloque = bloqueDe(nodo);
      if (bloqueAnterior && bloque !== bloqueAnterior) {
        trozos.push('\n');
        nodos.push(null);
      }
      bloqueAnterior = bloque;
      const respetaEspacios = /^(pre|break-spaces)/.test(estilo(nodo.parentElement).whiteSpace);
      trozos.push(respetaEspacios ? nodo.nodeValue : nodo.nodeValue.replace(/\s/g, ' '));
      nodos.push(nodo);
    }
    return { ...ApoyosLectura.armarTextoOrigen(trozos), nodos };
  }

  // Resaltado de la palabra que se está leyendo, con la CSS Custom Highlight
  // API: se resalta un Range del texto, sin agregar elementos ni cambiar el
  // texto (la selección y "Citar selección" devuelven lo de siempre). Funciona
  // en la página y en la vista de lectura limpia (su regla ::highlight está
  // en ESTILOS_BARRA). Si el navegador no tiene la API o la voz no emite el
  // evento boundary, no hay resaltado y la lectura sigue igual. Si algo falla
  // (por ejemplo, la página cambió el texto o se activó el glosario, que
  // reemplaza nodos), se deja de resaltar hasta la próxima lectura.
  // Si la palabra sale de la pantalla, se lleva al centro (sin animación con
  // prefers-reduced-motion).
  const NOMBRE_RESALTADO = 'apoyos-educativos-lectura';
  const ID_ESTILO_RESALTADO = 'apoyos-educativos-lectura-palabra';
  const REGLA_RESALTADO = `::highlight(${NOMBRE_RESALTADO}) { background-color: #ffd33d; color: #1f2328; }`;

  function crearResaltadoLectura() {
    const hayApi = typeof CSS !== 'undefined' && CSS.highlights !== undefined && typeof Highlight === 'function';
    let origen = null;

    const limpiar = () => {
      if (hayApi) CSS.highlights.delete(NOMBRE_RESALTADO);
    };

    const terminar = () => {
      limpiar();
      origen = null;
    };

    const empezar = (nuevoOrigen) => {
      limpiar();
      origen = hayApi ? nuevoOrigen : null;
      if (origen && !document.getElementById(ID_ESTILO_RESALTADO)) {
        const estilo = document.createElement('style');
        estilo.id = ID_ESTILO_RESALTADO;
        estilo.textContent = REGLA_RESALTADO;
        (document.head || document.documentElement).appendChild(estilo);
      }
    };

    const mostrarEnPantalla = (rango) => {
      const caja = rango.getBoundingClientRect();
      if (caja.width === 0 && caja.height === 0) return;
      if (caja.top >= 0 && caja.bottom <= window.innerHeight) return;
      const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      rango.startContainer.parentElement?.scrollIntoView({
        block: 'center', inline: 'nearest', behavior: reducir ? 'auto' : 'smooth',
      });
    };

    // fragmento: { texto, origen } de dividirEnFragmentos; charIndex y
    // charLength, los del evento boundary.
    const mostrar = (fragmento, charIndex, charLength) => {
      if (!origen) return;
      try {
        const palabra = ApoyosLectura.palabraEnPosicion(fragmento.texto, charIndex, charLength);
        const enOrigen = palabra && ApoyosLectura.rangoEnOrigen(fragmento.origen, palabra.inicio, palabra.fin);
        const desde = enOrigen && ApoyosLectura.ubicarEnTrozos(origen, enOrigen.inicio);
        const hasta = enOrigen && ApoyosLectura.ubicarEnTrozos(origen, enOrigen.fin - 1);
        const nodoDesde = desde && origen.nodos[desde.trozo];
        const nodoHasta = hasta && origen.nodos[hasta.trozo];
        if (!nodoDesde || !nodoHasta) {
          limpiar();
          return;
        }
        if (!nodoDesde.isConnected || !nodoHasta.isConnected) {
          terminar();
          return;
        }
        const rango = new Range();
        rango.setStart(nodoDesde, desde.desplazamiento);
        rango.setEnd(nodoHasta, hasta.desplazamiento + 1);
        CSS.highlights.set(NOMBRE_RESALTADO, new Highlight(rango));
        mostrarEnPantalla(rango);
      } catch {
        terminar();
      }
    };

    return { empezar, mostrar, terminar };
  }

  function elegirVoz() {
    const voces = speechSynthesis.getVoices();
    return voces.find((voz) => voz.lang === 'es-AR')
      || voces.find((voz) => voz.lang === 'es-ES')
      || voces.find((voz) => voz.lang.startsWith('es'))
      || null;
  }

  function configurarLectura(boton) {
    if (!('speechSynthesis' in window)) {
      boton.disabled = true;
      boton.title = 'Este navegador no permite la lectura en voz alta.';
      return;
    }

    // Cada lectura tiene un número; los eventos de una lectura anterior
    // (por ejemplo, los que dispara cancel()) se ignoran.
    let lecturaActual = 0;
    let leyendo = false;
    const resaltado = crearResaltadoLectura();

    // Mientras lee, el botón queda presionado; tocarlo de nuevo detiene.
    const actualizarBoton = () => {
      boton.setAttribute('aria-pressed', String(leyendo));
      boton.title = leyendo ? 'Tocá de nuevo para detener la lectura' : '';
    };

    const detener = () => {
      lecturaActual++;
      leyendo = false;
      speechSynthesis.cancel();
      resaltado.terminar();
      actualizarBoton();
    };

    const leer = () => {
      const elemento = elementoParaLeer();
      const origen = elemento ? recogerTextoParaLeer(elemento) : null;
      const fragmentos = origen ? ApoyosLectura.dividirEnFragmentos(origen.texto) : [];
      if (fragmentos.length === 0) return;

      speechSynthesis.cancel();
      const numero = ++lecturaActual;
      const voz = elegirVoz();
      resaltado.empezar(origen);

      fragmentos.forEach((fragmento, indice) => {
        const enunciado = new SpeechSynthesisUtterance(fragmento.texto);
        enunciado.lang = voz ? voz.lang : 'es-AR';
        if (voz) enunciado.voice = voz;

        // No todas las voces lo emiten: sin él no hay resaltado.
        enunciado.onboundary = (evento) => {
          if (numero === lecturaActual && evento.name === 'word') {
            resaltado.mostrar(fragmento, evento.charIndex, evento.charLength);
          }
        };

        const esUltimo = indice === fragmentos.length - 1;
        enunciado.onend = () => {
          if (esUltimo && numero === lecturaActual) detener();
        };
        enunciado.onerror = () => {
          if (numero === lecturaActual) detener();
        };
        speechSynthesis.speak(enunciado);
      });

      leyendo = true;
      actualizarBoton();
      registrarMetrica({ tipo: 'apoyo', apoyo: 'lectura_voz' });
    };

    boton.addEventListener('click', () => (leyendo ? detener() : leer()));
    window.addEventListener('pagehide', () => {
      speechSynthesis.cancel();
      resaltado.terminar();
    });
  }

  // ---------------------------------------------------------------------
  // Modo lectura: una hoja de estilos inyectada en la página que se
  // reescribe cada vez que cambia un control.
  // ---------------------------------------------------------------------

  const ID_ESTILO_MODO_LECTURA = 'apoyos-educativos-modo-lectura';
  const TAMANIO_BASE_PX = 16;

  // Viven solo en memoria mientras la página está abierta; no van al backend.
  // focoLinea y lineasFoco no generan CSS: los usa crearFocoLinea.
  const AJUSTES_INICIALES = {
    tamanio: 100, espaciado: 0, tipografia: 'original', contraste: false, daltonismo: 'ninguno',
    focoLinea: false, lineasFoco: 3,
  };
  const ajustes = { ...AJUSTES_INICIALES };

  // Alto contraste: invertir y girar el tono 180° devuelve cada color a su
  // tono original (un rojo sigue siendo rojo), solo que con el brillo dado
  // vuelta. Las imágenes y videos se vuelven a invertir para que queden
  // como estaban.
  const FILTRO_CONTRASTE = 'invert(1) hue-rotate(180deg)';
  const MEDIOS = 'img, video, canvas, iframe, embed, object';

  // Filtro para daltonismo. Las matrices de simulación (Machado, Oliveira y
  // Fernandes, 2009, severidad máxima) dicen cómo ve los colores cada tipo.
  // No se aplican tal cual (eso mostraría la página como la ve la persona,
  // sin ayudarla): se usa la daltonización clásica, que toma la diferencia
  // que la persona no distingue (original − simulado) y la pasa a los
  // canales que sí distingue. Matriz final = I + REPARTO · (I − simulación).
  const SIMULACION_DALTONISMO = {
    protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
    deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
    tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
  };
  const REPARTO_DALTONISMO = [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1];
  const ID_SVG_FILTROS = 'apoyos-educativos-filtros';
  const idFiltroDaltonismo = (tipo) => `apoyos-educativos-daltonismo-${tipo}`;

  // Devuelve los 20 valores de feColorMatrix (4 filas × 5 columnas: R, G, B,
  // alfa y desplazamiento); la fila del alfa lo deja igual.
  function matrizDaltonismo(simulacion) {
    const valores = [];
    for (let fila = 0; fila < 3; fila++) {
      for (let columna = 0; columna < 3; columna++) {
        let suma = fila === columna ? 1 : 0;
        for (let k = 0; k < 3; k++) {
          suma += REPARTO_DALTONISMO[fila * 3 + k] * ((k === columna ? 1 : 0) - simulacion[k * 3 + columna]);
        }
        valores.push(Number(suma.toFixed(4)));
      }
      valores.push(0, 0);
    }
    valores.push(0, 0, 0, 1, 0);
    return valores.join(' ');
  }

  // Los filtros SVG tienen que estar en el mismo árbol que el elemento que
  // los usa para que filter: url(#id) los encuentre: en el documento de la
  // página para <body> (se cuelgan de <html>, fuera de <body>, igual que la
  // barra) y dentro del Shadow DOM para la vista de lectura limpia.
  function asegurarFiltrosSvg(destino = document.documentElement) {
    if (destino.getRootNode().getElementById(ID_SVG_FILTROS)) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.id = ID_SVG_FILTROS;
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [propiedad, valor] of Object.entries({
      position: 'absolute', width: '0', height: '0', overflow: 'hidden',
    })) {
      svg.style.setProperty(propiedad, valor, 'important');
    }
    for (const [tipo, simulacion] of Object.entries(SIMULACION_DALTONISMO)) {
      const filtro = document.createElementNS(ns, 'filter');
      filtro.id = idFiltroDaltonismo(tipo);
      const matriz = document.createElementNS(ns, 'feColorMatrix');
      matriz.setAttribute('type', 'matrix');
      matriz.setAttribute('values', matrizDaltonismo(simulacion));
      filtro.appendChild(matriz);
      svg.appendChild(filtro);
    }
    destino.appendChild(svg);
  }

  // Tipografía para dislexia. Nombre propio para no chocar con una
  // OpenDyslexic que la página o la computadora ya tengan.
  const FAMILIA_DISLEXIA = 'Apoyos OpenDyslexic';
  // No se le cambia la letra al código ni a las fuentes de íconos (Font
  // Awesome, Material Icons, etc.), que dibujan símbolos con letras.
  const SIN_CAMBIO_DE_LETRA = 'code, pre, kbd, samp, [class*="icon"], [class*="fa-"], [class*="material"], [class*="glyph"]';

  // La fuente la manda background.js (va empaquetada en la extensión) y se
  // registra una sola vez con FontFace, que no depende de la política de
  // seguridad de la página para cargar fuentes.
  let cargaFuenteDislexia = null;

  function cargarFuenteDislexia() {
    if (!cargaFuenteDislexia) {
      cargaFuenteDislexia = (async () => {
        const respuesta = await chrome.runtime.sendMessage({ tipo: 'obtenerFuente' });
        if (!respuesta?.ok) throw new Error('Sin fuente');
        for (const [peso, base64] of Object.entries(respuesta.fuentes)) {
          const bytes = Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0));
          const fuente = new FontFace(FAMILIA_DISLEXIA, bytes.buffer, { weight: peso });
          document.fonts.add(await fuente.load());
        }
      })().catch((error) => {
        cargaFuenteDislexia = null; // se puede volver a intentar
        throw error;
      });
    }
    return cargaFuenteDislexia;
  }

  const TEXTO = 'p, li, dd, dt, td, th, blockquote, figcaption, label, pre, code, span, a, em, strong, b, i, small, div';
  const TITULOS = 'h1, h2, h3, h4, h5, h6';

  // Reglas de los ajustes para todo lo que está dentro de "raiz": 'body'
  // para la página y el selector de la vista de lectura limpia para ella
  // (así las dos usan exactamente los mismos ajustes).
  function generarCss(raiz = 'body', basePx = TAMANIO_BASE_PX) {
    const esPagina = raiz === 'body';
    const reglas = [];

    // Tamaño: valores fijos en px (no se acumulan entre elementos anidados).
    // Los títulos mantienen su jerarquía respecto del texto.
    if (ajustes.tamanio !== 100) {
      const px = (basePx * ajustes.tamanio) / 100;
      reglas.push(
        `${raiz} :is(${TEXTO}) { font-size: ${px}px !important; line-height: 1.6 !important; }`,
        `${raiz} h1 { font-size: ${px * 2}px !important; line-height: 1.3 !important; }`,
        `${raiz} h2 { font-size: ${px * 1.6}px !important; line-height: 1.3 !important; }`,
        `${raiz} h3 { font-size: ${px * 1.3}px !important; line-height: 1.3 !important; }`,
        `${raiz} :is(h4, h5, h6) { font-size: ${px * 1.1}px !important; line-height: 1.3 !important; }`,
        `${raiz} :is(${TITULOS}) * { font-size: inherit !important; line-height: inherit !important; }`,
      );
    }

    if (ajustes.espaciado !== 0) {
      reglas.push(`${raiz}, ${raiz} * { letter-spacing: ${ajustes.espaciado}em !important; }`);
    }

    if (ajustes.tipografia === 'opendyslexic') {
      reglas.push(`${raiz}, ${raiz} *:not(${SIN_CAMBIO_DE_LETRA}) { font-family: "${FAMILIA_DISLEXIA}", sans-serif !important; }`);
    }

    // Los filtros van sobre <body> y no sobre <html>, para no alcanzar a la
    // barra (que cuelga de <html>). Primero el contraste y después el
    // daltonismo, así las imágenes ya re-invertidas también se corrigen.
    // Efecto secundario conocido: un filter en <body> hace que los elementos
    // position: fixed de la página se ubiquen respecto de <body>.
    const filtros = [];
    if (ajustes.contraste) filtros.push(FILTRO_CONTRASTE);
    if (ajustes.daltonismo !== 'ninguno') filtros.push(`url(#${idFiltroDaltonismo(ajustes.daltonismo)})`);
    if (filtros.length > 0) {
      reglas.push(`${raiz} { filter: ${filtros.join(' ')} !important; }`);
    }
    if (ajustes.contraste) {
      // El fondo de <html> no lo alcanza el filtro: se pone negro a mano.
      if (esPagina) reglas.push('html { background-color: #000 !important; }');
      reglas.push(`${raiz} :is(${MEDIOS}) { filter: ${FILTRO_CONTRASTE} !important; }`);
    }

    return reglas.join('\n');
  }

  // Otros lugares donde se aplican los mismos ajustes además de la página
  // (la vista de lectura limpia): { selector, basePx, estilo, filtros }, con
  // el selector raíz, el tamaño de letra del que parte, su <style> dentro
  // del Shadow DOM y dónde van los filtros SVG.
  const destinosAjustes = [];

  function aplicarModoLectura() {
    aplicarAjustesEnPagina();
    for (const { selector, basePx, estilo, filtros } of destinosAjustes) {
      if (ajustes.daltonismo !== 'ninguno') asegurarFiltrosSvg(filtros);
      estilo.textContent = generarCss(selector, basePx);
    }
  }

  function aplicarAjustesEnPagina() {
    if (ajustes.daltonismo !== 'ninguno') asegurarFiltrosSvg();
    let estilo = document.getElementById(ID_ESTILO_MODO_LECTURA);
    const css = generarCss();

    if (!css) {
      if (estilo) estilo.remove();
      return;
    }
    if (!estilo) {
      estilo = document.createElement('style');
      estilo.id = ID_ESTILO_MODO_LECTURA;
      (document.head || document.documentElement).appendChild(estilo);
    }
    estilo.textContent = css;
  }

  function crearControlRango({ id, texto, min, max, paso, obtener, fijar, formatear }) {
    const control = crearElemento('div', 'control');
    const etiqueta = crearElemento('label');
    etiqueta.htmlFor = id;
    const valor = crearElemento('span', 'valor');
    etiqueta.append(document.createTextNode(texto), valor);

    const rango = document.createElement('input');
    rango.type = 'range';
    rango.id = id;
    rango.min = min;
    rango.max = max;
    rango.step = paso;

    const refrescar = () => {
      rango.value = obtener();
      valor.textContent = formatear(obtener());
      rango.setAttribute('aria-valuetext', valor.textContent);
    };
    rango.addEventListener('input', () => {
      fijar(Number(rango.value));
      valor.textContent = formatear(obtener());
      rango.setAttribute('aria-valuetext', valor.textContent);
      aplicarModoLectura();
    });

    refrescar();
    control.append(etiqueta, rango);
    return { control, refrescar };
  }

  // "vista" es la vista de lectura limpia: su botón va arriba de los
  // ajustes, que valen tanto para ella como para la página original.
  // "focoLinea" es la franja de lectura (crearFocoLinea): el panel solo
  // cambia los ajustes y le avisa.
  function crearPanelModoLectura(vista, focoLinea) {
    const panel = crearElemento('div', 'panel');
    panel.id = 'panel-modo-lectura';
    panel.hidden = true;

    const tamanio = crearControlRango({
      id: 'control-tamanio',
      texto: 'Tamaño de letra',
      min: 100, max: 200, paso: 10,
      obtener: () => ajustes.tamanio,
      fijar: (v) => { ajustes.tamanio = v; },
      formatear: (v) => (v === 100 ? 'Original' : v + ' %'),
    });

    const espaciado = crearControlRango({
      id: 'control-espaciado',
      texto: 'Espaciado entre letras',
      min: 0, max: 0.3, paso: 0.05,
      obtener: () => ajustes.espaciado,
      fijar: (v) => { ajustes.espaciado = v; },
      formatear: (v) => (v === 0 ? 'Original' : '+' + Math.round(v * 100) + ' %'),
    });

    // La primera vez que se elige OpenDyslexic hay que cargarla; mientras
    // tanto el selector queda deshabilitado. Si falla, vuelve a "Original".
    const tipografia = crearControlSelector({
      id: 'control-tipografia',
      texto: 'Tipo de letra',
      opciones: [['original', 'Original'], ['opendyslexic', 'OpenDyslexic (para dislexia)']],
      obtener: () => ajustes.tipografia,
      alCambiar: async (valor, { selector, aviso }) => {
        aviso.hidden = true;
        if (valor === 'opendyslexic') {
          selector.disabled = true;
          try {
            await cargarFuenteDislexia();
          } catch {
            selector.disabled = false;
            selector.value = ajustes.tipografia;
            aviso.textContent = 'No se pudo cargar la tipografía.';
            aviso.hidden = false;
            return;
          }
          selector.disabled = false;
          if (selector.value !== valor) return; // se tocó Restablecer mientras cargaba
        }
        ajustes.tipografia = valor;
        aplicarModoLectura();
      },
    });

    const interruptor = crearElemento('label', 'interruptor');
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.setAttribute('role', 'switch');
    casilla.addEventListener('change', () => {
      ajustes.contraste = casilla.checked;
      aplicarModoLectura();
    });
    interruptor.append(document.createTextNode('Alto contraste'), casilla);

    const daltonismo = crearControlSelector({
      id: 'control-daltonismo',
      texto: 'Filtro para daltonismo',
      opciones: [
        ['ninguno', 'Sin filtro'],
        ['protanopia', 'Protanopia (rojo)'],
        ['deuteranopia', 'Deuteranopia (verde)'],
        ['tritanopia', 'Tritanopia (azul)'],
      ],
      obtener: () => ajustes.daltonismo,
      alCambiar: (valor) => {
        ajustes.daltonismo = valor;
        aplicarModoLectura();
      },
    });

    // Foco de línea: interruptor y alto de la franja.
    const interruptorFoco = crearElemento('label', 'interruptor');
    const casillaFoco = document.createElement('input');
    casillaFoco.type = 'checkbox';
    casillaFoco.setAttribute('role', 'switch');
    casillaFoco.setAttribute('aria-label', 'Foco de línea');
    casillaFoco.addEventListener('change', () => {
      ajustes.focoLinea = casillaFoco.checked;
      focoLinea.refrescar();
    });
    interruptorFoco.append(document.createTextNode('Foco de línea'), casillaFoco);

    const lineasFoco = crearControlSelector({
      id: 'control-lineas-foco',
      texto: 'Alto de la franja',
      opciones: [['1', '1 línea'], ['3', '3 líneas'], ['5', '5 líneas']],
      obtener: () => String(ajustes.lineasFoco),
      alCambiar: (valor) => {
        ajustes.lineasFoco = Number(valor);
        focoLinea.refrescar();
      },
    });

    const botonRestablecer = crearElemento('button', 'secundario', 'Restablecer');
    botonRestablecer.type = 'button';
    botonRestablecer.addEventListener('click', () => {
      Object.assign(ajustes, AJUSTES_INICIALES);
      tamanio.refrescar();
      espaciado.refrescar();
      tipografia.refrescar();
      daltonismo.refrescar();
      lineasFoco.refrescar();
      casilla.checked = false;
      casillaFoco.checked = false;
      aplicarModoLectura();
      focoLinea.refrescar();
    });

    panel.append(
      vista.control, tamanio.control, espaciado.control, tipografia.control,
      interruptor, daltonismo.control, interruptorFoco, lineasFoco.control, botonRestablecer,
    );
    return panel;
  }

  // ---------------------------------------------------------------------
  // Foco de línea (HU-005): una capa oscura sobre la página con una franja
  // horizontal visible, de 1, 3 o 5 líneas. Va en el Shadow DOM de la barra
  // (la página no se toca), por debajo del panel, y no recibe el mouse
  // (pointer-events: none): clics, selección y "Citar selección" siguen
  // igual. La franja sigue al puntero y, mientras la opción está activa, se
  // mueve con las flechas arriba y abajo: esas teclas las toma
  // teclado_barra.js (el primer listener de la página) con teclaDeLaFranja,
  // así no hacen scroll ni mueven un video. No las toma si nacen en la barra
  // (salvo en la vista de lectura limpia, fuera de sus campos), en un campo
  // de la página o en algo que usa las flechas para lo suyo (USAN_FLECHAS),
  // ni con Alt, Ctrl, Meta o Mayús. Dentro de un iframe (un video embebido)
  // las teclas y el mouse no llegan a la página: ahí la franja queda quieta.
  // Es parte del Modo lectura: no registra métricas propias.
  // ---------------------------------------------------------------------

  const TECLA_DE_LA_FRANJA = Symbol.for('apoyos-educativos.teclaDeLaFranja');
  const USAN_FLECHAS = [
    'input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])',
    ...['slider', 'spinbutton', 'listbox', 'option', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
      'menuitemradio', 'grid', 'gridcell', 'tree', 'treeitem', 'treegrid', 'combobox', 'radiogroup',
      'radio', 'tablist', 'tab', 'textbox', 'searchbox'].map((rol) => `[role="${rol}"]`),
  ].join(', ');

  function crearFocoLinea(raiz) {
    const capa = crearElemento('div', 'foco-linea');
    capa.hidden = true;
    capa.setAttribute('aria-hidden', 'true');
    const sombraArriba = crearElemento('div', 'foco-sombra foco-arriba');
    const sombraAbajo = crearElemento('div', 'foco-sombra foco-abajo');
    capa.append(sombraArriba, sombraAbajo);
    raiz.append(capa);

    let centroY = window.innerHeight / 2;
    let ultimaX = window.innerWidth / 3;
    let altoLinea = ApoyosLectura.ALTO_LINEA_POR_DEFECTO;
    const activa = () => !capa.hidden;

    const sobreLaBarra = (x) => {
      const barra = raiz.querySelector('.barra');
      return barra !== null && !barra.hidden && x >= barra.getBoundingClientRect().left;
    };

    // El alto de línea del texto que está bajo la franja (en la página o en
    // la vista de lectura limpia). Sobre la barra o sin texto queda el anterior.
    const medirLinea = () => {
      if (sobreLaBarra(ultimaX)) return;
      let elemento = document.elementFromPoint(ultimaX, centroY);
      if (elemento === raiz.host) elemento = raiz.elementFromPoint(ultimaX, centroY);
      if (!(elemento instanceof Element) || elemento === raiz.host) return;
      const estilo = getComputedStyle(elemento);
      altoLinea = ApoyosLectura.altoDeLinea(estilo.lineHeight, estilo.fontSize);
    };

    const dibujar = () => {
      const { arriba, alto } = ApoyosLectura.calcularFranja({
        centroY, lineas: ajustes.lineasFoco, altoLinea, altoVentana: window.innerHeight,
      });
      sombraArriba.style.height = `${arriba}px`;
      sombraAbajo.style.top = `${arriba + alto}px`;
    };

    let cuadro = 0;
    const redibujar = () => {
      if (cuadro) return;
      cuadro = requestAnimationFrame(() => {
        cuadro = 0;
        medirLinea();
        dibujar();
      });
    };

    // Sobre el panel la franja no se mueve: se está usando la barra.
    const alMoverPuntero = (evento) => {
      if (evento.target === raiz.host && sobreLaBarra(evento.clientX)) return;
      ultimaX = evento.clientX;
      centroY = evento.clientY;
      redibujar();
    };

    // Si las flechas son para la franja. Desde la barra el evento llega con
    // el host como origen: solo valen las de la vista de lectura limpia.
    const tomaLasFlechas = (evento) => {
      if (evento.target === raiz.host) {
        const activo = raiz.activeElement;
        return activo instanceof Element && activo.closest('.vista-lectura') !== null && !esCampoDeLaBarra(activo);
      }
      const origen = evento.composedPath()[0];
      return !(origen instanceof Element && (origen.closest(USAN_FLECHAS) || origen.isContentEditable));
    };

    // La llama teclado_barra.js por cada tecla: true si es para la franja
    // (la mueve en keydown; keypress y keyup solo se cortan).
    globalThis[TECLA_DE_LA_FRANJA] = (evento) => {
      if (!activa() || (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown')) return false;
      if (evento.altKey || evento.ctrlKey || evento.metaKey || evento.shiftKey) return false;
      if (!tomaLasFlechas(evento)) return false;
      if (evento.type === 'keydown') {
        medirLinea();
        centroY = ApoyosLectura.moverFranja({
          centroY, direccion: evento.key === 'ArrowUp' ? -1 : 1, altoLinea, altoVentana: window.innerHeight,
        });
        dibujar();
      }
      return true;
    };

    const refrescar = () => {
      if (ajustes.focoLinea && !activa()) {
        capa.hidden = false;
        document.addEventListener('pointermove', alMoverPuntero, { capture: true, passive: true });
        window.addEventListener('resize', redibujar, { passive: true });
      } else if (!ajustes.focoLinea && activa()) {
        capa.hidden = true;
        document.removeEventListener('pointermove', alMoverPuntero, { capture: true });
        window.removeEventListener('resize', redibujar);
      }
      if (activa()) {
        medirLinea();
        dibujar();
      }
    };

    return { refrescar };
  }

  // Selector con etiqueta y un aviso debajo (oculto salvo que haya un error).
  // "opciones" es una lista de [valor, texto].
  function crearControlSelector({ id, texto, opciones, obtener, alCambiar }) {
    const control = crearElemento('div', 'control');
    const etiqueta = crearElemento('label', '', texto);
    etiqueta.htmlFor = id;

    const selector = document.createElement('select');
    selector.id = id;
    for (const [valor, textoOpcion] of opciones) {
      const opcion = crearElemento('option', '', textoOpcion);
      opcion.value = valor;
      selector.appendChild(opcion);
    }

    const aviso = crearElemento('p', 'aviso');
    aviso.id = id + '-aviso';
    aviso.hidden = true;
    aviso.setAttribute('role', 'status');
    selector.setAttribute('aria-describedby', aviso.id);

    const refrescar = () => {
      selector.value = obtener();
      aviso.hidden = true;
    };
    selector.addEventListener('change', () => alCambiar(selector.value, { selector, aviso }));

    refrescar();
    control.append(etiqueta, selector, aviso);
    return { control, refrescar };
  }

  // ---------------------------------------------------------------------
  // Vista de lectura limpia: solo el contenido principal de la página
  // (título, texto, imágenes), sin menús, publicidad ni barras laterales.
  // Lo extrae Readability.js de Mozilla (vendor/Readability.js, la librería
  // de la vista de lectura de Firefox; el manifest la carga antes que este
  // archivo), siempre sobre una copia del documento: la página no se toca.
  // ---------------------------------------------------------------------

  // Con menos texto que esto se considera que no hay contenido principal.
  const TEXTO_MINIMO_VISTA = 250;

  // Devuelve { titulo, contenido } con el contenido ya saneado, o null si
  // Readability no encuentra un texto principal (o falla).
  function extraerContenidoPrincipal() {
    if (typeof Readability !== 'function') return null;

    let articulo;
    try {
      // La copia no tiene ventana: sus scripts no se ejecutan. Se le saca lo
      // que agregó la extensión (la barra, sus hojas de estilos, los filtros
      // y las marcas del glosario, que vuelven a ser texto).
      const copia = document.cloneNode(true);
      copia.querySelectorAll(
        `apoyos-educativos-barra, #${ID_ESTILO_MODO_LECTURA}, #${ID_SVG_FILTROS}, #${ID_ESTILO_FOCO_MARCAS}, #${ID_ESTILO_RESALTADO}`,
      ).forEach((nodo) => nodo.remove());
      copia.querySelectorAll(ETIQUETA_MARCA).forEach((marca) => marca.replaceWith(marca.textContent));
      // serializer: se pide el resultado como nodos, no como texto HTML, así
      // nunca hace falta innerHTML.
      articulo = new Readability(copia, { serializer: (elemento) => elemento }).parse();
    } catch {
      return null;
    }

    const texto = articulo?.textContent?.trim() ?? '';
    if (!articulo?.content || texto.length < TEXTO_MINIMO_VISTA) return null;
    return {
      titulo: (articulo.title || document.title || '').trim(),
      contenido: construirContenidoLimpio(articulo.content),
    };
  }

  // Saneamiento por lista de permitidos. Lo que devuelve Readability no se
  // inserta: se recorre y se arma de nuevo con elementos creados acá, solo
  // de estas etiquetas y solo con estos atributos. Lo que no está en la
  // lista no pasa: ni scripts, ni atributos on... o style, ni enlaces
  // javascript: (las direcciones se aceptan solo con los protocolos de abajo).
  const ETIQUETAS_VISTA = new Set([
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'figure',
    'figcaption', 'img', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark', 'abbr', 'cite',
    'q', 'time', 'br', 'hr', 'pre', 'code', 'kbd', 'samp', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr',
    'th', 'td', 'div', 'span', 'section', 'article',
  ]);
  // Estas se descartan con todo lo que tienen adentro. Cualquier otra
  // etiqueta que no esté permitida se reemplaza por su contenido.
  const ETIQUETAS_DESCARTADAS = new Set([
    'script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
    'form', 'input', 'button', 'select', 'textarea', 'option', 'svg', 'math', 'video', 'audio', 'source',
    'track', 'canvas', 'link', 'meta', 'base', 'head', 'title', 'dialog', 'map', 'area',
  ]);
  const ATRIBUTOS_VISTA = {
    '*': ['lang', 'dir', 'title'],
    img: ['alt'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan'],
    ol: ['start'],
    time: ['datetime'],
  };
  const PROTOCOLOS_ENLACE = ['http:', 'https:', 'mailto:'];
  const PROTOCOLOS_IMAGEN = ['http:', 'https:'];

  // La dirección absoluta si su protocolo está permitido; si no, null.
  function direccionPermitida(valor, protocolos) {
    try {
      const url = new URL(valor, document.baseURI);
      return protocolos.includes(url.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  function construirContenidoLimpio(origen) {
    const copiar = (nodo, destino) => {
      for (const hijo of nodo.childNodes) {
        if (hijo.nodeType === Node.TEXT_NODE) {
          destino.append(document.createTextNode(hijo.nodeValue));
          continue;
        }
        if (hijo.nodeType !== Node.ELEMENT_NODE) continue; // comentarios, etc.

        const etiqueta = hijo.localName;
        if (hijo.namespaceURI !== 'http://www.w3.org/1999/xhtml' || ETIQUETAS_DESCARTADAS.has(etiqueta)) continue;
        if (!ETIQUETAS_VISTA.has(etiqueta)) {
          copiar(hijo, destino);
          continue;
        }

        let nuevo = document.createElement(etiqueta);
        if (etiqueta === 'a') {
          // Solo http, https y mailto. Un enlace a otra parte de esta misma
          // página (o con una dirección no permitida) queda como texto.
          const url = direccionPermitida(hijo.getAttribute('href') ?? '', PROTOCOLOS_ENLACE);
          const mismaPagina = url && url.origin + url.pathname + url.search
            === location.origin + location.pathname + location.search;
          if (url && !mismaPagina) {
            nuevo.href = url.href;
            nuevo.rel = 'noopener noreferrer';
          } else {
            nuevo = document.createElement('span');
          }
        } else if (etiqueta === 'img') {
          const src = hijo.getAttribute('src') ?? '';
          const url = direccionPermitida(src, PROTOCOLOS_IMAGEN);
          if (url) {
            nuevo.src = url.href;
          } else if (/^data:image\/(png|jpe?g|gif|webp|avif);/i.test(src)) {
            nuevo.src = src;
          } else {
            continue; // sin una dirección aceptable no hay imagen
          }
          nuevo.alt = '';
          nuevo.loading = 'lazy';
        }

        for (const atributo of [...ATRIBUTOS_VISTA['*'], ...(ATRIBUTOS_VISTA[nuevo.localName] ?? [])]) {
          if (hijo.hasAttribute(atributo)) nuevo.setAttribute(atributo, hijo.getAttribute(atributo));
        }
        copiar(hijo, nuevo);
        destino.append(nuevo);
      }
    };

    const contenedor = document.createElement('div');
    copiar(origen, contenedor);
    return contenedor;
  }

  const TAMANIO_BASE_VISTA_PX = 18;
  const SIN_TEXTO_PRINCIPAL = 'Esta página no tiene un texto principal que se pueda mostrar en modo lectura.';

  // El artículo de la vista si está abierta (para Leer en voz alta); si no, null.
  let elementoDeLaVista = () => null;

  // La vista es una superposición dentro del Shadow DOM de la barra: los
  // estilos de la página no la alcanzan y no se abre ninguna pestaña. Queda
  // al lado de la barra para poder cambiar los ajustes mientras se lee, que
  // se le aplican con el mismo generarCss que a la página (destinosAjustes).
  // Accesibilidad: es un role="dialog" no modal (la barra se sigue usando)
  // con el título como nombre; al abrir el foco va al título, Escape o
  // "Volver a la vista original" la cierran y el foco vuelve al botón que la
  // abrió. Mientras está abierta <body> queda inerte, así ni Tab ni el
  // lector de pantalla entran a la página tapada; al cerrar vuelve a estar
  // como estaba. No cambia la visibilidad ni el foco de la pestaña: no
  // afecta el tiempo en foco ni cuenta como salida de la Tarea.
  // Devuelve el botón con su aviso para el panel Modo lectura (control),
  // abrir y abierta para manejarla desde afuera, y cómo enterarse de los
  // clics en sus enlaces (conectarEnlaces) y de su cierre (avisarAlCerrar).
  // Con vistaPrevia: true es la vista previa del docente: ocupa toda la
  // pantalla (no hay barra), lleva el cartel "Vista previa del docente" y
  // su botón dice "Cerrar vista previa".
  function crearVistaLectura(raiz, { vistaPrevia = false } = {}) {
    const nombre = vistaPrevia ? 'Vista previa del docente' : 'Vista de lectura limpia';
    const vista = crearElemento('div', vistaPrevia ? 'vista-lectura vista-previa' : 'vista-lectura');
    vista.hidden = true;
    vista.setAttribute('role', 'dialog');
    vista.setAttribute('aria-label', nombre);

    const botonVolver = crearElemento('button', 'secundario',
      vistaPrevia ? 'Cerrar vista previa' : 'Volver a la vista original');
    botonVolver.type = 'button';
    const encabezado = crearElemento('div', 'vista-encabezado');
    encabezado.append(
      vistaPrevia
        ? crearElemento('span', 'vista-cartel', 'Vista previa del docente')
        : crearElemento('span', 'vista-nombre', 'Vista de lectura'),
      botonVolver,
    );

    const titulo = crearElemento('h1', 'vista-titulo');
    titulo.tabIndex = -1; // recibe el foco al abrir
    const cuerpo = crearElemento('div', 'vista-cuerpo');
    const articulo = crearElemento('article', 'vista-articulo');
    articulo.append(titulo, cuerpo);
    const desplazable = crearElemento('div', 'vista-desplazable');
    desplazable.append(articulo);
    vista.append(encabezado, desplazable);

    const estilo = document.createElement('style');
    raiz.append(estilo, vista);
    destinosAjustes.push({ selector: '.vista-lectura', basePx: TAMANIO_BASE_VISTA_PX, estilo, filtros: raiz });

    const boton = crearElemento('button', '', 'Vista de lectura limpia');
    boton.type = 'button';
    boton.setAttribute('aria-pressed', 'false');
    // Siempre está en el panel (vacío no se ve), para que el lector de
    // pantalla anuncie el mensaje cuando aparece.
    const aviso = crearElemento('p', 'aviso');
    aviso.setAttribute('role', 'status');
    const control = crearElemento('div', 'control-vista');
    control.append(boton, aviso);

    let inerteAntes = false;
    let alCerrar = null;
    const abierta = () => !vista.hidden;

    // Devuelve true si se abrió. Si la página no tiene un texto principal no
    // abre nada y, salvo con avisar: false (quien llama muestra su propio
    // aviso), deja el mensaje bajo el botón del panel.
    const abrir = ({ avisar = true } = {}) => {
      aviso.textContent = '';
      const extraido = extraerContenidoPrincipal();
      if (!extraido) {
        if (avisar) aviso.textContent = SIN_TEXTO_PRINCIPAL;
        return false;
      }

      titulo.textContent = extraido.titulo || 'Sin título';
      cuerpo.replaceChildren(...extraido.contenido.childNodes);
      vista.setAttribute('aria-label', nombre + ': ' + titulo.textContent);
      aplicarModoLectura();
      vista.hidden = false;
      desplazable.scrollTop = 0;
      if (document.body) {
        inerteAntes = document.body.inert;
        document.body.inert = true;
      }
      boton.setAttribute('aria-pressed', 'true');
      titulo.focus();
      return true;
    };

    const cerrar = () => {
      if (!abierta()) return;
      vista.hidden = true;
      cuerpo.replaceChildren();
      if (document.body) document.body.inert = inerteAntes;
      boton.setAttribute('aria-pressed', 'false');
      // Si la barra está cerrada el botón no se puede enfocar: va al de reabrirla.
      boton.focus();
      if (raiz.activeElement !== boton) raiz.querySelector('button.reabrir')?.focus();
      if (alCerrar) alCerrar();
    };

    boton.addEventListener('click', () => (abierta() ? cerrar() : abrir()));
    botonVolver.addEventListener('click', () => cerrar());
    vista.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      cerrar();
    });

    // Con la Tarea en curso, un enlace de la vista también saca de la página:
    // pasa por el mismo diálogo "¿Salir de la actividad?" que los de la
    // página (lo conecta crearBarra con conectarEnlaces).
    let alClicEnEnlace = null;
    cuerpo.addEventListener('click', (evento) => {
      const enlace = evento.target.closest?.('a[href]');
      if (enlace && alClicEnEnlace) alClicEnEnlace(evento, enlace);
    });

    elementoDeLaVista = () => (abierta() ? articulo : null);
    return {
      control,
      abrir,
      abierta,
      conectarEnlaces: (alClic) => { alClicEnEnlace = alClic; },
      avisarAlCerrar: (funcion) => { alCerrar = funcion; },
    };
  }

  // ---------------------------------------------------------------------
  // Glosario con pictogramas (HU-006). La lista fija viene de glosario.json
  // (la lee background.js). Cada aparición se envuelve en un elemento propio
  // que solo contiene el texto original, así que al desactivar se reemplaza
  // por ese mismo texto y la página queda como estaba.
  // ---------------------------------------------------------------------

  const ETIQUETA_MARCA = 'apoyos-glosario-palabra';

  // Estilos inline con !important: le ganan a los estilos de la página.
  const ESTILO_MARCA = {
    'background-color': '#fff3bf',
    color: '#1f2328',
    'border-bottom': `2px dotted ${COLOR_PRINCIPAL}`,
    'border-radius': '2px',
    cursor: 'pointer',
  };

  // Las marcas viven en la página (fuera del Shadow DOM) y :focus-visible no
  // se puede poner inline, así que su anillo de foco va en una hoja de
  // estilos propia que existe solo mientras el glosario está activo.
  const ID_ESTILO_FOCO_MARCAS = 'apoyos-educativos-glosario-foco';

  function agregarFocoMarcas() {
    if (document.getElementById(ID_ESTILO_FOCO_MARCAS)) return;
    const estilo = document.createElement('style');
    estilo.id = ID_ESTILO_FOCO_MARCAS;
    estilo.textContent = `${ETIQUETA_MARCA}:focus-visible {
      outline: 3px solid ${COLOR_FOCO} !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 7px #1f2328 !important;
    }`;
    (document.head || document.documentElement).appendChild(estilo);
  }

  // No se resalta dentro de estos elementos: scripts y estilos, campos de
  // formulario, código, y elementos que ya reaccionan a un clic (enlaces,
  // botones, summary), para no cambiarles el comportamiento.
  const SALTEAR = [
    'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select', 'option',
    'button', 'a', 'summary', 'code', 'pre', 'svg', 'math', '[aria-hidden="true"]',
    '[contenteditable]:not([contenteditable="false"])', ETIQUETA_MARCA,
  ].join(', ');

  // Con NFD "ó" se separa en "o" + tilde; el primer carácter es la vocal sola.
  const quitarTilde = (vocal) => vocal.normalize('NFD')[0];

  // Singular y plurales simples: "humedal" → "humedales",
  // "migración" → "migraciones", "hábitat" → "hábitats".
  function formasDePalabra(palabra) {
    const base = palabra.trim().toLowerCase();
    const formas = new Set([base]);
    if (/[aeiouáéíóú]$/.test(base)) {
      formas.add(base + 's');
    } else {
      formas.add(base + 's');
      formas.add(base.replace(/([áéíóú])([ns])$/, (_, vocal, final) => quitarTilde(vocal) + final) + 'es');
    }
    return [...formas].sort((a, b) => b.length - a.length);
  }

  const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Una sola expresión con un grupo por entrada: el grupo que coincide dice
  // qué entrada es. Los límites con \p{L} funcionan con tildes y eñes.
  function crearBuscador(glosario) {
    const entradas = [...glosario].sort((a, b) => b.palabra.length - a.palabra.length);
    const grupos = entradas.map((entrada) => `(${formasDePalabra(entrada.palabra).map(escaparRegex).join('|')})`);
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${grupos.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const entradaDe = (coincidencia) => entradas[coincidencia.slice(1).findIndex((grupo) => grupo !== undefined)];
    return { regex, entradaDe };
  }

  function crearMarca(texto) {
    const marca = document.createElement(ETIQUETA_MARCA);
    marca.textContent = texto;
    for (const [propiedad, valor] of Object.entries(ESTILO_MARCA)) {
      marca.style.setProperty(propiedad, valor, 'important');
    }
    marca.tabIndex = 0;
    marca.setAttribute('role', 'button');
    marca.setAttribute('aria-haspopup', 'dialog');
    marca.setAttribute('aria-expanded', 'false');
    return marca;
  }

  // Devuelve un Map marca → entrada del glosario.
  function resaltarPalabras(buscador) {
    const marcas = new Map();
    if (!document.body) return marcas;

    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(nodo) {
        if (!nodo.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const padre = nodo.parentElement;
        return padre && !padre.closest(SALTEAR) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    // Primero se juntan los nodos: modificar el DOM durante el recorrido lo corta.
    const nodos = [];
    while (recorrido.nextNode()) nodos.push(recorrido.currentNode);

    for (const nodo of nodos) {
      const texto = nodo.nodeValue;
      const coincidencias = [...texto.matchAll(buscador.regex)];
      if (coincidencias.length === 0) continue;

      const fragmento = document.createDocumentFragment();
      let desde = 0;
      for (const coincidencia of coincidencias) {
        if (coincidencia.index > desde) {
          fragmento.append(texto.slice(desde, coincidencia.index));
        }
        const marca = crearMarca(coincidencia[0]);
        marcas.set(marca, buscador.entradaDe(coincidencia));
        fragmento.append(marca);
        desde = coincidencia.index + coincidencia[0].length;
      }
      if (desde < texto.length) fragmento.append(texto.slice(desde));
      nodo.parentNode.replaceChild(fragmento, nodo);
    }
    return marcas;
  }

  function quitarResaltado(marcas) {
    const padres = new Set();
    for (const marca of marcas.keys()) {
      const padre = marca.parentNode;
      if (!padre) continue; // la página lo sacó por su cuenta
      padre.replaceChild(document.createTextNode(marca.textContent), marca);
      padres.add(padre);
    }
    // Vuelve a unir los pedazos de texto como estaban antes de resaltar.
    for (const padre of padres) padre.normalize();
  }

  function crearTarjeta(raiz) {
    const tarjeta = crearElemento('div', 'tarjeta');
    tarjeta.hidden = true;
    tarjeta.setAttribute('role', 'dialog');

    const pictograma = crearElemento('span', 'pictograma');
    pictograma.setAttribute('aria-hidden', 'true');
    const palabra = crearElemento('p', 'tarjeta-palabra');

    const botonCerrar = crearElemento('button', 'cerrar', '×');
    botonCerrar.type = 'button';
    botonCerrar.setAttribute('aria-label', 'Cerrar definición');

    const encabezado = crearElemento('div', 'tarjeta-encabezado');
    encabezado.append(pictograma, palabra, botonCerrar);
    const definicion = crearElemento('p', 'tarjeta-definicion');
    definicion.id = 'tarjeta-definicion';
    // Alternativa más fácil: "Más fácil: bañado".
    const sinonimo = crearElemento('p', 'tarjeta-sinonimo');
    sinonimo.id = 'tarjeta-sinonimo';
    const sinonimoPalabra = crearElemento('strong');
    sinonimo.append(document.createTextNode('Más fácil: '), sinonimoPalabra);
    tarjeta.append(encabezado, definicion, sinonimo);
    // Al recibir el foco, el lector anuncia "Definición de <palabra>" y
    // después la definición y el sinónimo. Un elemento oculto (el sinónimo
    // cuando no hay) se saltea solo.
    tarjeta.setAttribute('aria-describedby', `${definicion.id} ${sinonimo.id}`);
    raiz.appendChild(tarjeta);

    const MARGEN = 8;
    let marcaActual = null;

    // position: fixed respecto de la ventana: debajo de la palabra, o arriba
    // si no entra, y sin salirse por los costados.
    const ubicar = () => {
      if (!marcaActual) return;
      const rect = marcaActual.getBoundingClientRect();
      const alto = tarjeta.offsetHeight;
      const ancho = tarjeta.offsetWidth;
      let arriba = rect.bottom + 6;
      if (arriba + alto > window.innerHeight - MARGEN && rect.top - alto - 6 >= MARGEN) {
        arriba = rect.top - alto - 6;
      }
      const izquierda = Math.min(Math.max(rect.left, MARGEN), window.innerWidth - ancho - MARGEN);
      tarjeta.style.top = `${arriba}px`;
      tarjeta.style.left = `${Math.max(izquierda, MARGEN)}px`;
    };

    const ocultar = ({ devolverFoco = false } = {}) => {
      if (!marcaActual) return;
      const marca = marcaActual;
      marcaActual = null;
      tarjeta.hidden = true;
      marca.setAttribute('aria-expanded', 'false');
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
      if (devolverFoco && marca.isConnected) marca.focus();
    };

    const mostrar = (marca, entrada) => {
      if (marcaActual) marcaActual.setAttribute('aria-expanded', 'false');
      marcaActual = marca;
      marca.setAttribute('aria-expanded', 'true');
      pictograma.textContent = entrada.pictograma;
      palabra.textContent = entrada.palabra;
      tarjeta.setAttribute('aria-label', `Definición de ${entrada.palabra}`);
      definicion.textContent = entrada.definicion;
      sinonimoPalabra.textContent = entrada.sinonimo;
      sinonimo.hidden = !entrada.sinonimo;
      tarjeta.hidden = false;
      ubicar();
      window.addEventListener('scroll', ubicar, { capture: true, passive: true });
      window.addEventListener('resize', ubicar, { passive: true });
      botonCerrar.focus({ preventScroll: true });
    };

    botonCerrar.addEventListener('click', () => ocultar({ devolverFoco: true }));

    // La tarjeta no es modal: Tab o Mayús+Tab la cierran y devuelven el foco
    // a la palabra sin cancelar la tecla, así el navegador sigue desde ahí
    // hacia el próximo (o el anterior) elemento de la página.
    tarjeta.addEventListener('keydown', (evento) => {
      if (evento.key === 'Tab') ocultar({ devolverFoco: true });
    });

    return { mostrar, ocultar, abierta: () => marcaActual !== null };
  }

  function configurarGlosario(boton, raiz) {
    const tarjeta = crearTarjeta(raiz);
    let buscador = null;
    let marcas = new Map(); // vacío mientras el glosario está desactivado

    // Se escucha en fase de captura para que la página no pueda frenar el
    // evento antes. Los clics dentro del Shadow DOM (barra y tarjeta) llegan
    // con el host como target y no cierran la tarjeta.
    const alHacerClic = (evento) => {
      if (evento.target.closest?.('apoyos-educativos-barra')) return;
      const marca = evento.target.closest?.(ETIQUETA_MARCA);
      if (marca && marcas.has(marca)) {
        evento.preventDefault();
        tarjeta.mostrar(marca, marcas.get(marca));
      } else {
        tarjeta.ocultar();
      }
    };

    const alPresionarTecla = (evento) => {
      const marca = evento.target.closest?.(ETIQUETA_MARCA);
      if (marca && marcas.has(marca) && (evento.key === 'Enter' || evento.key === ' ')) {
        evento.preventDefault();
        tarjeta.mostrar(marca, marcas.get(marca));
      } else if (evento.key === 'Escape' && tarjeta.abierta()) {
        evento.stopPropagation(); // que no cierre además el panel abierto de la barra
        tarjeta.ocultar({ devolverFoco: true });
      }
    };

    const activar = async () => {
      if (!buscador) {
        boton.disabled = true;
        let respuesta;
        try {
          respuesta = await chrome.runtime.sendMessage({ tipo: 'obtenerGlosario' });
        } catch {
          respuesta = null;
        }
        boton.disabled = false;
        if (!respuesta?.ok || respuesta.glosario.length === 0) {
          boton.title = 'No se pudo cargar el glosario.';
          return;
        }
        buscador = crearBuscador(respuesta.glosario);
        boton.removeAttribute('title');
      }

      marcas = resaltarPalabras(buscador);
      agregarFocoMarcas();
      document.addEventListener('click', alHacerClic, true);
      document.addEventListener('keydown', alPresionarTecla, true);
      boton.setAttribute('aria-pressed', 'true');
      registrarMetrica({ tipo: 'apoyo', apoyo: 'glosario' });
    };

    const desactivar = () => {
      tarjeta.ocultar();
      document.removeEventListener('click', alHacerClic, true);
      document.removeEventListener('keydown', alPresionarTecla, true);
      quitarResaltado(marcas);
      document.getElementById(ID_ESTILO_FOCO_MARCAS)?.remove();
      marcas = new Map();
      boton.setAttribute('aria-pressed', 'false');
    };

    boton.addEventListener('click', () => {
      if (boton.getAttribute('aria-pressed') === 'true') {
        desactivar();
      } else {
        activar();
      }
    });
  }

  // ---------------------------------------------------------------------
  // Devolución del docente. Los mensajes se piden al crear la barra (para
  // mostrar cuántos no leídos hay en rojo sobre el botón) y otra vez cada
  // vez que se abre el panel, que además los marca como leídos. Funciona
  // igual con la Tarea sin empezar, en curso o finalizada.
  // ---------------------------------------------------------------------

  // "2026-09-28 14:05:00" (hora del servidor) -> "28/09/2026 14:05"
  function formatearFechaMensaje(fechaMysql) {
    const fecha = new Date(fechaMysql.replace(' ', 'T'));
    return fecha.toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function crearPanelDevolucion() {
    const boton = crearBotonPanel(ICONOS.devolucion, 'Devolución', 'panel-devolucion');
    const insignia = crearElemento('span', 'no-leidos');
    insignia.setAttribute('aria-hidden', 'true'); // la cantidad va en el aria-label del botón
    insignia.hidden = true;
    boton.append(insignia);

    const panel = crearElemento('div', 'panel');
    panel.id = 'panel-devolucion';
    panel.hidden = true;

    const aviso = crearElemento('p', 'aviso');
    const error = crearElemento('p', 'error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const lista = crearElemento('ul', 'mensajes');
    panel.append(crearElemento('p', 'tarea-subtitulo', 'Devoluciones de tu docente'), error, aviso, lista);

    const mostrarNoLeidos = (cantidad) => {
      insignia.hidden = cantidad === 0;
      insignia.textContent = cantidad > 9 ? '9+' : String(cantidad);
      boton.setAttribute('aria-label', cantidad === 0
        ? 'Devolución'
        : `Devolución, ${cantidad} ${cantidad === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}`);
    };

    // Los que no estaban leídos se muestran como "Nuevo" mientras el panel
    // sigue abierto, aunque ya se hayan marcado como leídos.
    const crearItem = (mensaje) => {
      const item = crearElemento('li', mensaje.leido ? '' : 'nuevo');
      const fecha = crearElemento('div', 'mensaje-fecha');
      fecha.append(crearElemento('span', '', formatearFechaMensaje(mensaje.fecha_envio)));
      if (!mensaje.leido) fecha.append(crearElemento('span', 'mensaje-nuevo', 'Nuevo'));
      item.append(fecha, crearElemento('p', 'mensaje-texto', mensaje.texto)); // textContent: no se interpreta como HTML
      return item;
    };

    // Devuelve la cantidad de no leídos, o null si no se pudieron traer.
    async function cargar() {
      let respuesta;
      try {
        respuesta = await chrome.runtime.sendMessage({ tipo: 'obtenerMensajes', actividadId, token });
      } catch {
        respuesta = null;
      }
      if (!respuesta?.ok || !Array.isArray(respuesta.cuerpo?.mensajes)) {
        error.textContent = textoError(respuesta, 'No se pudieron cargar las devoluciones.');
        error.hidden = false;
        return null;
      }

      const { mensajes, no_leidos: noLeidos } = respuesta.cuerpo;
      error.hidden = true;
      lista.replaceChildren(...mensajes.map(crearItem));
      aviso.textContent = 'Todavía no tenés devoluciones.';
      aviso.hidden = mensajes.length > 0;
      mostrarNoLeidos(noLeidos);
      return noLeidos;
    }

    async function alAbrir() {
      const noLeidos = await cargar();
      if (!noLeidos) return;

      let respuesta;
      try {
        respuesta = await chrome.runtime.sendMessage({ tipo: 'marcarMensajesLeidos', actividadId, token });
      } catch {
        respuesta = null;
      }
      // Si falla se deja el número: se vuelve a intentar la próxima vez que se abra.
      if (respuesta?.ok) mostrarNoLeidos(0);
    }

    mostrarNoLeidos(0);
    cargar();
    return { boton, panel, alAbrir };
  }

  // ---------------------------------------------------------------------
  // Mi clase (HU-017): las actividades de la clase de esta actividad que el
  // estudiante tiene asignadas, para abrir otra sin volver al panel web. La
  // lista se le pide a background.js cada vez que se abre el panel, así el
  // estado no queda viejo. Cada actividad trae su enlace ya firmado por el
  // backend; la actual no trae enlace y no se puede tocar.
  // Tocar una tarjeta carga esa actividad en esta misma pestaña. Con la
  // Tarea en curso eso es salir de la página: primero pasa por el mismo
  // diálogo que los enlaces del recurso (confirmarSalida) y, si el estudiante
  // confirma, la Tarea se finaliza antes de navegar. El tiempo en foco
  // pendiente lo manda el contador al ocultarse la página, como siempre.
  // ---------------------------------------------------------------------

  const ESTADOS_ACTIVIDAD = {
    en_curso: { texto: 'En curso', clase: 'insignia en-curso' },
    sin_empezar: { texto: 'Sin empezar', clase: 'insignia' },
    finalizada: { texto: '✓ Finalizada', clase: 'insignia' },
  };

  function crearPanelMiClase(raiz, confirmarSalida) {
    const boton = crearBotonPanel(ICONOS.clase, 'Mi clase', 'panel-mi-clase');

    const panel = crearElemento('div', 'panel');
    panel.id = 'panel-mi-clase';
    panel.hidden = true;

    const subtitulo = crearElemento('p', 'tarea-subtitulo', 'Actividades de tu clase');
    const aviso = crearElemento('p', 'aviso');
    aviso.hidden = true;
    const error = crearElemento('p', 'error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const pendientes = crearElemento('ul', 'actividades-clase');
    const tituloFinalizadas = crearElemento('p', 'finalizadas-titulo', 'Finalizadas');
    tituloFinalizadas.id = 'mi-clase-finalizadas';
    tituloFinalizadas.hidden = true;
    const finalizadas = crearElemento('ul', 'actividades-clase');
    finalizadas.setAttribute('aria-labelledby', tituloFinalizadas.id);
    finalizadas.hidden = true;
    panel.append(subtitulo, error, aviso, pendientes, tituloFinalizadas, finalizadas);

    const mostrarError = (texto) => {
      error.textContent = texto;
      error.hidden = false;
    };

    let abriendo = false;

    async function abrirActividad(url, tarjeta) {
      if (abriendo) return;
      // El enlace viene del backend, pero el recurso lo cargó el docente: solo páginas web.
      let destino;
      try {
        destino = new URL(url);
      } catch {
        destino = null;
      }
      if (!destino || !['http:', 'https:'].includes(destino.protocol)) {
        mostrarError('No se pudo abrir la actividad.');
        return;
      }

      abriendo = true;
      error.hidden = true;
      const salida = await confirmarSalida('Si abrís otra actividad, la Tarea de esta se finaliza.');
      if (salida !== 'salir') {
        abriendo = false;
        if (salida === 'error') mostrarError('No se pudo finalizar la tarea. No se abrió la otra actividad.');
        // El diálogo se llevó el foco: vuelve a la tarjeta, salvo que mientras
        // tanto se haya abierto otro (el aviso de finalización por salida).
        if (!raiz.querySelector('.dialogo')) tarjeta.focus();
        return;
      }

      // Mismo recurso que el de esta página: cambiar solo el "#apoyos=" no la
      // recarga y la barra quedaría en la actividad vieja.
      const mismaPagina = destino.origin + destino.pathname + destino.search
        === location.origin + location.pathname + location.search;
      location.assign(destino.href);
      if (mismaPagina) location.reload();
    }

    // textContent: el título no se interpreta como HTML.
    const crearItem = (actividad) => {
      const estado = ESTADOS_ACTIVIDAD[actividad.estado] ?? ESTADOS_ACTIVIDAD.sin_empezar;
      const pasos = Number.isInteger(actividad.cantidad_pasos) ? actividad.cantidad_pasos : 0;
      const abrible = actividad.actual !== true && typeof actividad.url === 'string';

      // La actual no es un botón: no lleva a ningún lado.
      const tarjeta = crearElemento(abrible ? 'button' : 'div', 'actividad-clase');
      if (abrible) {
        tarjeta.type = 'button';
        tarjeta.addEventListener('click', () => abrirActividad(actividad.url, tarjeta));
      }
      if (actividad.actual === true) {
        tarjeta.classList.add('actual');
        tarjeta.setAttribute('aria-current', 'true');
      }
      if (actividad.estado === 'finalizada') tarjeta.classList.add('finalizada');

      const datos = crearElemento('span', 'actividad-datos');
      datos.append(
        crearElemento('span', '', pasos === 1 ? '1 paso' : `${pasos} pasos`),
        crearElemento('span', estado.clase, estado.texto),
      );
      if (actividad.actual === true) datos.append(crearElemento('span', 'insignia aqui', 'Estás aquí'));
      tarjeta.append(crearElemento('span', 'actividad-titulo', String(actividad.titulo ?? '')), datos);

      const item = crearElemento('li');
      item.append(tarjeta);
      return item;
    };

    async function alAbrir() {
      let respuesta;
      try {
        respuesta = await chrome.runtime.sendMessage({ tipo: 'obtenerActividadesClase', token });
      } catch {
        respuesta = null;
      }
      if (!respuesta?.ok || !Array.isArray(respuesta.cuerpo?.actividades)) {
        mostrarError(textoError(respuesta, 'No se pudieron cargar las actividades.'));
        return;
      }

      const { actividades, clase } = respuesta.cuerpo;
      const nombreClase = typeof clase?.nombre === 'string' ? clase.nombre.trim() : '';
      subtitulo.textContent = nombreClase ? `Actividades de ${nombreClase}` : 'Actividades de tu clase';
      error.hidden = true;

      const terminadas = actividades.filter((actividad) => actividad.estado === 'finalizada');
      pendientes.replaceChildren(...actividades.filter((a) => a.estado !== 'finalizada').map(crearItem));
      finalizadas.replaceChildren(...terminadas.map(crearItem));
      pendientes.hidden = pendientes.childElementCount === 0;
      tituloFinalizadas.hidden = terminadas.length === 0;
      finalizadas.hidden = terminadas.length === 0;

      aviso.textContent = actividades.length === 0
        ? 'No hay actividades para mostrar.'
        : 'No tenés otras actividades en esta clase.';
      aviso.hidden = actividades.some((actividad) => actividad.actual !== true);
    }

    return { boton, panel, alAbrir };
  }

  // ---------------------------------------------------------------------
  // Tarea (HU-007): pasos cargados por el docente y cronómetro.
  // Tiene tres estados, guardados en el backend (actividad_estudiante):
  //   sin empezar: los pasos se ven pero no se pueden marcar; botón "Empezar".
  //   en curso:    se marcan pasos; cronómetro desde iniciada_en; "Finalizar".
  //   finalizada:  todo en solo lectura, con el tiempo total.
  // Empezar, finalizar y marcar pasos se le pide al background.js.
  // HU-016: el docente puede reabrir una Tarea finalizada. Esta barra no se
  // entera sola: sigue en "finalizada" (y sin registrar métricas) hasta que
  // el estudiante recarga la página. Ahí el backend ya la informa en curso,
  // con el tiempo trabajado antes en segundos_desde_inicio: el cronómetro
  // sigue desde ese valor, sin pasar por «Empezar» ni por su aviso.
  // Un paso es una pregunta de opción múltiple (una casilla por opción, se
  // pueden tildar varias) o una de verdadero o falso (dos radios como botones
  // lado a lado).
  // ---------------------------------------------------------------------

  function textoError(respuesta, porDefecto) {
    if (respuesta?.status === 401) {
      return 'No se pudo verificar el acceso a esta actividad. Volvé a abrirla desde tu panel.';
    }
    return respuesta?.cuerpo?.error || porDefecto;
  }

  // mm:ss, o h:mm:ss a partir de la hora.
  function formatearDuracion(segundosTotales) {
    const segundos = Math.max(0, Math.floor(segundosTotales));
    const h = Math.floor(segundos / 3600);
    const mm = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
    const ss = String(segundos % 60).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  // La misma duración para el lector de pantalla: "1 hora, 3 minutos y 5 segundos".
  function formatearDuracionHablada(segundosTotales) {
    const segundos = Math.max(0, Math.floor(segundosTotales));
    const unidades = [
      [Math.floor(segundos / 3600), 'hora', 'horas'],
      [Math.floor((segundos % 3600) / 60), 'minuto', 'minutos'],
      [segundos % 60, 'segundo', 'segundos'],
    ];
    const partes = unidades
      .filter(([cantidad]) => cantidad > 0)
      .map(([cantidad, singular, plural]) => `${cantidad} ${cantidad === 1 ? singular : plural}`);
    if (partes.length === 0) return '0 segundos';
    const ultima = partes.pop();
    return partes.length > 0 ? `${partes.join(', ')} y ${ultima}` : ultima;
  }

  // antesDeFinalizar se espera (puede devolver una promesa) antes de pedirle
  // al backend que finalice. alFinalizar se llama cada vez que el estado
  // queda en "finalizada" (también al cargar una tarea que ya lo estaba).
  // Salida de la pestaña: con la Tarea en curso el estudiante tiene que
  // quedarse en la pestaña; si sale, la Tarea se finaliza sola.
  //   GRACIA_OCULTA_MS:   espera desde que la pestaña queda oculta (cambio de
  //                       pestaña, ventana minimizada). 0 = finaliza al instante.
  //   GRACIA_BLUR_MS:     espera desde que la ventana pierde el foco sin
  //                       quedar oculta (otra aplicación, barra de direcciones,
  //                       Ctrl+F, un diálogo del sistema). Si el foco vuelve
  //                       antes, no se finaliza.
  //   FINALIZAR_POR_BLUR: false apaga la finalización por pérdida de foco;
  //                       queda solo la de pestaña oculta.
  const GRACIA_OCULTA_MS = 0;
  const GRACIA_BLUR_MS = 5000;
  const FINALIZAR_POR_BLUR = true;
  // Cada cuánto se mira si la ventana sigue teniendo el foco.
  const REVISION_FOCO_MS = 250;
  // Respaldo de la finalización por salida (navigator.sendBeacon). Es el
  // único pedido que no pasa por background.js; tiene que coincidir con su API_BASE.
  const URL_FINALIZAR_RESPALDO = 'http://localhost/apoyos-educativos/backend/api/tarea_finalizar.php';

  function crearPanelTarea(actividad, { raiz, antesDeFinalizar, tomarFocoPendiente, alFinalizar }) {
    const pasos = actividad.pasos || [];
    const panel = crearElemento('div', 'panel');
    panel.id = 'panel-tarea';
    panel.hidden = true;

    let estado = 'sin_empezar'; // 'sin_empezar' | 'en_curso' | 'finalizada'
    let cambiandoEstado = false; // mientras se espera la respuesta de empezar o finalizar
    const puedeMarcar = () => estado === 'en_curso' && !cambiandoEstado;

    const encabezado = crearElemento('div', 'tarea-encabezado');
    const contador = crearElemento('span', 'valor');
    contador.setAttribute('aria-live', 'polite');
    encabezado.append(crearElemento('p', 'tarea-subtitulo', 'Pasos'), contador);

    const mensaje = crearElemento('p', 'error');
    mensaje.setAttribute('role', 'alert');
    mensaje.hidden = true;

    const mostrarError = (texto) => {
      mensaje.textContent = texto;
      mensaje.hidden = false;
    };

    // Cada paso aporta una función que dice si está hecho, para el contador
    // y para el aviso de pasos faltantes al finalizar.
    const estanHechos = [];
    const contarHechos = () => estanHechos.filter((estaHecho) => estaHecho()).length;
    // Cada paso también aporta una función que rehace su aria-label
    // ("Paso 2, opción múltiple, sin responder: ..."); se llaman junto con
    // el contador, que se actualiza en cada cambio de cualquier paso.
    const etiquetasPasos = [];
    const actualizarContador = () => {
      contador.textContent = `${contarHechos()} de ${estanHechos.length} ${estanHechos.length === 1 ? 'paso' : 'pasos'}`;
      etiquetasPasos.forEach((etiquetar) => etiquetar());
    };

    // Avisos para el lector de pantalla al empezar o finalizar (no se ven).
    const anuncio = crearElemento('p', 'solo-lector');
    anuncio.setAttribute('role', 'status');
    anuncio.setAttribute('aria-live', 'polite');

    // HU-018: pasos cuya justificación ya vio el estudiante. Su respuesta no
    // se cambia más (el backend también lo rechaza), tampoco si el docente
    // reabre la Tarea.
    const pasosBloqueados = new Set(
      pasos.filter((paso) => paso.respuesta_bloqueada === true).map((paso) => paso.id));
    const puedeMarcarPaso = (pasoId) => puedeMarcar() && !pasosBloqueados.has(pasoId);

    // HU-018: la producción propia de cada paso (crearProduccion), si la
    // actividad la pide.
    const conProduccion = actividad.produccion_propia === true;
    const producciones = [];

    // Todas las casillas y radios de los pasos (cada uno con el id de su
    // paso), para habilitarlos o no según el estado.
    const controles = [];
    const lista = crearElemento('ol', 'pasos');

    const refrescarPasos = () => {
      controles.forEach(({ control, pasoId }) => { control.disabled = !puedeMarcarPaso(pasoId); });
      producciones.forEach((produccion) => produccion.refrescar());
      lista.classList.toggle('bloqueada', estado !== 'en_curso');
    };

    // Le pide a background.js que guarde el paso. Devuelve el cuerpo de la
    // respuesta si se guardó; si no, muestra el error, devuelve null y el que
    // llama revierte el cambio.
    async function guardar(pedido) {
      mensaje.hidden = true;
      let respuesta;
      try {
        respuesta = await chrome.runtime.sendMessage({ ...pedido, token });
      } catch {
        respuesta = null;
      }
      if (respuesta?.ok) return respuesta.cuerpo ?? {};

      // La justificación se vio desde otra pestaña: el paso queda fijo acá también.
      if (respuesta?.cuerpo?.respuesta_bloqueada === true) pasosBloqueados.add(pedido.pasoId);
      mostrarError(textoError(respuesta, 'No se pudo guardar el paso.'));
      return null;
    }

    // HU-018: botón "¿Por qué?" de un paso y el lugar donde se muestra la
    // justificación del docente. El botón aparece cuando el backend avisa
    // que hay una para mostrar (justificacion_disponible: el paso ya está
    // respondido). El texto no viene con la actividad: se pide recién al
    // tocar el botón, después de avisar que verlo deja fija la respuesta.
    // No registra ninguna métrica. alBloquear rehace el estado del paso.
    function crearJustificacion(paso, alBloquear) {
      const boton = crearElemento('button', 'secundario por-que', '¿Por qué?');
      boton.type = 'button';
      boton.setAttribute('aria-label', `¿Por qué? Ver la justificación del paso ${paso.orden}`);
      boton.hidden = paso.justificacion_disponible !== true;

      const texto = crearElemento('p', 'justificacion');
      texto.tabIndex = -1; // recibe el foco al mostrarse, para que el lector lo lea
      texto.hidden = true;

      boton.addEventListener('click', async () => {
        // Si ya la había visto (recargó la página) no hay nada que avisar.
        if (!pasosBloqueados.has(paso.id)) {
          const confirmo = await abrirDialogo(raiz, {
            titulo: '¿Ver la justificación?',
            texto: 'Si la ves, ya no vas a poder cambiar tu respuesta de este paso.',
            botones: [
              { texto: 'Ver la justificación', valor: true },
              { texto: 'Cancelar', valor: false, secundario: true, foco: true },
            ],
            valorEscape: false,
          });
          if (!confirmo) {
            boton.focus();
            return;
          }
        }

        boton.disabled = true;
        mensaje.hidden = true;
        let respuesta;
        try {
          respuesta = await chrome.runtime.sendMessage({ tipo: 'verJustificacion', pasoId: paso.id, token });
        } catch {
          respuesta = null;
        }
        boton.disabled = false;

        const justificacion = respuesta?.cuerpo?.justificacion;
        if (!respuesta?.ok || typeof justificacion !== 'string') {
          mostrarError(textoError(respuesta, 'No se pudo mostrar la justificación.'));
          boton.focus();
          return;
        }

        pasosBloqueados.add(paso.id);
        alBloquear();
        // Como texto, no como HTML: lo escribió el docente.
        texto.replaceChildren(crearElemento('strong', '', 'Justificación'), justificacion);
        texto.hidden = false;
        boton.hidden = true;
        texto.focus();
      });

      // Con la justificación ya a la vista el botón no vuelve.
      const mostrarBoton = (disponible) => {
        if (texto.hidden) boton.hidden = !disponible;
      };
      return { boton, texto, mostrarBoton };
    }

    // --- Producción propia (HU-018) ---
    // Los mismos límites que valida el backend (config/produccion.php).
    const CITA_MAX = 1000;
    const CITA_SEGUNDOS_MAX = 86400;
    const EXPLICACION_MAX = 2000;
    // Pausa al escribir después de la cual se guarda la explicación.
    const GUARDADO_MS = 1500;
    const NO_PEGAR = 'Acá no se puede pegar. Escribilo con tus palabras.';
    // Lo que beforeinput informa cuando el texto llega pegado o arrastrado
    // (también desde el menú, el historial del portapapeles o el teclado), y
    // cuando se corta o se arrastra hacia afuera. Escribir, dictar, el
    // corrector y los métodos de entrada no están en la lista.
    const ENTRADAS_BLOQUEADAS = new Set([
      'insertFromPaste', 'insertFromPasteAsQuotation', 'insertFromDrop', 'insertFromYank',
      'deleteByCut', 'deleteByDrag',
    ]);

    const unirEspacios = (texto) => texto.replace(/\s+/g, ' ').trim();

    // El fragmento del material que el estudiante tiene seleccionado, o ''.
    // El material es la página o, si está abierta, la vista de lectura limpia.
    // La vista vive en el Shadow DOM de la barra (cerrado): desde document no
    // se ve su selección, así que se le pide a la raíz. Lo seleccionado en
    // el panel (la consigna de un paso, una opción) no cuenta como cita.
    function leerSeleccionDelMaterial() {
      const articulo = raiz.querySelector('.vista-articulo');
      if (articulo) {
        try {
          const enVista = typeof raiz.getSelection === 'function' ? raiz.getSelection() : null;
          if (enVista && !enVista.isCollapsed && enVista.rangeCount > 0
              && articulo.contains(enVista.getRangeAt(0).commonAncestorContainer)) {
            return unirEspacios(enVista.toString());
          }
          // Navegadores sin getSelection en la raíz: los rangos compuestos.
          const seleccion = document.getSelection();
          const rango = typeof seleccion?.getComposedRanges === 'function'
            ? seleccion.getComposedRanges({ shadowRoots: [raiz] })[0]
            : null;
          if (rango && !rango.collapsed
              && articulo.contains(rango.startContainer) && articulo.contains(rango.endContainer)) {
            const copia = document.createRange();
            copia.setStart(rango.startContainer, rango.startOffset);
            copia.setEnd(rango.endContainer, rango.endOffset);
            return unirEspacios(copia.toString());
          }
        } catch {
          // Sigue con la selección de la página.
        }
      }

      const enPagina = document.getSelection();
      if (!enPagina || enPagina.isCollapsed || enPagina.rangeCount === 0) return '';
      // Una selección hecha dentro de la barra llega acá apuntando al
      // elemento que la contiene: no es del material.
      const nodo = enPagina.getRangeAt(0).commonAncestorContainer;
      if (nodo === raiz.host || raiz.host.contains(nodo)) return '';
      return unirEspacios(enPagina.toString());
    }

    // Última selección del material. Al activar "Citar selección" con el
    // mouse la selección se puede perder justo en ese clic: si se vació hace
    // un instante, vale la que había.
    let ultimaSeleccion = '';
    let seleccionVaciaDesdeMs = null;
    if (conProduccion) {
      document.addEventListener('selectionchange', () => {
        const texto = leerSeleccionDelMaterial();
        if (texto !== '') {
          ultimaSeleccion = texto;
          seleccionVaciaDesdeMs = null;
        } else {
          seleccionVaciaDesdeMs ??= Date.now();
        }
      });
    }

    const tomarSeleccion = () => {
      const texto = leerSeleccionDelMaterial();
      if (texto !== '') return texto;
      const recienVaciada = seleccionVaciaDesdeMs !== null && Date.now() - seleccionVaciaDesdeMs < 1000;
      return recienVaciada ? ultimaSeleccion : '';
    };

    // Último texto arrastrado o copiado desde el material. Junto con
    // ultimaSeleccion es lo único que se acepta al soltar o pegar en el campo
    // de la cita: así se comprueba que salió del material y no de otro lado.
    // Los eventos copy y dragstart cruzan el Shadow DOM, pero desde document
    // los que nacen adentro llegan con el destino cambiado al host: se
    // escuchan también en la raíz, donde se ve si salieron de la vista de
    // lectura limpia. En los dos casos decide leerSeleccionDelMaterial, que
    // descarta lo seleccionado en el panel. Sin selección (se arrastra un
    // enlace, por ejemplo) vale el texto del arrastre, si salió del material.
    let ultimoArrastradoOCopiado = '';
    const registrarDelMaterial = (evento, desdeRaiz) => {
      let texto = leerSeleccionDelMaterial();
      if (texto === '' && evento.type === 'dragstart') {
        const camino = evento.composedPath();
        const articulo = raiz.querySelector('.vista-articulo');
        const delMaterial = desdeRaiz
          ? articulo !== null && camino.includes(articulo)
          : !camino.includes(raiz.host);
        if (delMaterial) texto = unirEspacios(evento.dataTransfer?.getData('text/plain') ?? '');
      }
      if (texto !== '') ultimoArrastradoOCopiado = texto;
    };
    if (conProduccion && actividad.produccion_modo === 'cita_texto') {
      for (const tipo of ['copy', 'dragstart']) {
        document.addEventListener(tipo, (evento) => registrarDelMaterial(evento, false), true);
        raiz.addEventListener(tipo, (evento) => registrarDelMaterial(evento, true), true);
      }
    }

    // Texto soltado o pegado en el campo de la cita, normalizado; '' si no
    // coincide con lo último seleccionado, arrastrado o copiado del material.
    const textoDelMaterial = (crudo) => {
      const texto = unirEspacios(crudo ?? '');
      return texto !== '' && (texto === ultimaSeleccion || texto === ultimoArrastradoOCopiado) ? texto : '';
    };

    // "mm:ss" (o "h:mm:ss") escrito a mano, en segundos; null si no se entiende.
    const leerMinuto = (texto) => {
      const partes = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(texto.trim());
      if (!partes) return null;
      const [, horas, minutos, segundos] = partes;
      if (horas !== undefined && Number(minutos) > 59) return null;
      const total = Number(horas ?? 0) * 3600 + Number(minutos) * 60 + Number(segundos);
      return total <= CITA_SEGUNDOS_MAX ? total : null;
    };

    // Bloque de producción propia de un paso: la cita del material (un campo
    // de solo lectura que se llena con "Citar selección": no se tipea ni se
    // pega) y la explicación, en un campo donde no se puede pegar, cortar,
    // soltar texto ni abrir el menú contextual. El bloqueo es solo de ese
    // campo: el material, la consigna y los pasos se seleccionan y se copian
    // como siempre. Todo se guarda solo: la cita al tomarla y la explicación
    // después de una pausa al escribir y al salir del campo.
    // Según la modalidad (produccion_modo) se arma solo una parte: la cita
    // (cita_texto), el texto libre (texto_libre), o el momento citado y el
    // texto (momento_video).
    // Si el material es un video o audio (momento_video) la
    // cita es un momento: "Citar este momento" le pide a background.js el
    // segundo en que va el reproductor de la página (también si está en un
    // iframe). Como respaldo, siempre se puede escribir el minuto a mano:
    // sirve si no se encontró el reproductor o si se leyó otro (un aviso
    // publicitario, por ejemplo). No se copian subtítulos.
    function crearProduccion(paso) {
      const modo = actividad.produccion_modo;
      const esMedio = modo === 'momento_video';
      const conCita = modo !== 'texto_libre';
      const conTexto = modo !== 'cita_texto';
      const guardada = paso.produccion ?? {};
      const datos = {
        tipoCita: guardada.tipo_cita ?? null,
        citaTexto: guardada.cita_texto ?? null,
        citaSegundos: guardada.cita_segundos ?? null,
        explicacion: guardada.explicacion ?? '',
      };
      // Lo que la modalidad no usa viaja en null (el backend lo exige).
      const pedido = () => ({
        pasoId: paso.id,
        ...datos,
        explicacion: conTexto ? datos.explicacion.trim() : null,
      });
      const firma = () => JSON.stringify(pedido());
      let firmaGuardada = firma();
      let temporizador = null;
      let envioEnCurso = null;

      const bloque = crearElemento('div', 'produccion');

      // Mensajes del bloque (sin selección, pegado bloqueado, error al
      // guardar). Se vacía y se vuelve a llenar para que el lector de
      // pantalla lo anuncie aunque el texto se repita.
      const aviso = crearElemento('p', 'aviso');
      aviso.setAttribute('role', 'status');
      const avisar = (texto) => {
        aviso.textContent = '';
        setTimeout(() => { aviso.textContent = texto; }, 50);
      };

      const etiquetaCita = crearElemento('label', '', esMedio ? 'Momento del video o audio' : 'Cita del material');
      const cita = document.createElement('textarea');
      cita.id = `paso-${paso.id}-cita`;
      etiquetaCita.htmlFor = cita.id;
      cita.readOnly = true;
      cita.rows = esMedio ? 1 : 3;
      cita.placeholder = esMedio
        ? 'Reproducí el video o audio y tocá «Citar este momento».'
        : 'Seleccioná un fragmento del material y tocá «Citar selección», o arrastralo o pegalo acá.';
      const mostrarCita = () => {
        cita.value = datos.tipoCita === 'tiempo'
          ? `⏱ ${formatearDuracion(datos.citaSegundos)}`
          : (datos.citaTexto ?? '');
      };
      mostrarCita();
      const textoBotonCitar = esMedio ? 'Citar este momento' : 'Citar selección';
      const botonCitar = crearElemento('button', 'secundario', textoBotonCitar);
      botonCitar.type = 'button';
      botonCitar.setAttribute('aria-label', `${textoBotonCitar} en el paso ${paso.orden}`);

      // Solo con material en video o audio: el minuto a mano.
      const manual = crearElemento('div', 'momento-manual');
      const etiquetaManual = crearElemento('label', '', 'O escribí el minuto a mano (mm:ss)');
      const campoManual = document.createElement('input');
      campoManual.type = 'text';
      campoManual.id = `paso-${paso.id}-minuto`;
      etiquetaManual.htmlFor = campoManual.id;
      campoManual.placeholder = '03:25';
      campoManual.maxLength = 8;
      campoManual.autocomplete = 'off';
      const botonManual = crearElemento('button', 'secundario', 'Usar este minuto');
      botonManual.type = 'button';
      botonManual.setAttribute('aria-label', `Usar este minuto en el paso ${paso.orden}`);
      manual.append(etiquetaManual, campoManual, botonManual);

      const etiquetaExplicacion = crearElemento('label', '',
        esMedio ? '¿Qué se dice o se ve en ese momento?' : 'Justificá con tus palabras');
      const explicacion = document.createElement('textarea');
      explicacion.id = `paso-${paso.id}-explicacion`;
      etiquetaExplicacion.htmlFor = explicacion.id;
      explicacion.rows = 4;
      explicacion.maxLength = EXPLICACION_MAX;
      explicacion.value = datos.explicacion;

      // "Guardado" se ve pero no se anuncia: cambiaría a cada pausa al escribir.
      const estadoGuardado = crearElemento('span', 'valor');
      const contador = crearElemento('span', 'valor');
      const pie = crearElemento('div', 'pie');
      pie.append(estadoGuardado, contador);
      const contar = () => { contador.textContent = `${explicacion.value.length} / ${EXPLICACION_MAX}`; };
      contar();

      // Manda lo que cambió desde el último guardado. Solo con la Tarea en
      // curso: después el backend ya no lo acepta.
      async function enviar() {
        clearTimeout(temporizador);
        temporizador = null;
        if (envioEnCurso) await envioEnCurso;
        const firmaEnviada = firma();
        if (firmaEnviada === firmaGuardada || estado !== 'en_curso') return;

        envioEnCurso = (async () => {
          let respuesta;
          try {
            respuesta = await chrome.runtime.sendMessage({ tipo: 'guardarProduccion', produccion: pedido(), token });
          } catch {
            respuesta = null;
          }
          if (respuesta?.ok) {
            firmaGuardada = firmaEnviada;
            estadoGuardado.textContent = firma() === firmaGuardada ? 'Guardado' : '';
          } else {
            estadoGuardado.textContent = '';
            avisar(textoError(respuesta, 'No se pudo guardar lo que escribiste.'));
          }
        })();
        await envioEnCurso;
        envioEnCurso = null;
      }

      botonCitar.addEventListener('mousedown', (evento) => evento.preventDefault()); // no pierde la selección
      const citarMomento = (segundos) => {
        datos.tipoCita = 'tiempo';
        datos.citaTexto = null;
        datos.citaSegundos = Math.min(segundos, CITA_SEGUNDOS_MAX);
        mostrarCita();
        avisar(`Momento citado: ${formatearDuracion(datos.citaSegundos)}.`);
        enviar();
      };

      botonCitar.addEventListener('click', async () => {
        if (esMedio) {
          const teniaFoco = botonCitar.matches(':focus');
          botonCitar.disabled = true;
          let respuesta;
          try {
            respuesta = await chrome.runtime.sendMessage({ tipo: 'leerMomentoMedio' });
          } catch {
            respuesta = null;
          }
          botonCitar.disabled = !puedeMarcar();
          if (teniaFoco && !botonCitar.disabled) botonCitar.focus();

          if (respuesta?.ok && Number.isInteger(respuesta.segundos)) {
            citarMomento(respuesta.segundos);
          } else {
            avisar('No encontré un video o audio empezado en esta página. Escribí el minuto a mano.');
          }
          return;
        }

        const seleccion = tomarSeleccion();
        if (seleccion === '') {
          avisar('Primero seleccioná un fragmento del material.');
          return;
        }
        citarTexto(seleccion);
      });

      function citarTexto(texto) {
        const caracteres = Array.from(texto);
        const recortada = caracteres.slice(0, CITA_MAX).join('').trim();
        datos.tipoCita = 'texto';
        datos.citaTexto = recortada;
        datos.citaSegundos = null;
        cita.value = recortada;
        avisar(caracteres.length > CITA_MAX
          ? `Cita tomada. Se recortó a ${CITA_MAX} caracteres.`
          : 'Cita tomada.');
        enviar();
      }

      // La cita también se puede soltar o pegar en su campo (que sigue sin
      // dejar escribir: es de solo lectura), pero solo si el texto es lo
      // último que se seleccionó, arrastró o copió del material. Si no, se
      // rechaza con un aviso. El campo de la explicación no cambia: ahí no
      // se puede pegar ni soltar nada.
      const recibirCita = (crudo) => {
        if (!puedeMarcar()) {
          avisar('Ahora no se puede cambiar la cita.');
          return;
        }
        const texto = textoDelMaterial(crudo);
        if (texto === '') {
          avisar('La cita tiene que salir del material.');
          return;
        }
        citarTexto(texto);
      };
      if (!esMedio) {
        // Sin esto el navegador no deja soltar en un campo de solo lectura.
        cita.addEventListener('dragover', (evento) => {
          evento.preventDefault();
          if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'copy';
        });
        cita.addEventListener('drop', (evento) => {
          evento.preventDefault();
          recibirCita(evento.dataTransfer?.getData('text/plain'));
        });
        cita.addEventListener('paste', (evento) => {
          evento.preventDefault();
          recibirCita(evento.clipboardData?.getData('text/plain'));
        });
      } else {
        // En video o audio la cita es un momento: no se suelta ni se pega texto.
        for (const tipo of ['drop', 'paste']) {
          cita.addEventListener(tipo, (evento) => evento.preventDefault());
        }
      }

      const usarMinutoManual = () => {
        const segundos = leerMinuto(campoManual.value);
        if (segundos === null) {
          avisar('Escribí el minuto así: mm:ss (por ejemplo 03:25).');
          return;
        }
        campoManual.value = '';
        citarMomento(segundos);
      };
      botonManual.addEventListener('click', usarMinutoManual);
      campoManual.addEventListener('keydown', (evento) => {
        if (evento.key !== 'Enter') return;
        evento.preventDefault();
        usarMinutoManual();
      });

      explicacion.addEventListener('beforeinput', (evento) => {
        if (!ENTRADAS_BLOQUEADAS.has(evento.inputType)) return;
        evento.preventDefault();
        avisar(NO_PEGAR);
      });
      for (const tipo of ['paste', 'drop']) {
        explicacion.addEventListener(tipo, (evento) => {
          evento.preventDefault();
          avisar(NO_PEGAR);
        });
      }
      explicacion.addEventListener('cut', (evento) => {
        evento.preventDefault();
        avisar('Acá no se puede cortar texto.');
      });
      // Sin esto el navegador muestra que se puede soltar texto en el campo.
      explicacion.addEventListener('dragover', (evento) => {
        evento.preventDefault();
        if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'none';
      });
      explicacion.addEventListener('dragstart', (evento) => evento.preventDefault());
      explicacion.addEventListener('contextmenu', (evento) => evento.preventDefault());

      explicacion.addEventListener('input', () => {
        datos.explicacion = explicacion.value;
        contar();
        estadoGuardado.textContent = '';
        clearTimeout(temporizador);
        temporizador = setTimeout(enviar, GUARDADO_MS);
      });
      explicacion.addEventListener('blur', () => enviar());

      if (conCita) bloque.append(etiquetaCita, cita, botonCitar);
      if (esMedio) bloque.append(manual);
      if (conTexto) bloque.append(etiquetaExplicacion, explicacion, pie);
      bloque.append(aviso);

      producciones.push({
        enviar,
        // Para la finalización por salida: lo que falta guardar viaja con
        // ese pedido (background.js lo guarda antes de finalizar) y acá se
        // da por enviado.
        tomarPendiente: () => {
          clearTimeout(temporizador);
          temporizador = null;
          if (firma() === firmaGuardada) return null;
          firmaGuardada = firma();
          return pedido();
        },
        // Con la Tarea sin empezar o finalizada se lee pero no se cambia.
        // readOnly y no disabled: el texto sigue al alcance del lector.
        refrescar: () => {
          explicacion.readOnly = !puedeMarcar();
          botonCitar.disabled = !puedeMarcar();
          campoManual.disabled = !puedeMarcar();
          botonManual.disabled = !puedeMarcar();
        },
      });
      return bloque;
    }

    // Guarda lo que quedara sin enviar de todos los pasos (antes de finalizar).
    const guardarProducciones = () => Promise.all(producciones.map((produccion) => produccion.enviar()));

    // Paso de opción múltiple: la consigna del paso y una casilla por opción;
    // se pueden tildar varias. Cada cambio manda la lista completa de las
    // tildadas y el paso queda hecho si hay al menos una. Si falla, vuelven
    // a quedar tildadas las últimas que sí se guardaron.
    function crearPasoOpcionMultiple(paso) {
      const grupo = crearElemento('fieldset');
      grupo.append(crearElemento('legend', '', paso.descripcion));

      let tildadasGuardadas = paso.opciones_elegidas_ids ?? [];
      const casillas = [];
      const respondido = () => casillas.some((casilla) => casilla.checked);
      estanHechos.push(respondido);

      const reflejar = () => {
        grupo.classList.toggle('respondido', respondido());
        grupo.classList.toggle('bloqueado', pasosBloqueados.has(paso.id));
        actualizarContador();
      };

      for (const opcion of paso.opciones || []) {
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = String(opcion.id);
        casilla.checked = tildadasGuardadas.includes(opcion.id);
        casilla.addEventListener('change', () => enviar(casilla));
        casillas.push(casilla);
        controles.push({ control: casilla, pasoId: paso.id });

        const etiqueta = crearElemento('label');
        etiqueta.append(casilla, crearElemento('span', '', opcion.texto));
        grupo.append(etiqueta);
      }

      const justificacion = crearJustificacion(paso, () => {
        reflejar();
        refrescarPasos();
      });
      grupo.append(justificacion.boton, justificacion.texto);
      if (conProduccion) grupo.append(crearProduccion(paso));

      async function enviar(casilla) {
        const teniaFoco = casilla.matches(':focus');
        const opcionIds = casillas.filter((c) => c.checked).map((c) => Number(c.value));
        casillas.forEach((c) => { c.disabled = true; });
        reflejar();

        const guardado = await guardar({ tipo: 'elegirOpciones', pasoId: paso.id, opcionIds });

        casillas.forEach((c) => { c.disabled = !puedeMarcarPaso(paso.id); });
        if (guardado) {
          tildadasGuardadas = opcionIds;
          justificacion.mostrarBoton(guardado.justificacion_disponible === true);
        } else {
          casillas.forEach((c) => { c.checked = tildadasGuardadas.includes(Number(c.value)); });
        }
        reflejar();
        // Al deshabilitarse la casilla pierde el foco: se le devuelve.
        if (teniaFoco && !casilla.disabled) casilla.focus();
      }

      grupo.classList.toggle('respondido', respondido());
      grupo.classList.toggle('bloqueado', pasosBloqueados.has(paso.id));
      return grupo;
    }

    // Paso de verdadero o falso: la consigna del paso y dos botones lado a
    // lado. Cada botón es un radio real con la clase btn-check y un label.btn
    // al lado: tienen el mismo name, así que elegir uno desmarca el otro sin
    // código extra. Elegir uno lo envía y el paso queda hecho. Si falla,
    // vuelve a quedar marcada la última opción que sí se guardó (o ninguna).
    // Opción única usa lo mismo con botones: false: un radio común por
    // opción, uno debajo del otro (como las casillas de opción múltiple).
    // Elegir otra reemplaza la anterior.
    function crearPasoVerdaderoFalso(paso, { botones = true } = {}) {
      const grupo = crearElemento('fieldset');
      grupo.append(crearElemento('legend', '', paso.descripcion));
      const contenedor = botones ? crearElemento('div', 'opciones-vf') : grupo;
      if (botones) grupo.append(contenedor);

      let elegidaGuardada = paso.opcion_elegida_id ?? null;
      const radios = [];
      const respondido = () => radios.some((radio) => radio.checked);
      estanHechos.push(respondido);

      const reflejar = () => {
        grupo.classList.toggle('respondido', respondido());
        grupo.classList.toggle('bloqueado', pasosBloqueados.has(paso.id));
        actualizarContador();
      };

      for (const opcion of paso.opciones || []) {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `paso-${paso.id}`;
        radio.value = String(opcion.id);
        radio.checked = opcion.id === elegidaGuardada;
        radio.addEventListener('change', () => elegir(opcion.id, radio));
        radios.push(radio);
        controles.push({ control: radio, pasoId: paso.id });

        radio.id = `paso-${paso.id}-opcion-${opcion.id}`;
        if (botones) {
          radio.className = 'btn-check';
          const etiqueta = crearElemento('label', 'btn btn-outline-success', opcion.texto);
          etiqueta.htmlFor = radio.id;
          contenedor.append(radio, etiqueta);
        } else {
          const etiqueta = crearElemento('label');
          etiqueta.append(radio, crearElemento('span', '', opcion.texto));
          contenedor.append(etiqueta);
        }
      }

      const justificacion = crearJustificacion(paso, () => {
        reflejar();
        refrescarPasos();
      });
      grupo.append(justificacion.boton, justificacion.texto);
      if (conProduccion) grupo.append(crearProduccion(paso));

      async function elegir(opcionId, radio) {
        const teniaFoco = radio.matches(':focus');
        radios.forEach((r) => { r.disabled = true; });
        reflejar();

        const guardado = await guardar({ tipo: 'elegirOpcion', pasoId: paso.id, opcionId });

        radios.forEach((r) => { r.disabled = !puedeMarcarPaso(paso.id); });
        if (guardado) {
          elegidaGuardada = opcionId;
          justificacion.mostrarBoton(guardado.justificacion_disponible === true);
        } else {
          radios.forEach((r) => { r.checked = Number(r.value) === elegidaGuardada; });
        }
        reflejar();
        // Al deshabilitarse el radio pierde el foco: se le devuelve para
        // poder seguir con las flechas del teclado.
        if (teniaFoco && !radio.disabled) (radios.find((r) => r.checked) || radio).focus();
      }

      grupo.classList.toggle('respondido', respondido());
      grupo.classList.toggle('bloqueado', pasosBloqueados.has(paso.id));
      return grupo;
    }

    // Cada paso lleva delante su número de orden ("1.", "2.", ...). El
    // aria-label va en el grupo (fieldset) que el lector anuncia al llegar
    // con Tab, e incluye la consigna para no perderla.
    const CREAR_PASO = {
      opcion_multiple: { crear: crearPasoOpcionMultiple, tipo: 'opción múltiple', hecho: 'respondido', sinHacer: 'sin responder' },
      verdadero_falso: { crear: crearPasoVerdaderoFalso, tipo: 'verdadero o falso', hecho: 'respondido', sinHacer: 'sin responder' },
      opcion_unica: {
        crear: (paso) => crearPasoVerdaderoFalso(paso, { botones: false }),
        tipo: 'opción única',
        hecho: 'respondido',
        sinHacer: 'sin responder',
      },
    };

    for (const paso of pasos) {
      const tipo = CREAR_PASO[paso.tipo] ?? CREAR_PASO.opcion_multiple;
      const elemento = tipo.crear(paso);
      const estaHecho = estanHechos[estanHechos.length - 1];
      etiquetasPasos.push(() => {
        const estadoPaso = estaHecho() ? tipo.hecho : tipo.sinHacer;
        // HU-018: con la justificación ya vista se avisa que quedó fija.
        const fija = pasosBloqueados.has(paso.id) ? ', la respuesta ya no se puede cambiar' : '';
        elemento.setAttribute('aria-label', `Paso ${paso.orden}, ${tipo.tipo}, ${estadoPaso}${fija}: ${paso.descripcion}`);
      });

      const item = crearElemento('li');
      item.append(crearElemento('span', 'numero-paso', `${paso.orden}.`), elemento);
      lista.append(item);
    }

    // --- Sin empezar ---
    const bloqueSinEmpezar = crearElemento('div', 'estado-tarea');
    const botonEmpezar = crearElemento('button', '', 'Empezar');
    botonEmpezar.type = 'button';
    bloqueSinEmpezar.append(
      crearElemento('p', 'aviso', 'Cuando estés por arrancar, tocá «Empezar»: desde ese momento se cuenta el tiempo y podés marcar los pasos.'),
      botonEmpezar,
    );

    // --- En curso ---
    // El cronómetro no cuenta por su cuenta: muestra ahora menos iniciada_en.
    // El backend manda cuántos segundos pasaron según el reloj del servidor
    // y de ahí se saca el inicio en el reloj local, así una diferencia de
    // hora o de zona horaria con el servidor no lo afecta. Al recargar la
    // página se vuelve a calcular desde el backend.
    const bloqueEnCurso = crearElemento('div', 'estado-tarea');
    const cronometro = crearElemento('div', 'temporizador');
    // role="timer" no se anuncia solo (su aria-live es "off"): el tiempo se
    // consulta al llegar al cronómetro con el lector, que lee el aria-label
    // ("Tiempo desde que empezaste: 3 minutos y 25 segundos"). No es
    // enfocable con Tab a propósito: si tuviera el foco, NVDA leería el
    // cambio de nombre cada segundo.
    const reloj = crearElemento('span', 'reloj', '00:00');
    reloj.setAttribute('role', 'timer');
    const etiquetaTiempo = crearElemento('span', 'valor', 'Tiempo');
    etiquetaTiempo.setAttribute('aria-hidden', 'true'); // ya está en el aria-label del reloj
    cronometro.append(etiquetaTiempo, reloj);

    const botonFinalizar = crearElemento('button', '', 'Finalizar');
    botonFinalizar.type = 'button';

    const confirmacion = crearElemento('div', 'confirmacion');
    confirmacion.hidden = true;
    confirmacion.setAttribute('role', 'alertdialog');
    const textoConfirmacion = crearElemento('p');
    textoConfirmacion.id = 'tarea-confirmacion-texto';
    confirmacion.setAttribute('aria-labelledby', textoConfirmacion.id);
    const botonConfirmar = crearElemento('button', '', 'Finalizar');
    botonConfirmar.type = 'button';
    const botonCancelar = crearElemento('button', 'secundario', 'Cancelar');
    botonCancelar.type = 'button';
    const botonesConfirmacion = crearElemento('div', 'botones');
    botonesConfirmacion.append(botonConfirmar, botonCancelar);
    confirmacion.append(textoConfirmacion, botonesConfirmacion);

    bloqueEnCurso.append(cronometro, botonFinalizar, confirmacion);

    // --- Finalizada ---
    const bloqueFinalizada = crearElemento('div', 'estado-tarea');
    bloqueFinalizada.tabIndex = -1; // recibe el foco al finalizar
    const tiempoTotal = crearElemento('p', 'aviso');
    bloqueFinalizada.append(crearElemento('p', 'realizada', 'Esta actividad ya fue realizada.'), tiempoTotal);

    let inicioLocalMs = null;
    let intervaloReloj = null;

    const refrescarReloj = () => {
      const segundos = (Date.now() - inicioLocalMs) / 1000;
      reloj.textContent = formatearDuracion(segundos);
      reloj.setAttribute('aria-label', `Tiempo desde que empezaste: ${formatearDuracionHablada(segundos)}`);
    };

    const ocultarConfirmacion = () => {
      confirmacion.hidden = true;
      botonFinalizar.hidden = false;
    };

    const aplicarEstado = (tarea) => {
      if (tarea.finalizada_en) {
        estado = 'finalizada';
      } else if (tarea.iniciada_en) {
        estado = 'en_curso';
      } else {
        estado = 'sin_empezar';
      }

      clearInterval(intervaloReloj);
      if (estado === 'en_curso') {
        inicioLocalMs = Date.now() - (tarea.segundos_desde_inicio ?? 0) * 1000;
        refrescarReloj();
        intervaloReloj = setInterval(refrescarReloj, 1000);
      }
      if (estado === 'finalizada') {
        tiempoTotal.textContent = 'Tiempo total: ' + formatearDuracion(tarea.duracion_segundos ?? 0);
      }

      bloqueSinEmpezar.hidden = estado !== 'sin_empezar';
      bloqueEnCurso.hidden = estado !== 'en_curso';
      bloqueFinalizada.hidden = estado !== 'finalizada';
      ocultarConfirmacion();
      refrescarPasos();

      if (estado === 'finalizada') alFinalizar();
    };

    // Empieza o finaliza en el backend y deja la barra con el estado que
    // devuelve (también si responde con error pero informa el estado, por
    // ejemplo si ya se había finalizado en otra pestaña).
    async function cambiarEstado(tipo, errorPorDefecto) {
      cambiandoEstado = true;
      botonEmpezar.disabled = true;
      botonConfirmar.disabled = true;
      refrescarPasos();
      mensaje.hidden = true;

      let respuesta;
      try {
        respuesta = await chrome.runtime.sendMessage({ tipo, actividadId, token });
      } catch {
        respuesta = null;
      }

      cambiandoEstado = false;
      botonEmpezar.disabled = false;
      botonConfirmar.disabled = false;
      const tarea = respuesta?.cuerpo?.tarea;
      if (tarea) {
        aplicarEstado(tarea);
      } else {
        refrescarPasos();
      }
      if (!respuesta?.ok) mostrarError(textoError(respuesta, errorPorDefecto));
      return respuesta?.ok === true;
    }

    // Antes de empezar se avisa que no se puede salir de la pestaña: la
    // Tarea arranca solo si lo confirma. La opción segura (no empezar)
    // queda con el foco, y Escape también cancela.
    botonEmpezar.addEventListener('click', async () => {
      const confirmo = await abrirDialogo(raiz, {
        titulo: 'Antes de empezar',
        texto: 'Durante la Tarea no podés salir de esta pestaña ni cambiar de ventana. '
          + 'Si salís, la Tarea se finaliza.',
        botones: [
          { texto: 'Entendido, empezar', valor: true },
          { texto: 'Cancelar', valor: false, secundario: true, foco: true },
        ],
        valorEscape: false,
      });
      if (!confirmo) {
        botonEmpezar.focus();
        return;
      }
      await cambiarEstado('iniciarTarea', 'No se pudo empezar la tarea.');
      if (estado === 'en_curso') {
        anuncio.textContent = 'Actividad empezada. Ya podés marcar los pasos.';
        botonFinalizar.focus();
      }
    });

    // Antes de finalizar se pide confirmación. Un paso sin marcar es una
    // pregunta sin ninguna opción elegida.
    botonFinalizar.addEventListener('click', () => {
      const total = estanHechos.length;
      const faltan = total - contarHechos();
      if (faltan > 0) {
        textoConfirmacion.textContent = `Te faltan completar ${faltan} de ${total} ${total === 1 ? 'paso' : 'pasos'}. `
          + '¿Querés finalizar la actividad igual?';
        botonConfirmar.textContent = 'Finalizar igual';
        botonCancelar.textContent = 'Seguir con la tarea';
      } else {
        textoConfirmacion.textContent = '¿Ya terminaste? No vas a poder volver a marcar pasos después.';
        botonConfirmar.textContent = 'Finalizar';
        botonCancelar.textContent = 'Cancelar';
      }
      botonFinalizar.hidden = true;
      confirmacion.hidden = false;
      botonCancelar.focus(); // la opción segura queda con el foco
    });

    // Cancelar solo cierra el aviso: la tarea sigue en curso y el cronómetro también.
    botonCancelar.addEventListener('click', () => {
      ocultarConfirmacion();
      botonFinalizar.focus();
    });

    confirmacion.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation(); // que no cierre el panel entero
      ocultarConfirmacion();
      botonFinalizar.focus();
    });

    botonConfirmar.addEventListener('click', async () => {
      botonConfirmar.disabled = true; // que un doble clic no finalice dos veces
      await guardarProducciones();
      await antesDeFinalizar();
      const finalizada = await cambiarEstado('finalizarTarea', 'No se pudo finalizar la tarea.');
      if (estado === 'finalizada') {
        anuncio.textContent = 'Actividad finalizada.';
        bloqueFinalizada.focus();
      } else if (!finalizada) {
        ocultarConfirmacion();
        botonFinalizar.focus();
      }
    });

    // --- Salida de la pestaña con la Tarea en curso ---
    // Finaliza sin pasar por el botón Finalizar: no hay a quién preguntarle,
    // así que tampoco se muestra el aviso de pasos pendientes. El estado
    // queda igual que en una finalización normal (mismo endpoint).
    // finalizada_en es la hora del servidor al recibir el pedido, que sale
    // en el momento de la salida. Hay dos casos en que queda más tarde: si
    // el pedido falla y se reintenta al volver (queda la hora del reintento)
    // y con una gracia mayor que 0 (queda la salida más la gracia).
    let finalizandoPorSalida = false;
    let salidaSinRegistrar = false; // el pedido falló: se reintenta al volver
    let temporizadorOculta = null;
    let sinFocoDesdeMs = null;
    let avisoNativoAbierto = false;

    const avisarSalida = async () => {
      await abrirDialogo(raiz, {
        titulo: 'Saliste de la pestaña y la Tarea se finalizó',
        texto: 'Ya no podés marcar más pasos de esta actividad.',
        botones: [{ texto: 'Entendido', valor: true, foco: true }],
        valorEscape: true,
      });
      bloqueFinalizada.focus();
    };

    async function finalizarPorSalida({ reintento = false } = {}) {
      clearTimeout(temporizadorOculta);
      if (estado !== 'en_curso' || finalizandoPorSalida) return;
      finalizandoPorSalida = true;
      cambiandoEstado = true;
      refrescarPasos();
      mensaje.hidden = true;

      // background.js registra primero el tiempo en foco pendiente y después
      // finaliza. Si la página se está cerrando la respuesta no llega nunca.
      let respuesta = null;
      let tarea = null;
      try {
        respuesta = await chrome.runtime.sendMessage({
          tipo: 'finalizarTareaPorSalida', actividadId, token, segundosFoco: tomarFocoPendiente(),
          producciones: producciones.map((produccion) => produccion.tomarPendiente()).filter(Boolean),
        });
        tarea = respuesta?.cuerpo?.tarea;
      } catch {
        // No se pudo hablar con background.js (la extensión se recargó): el
        // respaldo es un beacon directo al backend, con el token en el body
        // porque no puede llevar encabezados. No tiene respuesta: si salió,
        // la barra da la Tarea por finalizada.
        let enviado = false;
        try {
          enviado = navigator.sendBeacon(URL_FINALIZAR_RESPALDO,
            JSON.stringify({ actividad_id: actividadId, token, motivo: 'salida' }));
        } catch {
          enviado = false;
        }
        if (enviado) {
          tarea = { iniciada_en: true, finalizada_en: true, duracion_segundos: (Date.now() - inicioLocalMs) / 1000 };
        }
      }

      cambiandoEstado = false;
      finalizandoPorSalida = false;
      if (tarea) {
        aplicarEstado(tarea);
      } else {
        refrescarPasos();
      }

      if (estado === 'finalizada') {
        salidaSinRegistrar = false;
        avisarSalida();
      } else if (reintento) {
        // Tampoco se pudo al volver: se avisa y la Tarea sigue en curso.
        mostrarError(textoError(respuesta, 'No se pudo finalizar la tarea.'));
      } else {
        salidaSinRegistrar = true;
      }
    }

    // La pestaña vuelve a verse o la ventana recupera el foco.
    const alVolver = () => {
      clearTimeout(temporizadorOculta);
      if (salidaSinRegistrar && !finalizandoPorSalida) {
        salidaSinRegistrar = false;
        finalizarPorSalida({ reintento: true });
      }
    };

    // Señal principal: la pestaña queda oculta. También pasa al cerrar o
    // recargar la página, justo antes de pagehide.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') {
        alVolver();
      } else if (estado === 'en_curso') {
        if (GRACIA_OCULTA_MS > 0) {
          temporizadorOculta = setTimeout(finalizarPorSalida, GRACIA_OCULTA_MS);
        } else {
          finalizarPorSalida();
        }
      }
    });
    window.addEventListener('pagehide', () => finalizarPorSalida());
    window.addEventListener('focus', alVolver);

    // Cerrar, recargar o salir de la página: el navegador muestra su aviso
    // nativo. Si confirma, la página se oculta y se finaliza arriba. Ese
    // aviso le saca el foco a la ventana: mientras está abierto no cuenta
    // como pérdida de foco, y al cerrarse (el setTimeout recién corre ahí,
    // porque el aviso frena la página) la gracia arranca de nuevo.
    window.addEventListener('beforeunload', (evento) => {
      if (estado !== 'en_curso') return;
      avisoNativoAbierto = true;
      setTimeout(() => {
        avisoNativoAbierto = false;
        sinFocoDesdeMs = null;
      }, 0);
      evento.preventDefault();
      evento.returnValue = '';
    });

    // La ventana pierde el foco sin que la pestaña quede oculta. Se mira
    // document.hasFocus() en vez de escuchar blur: sigue siendo true si el
    // foco está en un iframe del propio recurso (un video embebido), y
    // detecta también la salida desde ese iframe, que no dispara blur. La
    // barra es Shadow DOM, no un iframe: usarla no le saca el foco a la ventana.
    if (FINALIZAR_POR_BLUR) {
      setInterval(() => {
        if (estado !== 'en_curso' || finalizandoPorSalida || avisoNativoAbierto || document.hasFocus()) {
          sinFocoDesdeMs = null;
          return;
        }
        sinFocoDesdeMs ??= Date.now();
        if (Date.now() - sinFocoDesdeMs >= GRACIA_BLUR_MS) {
          sinFocoDesdeMs = null;
          finalizarPorSalida();
        }
      }, REVISION_FOCO_MS);
    }

    // --- Enlaces que sacan de la página ---
    // Con la Tarea en curso, un enlace que carga otra página o abre una
    // pestaña nueva la finalizaría: antes se pregunta con un diálogo propio.
    // Se escucha en window y en la fase de burbuja, o sea al final: si la
    // página ya canceló el clic (navegación sin recarga de una aplicación
    // web, una marca del glosario) no se pregunta nada. Tampoco por las
    // anclas de la misma página ni por Ctrl+clic, que abre en segundo plano
    // y deja esta pestaña a la vista. Lo que no pasa por un clic en un
    // enlace (formularios, navegación hecha por un script de la página)
    // queda cubierto por el aviso nativo de beforeunload.
    let siguiendoEnlace = false; // el clic que se repite después de confirmar

    const saleDeLaPagina = (enlace) => {
      let destino;
      try {
        destino = new URL(enlace.href, location.href);
      } catch {
        return false;
      }
      if (!['http:', 'https:', 'file:'].includes(destino.protocol) || enlace.hasAttribute('download')) return false;
      if (!['', '_self', '_parent', '_top'].includes(enlace.target.toLowerCase())) return true; // pestaña nueva
      // La misma página con un "#ancla" no recarga nada.
      const mismaPagina = destino.origin + destino.pathname + destino.search
        === location.origin + location.pathname + location.search;
      return !(mismaPagina && destino.hash !== '');
    };

    // Los enlaces de la vista de lectura limpia están dentro del Shadow DOM
    // y desde window no se ven: la vista avisa de sus clics con revisarEnlace.
    window.addEventListener('click', (evento) => {
      revisarEnlace(evento, evento.composedPath().find((nodo) =>
        (nodo instanceof HTMLAnchorElement || nodo instanceof HTMLAreaElement) && nodo.hasAttribute('href')));
    });

    // Pregunta antes de una salida de la página que el estudiante eligió (un
    // enlace del recurso, otra actividad de Mi clase). Devuelve 'salir' si
    // se puede navegar (no había Tarea en curso, o quedó finalizada),
    // 'quedarse' si eligió quedarse y 'error' si no se pudo finalizar.
    async function confirmarSalida(texto) {
      if (estado !== 'en_curso') return 'salir';

      const salir = await abrirDialogo(raiz, {
        titulo: '¿Salir de la actividad?',
        texto,
        botones: [
          { texto: 'Salir y finalizar', valor: true },
          { texto: 'Quedarme', valor: false, secundario: true, foco: true },
        ],
        valorEscape: false,
      });
      if (!salir) return 'quedarse';

      // Finalización normal (el estudiante la confirmó) y recién después se
      // navega. Si no se pudo finalizar, el error queda en el panel de la
      // Tarea y no se navega.
      await guardarProducciones();
      await antesDeFinalizar();
      await cambiarEstado('finalizarTarea', 'No se pudo finalizar la tarea.');
      return estado === 'finalizada' ? 'salir' : 'error';
    }

    async function revisarEnlace(evento, enlace) {
      if (siguiendoEnlace || estado !== 'en_curso' || evento.defaultPrevented) return;
      if (evento.button !== 0 || evento.ctrlKey || evento.metaKey) return;
      if (!enlace || !saleDeLaPagina(enlace)) return;

      evento.preventDefault();
      const salida = await confirmarSalida('Este enlace te saca de la página. Si salís, la Tarea se finaliza.');
      if (salida === 'quedarse') {
        // Si mientras tanto la Tarea se finalizó por salida, el foco es del aviso.
        if (estado === 'en_curso') enlace.focus();
        return;
      }
      if (salida !== 'salir') return;
      if (!enlace.isConnected) {
        location.assign(enlace.href);
        return;
      }
      siguiendoEnlace = true;
      try {
        enlace.click();
      } finally {
        siguiendoEnlace = false;
      }
    }

    if (pasos.length > 0) {
      actualizarContador();
      panel.append(encabezado, lista, mensaje, bloqueSinEmpezar, bloqueEnCurso, bloqueFinalizada, anuncio);
    } else {
      panel.append(crearElemento('p', 'aviso', 'Esta actividad no tiene pasos cargados.'),
        mensaje, bloqueSinEmpezar, bloqueEnCurso, bloqueFinalizada, anuncio);
    }

    aplicarEstado(actividad);
    return { panel, enCurso: () => estado === 'en_curso', revisarEnlace, confirmarSalida };
  }
})();
