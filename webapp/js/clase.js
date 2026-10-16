// Página de una clase (HU-014): clase.html?id=N muestra las actividades de
// esa clase con las mismas acciones que tenía antes el panel docente
// (Asignar, Duplicar, Ver métricas). No hay endpoint propio: los datos salen
// de clase_listar.php y actividad_listar.php, filtrando por clase_id acá.
// HU-015: editar y dar de baja cada actividad, y la sección
// "Actividades dadas de baja" con Reactivar (baja lógica: no se borra nada).
// Métricas de la clase: las casillas de la tabla eligen actividades y el
// botón "Métricas de la clase" abre metricas-clase.html con sus ids. Las
// dadas de baja no tienen casilla: no se pueden elegir.

const alertaPanel = document.getElementById('alerta');
const mensajePanel = document.getElementById('mensaje-panel');
const cargando = document.getElementById('cargando');
const noEncontrada = document.getElementById('no-encontrada');
const contenidoClase = document.getElementById('contenido-clase');
const migaClase = document.getElementById('miga-clase');
const claseNombre = document.getElementById('clase-nombre');
const claseMateria = document.getElementById('clase-materia');
const claseDescripcion = document.getElementById('clase-descripcion');
const vacio = document.getElementById('vacio');
const contenedorTabla = document.getElementById('contenedor-tabla');
const listaActividades = document.getElementById('lista-actividades');
const seccionBajas = document.getElementById('seccion-bajas');
const listaBajas = document.getElementById('lista-bajas');
const actividadesTodas = document.getElementById('actividades-todas');
const btnMetricasClase = document.getElementById('btn-metricas-clase');

const modalAsignar = new bootstrap.Modal(document.getElementById('modal-asignar'));
const formAsignar = document.getElementById('form-asignar');
const alertaAsignar = document.getElementById('alerta-asignar');
const asignarTitulo = document.getElementById('asignar-actividad-titulo');
const estudiantesCargando = document.getElementById('estudiantes-cargando');
const estudiantesVacio = document.getElementById('estudiantes-vacio');
const estudiantesLista = document.getElementById('estudiantes-lista');
const estudiantesCasillas = document.getElementById('estudiantes-casillas');
const estudiantesTodos = document.getElementById('estudiantes-todos');
const btnAsignar = document.getElementById('btn-asignar');
const opcionCorreo = document.getElementById('opcion-correo');
const casillaCorreo = document.getElementById('asignar-correo');

const elementoModalBaja = document.getElementById('modal-baja');
const modalBaja = new bootstrap.Modal(elementoModalBaja);
const textoModalBaja = document.getElementById('modal-baja-texto');
const mensajeBaja = document.getElementById('mensaje-baja');
const btnConfirmarBaja = document.getElementById('btn-confirmar-baja');

const parametros = new URLSearchParams(window.location.search);
const claseId = Number(parametros.get('id'));

// Actividad que se está asignando en el modal.
let actividadAsignarId = null;
// Actividad que se está por dar de baja en el modal.
let actividadBaja = null;
// La lista de estudiantes se pide una sola vez, la primera vez que se abre el modal.
let estudiantesCargados = false;
// Adónde va el foco al cerrar el modal de baja. Es una función porque la
// tabla se recarga: el botón que lo abrió ya es otro elemento, o ya no está.
let destinoFoco = () => claseNombre;
// Ids de las actividades elegidas para "Métricas de la clase". Se guardan
// acá y no solo en las casillas porque la tabla se recarga.
const actividadesElegidas = new Set();
// El mismo tope que metricas_clase.php.
const ACTIVIDADES_METRICAS_MAX = 100;

// El botón de una acción sobre una actividad, buscado de nuevo en las tablas.
function botonDeActividad(accion, actividadId) {
  return contenidoClase.querySelector(`[data-accion="${accion}"][data-actividad-id="${actividadId}"]`);
}

function crearBotonAccion(texto, etiqueta, accion, actividad, clases, alHacerClic) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-sm ' + clases;
  boton.textContent = texto;
  // El texto visible es corto; el lector de pantalla oye también el título.
  boton.setAttribute('aria-label', etiqueta + ' ' + actividad.titulo);
  boton.dataset.accion = accion;
  boton.dataset.actividadId = actividad.id;
  boton.addEventListener('click', () => alHacerClic(actividad, boton));
  return boton;
}

function crearEnlaceAccion(texto, etiqueta, href, clases) {
  const enlace = document.createElement('a');
  enlace.className = 'btn btn-sm ' + clases;
  enlace.href = href;
  enlace.textContent = texto;
  enlace.setAttribute('aria-label', etiqueta);
  return enlace;
}

// La clase viaja en el enlace solo para que "Volver" de métricas regrese acá.
function hrefMetricas(actividad) {
  return 'metricas.html?actividad=' + encodeURIComponent(actividad.id)
    + '&clase=' + encodeURIComponent(actividad.clase_id);
}

// Todo con textContent / createElement: los datos vienen del usuario
// y no se insertan como HTML.
function crearFila(actividad) {
  const fila = document.createElement('tr');

  const celdaCasilla = document.createElement('td');
  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  casilla.className = 'form-check-input casilla-actividad';
  casilla.value = actividad.id;
  casilla.checked = actividadesElegidas.has(actividad.id);
  casilla.setAttribute('aria-label', 'Seleccionar ' + actividad.titulo);
  casilla.addEventListener('change', () => {
    if (casilla.checked) {
      actividadesElegidas.add(actividad.id);
    } else {
      actividadesElegidas.delete(actividad.id);
    }
    actualizarSeleccion();
  });
  celdaCasilla.appendChild(casilla);

  const celdaTitulo = document.createElement('td');
  celdaTitulo.textContent = actividad.titulo;

  const celdaRecurso = document.createElement('td');
  const enlace = document.createElement('a');
  enlace.href = actividad.recurso_url;
  enlace.target = '_blank';
  enlace.rel = 'noopener noreferrer';
  enlace.textContent = 'Abrir recurso';

  const btnCopiar = document.createElement('button');
  btnCopiar.type = 'button';
  btnCopiar.className = 'btn btn-link btn-sm p-0 ms-2 align-baseline boton-copiar';
  btnCopiar.title = TITULO_COPIAR;
  btnCopiar.setAttribute('aria-label', TITULO_COPIAR);
  btnCopiar.appendChild(crearIcono(TRAZOS_COPIAR));
  btnCopiar.addEventListener('click', () => copiarEnlace(actividad.recurso_url, btnCopiar));

  celdaRecurso.append(enlace, btnCopiar);

  const celdaPasos = document.createElement('td');
  celdaPasos.className = 'text-center';
  celdaPasos.textContent = actividad.cantidad_pasos;

  const celdaFecha = document.createElement('td');
  celdaFecha.textContent = formatearFecha(actividad.fecha_creacion);

  const celdaAcciones = document.createElement('td');
  const acciones = document.createElement('div');
  acciones.className = 'd-flex flex-wrap gap-1 justify-content-end';
  acciones.append(
    crearBotonAccion('Asignar', 'Asignar', 'asignar', actividad, 'btn-outline-primary', abrirAsignar),
    crearBotonAccion('Duplicar', 'Duplicar', 'duplicar', actividad, 'btn-outline-secondary', duplicar),
    crearEnlaceAccion('Editar', 'Editar ' + actividad.titulo,
      'actividad-nueva.html?id=' + encodeURIComponent(actividad.id), 'btn-outline-secondary'),
    crearEnlaceAccion('Ver métricas', 'Ver métricas de ' + actividad.titulo, hrefMetricas(actividad), 'btn-primary'),
    crearBotonAccion('Dar de baja', 'Dar de baja', 'baja', actividad, 'btn-outline-danger', abrirBaja),
  );
  celdaAcciones.appendChild(acciones);

  fila.append(celdaCasilla, celdaTitulo, celdaRecurso, celdaPasos, celdaFecha, celdaAcciones);
  return fila;
}

// Fila de la sección "Actividades dadas de baja": el docente sigue viendo
// sus métricas (y devoluciones) y puede reactivarla.
function crearFilaBaja(actividad) {
  const fila = document.createElement('tr');

  const celdaTitulo = document.createElement('td');
  celdaTitulo.textContent = actividad.titulo;

  const celdaFecha = document.createElement('td');
  celdaFecha.textContent = formatearFecha(actividad.dada_de_baja_en);

  const celdaAcciones = document.createElement('td');
  const acciones = document.createElement('div');
  acciones.className = 'd-flex flex-wrap gap-1 justify-content-end';
  acciones.append(
    crearEnlaceAccion('Ver métricas', 'Ver métricas de ' + actividad.titulo, hrefMetricas(actividad), 'btn-outline-primary'),
    crearBotonAccion('Reactivar', 'Reactivar', 'reactivar', actividad, 'btn-outline-secondary', reactivar),
  );
  celdaAcciones.appendChild(acciones);

  fila.append(celdaTitulo, celdaFecha, celdaAcciones);
  return fila;
}

function mostrarNoEncontrada() {
  migaClase.textContent = 'Clase no encontrada';
  noEncontrada.classList.remove('d-none');
  contenidoClase.classList.add('d-none');
}

function mostrarClase(clase) {
  document.title = clase.nombre + ' — Apoyos Educativos';
  migaClase.textContent = clase.nombre;
  claseNombre.textContent = clase.nombre;
  claseMateria.textContent = clase.materia ? 'Materia: ' + clase.materia : '';
  claseMateria.classList.toggle('d-none', !clase.materia);
  claseDescripcion.textContent = clase.descripcion || '';
  claseDescripcion.classList.toggle('d-none', !clase.descripcion);

  document.getElementById('btn-crear-actividad').href =
    'actividad-nueva.html?clase_id=' + encodeURIComponent(clase.id);

  contenidoClase.classList.remove('d-none');
}

// Se piden las tres listas juntas (clases activas, actividades activas y
// dadas de baja) y se filtran las de esta clase. Si la clase no está entre
// las activas del docente (no existe, es de otro o está dada de baja), se
// muestra "Clase no encontrada".
async function cargarClase() {
  cargando.classList.remove('d-none');
  try {
    const respuestas = await Promise.all([
      getJson('clase_listar.php'),
      getJson('actividad_listar.php'),
      getJson('actividad_listar.php?bajas=1'),
    ]);

    if (respuestas.some(({ status }) => status === 401 || status === 403)) {
      window.location.href = 'index.html';
      return;
    }
    const fallida = respuestas.find(({ ok }) => !ok);
    if (fallida) {
      mostrarAlerta(alertaPanel, 'danger', fallida.cuerpo.error || 'No se pudo cargar la clase.');
      return;
    }
    const [clases, actividades, bajas] = respuestas.map(({ cuerpo }) => cuerpo);

    const clase = clases.clases.find((c) => c.id === claseId);
    if (!clase) {
      mostrarNoEncontrada();
      return;
    }
    mostrarClase(clase);

    const deLaClase = actividades.actividades.filter((a) => a.clase_id === claseId);
    // Una actividad elegida que ya no está en la tabla (se dio de baja) deja de estarlo.
    const idsActivas = new Set(deLaClase.map((a) => a.id));
    actividadesElegidas.forEach((id) => {
      if (!idsActivas.has(id)) actividadesElegidas.delete(id);
    });
    listaActividades.replaceChildren(...deLaClase.map(crearFila));
    actualizarSeleccion();
    vacio.classList.toggle('d-none', deLaClase.length > 0);
    contenedorTabla.classList.toggle('d-none', deLaClase.length === 0);

    const bajasDeLaClase = bajas.actividades.filter((a) => a.clase_id === claseId);
    listaBajas.replaceChildren(...bajasDeLaClase.map(crearFilaBaja));
    seccionBajas.classList.toggle('d-none', bajasDeLaClase.length === 0);
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    cargando.classList.add('d-none');
  }
}

// ---- Métricas de la clase ----

function casillasActividades() {
  return Array.from(listaActividades.querySelectorAll('.casilla-actividad'));
}

// Pone "Seleccionar todas" y el botón de acuerdo con las actividades elegidas.
function actualizarSeleccion() {
  const total = casillasActividades().length;
  const elegidas = actividadesElegidas.size;
  actividadesTodas.checked = total > 0 && elegidas === total;
  actividadesTodas.indeterminate = elegidas > 0 && elegidas < total;
  btnMetricasClase.disabled = elegidas === 0;
}

actividadesTodas.addEventListener('change', () => {
  casillasActividades().forEach((casilla) => {
    casilla.checked = actividadesTodas.checked;
    if (casilla.checked) {
      actividadesElegidas.add(Number(casilla.value));
    } else {
      actividadesElegidas.delete(Number(casilla.value));
    }
  });
  actualizarSeleccion();
});

btnMetricasClase.addEventListener('click', () => {
  if (actividadesElegidas.size > ACTIVIDADES_METRICAS_MAX) {
    mostrarAlerta(alertaPanel, 'warning',
      'Podés elegir como máximo ' + ACTIVIDADES_METRICAS_MAX + ' actividades para ver las métricas de la clase.');
    return;
  }
  window.location.href = 'metricas-clase.html?clase=' + encodeURIComponent(claseId)
    + '&actividades=' + Array.from(actividadesElegidas).join(',');
});

// ---- Duplicar ----

// La copia queda en la misma clase, así que el docente sigue en esta página.
async function duplicar(actividad, boton) {
  boton.disabled = true;
  mensajePanel.replaceChildren();
  try {
    const { ok, status, cuerpo } = await postJson('actividad_duplicar.php', { actividad_id: actividad.id });

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudo duplicar la actividad.');
      return;
    }

    await cargarClase();
    avisar(mensajePanel, 'success', 'Se creó "' + cuerpo.actividad.titulo + '".');
    const nuevoBoton = botonDeActividad('duplicar', actividad.id);
    if (nuevoBoton) nuevoBoton.focus();
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    boton.disabled = false;
  }
}

// ---- Dar de baja y reactivar ----

function abrirBaja(actividad) {
  actividadBaja = actividad;
  mensajePanel.replaceChildren();
  mensajeBaja.replaceChildren();
  textoModalBaja.textContent = 'La actividad "' + actividad.titulo + '" dejará de verse para los estudiantes, '
    + 'pero no se borra nada (ni sus pasos, ni sus métricas, ni las devoluciones) y podés reactivarla.';
  btnConfirmarBaja.disabled = false;
  destinoFoco = () => botonDeActividad('baja', actividad.id) || claseNombre;
  modalBaja.show();
}

// En una confirmación de baja el foco arranca en Cancelar: Enter sin
// pensar no da de baja nada.
elementoModalBaja.addEventListener('shown.bs.modal', () => document.getElementById('btn-cancelar-baja').focus());
elementoModalBaja.addEventListener('hidden.bs.modal', () => destinoFoco().focus());

btnConfirmarBaja.addEventListener('click', async () => {
  btnConfirmarBaja.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('actividad_baja.php', { id: actividadBaja.id });

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      avisar(mensajeBaja, 'danger', cuerpo.error || 'No se pudo dar de baja la actividad.');
      return;
    }

    await cargarClase();
    // La fila ya no está en la tabla: el foco va al título de la clase.
    modalBaja.hide();
    avisar(mensajePanel, 'success', cuerpo.mensaje);
  } catch {
    avisar(mensajeBaja, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnConfirmarBaja.disabled = false;
  }
});

// Reactivar no pierde nada, así que no pide confirmación.
async function reactivar(actividad, boton) {
  boton.disabled = true;
  mensajePanel.replaceChildren();
  try {
    const { ok, status, cuerpo } = await postJson('actividad_reactivar.php', { id: actividad.id });

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudo reactivar la actividad.');
      boton.disabled = false;
      return;
    }

    await cargarClase();
    avisar(mensajePanel, 'success', cuerpo.mensaje);
    // Vuelve a la tabla de activas: el foco va a su botón "Dar de baja".
    (botonDeActividad('baja', actividad.id) || claseNombre).focus();
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
    boton.disabled = false;
  }
}

// ---- Copiar enlace ----

const TITULO_COPIAR = 'Copiar enlace del recurso';

// Copia el link plano del recurso, sin token: sirve para verlo, pero sin
// la barra de apoyos (esa se activa solo desde "Abrir" en panel-estudiante).
async function copiarEnlace(url, boton) {
  try {
    // navigator.clipboard solo existe en contextos seguros (https o localhost).
    if (!navigator.clipboard) {
      throw new Error('Portapapeles no disponible');
    }
    await navigator.clipboard.writeText(url);
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo copiar el enlace.');
    return;
  }

  mostrarCopiado(boton);
}

// ---- Asignar ----

function crearCasilla(estudiante) {
  const contenedor = document.createElement('div');
  contenedor.className = 'form-check';

  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  casilla.className = 'form-check-input casilla-estudiante';
  casilla.id = 'estudiante-' + estudiante.id;
  casilla.value = estudiante.id;

  const etiqueta = document.createElement('label');
  etiqueta.className = 'form-check-label';
  etiqueta.htmlFor = casilla.id;
  etiqueta.textContent = estudiante.apellido + ', ' + estudiante.nombre;

  contenedor.append(casilla, etiqueta);
  return contenedor;
}

function casillasEstudiantes() {
  return Array.from(estudiantesCasillas.querySelectorAll('.casilla-estudiante'));
}

async function cargarEstudiantes() {
  estudiantesCargando.classList.remove('d-none');
  try {
    const { ok, status, cuerpo } = await getJson('estudiantes_listar.php');

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaAsignar, 'danger', cuerpo.error || 'No se pudieron cargar los estudiantes.');
      return;
    }

    estudiantesCargados = true;
    if (cuerpo.estudiantes.length === 0) {
      estudiantesVacio.classList.remove('d-none');
      return;
    }

    cuerpo.estudiantes.forEach((estudiante) => estudiantesCasillas.appendChild(crearCasilla(estudiante)));
    estudiantesLista.classList.remove('d-none');
    opcionCorreo.classList.remove('d-none');
  } catch {
    mostrarAlerta(alertaAsignar, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    estudiantesCargando.classList.add('d-none');
  }
}

function abrirAsignar(actividad) {
  actividadAsignarId = actividad.id;
  asignarTitulo.textContent = actividad.titulo;
  alertaAsignar.classList.add('d-none');
  estudiantesTodos.checked = false;
  casillasEstudiantes().forEach((casilla) => { casilla.checked = false; });
  casillaCorreo.checked = true;
  btnAsignar.disabled = false;

  modalAsignar.show();
  if (!estudiantesCargados) {
    cargarEstudiantes();
  }
}

// HU-019: debajo del aviso de la asignación, "Correo: Enviado a N · Sin
// correo M · Error K · Pendientes P" (lo arma el backend) y, si algo no
// salió, el motivo general. Se agrega a la misma región role="status".
function mostrarResultadoCorreo(correo) {
  const todoEnviado = correo.sin_correo + correo.errores + correo.pendientes === 0;
  const aviso = document.createElement('div');
  aviso.className = 'alert mb-3 ' + (todoEnviado ? 'alert-success' : 'alert-warning');
  let texto = correo.resumen;
  if (correo.aviso) {
    texto += ' ' + correo.aviso;
  }
  if (!todoEnviado) {
    texto += ' El estado de cada estudiante está en Métricas, donde se puede reenviar.';
  }
  aviso.textContent = texto;
  mensajePanel.appendChild(aviso);
}

estudiantesTodos.addEventListener('change', () => {
  casillasEstudiantes().forEach((casilla) => { casilla.checked = estudiantesTodos.checked; });
});

formAsignar.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const estudianteIds = casillasEstudiantes()
    .filter((casilla) => casilla.checked)
    .map((casilla) => Number(casilla.value));

  if (estudianteIds.length === 0) {
    mostrarAlerta(alertaAsignar, 'warning', 'Elegí al menos un estudiante.');
    return;
  }

  // Con correo el pedido puede tardar unos segundos (envío uno por uno).
  btnAsignar.disabled = true;
  btnAsignar.textContent = casillaCorreo.checked ? 'Asignando y enviando…' : 'Asignando…';
  try {
    const { ok, status, cuerpo } = await postJson('actividad_asignar.php', {
      actividad_id: actividadAsignarId,
      estudiante_ids: estudianteIds,
      enviar_correo: casillaCorreo.checked,
    });

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      const detalle = cuerpo.errores ? Object.values(cuerpo.errores).join(' ') : cuerpo.error;
      mostrarAlerta(alertaAsignar, 'danger', detalle || 'No se pudo asignar la actividad.');
      return;
    }

    modalAsignar.hide();
    avisar(mensajePanel, 'success', cuerpo.mensaje);
    if (cuerpo.correo) {
      mostrarResultadoCorreo(cuerpo.correo);
    }
  } catch {
    mostrarAlerta(alertaAsignar, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnAsignar.disabled = false;
    btnAsignar.textContent = 'Asignar';
  }
});

// ---- Arranque ----

// Mensaje de éxito que deja actividad-nueva.html al volver (al crear o al
// editar una actividad).
const AVISOS_VUELTA = {
  creada: 'Actividad creada correctamente.',
  editada: 'Actividad actualizada correctamente.',
};
const vuelta = Object.keys(AVISOS_VUELTA).find((clave) => parametros.get(clave) === '1');
if (vuelta) {
  avisar(mensajePanel, 'success', AVISOS_VUELTA[vuelta]);
  history.replaceState(null, '', 'clase.html?id=' + encodeURIComponent(claseId));
}

if (!Number.isInteger(claseId) || claseId < 1) {
  cargando.classList.add('d-none');
  mostrarNoEncontrada();
} else {
  cargarClase();
}
