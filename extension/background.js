// Service worker: único punto de la extensión que habla con el backend.
// El content script le pide los datos por mensaje y acá se hace el fetch.

const API_BASE = 'http://localhost/apoyos-educativos/backend/api/';

chrome.runtime.onMessage.addListener((mensaje, remitente, responder) => {
  if (mensaje?.tipo === 'obtenerDetalle') {
    obtenerDetalle(mensaje.actividadId, mensaje.token).then(responder);
    return true; // la respuesta se envía de forma asíncrona
  }
  if (mensaje?.tipo === 'elegirOpcion') {
    elegirOpcion(mensaje.pasoId, mensaje.opcionId, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'elegirOpciones') {
    elegirOpciones(mensaje.pasoId, mensaje.opcionIds, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'verJustificacion') {
    verJustificacion(mensaje.pasoId, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'guardarProduccion') {
    guardarProduccion(mensaje.produccion, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'leerMomentoMedio') {
    leerMomentoMedio(remitente.tab?.id).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'iniciarTarea') {
    cambiarEstadoTarea('tarea_iniciar.php', mensaje.actividadId, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'finalizarTarea') {
    cambiarEstadoTarea('tarea_finalizar.php', mensaje.actividadId, mensaje.token, 'estudiante').then(responder);
    return true;
  }
  if (mensaje?.tipo === 'finalizarTareaPorSalida') {
    finalizarTareaPorSalida(mensaje.actividadId, mensaje.segundosFoco, mensaje.token, mensaje.producciones)
      .then(responder);
    return true;
  }
  if (mensaje?.tipo === 'registrarMetrica') {
    registrarMetrica(mensaje.metrica, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'obtenerMensajes') {
    obtenerMensajes(mensaje.actividadId, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'marcarMensajesLeidos') {
    marcarMensajesLeidos(mensaje.actividadId, mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'obtenerActividadesClase') {
    obtenerActividadesClase(mensaje.token).then(responder);
    return true;
  }
  if (mensaje?.tipo === 'obtenerGlosario') {
    obtenerGlosario().then(responder);
    return true;
  }
  if (mensaje?.tipo === 'obtenerFuente') {
    obtenerFuente().then(responder);
    return true;
  }
  return false;
});

// HU-006: glosario fijo que viaja dentro de la extensión (no hay backend).
// Se lee desde acá para no tener que exponer el archivo a las páginas
// con web_accessible_resources.
async function obtenerGlosario() {
  try {
    const respuesta = await fetch(chrome.runtime.getURL('glosario.json'));
    const entradas = await respuesta.json();
    // El sinónimo es opcional: si falta, la tarjeta no muestra esa línea.
    const glosario = Array.isArray(entradas)
      ? entradas
          .filter((e) => typeof e?.palabra === 'string' && e.palabra.trim()
            && typeof e.definicion === 'string' && typeof e.pictograma === 'string')
          .map((e) => ({ ...e, sinonimo: typeof e.sinonimo === 'string' ? e.sinonimo.trim() : '' }))
      : [];
    return { ok: true, glosario };
  } catch {
    return { ok: false, glosario: [] };
  }
}

// Modo lectura: la tipografía OpenDyslexic viaja dentro de la extensión
// (fuentes/), así funciona sin internet. Se manda en base64 porque los
// mensajes solo admiten datos serializables como JSON; el content script
// la registra con la API FontFace.
const FUENTES = { normal: 'fuentes/OpenDyslexic-Regular.woff', bold: 'fuentes/OpenDyslexic-Bold.woff' };

async function obtenerFuente() {
  try {
    const fuentes = {};
    for (const [peso, ruta] of Object.entries(FUENTES)) {
      const bytes = new Uint8Array(await (await fetch(chrome.runtime.getURL(ruta))).arrayBuffer());
      let binario = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      fuentes[peso] = btoa(binario);
    }
    return { ok: true, fuentes };
  } catch {
    return { ok: false, fuentes: {} };
  }
}

function datosInvalidos() {
  return { ok: false, status: 400, cuerpo: { exito: false, error: 'Datos inválidos.' } };
}

function obtenerDetalle(actividadId, token) {
  if (!Number.isInteger(actividadId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('actividad_detalle.php?id=' + actividadId, token, { method: 'GET' });
}

// HU-007: empieza o finaliza la Tarea. El backend responde con el estado
// (iniciada_en, finalizada_en, segundos) en cuerpo.tarea.
// motivo (HU-016) va solo al finalizar: 'estudiante' si tocó Finalizar,
// 'salida' si se finalizó sola por salir de la pestaña. El backend lo exige.
function cambiarEstadoTarea(ruta, actividadId, token, motivo) {
  if (!Number.isInteger(actividadId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  const cuerpo = { actividad_id: actividadId };
  if (motivo) cuerpo.motivo = motivo;
  return pedir(ruta, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

// El estudiante salió de la pestaña con la Tarea en curso: se finaliza sin
// preguntar. Primero se registra el tiempo en foco que quedaba pendiente (y
// se espera), porque con la Tarea finalizada el backend ya no lo acepta. Se
// hace acá y no en el content script porque este service worker sigue vivo
// aunque la página se esté cerrando.
// HU-018: por lo mismo, antes de finalizar se guarda la producción propia
// que el estudiante tenía escrita y todavía no se había enviado.
const PRODUCCIONES_PENDIENTES_MAX = 50;

async function finalizarTareaPorSalida(actividadId, segundosFoco, token, producciones) {
  if (Number.isInteger(segundosFoco) && segundosFoco >= 1) {
    await registrarMetrica({ tipo: 'foco', segundos: Math.min(segundosFoco, 120) }, token);
  }
  if (Array.isArray(producciones)) {
    for (const produccion of producciones.slice(0, PRODUCCIONES_PENDIENTES_MAX)) {
      await guardarProduccion(produccion, token);
    }
  }
  return cambiarEstadoTarea('tarea_finalizar.php', actividadId, token, 'salida');
}

// Devoluciones del docente: la lista (con cuerpo.no_leidos) y marcarlas
// como leídas. No dependen del estado de la Tarea.
function obtenerMensajes(actividadId, token) {
  if (!Number.isInteger(actividadId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('mensajes_estudiante.php?actividad_id=' + actividadId, token, { method: 'GET' });
}

function marcarMensajesLeidos(actividadId, token) {
  if (!Number.isInteger(actividadId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('mensajes_marcar_leidos.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actividad_id: actividadId }),
  });
}

// HU-017: actividades de la clase de esta actividad asignadas al estudiante.
// No lleva parámetros: el backend saca la actividad, el estudiante y la
// clase del token.
function obtenerActividadesClase(token) {
  if (typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('extension_clase_actividades.php', token, { method: 'GET' });
}

// HU-007: responde un paso de verdadero o falso; el backend lo deja completado.
function elegirOpcion(pasoId, opcionId, token) {
  if (!Number.isInteger(pasoId) || !Number.isInteger(opcionId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('paso_marcar.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paso_id: pasoId, opcion_id: opcionId }),
  });
}

// Responde un paso de opción múltiple con todas las opciones tildadas en ese
// momento (puede ser ninguna: el backend lo deja sin completar).
function elegirOpciones(pasoId, opcionIds, token) {
  if (!Number.isInteger(pasoId) || !Array.isArray(opcionIds)
      || !opcionIds.every(Number.isInteger) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('paso_marcar.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paso_id: pasoId, opcion_ids: opcionIds }),
  });
}

// HU-018: pide la justificación del docente de un paso ya respondido (botón
// "¿Por qué?"). El backend decide si corresponde mostrarla y, al devolverla,
// deja bloqueada la respuesta de ese paso. No registra ninguna métrica.
function verJustificacion(pasoId, token) {
  if (!Number.isInteger(pasoId) || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('paso_justificacion.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paso_id: pasoId }),
  });
}

// HU-018: guarda la producción propia de un paso: la cita del material y/o el
// texto del estudiante, según la modalidad de la actividad (lo que no usa va
// en null). Reemplaza lo que hubiera guardado en ese paso. El backend valida
// todo de nuevo y solo lo acepta con la Tarea en curso.
function guardarProduccion(produccion, token) {
  const valida = Number.isInteger(produccion?.pasoId)
    && [null, 'texto', 'tiempo'].includes(produccion.tipoCita)
    && (produccion.citaTexto === null || typeof produccion.citaTexto === 'string')
    && (produccion.citaSegundos === null || Number.isInteger(produccion.citaSegundos))
    && (produccion.explicacion === null || typeof produccion.explicacion === 'string');
  if (!valida || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('paso_produccion_guardar.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paso_id: produccion.pasoId,
      tipo_cita: produccion.tipoCita,
      cita_texto: produccion.citaTexto,
      cita_segundos: produccion.citaSegundos,
      explicacion: produccion.explicacion,
    }),
  });
}

// HU-018: en qué segundo va el video o audio de la pestaña que lo pide
// ("Citar este momento"). El reproductor puede estar en un iframe de otro
// sitio, adonde content_script.js no llega: se les pregunta a todos los
// frames de esa pestaña (media_frame.js), que contestan solo un número.
// Primero por lo que está sonando; si nadie contesta, por lo que quedó en
// pausa. No habla con el backend. Devuelve { ok, segundos }.
async function leerMomentoMedio(tabId) {
  if (!Number.isInteger(tabId)) return { ok: false };
  for (const soloReproduciendo of [true, false]) {
    try {
      const segundos = await chrome.tabs.sendMessage(tabId, { tipo: 'leerMomentoMedio', soloReproduciendo });
      if (Number.isInteger(segundos) && segundos >= 0) return { ok: true, segundos };
    } catch {
      // Ningún frame contestó: se sigue con el intento siguiente.
    }
  }
  return { ok: false };
}

// HU-008: tiempo en foco ({ tipo: 'foco', segundos }) o uso de un apoyo
// ({ tipo: 'apoyo', apoyo }). El estudiante y la actividad los saca el
// backend del token, no se mandan en el cuerpo. La Tarea no es un apoyo: ni
// abrirla ni empezarla se registra como uso.
const APOYOS = ['lectura_voz', 'modo_lectura', 'glosario'];

function registrarMetrica(metrica, token) {
  let cuerpo;
  if (metrica?.tipo === 'foco' && Number.isInteger(metrica.segundos)
      && metrica.segundos >= 1 && metrica.segundos <= 120) {
    cuerpo = { tipo: 'foco', segundos: metrica.segundos };
  } else if (metrica?.tipo === 'apoyo' && APOYOS.includes(metrica.apoyo)) {
    cuerpo = { tipo: 'apoyo', apoyo: metrica.apoyo };
  }
  if (!cuerpo || typeof token !== 'string') {
    return Promise.resolve(datosInvalidos());
  }
  return pedir('metrica_registrar.php', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
}

async function pedir(ruta, token, opciones) {
  try {
    const respuesta = await fetch(API_BASE + ruta, {
      ...opciones,
      headers: { ...opciones.headers, Authorization: 'Bearer ' + token },
    });

    let cuerpo;
    try {
      cuerpo = await respuesta.json();
    } catch {
      cuerpo = { exito: false, error: 'Respuesta inválida del servidor.' };
    }

    return { ok: respuesta.ok, status: respuesta.status, cuerpo };
  } catch {
    return { ok: false, status: 0, cuerpo: { exito: false, error: 'No se pudo conectar con el servidor.' } };
  }
}
