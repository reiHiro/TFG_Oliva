const alertaPanel = document.getElementById('alerta');
const cargando = document.getElementById('cargando');
const vacio = document.getElementById('vacio');
const listaActividades = document.getElementById('lista-actividades');

// Todo con textContent / createElement: los datos vienen del docente
// y no se insertan como HTML.
function crearTarjeta(actividad) {
  const columna = document.createElement('div');
  columna.className = 'col';

  const tarjeta = document.createElement('article');
  tarjeta.className = 'card h-100 shadow-sm';

  const cuerpo = document.createElement('div');
  cuerpo.className = 'card-body d-flex flex-column';

  const titulo = document.createElement('h3');
  titulo.className = 'card-title h5';
  titulo.textContent = actividad.titulo;

  // El docente se muestra en el encabezado de la clase.
  const datos = document.createElement('p');
  datos.className = 'card-subtitle small text-body-secondary mb-3';
  datos.textContent = 'Asignada el ' + formatearFecha(actividad.fecha_asignacion)
    + ' · ' + actividad.cantidad_pasos + (actividad.cantidad_pasos === 1 ? ' paso' : ' pasos');

  const consigna = document.createElement('p');
  consigna.className = 'card-text';
  consigna.style.whiteSpace = 'pre-line'; // respeta los saltos de línea de la consigna
  consigna.textContent = actividad.consigna;

  const botonAbrir = document.createElement('button');
  botonAbrir.type = 'button';
  botonAbrir.className = 'btn btn-primary mt-auto align-self-start';
  botonAbrir.textContent = 'Abrir';
  botonAbrir.addEventListener('click', () => abrirActividad(actividad.id, botonAbrir));

  cuerpo.append(titulo, datos, consigna, botonAbrir);
  tarjeta.appendChild(cuerpo);
  columna.appendChild(tarjeta);
  return columna;
}

// Agrupa por clase_id y no por nombre: dos docentes pueden tener una clase
// "5.º A". Las clases quedan en el orden de su asignación más reciente.
function agruparPorClase(actividades) {
  const grupos = new Map();
  actividades.forEach((actividad) => {
    if (!grupos.has(actividad.clase_id)) {
      grupos.set(actividad.clase_id, {
        id: actividad.clase_id,
        nombre: actividad.clase_nombre,
        materia: actividad.clase_materia,
        docente: actividad.docente_nombre + ' ' + actividad.docente_apellido,
        actividades: [],
      });
    }
    grupos.get(actividad.clase_id).actividades.push(actividad);
  });
  return Array.from(grupos.values());
}

function crearGrupo(grupo) {
  const seccion = document.createElement('section');
  seccion.className = 'mb-5';

  const titulo = document.createElement('h2');
  titulo.className = 'h5 mb-1';
  titulo.id = 'clase-' + grupo.id;
  titulo.textContent = textoClase(grupo.nombre, grupo.materia);
  seccion.setAttribute('aria-labelledby', titulo.id);

  const docente = document.createElement('p');
  docente.className = 'small text-body-secondary mb-3';
  docente.textContent = 'Docente: ' + grupo.docente;

  const tarjetas = document.createElement('div');
  tarjetas.className = 'row row-cols-1 row-cols-md-2 g-3';
  grupo.actividades.forEach((actividad) => tarjetas.appendChild(crearTarjeta(actividad)));

  seccion.append(titulo, docente, tarjetas);
  return seccion;
}

// La pestaña se abre en el mismo click (antes del await) para que el
// navegador no la bloquee como ventana emergente; después se le carga la URL.
async function abrirActividad(actividadId, boton) {
  const pestania = window.open('', '_blank');
  boton.disabled = true;

  try {
    const { ok, status, cuerpo } = await getJson('actividad_abrir.php?id=' + encodeURIComponent(actividadId));

    if (status === 401 || status === 403) {
      if (pestania) pestania.close();
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      if (pestania) pestania.close();
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudo abrir la actividad.');
      return;
    }

    if (pestania) {
      pestania.opener = null; // la página del recurso no puede tocar este panel
      pestania.location.href = cuerpo.url;
    } else {
      window.open(cuerpo.url, '_blank', 'noopener');
    }
  } catch {
    if (pestania) pestania.close();
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    boton.disabled = false;
  }
}

async function cargarActividades() {
  try {
    const { ok, status, cuerpo } = await getJson('actividad_mis_asignadas.php');

    if (status === 401 || status === 403) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      mostrarAlerta(alertaPanel, 'danger', cuerpo.error || 'No se pudieron cargar las actividades.');
      return;
    }

    if (cuerpo.actividades.length === 0) {
      vacio.classList.remove('d-none');
      return;
    }

    agruparPorClase(cuerpo.actividades).forEach((grupo) => listaActividades.appendChild(crearGrupo(grupo)));
  } catch {
    mostrarAlerta(alertaPanel, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    cargando.classList.add('d-none');
  }
}

cargarActividades();
