const RECARGA_MS = 30000;

// Nombres legibles de los apoyos (tipo_apoyo de la tabla apoyo). La Tarea no
// es un apoyo.
const NOMBRES_APOYO = {
  lectura_voz: 'Lectura en voz alta',
  modo_lectura: 'Modo lectura',
  glosario: 'Glosario',
};

const alertaMetricas = document.getElementById('alerta');
const cargando = document.getElementById('cargando');
const contenido = document.getElementById('contenido');
const actividadTitulo = document.getElementById('actividad-titulo');
const ultimaActualizacion = document.getElementById('ultima-actualizacion');
const btnActualizar = document.getElementById('btn-actualizar');
const indFoco = document.getElementById('ind-foco');
const indPasos = document.getElementById('ind-pasos');
const indPasosDetalle = document.getElementById('ind-pasos-detalle');
const indAbrieron = document.getElementById('ind-abrieron');
const vacio = document.getElementById('vacio');
const contenedorTabla = document.getElementById('contenedor-tabla');
const listaEstudiantes = document.getElementById('lista-estudiantes');
const listaDificultad = document.getElementById('lista-dificultad');
const dificultadVacio = document.getElementById('dificultad-vacio');

// Por debajo de este porcentaje la barra del paso se pinta de rojo (HU-010).
const UMBRAL_DIFICULTAD = 50;

// Todos los pasos tienen respuesta correcta: se miden por acierto.
const ETIQUETAS_TIPO_RESPUESTA = {
  opcion_unica: 'Opción única',
  opcion_multiple: 'Opción múltiple',
  verdadero_falso: 'V/F',
};

// Etiqueta chica con el tipo del paso.
function crearEtiquetaTipo(paso) {
  const etiqueta = document.createElement('span');
  etiqueta.className = 'badge rounded-pill text-bg-light border fw-normal ms-1';
  etiqueta.textContent = ETIQUETAS_TIPO_RESPUESTA[paso.tipo];
  return etiqueta;
}

const modalDetalle = new bootstrap.Modal(document.getElementById('modal-detalle'));
const detalleTitulo = document.getElementById('modal-detalle-titulo');
const alertaDetalle = document.getElementById('alerta-detalle');
const detalleCargando = document.getElementById('detalle-cargando');
const detalleContenido = document.getElementById('detalle-contenido');
const detalleSinActividad = document.getElementById('detalle-sin-actividad');
const detalleFoco = document.getElementById('detalle-foco');
const detalleSinPasos = document.getElementById('detalle-sin-pasos');
const detallePasos = document.getElementById('detalle-pasos');
const detalleSinApoyos = document.getElementById('detalle-sin-apoyos');
const detalleApoyos = document.getElementById('detalle-apoyos');

const actividadId = Number(new URLSearchParams(window.location.search).get('actividad'));

// "Volver" regresa a la clase de la actividad cuando se llegó desde
// clase.html (que agrega &clase=N al enlace); si no, a "Mis clases".
// Es solo navegación: clase.html vuelve a comprobar que la clase sea del docente.
const claseVolverId = Number(new URLSearchParams(window.location.search).get('clase'));
if (Number.isInteger(claseVolverId) && claseVolverId > 0) {
  const enlaceVolver = document.getElementById('enlace-volver');
  enlaceVolver.href = 'clase.html?id=' + encodeURIComponent(claseVolverId);
  enlaceVolver.textContent = '← Volver a la clase';
}

// Evita dos pedidos a la vez (botón + recarga automática).
let actualizando = false;

// false si la actividad o su clase están dadas de baja: no se ofrece
// reabrir la Tarea (el backend igual lo rechaza).
let actividadVigente = true;

function formatearTiempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return String(minutos).padStart(2, '0') + ':' + String(resto).padStart(2, '0');
}

function nombreApoyo(tipo) {
  return NOMBRES_APOYO[tipo] || tipo;
}

function crearInsigniaApoyo(apoyo) {
  const insignia = document.createElement('span');
  insignia.className = 'badge insignia-apoyo me-1 mb-1';
  insignia.textContent = nombreApoyo(apoyo.apoyo) + ' ';

  const cantidad = document.createElement('span');
  cantidad.className = 'badge text-bg-light ms-1';
  cantidad.textContent = apoyo.veces;

  insignia.appendChild(cantidad);
  return insignia;
}

function crearBarraPasos(completados, total) {
  const contenedor = document.createElement('div');

  const texto = document.createElement('div');
  texto.className = 'small mb-1';
  texto.textContent = completados + ' / ' + total;

  const porcentaje = total > 0 ? Math.round((100 * completados) / total) : 0;
  const barra = document.createElement('div');
  barra.className = 'progress';
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-label', 'Pasos completados');
  barra.setAttribute('aria-valuenow', String(porcentaje));
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');

  const relleno = document.createElement('div');
  relleno.className = 'progress-bar';
  relleno.style.width = porcentaje + '%';

  barra.appendChild(relleno);
  contenedor.append(texto, barra);
  return contenedor;
}

// HU-016: cómo terminó la Tarea y cuántas veces se reabrió, en una sola
// línea chica. Son los datos tal cual; vacío si no hay nada que decir.
const TEXTOS_MOTIVO = {
  salida: 'Finalizada por salida de la pestaña',
  estudiante: 'Finalizada por el estudiante',
};

function textoEstadoTarea(estudiante) {
  const partes = [];
  if (estudiante.finalizada_en !== null) {
    // Sin motivo: una Tarea finalizada antes de que se guardara el motivo.
    partes.push(TEXTOS_MOTIVO[estudiante.finalizada_motivo] || 'Finalizada');
  }
  if (estudiante.reaperturas > 0) {
    partes.push(estudiante.reaperturas === 1 ? 'Reabierta 1 vez' : 'Reabierta ' + estudiante.reaperturas + ' veces');
  }
  return partes.join(' · ');
}

// HU-019: último intento de mandarle el enlace por correo. El texto dice el
// estado (no solo el color).
const ESTADOS_CORREO = {
  enviado: { texto: 'Enviado', clase: 'text-bg-success' },
  sin_correo: { texto: 'Sin correo', clase: 'text-bg-warning' },
  error: { texto: 'Error', clase: 'text-bg-danger' },
};

function crearCeldaCorreo(estudiante) {
  const celda = document.createElement('td');
  const estado = estudiante.correo ? ESTADOS_CORREO[estudiante.correo.resultado] : null;

  const insignia = document.createElement('span');
  insignia.className = 'badge ' + (estado ? estado.clase : 'text-bg-light border');
  insignia.textContent = estado ? estado.texto : 'No enviado';
  celda.appendChild(insignia);

  if (estudiante.correo) {
    const fecha = document.createElement('small');
    fecha.className = 'd-block text-body-secondary';
    fecha.textContent = formatearFechaHora(estudiante.correo.fecha);
    celda.appendChild(fecha);
  }

  // "Sin correo" no se ofrece: la dirección no cambia reintentando.
  if (actividadVigente && estudiante.correo?.resultado !== 'sin_correo') {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-link btn-sm p-0 d-block boton-correo';
    boton.textContent = estudiante.correo ? 'Reenviar' : 'Enviar';
    boton.setAttribute('aria-label', boton.textContent + ' el enlace por correo a '
      + estudiante.apellido + ', ' + estudiante.nombre);
    boton.addEventListener('click', () => abrirCorreo(estudiante));
    celda.appendChild(boton);
  }

  return celda;
}

// Todo con textContent / createElement: los nombres vienen del usuario.
function crearFila(estudiante) {
  const fila = document.createElement('tr');
  fila.dataset.estudiante = estudiante.id;

  const celdaNombre = document.createElement('td');
  celdaNombre.textContent = estudiante.apellido + ', ' + estudiante.nombre;
  const estadoTarea = textoEstadoTarea(estudiante);
  if (estadoTarea !== '') {
    const estado = document.createElement('small');
    estado.className = 'd-block text-body-secondary';
    estado.textContent = estadoTarea;
    celdaNombre.appendChild(estado);
  }
  fila.appendChild(celdaNombre);

  // "Sin datos": ni filas en metrica ni pasos tildados.
  if (!estudiante.abrio && estudiante.pasos_completados === 0) {
    const celdaSinDatos = document.createElement('td');
    celdaSinDatos.colSpan = 4;
    celdaSinDatos.className = 'text-body-secondary fst-italic';
    celdaSinDatos.textContent = 'Sin actividad registrada';
    fila.appendChild(celdaSinDatos);
  } else {
    const celdaFoco = document.createElement('td');
    celdaFoco.textContent = formatearTiempo(estudiante.tiempo_foco);

    const celdaPasos = document.createElement('td');
    if (estudiante.total_pasos > 0) {
      celdaPasos.appendChild(crearBarraPasos(estudiante.pasos_completados, estudiante.total_pasos));
    } else {
      celdaPasos.className = 'text-body-secondary';
      celdaPasos.textContent = 'Sin pasos';
    }

    // Solo pasos de opción múltiple: correctas sobre las que respondió.
    // HU-018: con producción propia, logrados sobre resueltos (opción
    // correcta y justificación válida), los pendientes aparte y el acierto
    // de opción como referencia.
    const celdaCorrectas = document.createElement('td');
    if (estudiante.logro && estudiante.respondidas > 0) {
      celdaCorrectas.appendChild(crearResumenLogro(estudiante.logro));
    } else if (estudiante.respondidas > 0) {
      celdaCorrectas.textContent = estudiante.correctas + ' / ' + estudiante.respondidas;
    } else {
      celdaCorrectas.className = 'text-body-secondary';
      celdaCorrectas.textContent = '—';
      celdaCorrectas.title = estudiante.respuestas.length === 0
        ? 'La actividad no tiene pasos de opción múltiple'
        : 'Todavía no respondió ninguno';
    }

    const celdaApoyos = document.createElement('td');
    if (estudiante.apoyos.length === 0) {
      celdaApoyos.className = 'text-body-secondary';
      celdaApoyos.textContent = 'Ninguno';
    } else {
      estudiante.apoyos.forEach((apoyo) => celdaApoyos.appendChild(crearInsigniaApoyo(apoyo)));
    }

    fila.append(celdaFoco, celdaPasos, celdaCorrectas, celdaApoyos);
  }

  fila.appendChild(crearCeldaCorreo(estudiante));

  const celdaAcciones = document.createElement('td');
  celdaAcciones.className = 'text-end text-nowrap';

  const btnDevolucion = document.createElement('button');
  btnDevolucion.type = 'button';
  btnDevolucion.className = 'btn btn-sm btn-outline-primary me-1';
  btnDevolucion.textContent = 'Enviar devolución';
  btnDevolucion.addEventListener('click', () => abrirDevolucion(estudiante));

  const btnDetalle = document.createElement('button');
  btnDetalle.type = 'button';
  btnDetalle.className = 'btn btn-sm btn-outline-secondary';
  btnDetalle.textContent = 'Detalle';
  btnDetalle.addEventListener('click', () => abrirDetalle(estudiante));

  celdaAcciones.append(crearBotonEnlace(estudiante));
  if (estudiante.finalizada_en !== null && actividadVigente) {
    const btnReabrir = document.createElement('button');
    btnReabrir.type = 'button';
    btnReabrir.className = 'btn btn-sm btn-outline-secondary me-1 boton-reabrir';
    btnReabrir.textContent = 'Reabrir Tarea';
    btnReabrir.addEventListener('click', () => abrirReabrir(estudiante));
    celdaAcciones.append(btnReabrir);
  }
  celdaAcciones.append(btnDevolucion, btnDetalle);
  fila.appendChild(celdaAcciones);

  return fila;
}

function mostrarResumen(resumen) {
  indFoco.textContent = formatearTiempo(resumen.tiempo_foco_promedio);

  if (resumen.porcentaje_pasos === null) {
    indPasos.textContent = '—';
    indPasosDetalle.textContent = resumen.total_pasos === 0
      ? 'la actividad no tiene pasos'
      : 'sin estudiantes asignados';
  } else {
    indPasos.textContent = resumen.porcentaje_pasos.toLocaleString('es-AR') + ' %';
    indPasosDetalle.textContent = 'del total de pasos de todos los asignados';
  }

  indAbrieron.textContent = resumen.abrieron + ' de ' + resumen.asignados;
}

// ---- Pasos con más dificultad (HU-010) ----

// Cada paso muestra el porcentaje de acierto entre los que respondieron
// (null si nadie respondió).
// ---- Logro con justificación (HU-018, solo con producción propia) ----

const NOMBRES_MOTIVO = {
  opcion_incorrecta: 'opción incorrecta',
  sin_justificacion: 'sin justificación',
  justificacion_no_valida: 'justificación no válida',
};

function textoPendientes(cantidad) {
  return cantidad === 1 ? '1 pendiente de revisar' : cantidad + ' pendientes de revisar';
}

// "No logrados: 2 opción incorrecta · 1 sin justificación" (solo los motivos que hay).
function textoMotivos(logro) {
  const partes = Object.entries(NOMBRES_MOTIVO)
    .filter(([motivo]) => logro.motivos[motivo] > 0)
    .map(([motivo, nombre]) => logro.motivos[motivo] + ' ' + nombre);
  return partes.length > 0 ? 'No logrados: ' + partes.join(' · ') : '';
}

// Las líneas de un bloque de logro: logrados sobre resueltos (o "Sin datos"),
// pendientes, motivos de los no logrados y el acierto de opción crudo.
function crearResumenLogro(logro) {
  const contenedor = document.createElement('div');
  const linea = (texto, clase) => {
    if (!texto) return;
    const elemento = document.createElement('div');
    elemento.className = clase;
    elemento.textContent = texto;
    contenedor.appendChild(elemento);
  };
  linea(logro.resueltos === 0 ? 'Sin datos' : logro.logrados + ' de ' + logro.resueltos + ' logrados', 'small');
  linea(logro.pendientes > 0 ? textoPendientes(logro.pendientes) : '', 'small text-body-secondary');
  linea(textoMotivos(logro), 'small text-body-secondary');
  linea('Opción correcta: ' + logro.aciertos_opcion + ' de ' + logro.respondidas, 'small text-body-secondary');
  return contenedor;
}

function crearItemDificultad(paso) {
  // Con producción propia el porcentaje es el de logro (opción correcta y
  // justificación válida); si no, el de acierto de opción, como siempre.
  const logro = paso.logro ?? null;
  const valor = logro ? logro.porcentaje : paso.porcentaje_acierto;

  const item = document.createElement('li');
  item.className = 'mb-3';

  const encabezado = document.createElement('div');
  encabezado.className = 'd-flex justify-content-between gap-2 small mb-1';

  const descripcion = document.createElement('span');
  descripcion.textContent = paso.orden + '. ' + paso.descripcion;
  descripcion.appendChild(crearEtiquetaTipo(paso));

  const porcentaje = document.createElement('span');
  porcentaje.className = 'fw-semibold text-nowrap';
  porcentaje.textContent = valor === null ? '—' : valor.toLocaleString('es-AR') + ' %';

  encabezado.append(descripcion, porcentaje);

  const barra = document.createElement('div');
  barra.className = 'progress flex-grow-1';
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-label', logro
    ? 'Logrado por ' + logro.logrados + ' de ' + logro.resueltos + ' resueltos, opción correcta y justificación válida'
    : 'Acertado por ' + paso.acertaron + ' de ' + paso.respondieron + ' que respondieron');
  barra.setAttribute('aria-valuenow', String(valor ?? 0));
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');

  // Verde (color institucional por defecto de .progress-bar) salvo que esté bajo el umbral.
  const relleno = document.createElement('div');
  relleno.className = valor !== null && valor < UMBRAL_DIFICULTAD ? 'progress-bar bg-danger' : 'progress-bar';
  relleno.style.width = (valor ?? 0) + '%';
  barra.appendChild(relleno);

  // Etiqueta chica al lado de la barra: qué mide ese porcentaje.
  const etiqueta = document.createElement('span');
  etiqueta.className = 'badge rounded-pill text-bg-light border fw-normal';
  etiqueta.textContent = logro ? 'logro con justificación' : 'acierto';

  const filaBarra = document.createElement('div');
  filaBarra.className = 'd-flex align-items-center gap-2';
  filaBarra.append(barra, etiqueta);

  let detalle = document.createElement('small');
  detalle.className = 'text-body-secondary';
  if (paso.respondieron === 0) {
    detalle.textContent = 'Nadie lo respondió todavía';
  } else if (logro) {
    detalle = crearResumenLogro(logro);
  } else {
    detalle.textContent = paso.acertaron + ' de ' + paso.respondieron + ' que respondieron acertaron';
  }

  item.append(encabezado, filaBarra, detalle);
  return item;
}

function mostrarDificultad(pasos, resumen) {
  // El backend ya los manda ordenados de menor a mayor porcentaje de acierto.
  listaDificultad.replaceChildren(...pasos.map(crearItemDificultad));

  if (pasos.length > 0) {
    dificultadVacio.classList.add('d-none');
    return;
  }
  dificultadVacio.textContent = resumen.total_pasos === 0
    ? 'La actividad no tiene pasos.'
    : 'Sin estudiantes asignados.';
  dificultadVacio.classList.remove('d-none');
}

async function cargarMetricas() {
  if (actualizando) {
    return;
  }
  actualizando = true;
  btnActualizar.disabled = true;

  try {
    const { ok, status, cuerpo } = await getJson('metricas_actividad.php?id=' + encodeURIComponent(actividadId));

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaMetricas, 'danger', cuerpo.error || 'No se pudieron cargar las métricas.');
      return;
    }

    alertaMetricas.classList.add('d-none');
    actividadTitulo.textContent = cuerpo.actividad.titulo;
    actividadVigente = cuerpo.actividad.vigente;
    mostrarResumen(cuerpo.resumen);
    mostrarDificultad(cuerpo.pasos_dificultad, cuerpo.resumen);

    listaEstudiantes.replaceChildren(...cuerpo.por_estudiante.map(crearFila));
    const hayEstudiantes = cuerpo.por_estudiante.length > 0;
    vacio.classList.toggle('d-none', hayEstudiantes);
    contenedorTabla.classList.toggle('d-none', !hayEstudiantes);
    contenido.classList.remove('d-none');

    ultimaActualizacion.textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-AR');
  } catch {
    mostrarAlerta(alertaMetricas, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    cargando.classList.add('d-none');
    btnActualizar.disabled = false;
    actualizando = false;
  }
}

// ---- Detalle ----

// mm:ss de un momento citado de un video o audio (h:mm:ss desde la hora).
function formatearMomento(segundos) {
  const horas = Math.floor(segundos / 3600);
  const resto = formatearTiempo(segundos % 3600);
  return horas > 0 ? horas + ':' + resto : resto;
}

// Dirección del recurso en el momento citado, o null si el recurso no es una
// dirección http o https (no se arma ningún enlace con otro protocolo).
// YouTube lleva el tiempo en "t" ("start" en los embebidos), Vimeo en
// "#t=Ns" y el resto en "#t=N", el fragmento estándar de medios: funciona
// cuando el recurso es el archivo de video o audio; en una página que solo
// lo contiene, abre la página sin saltar.
function urlDelMomento(recursoUrl, segundos) {
  let url;
  try {
    url = new URL(recursoUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const esDe = (dominio) => url.hostname === dominio || url.hostname.endsWith('.' + dominio);
  if (esDe('youtube.com') || esDe('youtube-nocookie.com')) {
    url.searchParams.set(url.pathname.startsWith('/embed/') ? 'start' : 't', String(segundos));
  } else if (esDe('youtu.be')) {
    url.searchParams.set('t', String(segundos));
  } else if (esDe('vimeo.com')) {
    url.hash = 't=' + segundos + 's';
  } else {
    url.hash = 't=' + segundos;
  }
  return url.href;
}

// Un texto con su título chico arriba. Sin texto se muestra "vacio" en gris.
// textContent: lo escribieron el estudiante o el docente.
function crearBloqueTexto(titulo, texto, vacio) {
  const bloque = document.createElement('div');
  bloque.className = 'mb-2';

  const etiqueta = document.createElement('div');
  etiqueta.className = 'small fw-semibold';
  etiqueta.textContent = titulo;

  const contenido = document.createElement('div');
  contenido.className = texto ? 'small' : 'small text-body-secondary fst-italic';
  contenido.style.whiteSpace = 'pre-wrap';
  contenido.style.overflowWrap = 'anywhere';
  contenido.textContent = texto || vacio;

  bloque.append(etiqueta, contenido);
  return bloque;
}

// HU-018: lo que escribió el estudiante en el paso (cita del material y
// explicación, solo en actividades con producción propia) y, al lado, la
// justificación del docente como referencia. Son los textos tal cual: no se
// comparan ni se marca nada, el docente evalúa leyendo.
// Devuelve null si no hay nada que mostrar.
// ---- Marca "Justificación válida" (HU-018) ----

const mensajeMarca = document.getElementById('mensaje-marca');

const OPCIONES_MARCA = [
  { valor: true, texto: 'Sí' },
  { valor: false, texto: 'No' },
  { valor: null, texto: 'Sin revisar' },
];

// Insignia del estado de logro de un paso (solo con producción propia; el
// estado lo calcula el backend). Colores distintos entre sí, pero el texto
// ya dice el estado: no depende del color.
const INSIGNIAS_LOGRO = {
  logrado: { clase: 'badge text-bg-success', texto: '✓ Logrado' },
  opcion_incorrecta: { clase: 'badge text-bg-danger', texto: '✗ Opción incorrecta' },
  sin_justificacion: { clase: 'badge text-bg-warning', texto: '✗ Sin justificación' },
  justificacion_no_valida: {
    clase: 'badge bg-danger-subtle text-danger-emphasis border border-danger',
    texto: '✗ Justificación no válida',
  },
  pendiente: { clase: 'badge text-bg-info', texto: 'Pendiente de revisión' },
};

function pintarInsigniaLogro(insignia, estado) {
  const datos = INSIGNIAS_LOGRO[estado] ?? { clase: 'badge text-bg-secondary', texto: 'Sin responder' };
  insignia.className = datos.clase;
  insignia.textContent = datos.texto;
}

// Al cambiar la marca en el Detalle, la insignia se pone al día: solo cambia
// si la opción es correcta y hay producción (el resto no depende de la marca).
// Las métricas de la pantalla se recalculan en el backend al recargar.
function estadoConMarca(paso, valor) {
  if (paso.estado_logro === null || paso.estado_logro === 'opcion_incorrecta' || paso.estado_logro === 'sin_justificacion') {
    return paso.estado_logro;
  }
  if (valor === true) return 'logrado';
  return valor === false ? 'justificacion_no_valida' : 'pendiente';
}

// Tres botones (radios btn-check) para la marca del docente sobre la
// producción de un estudiante en un paso. Se guarda al elegir; si falla,
// vuelve a quedar marcada la anterior. Es la lectura del docente: no cambia
// el acierto de opción y el estudiante no la ve. alGuardar(valor) actualiza
// la insignia de estado.
function crearMarcaJustificacion(paso, estudianteId, alGuardar) {
  const grupo = document.createElement('fieldset');
  grupo.className = 'mt-1';

  const leyenda = document.createElement('legend');
  leyenda.className = 'small fw-semibold mb-1 float-none';
  leyenda.textContent = 'Justificación válida';

  const botones = document.createElement('div');
  botones.className = 'btn-group btn-group-sm';

  let guardada = paso.produccion.justificacion_valida;
  const nombre = 'marca-' + estudianteId + '-' + paso.id;
  const radios = OPCIONES_MARCA.map(({ valor, texto }, i) => {
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.className = 'btn-check';
    radio.name = nombre;
    radio.id = nombre + '-' + i;
    radio.autocomplete = 'off';
    radio.checked = valor === guardada;

    const etiqueta = document.createElement('label');
    etiqueta.className = 'btn btn-outline-secondary';
    etiqueta.htmlFor = radio.id;
    etiqueta.textContent = texto;

    radio.addEventListener('change', () => guardar(valor, radio));
    botones.append(radio, etiqueta);
    return { radio, valor };
  });

  async function guardar(valor, radio) {
    radios.forEach((r) => { r.radio.disabled = true; });
    mensajeMarca.replaceChildren();
    let error = null;
    try {
      const { ok, status, cuerpo } = await postJson('produccion_marcar.php', {
        actividad_id: actividadId,
        estudiante_id: estudianteId,
        paso_id: paso.id,
        valida: valor,
      });
      if (status === 401) {
        window.location.href = 'index.html';
        return;
      }
      if (ok) {
        guardada = valor;
        alGuardar(valor);
        mensajeMarca.textContent = 'Marca del paso ' + paso.orden + ' guardada.';
        // Los conteos de la pantalla se ponen al día.
        recargarMetricas();
      } else {
        error = cuerpo.error || 'No se pudo guardar la marca.';
      }
    } catch {
      error = 'No se pudo conectar con el servidor.';
    }

    radios.forEach((r) => { r.radio.disabled = false; });
    if (error !== null) {
      radios.forEach((r) => { r.radio.checked = r.valor === guardada; });
      mensajeMarca.textContent = error;
    }
    // Al deshabilitarse pierde el foco: vuelve a la opción marcada.
    (radios.find((r) => r.radio.checked)?.radio ?? radio).focus();
  }

  grupo.append(leyenda, botones);
  return grupo;
}

// Una cita de tiempo ("⏱ mm:ss") lleva el enlace "Ir a ese momento" al
// recurso de la actividad. Si hay producción, debajo va la marca del docente.
function crearProduccionPaso(paso, actividad, estudianteId, alGuardarMarca) {
  const conProduccion = 'produccion' in paso;
  if (!conProduccion && !paso.justificacion) return null;

  const fila = document.createElement('div');
  fila.className = 'row g-3 mt-0';

  if (conProduccion) {
    const produccion = paso.produccion;
    const cita = produccion?.tipo_cita === 'tiempo'
      ? '⏱ ' + formatearMomento(produccion.cita_segundos)
      : produccion?.cita_texto;

    // Solo lo que pide la modalidad: la cita (cita_texto), el texto libre
    // (texto_libre) o el momento y lo que se ve en él (momento_video).
    const modo = actividad?.produccion_modo;
    const columna = document.createElement('div');
    columna.className = paso.justificacion ? 'col-md-6' : 'col-12';
    const bloqueCita = crearBloqueTexto(modo === 'momento_video' ? 'Momento citado' : 'Cita del material', cita, 'Sin cita');
    const destino = produccion?.tipo_cita === 'tiempo'
      ? urlDelMomento(actividad?.recurso_url, produccion.cita_segundos)
      : null;
    if (destino !== null) {
      const enlace = document.createElement('a');
      enlace.className = 'small';
      enlace.href = destino;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.textContent = 'Ir a ese momento';
      enlace.setAttribute('aria-label',
        'Ir a ese momento del recurso (' + formatearMomento(produccion.cita_segundos) + '), se abre en otra pestaña');
      bloqueCita.appendChild(enlace);
    }
    if (modo !== 'texto_libre') columna.appendChild(bloqueCita);
    if (modo === 'texto_libre') {
      columna.appendChild(crearBloqueTexto('Justificación del estudiante', produccion?.explicacion, 'Sin justificación'));
    } else if (modo === 'momento_video') {
      columna.appendChild(crearBloqueTexto('Qué se dice o se ve en ese momento', produccion?.explicacion, 'Sin texto'));
    }
    if (produccion) columna.appendChild(crearMarcaJustificacion(paso, estudianteId, alGuardarMarca));
    fila.appendChild(columna);
  }

  if (paso.justificacion) {
    const columna = document.createElement('div');
    columna.className = conProduccion ? 'col-md-6' : 'col-12';
    columna.appendChild(crearBloqueTexto('Justificación del docente (referencia)', paso.justificacion, ''));
    fila.appendChild(columna);
  }
  return fila;
}

// Un paso de opción múltiple o verdadero o falso respondido muestra las
// opciones elegidas y si acertó: verde si el conjunto elegido es exactamente
// el de las correctas, rojo si no.
function crearItemPaso(paso, actividad, estudianteId) {
  const respondido = paso.opciones_elegidas.length > 0;

  const item = document.createElement('li');
  item.className = 'list-group-item d-flex gap-2 align-items-start';

  // HU-018: con producción propia la insignia es uno de los cinco estados de
  // logro (Logrado, Opción incorrecta, Sin justificación, Justificación no
  // válida, Pendiente de revisión), o "Sin responder". Sin producción
  // propia, "Correcta" / "Incorrecta" como siempre.
  const conProduccion = actividad?.produccion_propia === true;
  const estado = document.createElement('span');
  if (conProduccion) {
    pintarInsigniaLogro(estado, paso.estado_logro);
  } else if (respondido) {
    estado.className = paso.correcta ? 'badge text-bg-success' : 'badge text-bg-danger';
    estado.textContent = paso.correcta ? '✓ Correcta' : '✗ Incorrecta';
  } else {
    estado.className = 'badge text-bg-secondary';
    estado.textContent = 'Pendiente';
  }

  const texto = document.createElement('div');
  texto.className = 'flex-grow-1';
  texto.style.minWidth = '0';
  const descripcion = document.createElement('div');
  descripcion.textContent = paso.descripcion;
  descripcion.appendChild(crearEtiquetaTipo(paso));
  texto.appendChild(descripcion);

  if (respondido) {
    const eleccion = document.createElement('small');
    eleccion.className = 'd-block ' + (paso.correcta ? 'text-success' : 'text-danger');
    eleccion.textContent = 'Eligió: ' + paso.opciones_elegidas.join(' · ');
    texto.appendChild(eleccion);

    // En opción múltiple puede haber varias correctas: se aclara que se
    // compara el conjunto completo.
    if (paso.tipo === 'opcion_multiple') {
      const coincide = document.createElement('small');
      coincide.className = 'd-block text-body-secondary';
      coincide.textContent = paso.correcta
        ? 'Coincide con las opciones correctas'
        : 'No coincide con las opciones correctas';
      texto.appendChild(coincide);
    }
  }

  const produccion = crearProduccionPaso(paso, actividad, estudianteId,
    (valor) => { if (conProduccion) pintarInsigniaLogro(estado, estadoConMarca(paso, valor)); });
  if (produccion) texto.appendChild(produccion);

  item.append(estado, texto);
  return item;
}

function crearItemApoyo(apoyo) {
  const item = document.createElement('li');
  item.className = 'list-group-item d-flex justify-content-between align-items-center';
  item.textContent = nombreApoyo(apoyo.apoyo);

  const cantidad = document.createElement('span');
  cantidad.className = 'badge insignia-apoyo rounded-pill';
  cantidad.textContent = apoyo.veces === 1 ? '1 vez' : apoyo.veces + ' veces';

  item.appendChild(cantidad);
  return item;
}

async function abrirDetalle(estudiante) {
  detalleTitulo.textContent = estudiante.apellido + ', ' + estudiante.nombre;
  alertaDetalle.classList.add('d-none');
  mensajeMarca.replaceChildren();
  detalleContenido.classList.add('d-none');
  detalleCargando.classList.remove('d-none');
  modalDetalle.show();

  try {
    const { ok, status, cuerpo } = await getJson(
      'metricas_estudiante.php?actividad=' + encodeURIComponent(actividadId)
      + '&estudiante=' + encodeURIComponent(estudiante.id)
    );

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaDetalle, 'danger', cuerpo.error || 'No se pudo cargar el detalle.');
      return;
    }

    const hayDatos = cuerpo.abrio || cuerpo.pasos.some((paso) => paso.completado);
    detalleSinActividad.classList.toggle('d-none', hayDatos);
    detalleFoco.textContent = formatearTiempo(cuerpo.tiempo_foco) + ' (mm:ss)';

    detallePasos.replaceChildren(...cuerpo.pasos.map((paso) => crearItemPaso(paso, cuerpo.actividad, cuerpo.estudiante.id)));
    detalleSinPasos.classList.toggle('d-none', cuerpo.pasos.length > 0);

    detalleApoyos.replaceChildren(...cuerpo.apoyos.map(crearItemApoyo));
    detalleSinApoyos.classList.toggle('d-none', cuerpo.apoyos.length > 0);

    detalleContenido.classList.remove('d-none');
  } catch {
    mostrarAlerta(alertaDetalle, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    detalleCargando.classList.add('d-none');
  }
}

// ---- Enlace directo por estudiante ----

const TITULO_ENLACE = 'Copiar enlace directo para este estudiante. No lo abras vos para probarlo: '
  + 'si tocás Empezar, la actividad queda registrada a su nombre.';
const TITULO_ENLACE_FINALIZADA = 'Esta actividad ya fue realizada, el enlace no sirve';

// Un botón deshabilitado no recibe el mouse y en algunos navegadores no
// muestra su title: por eso el title va también en un span que lo envuelve.
function crearBotonEnlace(estudiante) {
  const finalizada = estudiante.finalizada_en !== null;
  const titulo = finalizada ? TITULO_ENLACE_FINALIZADA : TITULO_ENLACE;

  const envoltorio = document.createElement('span');
  envoltorio.className = 'd-inline-block me-2 align-middle';
  envoltorio.title = titulo;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-link btn-sm p-0 boton-copiar';
  boton.title = titulo;
  boton.setAttribute('aria-label', titulo);
  boton.disabled = finalizada;
  boton.appendChild(crearIcono(TRAZOS_COPIAR));
  boton.addEventListener('click', () => copiarEnlaceEstudiante(estudiante, boton));

  envoltorio.appendChild(boton);
  return envoltorio;
}

async function copiarEnlaceEstudiante(estudiante, boton) {
  boton.disabled = true;
  try {
    const { ok, status, cuerpo } = await getJson(
      'actividad_enlace_estudiante.php?actividad_id=' + encodeURIComponent(actividadId)
      + '&estudiante_id=' + encodeURIComponent(estudiante.id)
    );
    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaMetricas, 'danger', cuerpo.error || 'No se pudo obtener el enlace.');
      return;
    }
    // navigator.clipboard solo existe en contextos seguros (https o localhost).
    if (!navigator.clipboard) {
      throw new Error('Portapapeles no disponible');
    }
    await navigator.clipboard.writeText(cuerpo.url);
    mostrarCopiado(boton);
  } catch {
    mostrarAlerta(alertaMetricas, 'danger', 'No se pudo copiar el enlace.');
  } finally {
    boton.disabled = false;
  }
}

// ---- Reabrir la Tarea de un estudiante (HU-016) ----

const elementoModalReabrir = document.getElementById('modal-reabrir');
const modalReabrir = new bootstrap.Modal(elementoModalReabrir);
const textoModalReabrir = document.getElementById('modal-reabrir-texto');
const mensajeReabrir = document.getElementById('mensaje-reabrir');
const mensajePanel = document.getElementById('mensaje-panel');
const btnConfirmarReabrir = document.getElementById('btn-confirmar-reabrir');

let estudianteReabrir = null;

// Aviso dentro de una región role="status" que queda siempre en la página.
function avisar(region, tipo, mensaje) {
  const aviso = document.createElement('div');
  aviso.className = 'alert alert-' + tipo + ' mb-3';
  aviso.textContent = mensaje;
  region.replaceChildren(aviso);
}

// La tabla se rearma en cada recarga (también la automática), así que el
// botón que abrió el modal puede no existir más: el foco vuelve al botón
// de esa fila que lo abrió (claseBoton) si sigue estando, si no al primer
// botón habilitado de la fila, y si tampoco, a Actualizar.
function destinoFocoFila(estudiante, claseBoton) {
  const fila = estudiante
    ? listaEstudiantes.querySelector('tr[data-estudiante="' + estudiante.id + '"]')
    : null;
  return fila?.querySelector(claseBoton) || fila?.querySelector('button:not(:disabled)') || btnActualizar;
}

function destinoFocoReabrir() {
  return destinoFocoFila(estudianteReabrir, '.boton-reabrir');
}

function abrirReabrir(estudiante) {
  estudianteReabrir = estudiante;
  mensajePanel.replaceChildren();
  mensajeReabrir.replaceChildren();
  textoModalReabrir.textContent = '¿Reabrir la Tarea de ' + estudiante.apellido + ', ' + estudiante.nombre
    + '? Conserva sus respuestas y el tiempo ya trabajado.';
  btnConfirmarReabrir.disabled = false;
  modalReabrir.show();
}

// El foco arranca en Cancelar: Enter sin pensar no reabre nada.
elementoModalReabrir.addEventListener('shown.bs.modal', () => document.getElementById('btn-cancelar-reabrir').focus());
elementoModalReabrir.addEventListener('hidden.bs.modal', () => destinoFocoReabrir().focus());

// Vuelve a pedir las métricas. Si justo había una recarga automática en
// curso se la espera, porque puede traer el estado anterior.
async function recargarMetricas() {
  while (actualizando) {
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  await cargarMetricas();
}

btnConfirmarReabrir.addEventListener('click', async () => {
  const estudiante = estudianteReabrir;
  btnConfirmarReabrir.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('tarea_reabrir.php', {
      actividad_id: actividadId,
      estudiante_id: estudiante.id,
    });

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      avisar(mensajeReabrir, 'danger', cuerpo.error || 'No se pudo reabrir la Tarea.');
      // 409: ya no estaba finalizada (se reabrió desde otra pestaña): la
      // tabla se pone al día.
      if (status === 409) recargarMetricas();
      return;
    }

    await recargarMetricas();
    modalReabrir.hide();
    avisar(mensajePanel, 'success', 'Tarea de ' + estudiante.apellido + ', ' + estudiante.nombre + ' reabierta.');
  } catch {
    avisar(mensajeReabrir, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnConfirmarReabrir.disabled = false;
  }
});

// ---- Enviar o reenviar el enlace por correo (HU-019) ----

const elementoModalCorreo = document.getElementById('modal-correo');
const modalCorreo = new bootstrap.Modal(elementoModalCorreo);
const textoModalCorreo = document.getElementById('modal-correo-texto');
const mensajeCorreo = document.getElementById('mensaje-correo');
const btnConfirmarCorreo = document.getElementById('btn-confirmar-correo');

let estudianteCorreo = null;

function abrirCorreo(estudiante) {
  estudianteCorreo = estudiante;
  mensajePanel.replaceChildren();
  mensajeCorreo.replaceChildren();
  textoModalCorreo.textContent = '¿' + (estudiante.correo ? 'Reenviar' : 'Enviar') + ' por correo a '
    + estudiante.apellido + ', ' + estudiante.nombre + ' el enlace personal de esta actividad? '
    + 'Le llega a la dirección con la que se registró.';
  btnConfirmarCorreo.disabled = false;
  modalCorreo.show();
}

// El foco arranca en Cancelar, como en el resto de las confirmaciones.
elementoModalCorreo.addEventListener('shown.bs.modal', () => document.getElementById('btn-cancelar-correo').focus());
elementoModalCorreo.addEventListener('hidden.bs.modal', () => destinoFocoFila(estudianteCorreo, '.boton-correo').focus());

btnConfirmarCorreo.addEventListener('click', async () => {
  const estudiante = estudianteCorreo;
  const nombre = estudiante.apellido + ', ' + estudiante.nombre;
  btnConfirmarCorreo.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('correo_reenviar.php', {
      actividad_id: actividadId,
      estudiante_id: estudiante.id,
    });

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      avisar(mensajeCorreo, 'danger', cuerpo.error || 'No se pudo enviar el correo.');
      // 502: el intento quedó registrado como error; la tabla se pone al día.
      if (status === 502) recargarMetricas();
      return;
    }

    await recargarMetricas();
    modalCorreo.hide();
    if (cuerpo.resultado === 'enviado') {
      avisar(mensajePanel, 'success', 'Correo enviado a ' + nombre + '.');
    } else {
      avisar(mensajePanel, 'warning', nombre + ': ' + cuerpo.mensaje);
    }
  } catch {
    avisar(mensajeCorreo, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnConfirmarCorreo.disabled = false;
  }
});

// ---- Devolución del docente ----

const modalDevolucion = new bootstrap.Modal(document.getElementById('modal-devolucion'));
const devolucionTitulo = document.getElementById('modal-devolucion-titulo');
const alertaDevolucion = document.getElementById('alerta-devolucion');
const formDevolucion = document.getElementById('form-devolucion');
const devolucionTexto = document.getElementById('devolucion-texto');
const btnEnviarDevolucion = document.getElementById('btn-enviar-devolucion');
const devolucionesCargando = document.getElementById('devoluciones-cargando');
const devolucionesVacio = document.getElementById('devoluciones-vacio');
const listaDevoluciones = document.getElementById('lista-devoluciones');

// Estudiante del cuadro abierto. Cada apertura tiene un número: si llega la
// respuesta de un estudiante anterior, se descarta.
let estudianteDevolucion = null;
let aperturaDevolucion = 0;

function crearItemDevolucion(mensaje) {
  const item = document.createElement('li');
  item.className = 'list-group-item';

  const encabezado = document.createElement('div');
  encabezado.className = 'd-flex justify-content-between gap-2 small text-body-secondary mb-1';
  const fecha = document.createElement('span');
  fecha.textContent = formatearFechaHora(mensaje.fecha_envio);
  const estado = document.createElement('span');
  estado.textContent = mensaje.leido ? 'Leída' : 'Sin leer';
  encabezado.append(fecha, estado);

  // white-space: pre-wrap para respetar los saltos de línea que escribió.
  const texto = document.createElement('div');
  texto.style.whiteSpace = 'pre-wrap';
  texto.textContent = mensaje.texto;

  item.append(encabezado, texto);
  return item;
}

function mostrarDevoluciones(mensajes) {
  listaDevoluciones.replaceChildren(...mensajes.map(crearItemDevolucion));
  devolucionesVacio.classList.toggle('d-none', mensajes.length > 0);
}

async function cargarDevoluciones(estudiante, apertura) {
  try {
    const { ok, status, cuerpo } = await getJson(
      'mensajes_docente.php?actividad_id=' + encodeURIComponent(actividadId)
      + '&estudiante_id=' + encodeURIComponent(estudiante.id)
    );
    if (apertura !== aperturaDevolucion) return;
    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaDevolucion, 'danger', cuerpo.error || 'No se pudieron cargar las devoluciones.');
      return;
    }
    mostrarDevoluciones(cuerpo.mensajes);
  } catch {
    if (apertura === aperturaDevolucion) {
      mostrarAlerta(alertaDevolucion, 'danger', 'No se pudo conectar con el servidor.');
    }
  } finally {
    if (apertura === aperturaDevolucion) devolucionesCargando.classList.add('d-none');
  }
}

function abrirDevolucion(estudiante) {
  estudianteDevolucion = estudiante;
  const apertura = ++aperturaDevolucion;

  devolucionTitulo.textContent = 'Devolución para ' + estudiante.apellido + ', ' + estudiante.nombre;
  alertaDevolucion.classList.add('d-none');
  formDevolucion.reset();
  devolucionTexto.classList.remove('is-invalid');
  listaDevoluciones.replaceChildren();
  devolucionesVacio.classList.add('d-none');
  devolucionesCargando.classList.remove('d-none');
  modalDevolucion.show();

  cargarDevoluciones(estudiante, apertura);
}

document.getElementById('modal-devolucion').addEventListener('shown.bs.modal', () => devolucionTexto.focus());

formDevolucion.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const texto = devolucionTexto.value.trim();
  if (texto === '') {
    devolucionTexto.classList.add('is-invalid');
    mostrarAlerta(alertaDevolucion, 'danger', 'Escribí la devolución antes de enviarla.');
    return;
  }
  devolucionTexto.classList.remove('is-invalid');

  const estudiante = estudianteDevolucion;
  const apertura = aperturaDevolucion;
  btnEnviarDevolucion.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('mensaje_enviar.php', {
      actividad_id: actividadId,
      estudiante_id: estudiante.id,
      texto,
    });
    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (apertura !== aperturaDevolucion) return;
    if (!ok) {
      mostrarAlerta(alertaDevolucion, 'danger',
        cuerpo.errores?.texto || cuerpo.error || 'No se pudo enviar la devolución.');
      return;
    }
    formDevolucion.reset();
    mostrarAlerta(alertaDevolucion, 'success', 'Devolución enviada.');
    cargarDevoluciones(estudiante, apertura);
  } catch {
    if (apertura === aperturaDevolucion) {
      mostrarAlerta(alertaDevolucion, 'danger', 'No se pudo conectar con el servidor.');
    }
  } finally {
    btnEnviarDevolucion.disabled = false;
  }
});

// ---- Arranque ----

if (!Number.isInteger(actividadId) || actividadId < 1) {
  cargando.classList.add('d-none');
  btnActualizar.disabled = true;
  mostrarAlerta(alertaMetricas, 'danger', 'Falta indicar la actividad.');
} else {
  btnActualizar.addEventListener('click', cargarMetricas);
  cargarMetricas();
  // Solo se refrescan los datos, no la página.
  setInterval(cargarMetricas, RECARGA_MS);
}
