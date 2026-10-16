// Panel del docente: sus clases (HU-014). Cada tarjeta lleva a clase.html,
// donde están las actividades de esa clase. Desde acá también se editan,
// se dan de baja y se reactivan (HU-015, baja lógica: no se borra nada).

const alertaPanel = document.getElementById('alerta');
const mensajePanel = document.getElementById('mensaje-panel');
const tituloPagina = document.getElementById('titulo-pagina');
const cargando = document.getElementById('cargando');
const vacio = document.getElementById('vacio');
const listaClases = document.getElementById('lista-clases');
const btnCrearClase = document.getElementById('btn-crear-clase');
const btnVerBajas = document.getElementById('btn-ver-bajas');

const elementoModalClase = document.getElementById('modal-clase');
const modalClase = new bootstrap.Modal(elementoModalClase);
const formClase = document.getElementById('form-clase');
const tituloModalClase = document.getElementById('modal-clase-titulo');
const btnGuardarClase = document.getElementById('btn-guardar-clase');

const elementoModalBaja = document.getElementById('modal-baja');
const modalBaja = new bootstrap.Modal(elementoModalBaja);
const textoModalBaja = document.getElementById('modal-baja-texto');
const mensajeBaja = document.getElementById('mensaje-baja');
const btnConfirmarBaja = document.getElementById('btn-confirmar-baja');

// Vista actual: false = clases activas, true = clases dadas de baja.
let viendoBajas = false;
// Clase que se está por dar de baja en el modal.
let claseBaja = null;
// Adónde va el foco cuando se cierra un modal. Es una función porque, si la
// lista se recargó mientras tanto, el botón que lo abrió ya es otro elemento
// (o ya no está, si la clase se dio de baja).
let destinoFoco = () => btnCrearClase;

function cantidadActividades(n) {
  return n + (n === 1 ? ' actividad' : ' actividades');
}

// El botón de una acción sobre una clase, buscado de nuevo en la lista.
function botonDeClase(accion, claseId) {
  return listaClases.querySelector(`[data-accion="${accion}"][data-clase-id="${claseId}"]`);
}

// Nombre, materia y descripción de la tarjeta (los mismos en las dos vistas).
function crearDatosClase(clase, contenedor) {
  const nombre = document.createElement('h2');
  nombre.className = 'card-title h5 mb-1';
  nombre.textContent = clase.nombre;
  contenedor.appendChild(nombre);

  if (clase.materia) {
    const materia = document.createElement('p');
    materia.className = 'small mb-2';
    materia.textContent = 'Materia: ' + clase.materia;
    contenedor.appendChild(materia);
  }
  if (clase.descripcion) {
    const descripcion = document.createElement('p');
    descripcion.className = 'card-text small text-body-secondary';
    descripcion.textContent = clase.descripcion;
    contenedor.appendChild(descripcion);
  }
}

function crearBotonAccion(texto, etiqueta, accion, clase, clases, alHacerClic) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-sm ' + clases;
  boton.textContent = texto;
  // El texto visible es corto; el lector de pantalla oye también el nombre de la clase.
  boton.setAttribute('aria-label', etiqueta + ' ' + clase.nombre);
  boton.dataset.accion = accion;
  boton.dataset.claseId = clase.id;
  boton.addEventListener('click', () => alHacerClic(clase, boton));
  return boton;
}

// Todo con textContent / createElement: los datos los escribió el docente
// y no se insertan como HTML.
// La parte de arriba de la tarjeta es un enlace real (se abre con Enter y
// con el clic del medio). Los botones van aparte, en el pie: un botón no
// puede ir dentro de un enlace.
function crearTarjetaActiva(clase) {
  const item = document.createElement('li');
  item.className = 'col';

  const tarjeta = document.createElement('div');
  tarjeta.className = 'card h-100 shadow-sm tarjeta-clase';

  const enlace = document.createElement('a');
  enlace.className = 'card-body d-flex flex-column text-reset text-decoration-none enlace-clase';
  enlace.href = 'clase.html?id=' + encodeURIComponent(clase.id);
  crearDatosClase(clase, enlace);

  const cantidad = document.createElement('p');
  cantidad.className = 'small text-body-secondary mt-auto mb-0';
  cantidad.textContent = cantidadActividades(clase.cantidad_actividades);
  enlace.appendChild(cantidad);

  const pie = document.createElement('div');
  pie.className = 'card-footer bg-body d-flex flex-wrap gap-2 justify-content-end';
  pie.append(
    crearBotonAccion('Editar', 'Editar la clase', 'editar', clase, 'btn-outline-secondary', abrirEditar),
    crearBotonAccion('Dar de baja', 'Dar de baja la clase', 'baja', clase, 'btn-outline-danger', abrirBaja),
  );

  tarjeta.append(enlace, pie);
  item.appendChild(tarjeta);
  return item;
}

// En la vista de bajas la tarjeta no es un enlace: la página de una clase
// dada de baja no se puede abrir hasta reactivarla.
function crearTarjetaBaja(clase) {
  const item = document.createElement('li');
  item.className = 'col';

  const tarjeta = document.createElement('div');
  tarjeta.className = 'card h-100 shadow-sm';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'card-body d-flex flex-column';
  crearDatosClase(clase, cuerpo);

  const fecha = document.createElement('p');
  fecha.className = 'small text-body-secondary mt-auto mb-0';
  fecha.textContent = 'Dada de baja el ' + formatearFecha(clase.dada_de_baja_en);
  cuerpo.appendChild(fecha);

  const pie = document.createElement('div');
  pie.className = 'card-footer bg-body d-flex justify-content-end';
  pie.appendChild(crearBotonAccion('Reactivar', 'Reactivar la clase', 'reactivar', clase, 'btn-outline-primary', reactivar));

  tarjeta.append(cuerpo, pie);
  item.appendChild(tarjeta);
  return item;
}

async function cargarClases() {
  cargando.classList.remove('d-none');
  try {
    const { ok, status, cuerpo } = await getJson('clase_listar.php' + (viendoBajas ? '?bajas=1' : ''));

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudieron cargar las clases.');
      return;
    }

    const crear = viendoBajas ? crearTarjetaBaja : crearTarjetaActiva;
    listaClases.replaceChildren(...cuerpo.clases.map(crear));
    vacio.textContent = viendoBajas
      ? 'No tenés clases dadas de baja.'
      : 'Todavía no creaste ninguna clase. Usá el botón Crear clase para agregar la primera.';
    vacio.classList.toggle('d-none', cuerpo.clases.length > 0);
    listaClases.classList.toggle('d-none', cuerpo.clases.length === 0);
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    cargando.classList.add('d-none');
  }
}

// ---- Activas / dadas de baja ----

btnVerBajas.addEventListener('click', async () => {
  viendoBajas = !viendoBajas;
  tituloPagina.textContent = viendoBajas ? 'Clases dadas de baja' : 'Mis clases';
  btnVerBajas.textContent = viendoBajas ? 'Volver a mis clases' : 'Ver clases dadas de baja';
  // En la vista de bajas no se crean clases.
  btnCrearClase.classList.toggle('d-none', viendoBajas);
  mensajePanel.replaceChildren();
  alertaPanel.classList.add('d-none');
  await cargarClases();
  // El foco va al título, así el lector anuncia en qué vista quedó.
  tituloPagina.focus();
});

// ---- Modal "Crear clase" / "Editar clase" ----

// Primero se recarga la lista y después se cierra, así el foco puede
// volver al botón "Editar" de la tarjeta ya recargada.
const formularioClase = prepararFormClase(formClase, document.getElementById('mensaje-clase'), async (clase, editada) => {
  await cargarClases();
  modalClase.hide();
  avisar(mensajePanel, 'success', editada
    ? 'Se guardaron los cambios de la clase "' + textoClase(clase.nombre, clase.materia) + '".'
    : 'Se creó la clase "' + textoClase(clase.nombre, clase.materia) + '".');
});

btnCrearClase.addEventListener('click', () => {
  mensajePanel.replaceChildren();
  formularioClase.reiniciar();
  tituloModalClase.textContent = 'Crear clase';
  btnGuardarClase.textContent = 'Crear clase';
  destinoFoco = () => btnCrearClase;
  modalClase.show();
});

function abrirEditar(clase) {
  mensajePanel.replaceChildren();
  formularioClase.editar(clase);
  tituloModalClase.textContent = 'Editar clase';
  btnGuardarClase.textContent = 'Guardar cambios';
  destinoFoco = () => botonDeClase('editar', clase.id) || btnCrearClase;
  modalClase.show();
}

// El foco entra al primer campo cuando el modal ya es visible.
elementoModalClase.addEventListener('shown.bs.modal', () => formClase.elements.nombre.focus());

// Al cerrar (Esc, Cancelar, la cruz o después de guardar) el foco vuelve al
// botón que abrió el modal.
elementoModalClase.addEventListener('hidden.bs.modal', () => destinoFoco().focus());

// ---- Dar de baja ----

function abrirBaja(clase) {
  claseBaja = clase;
  mensajePanel.replaceChildren();
  mensajeBaja.replaceChildren();
  textoModalBaja.textContent = 'La clase "' + textoClase(clase.nombre, clase.materia) + '" y sus '
    + cantidadActividades(clase.cantidad_actividades)
    + ' dejarán de verse, pero no se borra nada y podés reactivarla.';
  btnConfirmarBaja.disabled = false;
  destinoFoco = () => botonDeClase('baja', clase.id) || btnCrearClase;
  modalBaja.show();
}

// En una confirmación de baja el foco arranca en Cancelar: Enter sin
// pensar no da de baja nada.
elementoModalBaja.addEventListener('shown.bs.modal', () => document.getElementById('btn-cancelar-baja').focus());
elementoModalBaja.addEventListener('hidden.bs.modal', () => destinoFoco().focus());

btnConfirmarBaja.addEventListener('click', async () => {
  btnConfirmarBaja.disabled = true;
  try {
    const { ok, status, cuerpo } = await postJson('clase_baja.php', { id: claseBaja.id });

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      avisar(mensajeBaja, 'danger', cuerpo.error || 'No se pudo dar de baja la clase.');
      return;
    }

    await cargarClases();
    // La tarjeta ya no está: el foco va a "Crear clase" (destinoFoco no la encuentra).
    modalBaja.hide();
    avisar(mensajePanel, 'success', cuerpo.mensaje);
  } catch {
    avisar(mensajeBaja, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnConfirmarBaja.disabled = false;
  }
});

// ---- Reactivar (vista de bajas) ----

// Reactivar no pierde nada, así que no pide confirmación.
async function reactivar(clase, boton) {
  boton.disabled = true;
  mensajePanel.replaceChildren();
  try {
    const { ok, status, cuerpo } = await postJson('clase_reactivar.php', { id: clase.id });

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudo reactivar la clase.');
      boton.disabled = false;
      return;
    }

    await cargarClases();
    avisar(mensajePanel, 'success', 'Se reactivó la clase "' + textoClase(clase.nombre, clase.materia)
      + '". Ya aparece en Mis clases.');
    // La tarjeta desapareció de esta vista: el foco va al título.
    tituloPagina.focus();
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
    boton.disabled = false;
  }
}

cargarClases();
