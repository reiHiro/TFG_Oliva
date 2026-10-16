const formActividad = document.getElementById('form-actividad');
const alertaActividad = document.getElementById('alerta');
const btnGuardar = document.getElementById('btn-enviar');
const listaPasos = document.getElementById('lista-pasos');
const plantillaPaso = document.getElementById('plantilla-paso');
const plantillaOpcion = document.getElementById('plantilla-opcion');
const feedbackPasos = formActividad.querySelector('[data-campo="pasos"]');

const btnVistaPrevia = document.getElementById('btn-vista-previa');
const selectClase = formActividad.elements.clase_id;
const mensajeClase = document.getElementById('mensaje-clase');

// Cantidad de clases del docente; sin ninguna no se puede guardar la actividad.
let cantidadClases = 0;

// Clase con la que se llegó desde clase.html (?clase_id=N). Viene elegida en
// el selector, y "Volver" y "Cancelar" regresan a ella. Sin parámetro (o si
// no es una clase del docente) se elige a mano y se vuelve a "Mis clases".
const parametroClase = Number(new URLSearchParams(window.location.search).get('clase_id'));
const claseOrigenId = Number.isInteger(parametroClase) && parametroClase > 0 ? parametroClase : null;

// Con ?id=N la página edita esa actividad (HU-015) en vez de crear una.
// Se reutiliza el mismo formulario; la clase no se puede cambiar.
const parametroId = Number(new URLSearchParams(window.location.search).get('id'));
const actividadEditarId = Number.isInteger(parametroId) && parametroId > 0 ? parametroId : null;
// En edición: si el recurso y los pasos están bloqueados porque un
// estudiante ya la inició.
let contenidoBloqueado = false;

const OPCIONES_MIN = 2;
const OPCIONES_MAX = 4;

// Etiqueta chica que se muestra junto al número de cada paso.
const ETIQUETAS_TIPO = {
  opcion_unica: 'Opción única',
  opcion_multiple: 'Opción múltiple',
  verdadero_falso: 'V/F',
};

// Cada paso necesita su propio grupo de radios para la correcta de verdadero o falso.
let contadorPasos = 0;

// --- Clase ------------------------------------------------------------------

function crearOpcion(valor, texto) {
  const opcion = document.createElement('option');
  opcion.value = valor;
  opcion.textContent = texto;
  return opcion;
}

function apuntarEnlacesVolver(claseId) {
  const volver = document.getElementById('enlace-volver');
  const cancelar = document.getElementById('enlace-cancelar');
  const destino = 'clase.html?id=' + encodeURIComponent(claseId);
  volver.href = destino;
  volver.textContent = '← Volver a la clase';
  cancelar.href = destino;
}

// Las clases se crean solo desde "Mis clases": sin ninguna, el aviso lleva ahí.
function avisarSinClases() {
  const aviso = document.createElement('div');
  aviso.className = 'alert alert-warning mb-3';
  const enlace = document.createElement('a');
  enlace.href = 'panel-docente.html';
  enlace.className = 'alert-link';
  enlace.textContent = 'Mis clases';
  aviso.append('Para guardar una actividad primero tenés que crear una clase. Creala desde ', enlace, '.');
  mensajeClase.replaceChildren(aviso);
}

// Llena el selector con las clases del docente. Si se pasa seleccionarId
// (la de ?clase_id) y es del docente, queda elegida esa; si hay una sola, esa.
async function cargarClases(seleccionarId = null) {
  try {
    const { ok, status, cuerpo } = await getJson('clase_listar.php');

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaActividad, 'danger', cuerpo.error || 'No se pudieron cargar las clases.');
      return;
    }

    cantidadClases = cuerpo.clases.length;
    if (cantidadClases === 0) {
      selectClase.replaceChildren(crearOpcion('', 'Todavía no tenés clases'));
      // Sin clases no se puede guardar: se manda al docente a crear una.
      avisarSinClases();
      return;
    }

    selectClase.replaceChildren(
      crearOpcion('', 'Elegí una clase'),
      ...cuerpo.clases.map((clase) => crearOpcion(clase.id, textoClase(clase.nombre, clase.materia)))
    );
    if (seleccionarId !== null && cuerpo.clases.some((clase) => clase.id === seleccionarId)) {
      selectClase.value = String(seleccionarId);
    } else if (cantidadClases === 1) {
      selectClase.value = String(cuerpo.clases[0].id);
    }
  } catch {
    mostrarAlerta(alertaActividad, 'danger', 'No se pudo conectar con el servidor.');
  }
}

// --- Lista de pasos ---------------------------------------------------------

// Renumera los pasos (y sus opciones) y deshabilita "Quitar" cuando queda uno solo.
function actualizarPasos() {
  const items = listaPasos.querySelectorAll(':scope > .paso');
  items.forEach((item, i) => {
    const numero = i + 1;
    item.querySelector('.numero-paso').textContent = numero;
    item.querySelector('.descripcion-paso').setAttribute('aria-label', `Paso ${numero}`);
    item.querySelector('.tipo-paso').setAttribute('aria-label', `Tipo del paso ${numero}`);
    // Sin tipo elegido todavía no hay insignia.
    const tipo = item.querySelector('.tipo-paso').value;
    const etiquetaTipo = item.querySelector('.etiqueta-tipo');
    etiquetaTipo.textContent = ETIQUETAS_TIPO[tipo] ?? '';
    etiquetaTipo.hidden = tipo === '';
    item.querySelector('.grupo-vf').setAttribute('aria-label', `Respuesta correcta del paso ${numero}`);
    item.querySelector('.justificacion-paso').setAttribute('aria-label',
      `Justificación del paso ${numero} (fragmento del material, opcional)`);
    item.querySelector('.btn-quitar-paso').disabled = items.length === 1;
    actualizarOpciones(item, numero);
  });
}

const AYUDA_OPCIONES = {
  opcion_multiple: 'Entre 2 y 4 opciones. Marcá las correctas (al menos una).',
  opcion_unica: 'Entre 2 y 4 opciones. Marcá la correcta (solo una).',
};

// En opción única la correcta se marca con un radio (todos los del paso
// con el mismo name: marcar uno desmarca el otro); en opción múltiple, con
// casillas. Al pasar de múltiple a única queda marcada solo la primera.
function actualizarOpciones(item, numeroPaso) {
  const unica = item.querySelector('.tipo-paso').value === 'opcion_unica';
  item.querySelector('.ayuda-opciones').textContent = AYUDA_OPCIONES[unica ? 'opcion_unica' : 'opcion_multiple'];
  const opciones = item.querySelectorAll('.lista-opciones > li');
  let hayMarcada = false;
  opciones.forEach((opcion, j) => {
    const numero = j + 1;
    opcion.querySelector('.texto-opcion').setAttribute('aria-label', `Opción ${numero} del paso ${numeroPaso}`);
    const marca = opcion.querySelector('.correcta-opcion');
    const estabaMarcada = marca.checked;
    marca.type = unica ? 'radio' : 'checkbox';
    marca.name = unica ? `${item.dataset.grupo}-unica` : '';
    marca.checked = estabaMarcada && !(unica && hayMarcada);
    hayMarcada ||= marca.checked;
    marca.setAttribute('aria-label', unica ? `La opción ${numero} es la correcta` : `La opción ${numero} es correcta`);
    opcion.querySelector('.btn-quitar-opcion').disabled = opciones.length <= OPCIONES_MIN;
  });
  item.querySelector('.btn-agregar-opcion').disabled = opciones.length >= OPCIONES_MAX;
}

// enfocar = false cuando se cargan los pasos de una actividad a editar.
function agregarPaso(enfocar = true) {
  const item = plantillaPaso.content.firstElementChild.cloneNode(true);
  item.dataset.grupo = `correcta-${++contadorPasos}`;
  // Los botones Verdadero / Falso son radios reales (btn-check): mismo name
  // para que elegir uno desmarque el otro, e id propio para su label.
  item.querySelectorAll('.correcta-vf').forEach((radio) => {
    radio.name = `${item.dataset.grupo}-vf`;
    radio.id = `${item.dataset.grupo}-${radio.value}`;
    radio.nextElementSibling.htmlFor = radio.id;
  });
  // HU-018: la justificación del paso, con su label.
  const justificacion = item.querySelector('.justificacion-paso');
  justificacion.id = `${item.dataset.grupo}-justificacion`;
  item.querySelector('.etiqueta-justificacion').htmlFor = justificacion.id;
  listaPasos.appendChild(item);
  actualizarPasos();
  if (enfocar) item.querySelector('.descripcion-paso').focus();
  return item;
}

function agregarOpcion(item) {
  const opcion = plantillaOpcion.content.firstElementChild.cloneNode(true);
  item.querySelector('.lista-opciones').appendChild(opcion);
  return opcion;
}

// Muestra los campos extra del tipo elegido: opciones de texto en opción
// múltiple, solo el selector de la correcta en verdadero o falso.
// Al pasar a opción múltiple por primera vez se cargan las dos opciones mínimas.
function cambiarTipo(item) {
  const selectTipo = item.querySelector('.tipo-paso');
  const tipo = selectTipo.value;
  selectTipo.classList.remove('is-invalid');
  selectTipo.removeAttribute('aria-invalid');
  // Opción única y opción múltiple usan la misma lista de opciones.
  const conOpciones = tipo === 'opcion_multiple' || tipo === 'opcion_unica';
  item.querySelector('.opciones-paso').hidden = !conOpciones;
  item.querySelector('.verdadero-falso-paso').hidden = tipo !== 'verdadero_falso';
  if (conOpciones && item.querySelectorAll('.lista-opciones > li').length === 0) {
    for (let j = 0; j < OPCIONES_MIN; j++) agregarOpcion(item);
  }
  actualizarPasos();
}

document.getElementById('btn-agregar-paso').addEventListener('click', () => agregarPaso());

// Agrega un paso ya cargado (edición), en el formato de actividad_obtener.php.
function agregarPasoConDatos(paso) {
  const item = agregarPaso(false);
  item.querySelector('.descripcion-paso').value = paso.descripcion;
  item.querySelector('.justificacion-paso').value = paso.justificacion ?? '';
  item.querySelector('.tipo-paso').value = paso.tipo;
  cambiarTipo(item);

  if (paso.tipo === 'opcion_multiple' || paso.tipo === 'opcion_unica') {
    // cambiarTipo cargó dos opciones vacías: se reemplazan por las guardadas.
    item.querySelector('.lista-opciones').replaceChildren();
    paso.opciones.forEach((datos) => {
      const opcion = agregarOpcion(item);
      opcion.querySelector('.texto-opcion').value = datos.texto;
      opcion.querySelector('.correcta-opcion').checked = datos.es_correcta;
    });
  } else if (paso.tipo === 'verdadero_falso') {
    const radio = item.querySelector(`.correcta-vf[value="${paso.correcta}"]`);
    if (radio) radio.checked = true;
  }
  actualizarPasos();
}

listaPasos.addEventListener('change', (evento) => {
  if (evento.target.classList.contains('tipo-paso')) {
    cambiarTipo(evento.target.closest('.paso'));
  }
});

listaPasos.addEventListener('click', (evento) => {
  const item = evento.target.closest('.paso');
  if (!item) return;

  if (evento.target.closest('.btn-quitar-paso')) {
    if (listaPasos.children.length === 1) return;
    item.remove();
  } else if (evento.target.closest('.btn-agregar-opcion')) {
    if (item.querySelectorAll('.lista-opciones > li').length >= OPCIONES_MAX) return;
    agregarOpcion(item).querySelector('.texto-opcion').focus();
  } else if (evento.target.closest('.btn-quitar-opcion')) {
    if (item.querySelectorAll('.lista-opciones > li').length <= OPCIONES_MIN) return;
    evento.target.closest('li').remove();
  } else {
    return;
  }
  actualizarPasos();
});

// Arma el paso tal como lo espera actividad_crear.php.
function leerPaso(item) {
  const paso = {
    descripcion: item.querySelector('.descripcion-paso').value.trim(),
    tipo: item.querySelector('.tipo-paso').value,
    // HU-018: opcional; vacía, el servidor la guarda como "sin justificación".
    justificacion: item.querySelector('.justificacion-paso').value.trim(),
  };
  if (paso.tipo === 'opcion_multiple' || paso.tipo === 'opcion_unica') {
    paso.opciones = Array.from(item.querySelectorAll('.lista-opciones > li'), (opcion) => ({
      texto: opcion.querySelector('.texto-opcion').value.trim(),
      es_correcta: opcion.querySelector('.correcta-opcion').checked,
    }));
  } else if (paso.tipo === 'verdadero_falso') {
    // El servidor crea las opciones "Verdadero" y "Falso"; solo viaja cuál es la correcta.
    paso.correcta = item.querySelector('.correcta-vf:checked')?.value ?? null;
  }
  return paso;
}

// --- Vista previa del modo lectura --------------------------------------------

// El enlace del recurso como URL si es http o https; si no, null.
function urlDelRecurso() {
  try {
    const url = new URL(formActividad.recurso_url.value.trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

// El botón solo sirve con un enlace válido. Funciona también con el enlace
// bloqueado (actividad ya iniciada): no cambia nada, solo lo abre.
function actualizarVistaPrevia() {
  btnVistaPrevia.disabled = urlDelRecurso() === null;
}

formActividad.recurso_url.addEventListener('input', actualizarVistaPrevia);

// Abre el recurso en una pestaña nueva con la marca que le pide a la
// extensión la vista de lectura limpia en modo vista previa (reemplaza el
// "#..." que el enlace pudiera traer). No guarda nada ni habla con el
// backend; sin la extensión instalada se ve la página tal cual.
btnVistaPrevia.addEventListener('click', () => {
  const url = urlDelRecurso();
  if (url === null) return;
  url.hash = 'vista-previa-lectura';
  window.open(url.href, '_blank', 'noopener');
});

// --- Producción propia (HU-018) ---------------------------------------------

const casillaProduccion = formActividad.produccion_propia;
const casillaMostrarJustificacion = formActividad.mostrar_justificacion;
const selectorMaterial = document.getElementById('produccion_material');
const grupoProduccionTexto = document.getElementById('grupo-produccion-texto');

// La modalidad que se guarda (produccion_modo) sale del material y, si es
// texto, de cómo justifica el estudiante.
function modoProduccion() {
  if (selectorMaterial.value === 'medio') return 'momento_video';
  return formActividad.querySelector('input[name="produccion_texto"]:checked')?.value ?? 'cita_texto';
}

// Pone el selector y los radios según una modalidad guardada.
function mostrarModoProduccion(modo) {
  selectorMaterial.value = modo === 'momento_video' ? 'medio' : 'texto';
  const radio = formActividad.querySelector(`input[name="produccion_texto"][value="${modo === 'texto_libre' ? 'texto_libre' : 'cita_texto'}"]`);
  radio.checked = true;
  actualizarMaterial();
}

// "El estudiante: cita / texto libre" solo con material de texto.
function actualizarMaterial() {
  grupoProduccionTexto.hidden = selectorMaterial.value !== 'texto';
}

selectorMaterial.addEventListener('change', actualizarMaterial);

// Con producción propia la justificación no se le muestra al estudiante
// (queda como referencia del docente): la casilla de mostrarla se destilda y
// se deshabilita. El servidor hace lo mismo.
function actualizarProduccionPropia() {
  const activa = casillaProduccion.checked;
  if (activa) casillaMostrarJustificacion.checked = false;
  casillaMostrarJustificacion.disabled = activa;
  // El material solo se elige con producción propia.
  document.getElementById('grupo-produccion-material').classList.toggle('d-none', !activa);
}

casillaProduccion.addEventListener('change', actualizarProduccionPropia);
// Por si el navegador restauró el formulario al volver atrás.
actualizarProduccionPropia();
actualizarMaterial();

// --- Edición (HU-015) -------------------------------------------------------

// Si un estudiante ya inició la actividad, el recurso, los pasos y la casilla
// de producción propia (con su material) se muestran deshabilitados y el aviso explica por qué
// (y que la salida es duplicarla). El fieldset deshabilitado deshabilita todo
// lo de adentro.
function bloquearContenido() {
  contenidoBloqueado = true;
  document.getElementById('aviso-iniciada').classList.remove('d-none');
  const recurso = formActividad.recurso_url;
  recurso.disabled = true;
  recurso.setAttribute('aria-describedby', 'aviso-iniciada');
  casillaProduccion.disabled = true;
  casillaProduccion.setAttribute('aria-describedby', 'produccion_propia-ayuda aviso-iniciada');
  selectorMaterial.disabled = true;
  selectorMaterial.setAttribute('aria-describedby', 'aviso-iniciada');
  grupoProduccionTexto.disabled = true;
  grupoProduccionTexto.setAttribute('aria-describedby', 'aviso-iniciada');
  const fieldsetPasos = document.getElementById('fieldset-pasos');
  fieldsetPasos.disabled = true;
  fieldsetPasos.setAttribute('aria-describedby', 'aviso-iniciada');
}

// Carga la actividad en el formulario. Con conservarTextos (después de un
// 409 al guardar) se mantienen el título, la consigna y las casillas de modo
// lectura y de mostrar la justificación como los dejó el docente, y solo se
// vuelven a traer el recurso y los pasos guardados (con sus justificaciones).
async function cargarActividadParaEditar(conservarTextos = false) {
  try {
    const { ok, status, cuerpo } = await getJson('actividad_obtener.php?id=' + encodeURIComponent(actividadEditarId));

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      // No existe, no es del docente o está dada de baja: no hay nada que editar.
      formActividad.hidden = true;
      mostrarAlerta(alertaActividad, 'danger', cuerpo.error || 'No se pudo cargar la actividad.');
      return;
    }

    const actividad = cuerpo.actividad;
    apuntarEnlacesVolver(actividad.clase_id);

    // La clase se muestra, pero no se cambia: el selector queda con una sola
    // opción y deshabilitado.
    selectClase.replaceChildren(crearOpcion(actividad.clase_id, textoClase(actividad.clase_nombre, actividad.clase_materia)));
    selectClase.disabled = true;
    // El motivo no ocupa lugar en la página: va como tooltip y, para lectores
    // de pantalla, en el texto oculto al que apunta el aria-describedby.
    selectClase.title = 'La clase de una actividad no se cambia.';
    document.getElementById('clase_id-ayuda').textContent = selectClase.title;

    if (!conservarTextos) {
      formActividad.titulo.value = actividad.titulo;
      formActividad.consigna.value = actividad.consigna;
      formActividad.modo_lectura_inicial.checked = actividad.modo_lectura_inicial === true;
      formActividad.mostrar_justificacion.checked = actividad.mostrar_justificacion === true;
    }
    formActividad.recurso_url.value = actividad.recurso_url;
    actualizarVistaPrevia();
    casillaProduccion.checked = actividad.produccion_propia === true;
    mostrarModoProduccion(actividad.produccion_modo);
    actualizarProduccionPropia();
    listaPasos.replaceChildren();
    actividad.pasos.forEach(agregarPasoConDatos);

    if (actividad.iniciada) bloquearContenido();
  } catch {
    mostrarAlerta(alertaActividad, 'danger', 'No se pudo conectar con el servidor.');
  }
}

// Ajusta la pantalla al modo edición antes de cargar los datos.
function prepararModoEdicion() {
  document.title = 'Editar actividad — Apoyos Educativos';
  document.getElementById('titulo-pagina').textContent = 'Editar actividad';
  btnGuardar.textContent = 'Guardar cambios';
}

// --- Errores ----------------------------------------------------------------

function limpiarErrores() {
  formActividad.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  selectClase.removeAttribute('aria-invalid');
  listaPasos.querySelectorAll('.tipo-paso').forEach((select) => select.removeAttribute('aria-invalid'));
  feedbackPasos.classList.remove('d-block');
  alertaActividad.classList.add('d-none');
}

// Un paso nuevo arranca en "Seleccionar tipo…": sin tipo no se manda nada al
// servidor. Marca los pasos que faltan, lleva el foco al primero y devuelve
// false si hay alguno.
function validarTiposElegidos() {
  const sinTipo = [];
  listaPasos.querySelectorAll(':scope > .paso').forEach((item, i) => {
    const select = item.querySelector('.tipo-paso');
    if (select.value !== '') return;
    select.classList.add('is-invalid');
    select.setAttribute('aria-invalid', 'true');
    sinTipo.push({ numero: i + 1, select });
  });
  if (sinTipo.length === 0) return true;

  const numeros = sinTipo.map(({ numero }) => numero);
  const mensaje = numeros.length === 1
    ? `Elegí el tipo de paso en el paso ${numeros[0]}.`
    : `Elegí el tipo de paso en los pasos ${numeros.join(', ')}.`;
  feedbackPasos.textContent = mensaje;
  feedbackPasos.classList.add('d-block');
  mostrarAlerta(alertaActividad, 'danger', mensaje);
  sinTipo[0].select.focus();
  return false;
}

function marcarErrores(errores) {
  Object.entries(errores).forEach(([campo, mensaje]) => {
    const feedback = formActividad.querySelector(`[data-campo="${campo}"]`);
    if (feedback) feedback.textContent = mensaje;

    if (campo === 'pasos') {
      // No es un input único: se muestra el mensaje bajo la lista.
      feedbackPasos.classList.add('d-block');
      listaPasos.querySelectorAll('.paso').forEach((item) => {
        const campos = [item.querySelector('.descripcion-paso')];
        if (!item.querySelector('.opciones-paso').hidden) {
          campos.push(...item.querySelectorAll('.texto-opcion'));
        }
        campos.forEach((input) => {
          if (!input.value.trim()) input.classList.add('is-invalid');
        });
      });
    } else if (formActividad.elements[campo]) {
      formActividad.elements[campo].classList.add('is-invalid');
      if (campo === 'clase_id') selectClase.setAttribute('aria-invalid', 'true');
    }
  });
}

// --- Envío ------------------------------------------------------------------

formActividad.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores();

  // Con el contenido bloqueado (edición de una actividad ya iniciada) los
  // pasos no viajan, así que no se validan.
  if (!contenidoBloqueado && !validarTiposElegidos()) return;

  if (actividadEditarId !== null) {
    await guardarEdicion();
    return;
  }

  // Sin clases no tiene sentido mandar la actividad: se pide crear una primero.
  if (cantidadClases === 0) {
    marcarErrores({ clase_id: 'Primero creá una clase desde Mis clases.' });
    selectClase.focus();
    return;
  }

  const datos = {
    clase_id: Number(selectClase.value) || null,
    titulo: formActividad.titulo.value.trim(),
    consigna: formActividad.consigna.value.trim(),
    recurso_url: formActividad.recurso_url.value.trim(),
    modo_lectura_inicial: formActividad.modo_lectura_inicial.checked,
    mostrar_justificacion: formActividad.mostrar_justificacion.checked,
    produccion_propia: casillaProduccion.checked,
    produccion_modo: modoProduccion(),
    pasos: Array.from(listaPasos.querySelectorAll(':scope > .paso'), leerPaso),
  };

  btnGuardar.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('actividad_crear.php', datos);

    if (ok) {
      // Se vuelve a la clase de la actividad, que puede no ser la de origen
      // si el docente cambió el selector.
      window.location.href = 'clase.html?id=' + encodeURIComponent(cuerpo.actividad.clase_id) + '&creada=1';
      return;
    }
    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (cuerpo.errores) marcarErrores(cuerpo.errores);
    mostrarAlerta(alertaActividad, 'danger', cuerpo.error || 'No se pudo guardar la actividad.');
  } catch {
    mostrarAlerta(alertaActividad, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnGuardar.disabled = false;
  }
});

// Edición: título, consigna y las casillas "Abrir en modo lectura al empezar"
// y "Mostrar la justificación..." viajan
// siempre (se pueden cambiar con la actividad iniciada); el recurso, los
// pasos y "Producción propia" solo si no están bloqueados. Si el servidor responde 409 (un estudiante la inició
// mientras se editaba), se bloquean y se vuelven a traer los guardados.
async function guardarEdicion() {
  const datos = {
    id: actividadEditarId,
    titulo: formActividad.titulo.value.trim(),
    consigna: formActividad.consigna.value.trim(),
    modo_lectura_inicial: formActividad.modo_lectura_inicial.checked,
    mostrar_justificacion: formActividad.mostrar_justificacion.checked,
  };
  if (!contenidoBloqueado) {
    datos.recurso_url = formActividad.recurso_url.value.trim();
    datos.produccion_propia = casillaProduccion.checked;
    datos.produccion_modo = modoProduccion();
    datos.pasos = Array.from(listaPasos.querySelectorAll(':scope > .paso'), leerPaso);
  }

  btnGuardar.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('actividad_editar.php', datos);

    if (ok) {
      window.location.href = 'clase.html?id=' + encodeURIComponent(cuerpo.actividad.clase_id) + '&editada=1';
      return;
    }
    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (status === 409 && cuerpo.iniciada) {
      await cargarActividadParaEditar(true);
      mostrarAlerta(alertaActividad, 'warning', cuerpo.error
        + ' Tus otros cambios siguen acá: tocá Guardar cambios de nuevo para guardarlos.');
      return;
    }
    if (cuerpo.errores) marcarErrores(cuerpo.errores);
    mostrarAlerta(alertaActividad, 'danger', cuerpo.error || 'No se pudo guardar la actividad.');
  } catch {
    mostrarAlerta(alertaActividad, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnGuardar.disabled = false;
  }
}

if (actividadEditarId !== null) {
  prepararModoEdicion();
  cargarActividadParaEditar().then(() => {
    if (!formActividad.hidden) formActividad.titulo.focus();
  });
} else {
  agregarPaso(); // arranca con un paso vacío
  cargarClases(claseOrigenId).then(() => {
    // Los enlaces vuelven a la clase de origen solo si de verdad es del docente.
    if (claseOrigenId !== null && selectClase.value === String(claseOrigenId)) {
      apuntarEnlacesVolver(claseOrigenId);
    }
  });
  selectClase.focus();
}
