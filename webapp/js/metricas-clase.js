// Métricas de la clase: metricas-clase.html?clase=N&actividades=1,2,3 muestra
// las métricas sumadas de las actividades elegidas en clase.html
// (metricas_clase.php). Las funciones que dibujan (tiempo, insignias, barras,
// temas con más dificultad) están copiadas o adaptadas de metricas.js para no tocar esa pantalla.

const RECARGA_MS = 30000;

// Nombres legibles de los apoyos (tipo_apoyo de la tabla apoyo). La Tarea no
// es un apoyo.
const NOMBRES_APOYO = {
  lectura_voz: 'Lectura en voz alta',
  modo_lectura: 'Modo lectura',
  glosario: 'Glosario',
};

// Por debajo de este porcentaje la barra del tema se pinta de rojo.
const UMBRAL_DIFICULTAD = 50;

const alertaMetricas = document.getElementById('alerta');
const cargando = document.getElementById('cargando');
const contenido = document.getElementById('contenido');
const claseNombre = document.getElementById('clase-nombre');
const actividadesElegidas = document.getElementById('actividades-elegidas');
const ultimaActualizacion = document.getElementById('ultima-actualizacion');
const btnActualizar = document.getElementById('btn-actualizar');
const indActividades = document.getElementById('ind-actividades');
const indEstudiantes = document.getElementById('ind-estudiantes');
const indTareas = document.getElementById('ind-tareas');
const indTareasDetalle = document.getElementById('ind-tareas-detalle');
const indFocoTotal = document.getElementById('ind-foco-total');
const indFocoPromedio = document.getElementById('ind-foco-promedio');
const listaDificultad = document.getElementById('lista-dificultad');
const listaApoyos = document.getElementById('lista-apoyos');
const apoyosVacio = document.getElementById('apoyos-vacio');
const vacio = document.getElementById('vacio');
const contenedorTabla = document.getElementById('contenedor-tabla');
const listaEstudiantes = document.getElementById('lista-estudiantes');

const parametros = new URLSearchParams(window.location.search);
const claseId = Number(parametros.get('clase'));
// Solo ids enteros positivos; el backend vuelve a validar la lista.
const actividadIds = (parametros.get('actividades') || '')
  .split(',')
  .map(Number)
  .filter((id) => Number.isInteger(id) && id > 0);

// Evita dos pedidos a la vez (botón + recarga automática).
let actualizando = false;

function formatearTiempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return String(minutos).padStart(2, '0') + ':' + String(resto).padStart(2, '0');
}

function nombreApoyo(tipo) {
  return NOMBRES_APOYO[tipo] || tipo;
}

function plural(cantidad, singular, pluralTexto) {
  return cantidad + ' ' + (cantidad === 1 ? singular : pluralTexto);
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

// ---- Resumen ----

function mostrarResumen(resumen) {
  indActividades.textContent = resumen.actividades;
  indEstudiantes.textContent = resumen.estudiantes;

  // La Tarea es de cada actividad: se cuentan los pares estudiante-actividad
  // y, aparte, los estudiantes que finalizaron todas las suyas.
  indTareas.textContent = resumen.tareas_finalizadas + ' de ' + resumen.asignaciones;
  indTareasDetalle.textContent = 'Todas: ' + resumen.estudiantes_finalizaron_todas
    + ' de ' + plural(resumen.estudiantes, 'estudiante', 'estudiantes');

  indFocoTotal.textContent = formatearTiempo(resumen.tiempo_foco_total);
  indFocoPromedio.textContent = formatearTiempo(resumen.tiempo_foco_promedio);
}

// ---- Tabla por estudiante ----

// Todo con textContent / createElement: los nombres vienen del usuario.
function crearFila(estudiante) {
  const fila = document.createElement('tr');

  const celdaNombre = document.createElement('td');
  celdaNombre.textContent = estudiante.apellido + ', ' + estudiante.nombre;

  const celdaTareas = document.createElement('td');
  celdaTareas.textContent = estudiante.finalizadas + ' / ' + estudiante.asignadas;
  fila.append(celdaNombre, celdaTareas);

  // "Sin datos": ni filas en metrica ni pasos tildados en ninguna.
  if (!estudiante.abrio && estudiante.pasos_completados === 0) {
    const celdaSinDatos = document.createElement('td');
    celdaSinDatos.colSpan = 4;
    celdaSinDatos.className = 'text-body-secondary fst-italic';
    celdaSinDatos.textContent = 'Sin actividad registrada';
    fila.appendChild(celdaSinDatos);
    return fila;
  }

  const celdaPasos = document.createElement('td');
  if (estudiante.total_pasos > 0) {
    celdaPasos.appendChild(crearBarraPasos(estudiante.pasos_completados, estudiante.total_pasos));
  } else {
    celdaPasos.className = 'text-body-secondary';
    celdaPasos.textContent = 'Sin pasos';
  }

  const celdaCorrectas = document.createElement('td');
  if (estudiante.respondidas > 0) {
    celdaCorrectas.textContent = estudiante.correctas + ' / ' + estudiante.respondidas;
  } else {
    celdaCorrectas.className = 'text-body-secondary';
    celdaCorrectas.textContent = '—';
    celdaCorrectas.title = 'Todavía no respondió ninguno';
  }

  const celdaFoco = document.createElement('td');
  celdaFoco.textContent = formatearTiempo(estudiante.tiempo_foco);

  const celdaApoyos = document.createElement('td');
  if (estudiante.apoyos.length === 0) {
    celdaApoyos.className = 'text-body-secondary';
    celdaApoyos.textContent = 'Ninguno';
  } else {
    estudiante.apoyos.forEach((apoyo) => celdaApoyos.appendChild(crearInsigniaApoyo(apoyo)));
  }

  fila.append(celdaPasos, celdaCorrectas, celdaFoco, celdaApoyos);
  return fila;
}

// ---- Apoyos usados ----

function crearItemApoyo(apoyo) {
  const item = document.createElement('li');
  item.className = 'list-group-item d-flex justify-content-between align-items-center gap-2';

  const texto = document.createElement('div');
  texto.textContent = nombreApoyo(apoyo.apoyo);
  const quienes = document.createElement('small');
  quienes.className = 'd-block text-body-secondary';
  quienes.textContent = plural(apoyo.estudiantes, 'estudiante', 'estudiantes');
  texto.appendChild(quienes);

  const cantidad = document.createElement('span');
  cantidad.className = 'badge insignia-apoyo rounded-pill';
  cantidad.textContent = plural(apoyo.veces, 'vez', 'veces');

  item.append(texto, cantidad);
  return item;
}

// ---- Temas con más dificultad ----

// Un tema es una actividad. Su porcentaje es respuestas correctas sobre
// respuestas dadas, sumando todos sus pasos y todos sus estudiantes
// (temas_dificultad de metricas_clase.php); null si todavía no hay respuestas.
// HU-018: un tema de una actividad con producción propia se mide por logro
// (opción correcta y justificación válida) y lleva la etiqueta "con
// justificación"; los demás, por acierto de opción. tema.porcentaje es el de
// su criterio.
function crearItemTema(tema) {
  const conLogro = tema.criterio === 'logro';
  const valor = tema.porcentaje;

  const item = document.createElement('li');
  item.className = 'mb-3';

  const encabezado = document.createElement('div');
  encabezado.className = 'd-flex justify-content-between gap-2 small mb-1';

  const titulo = document.createElement('span');
  titulo.textContent = tema.actividad.titulo;
  if (conLogro) {
    const etiqueta = document.createElement('span');
    etiqueta.className = 'badge rounded-pill text-bg-light border fw-normal ms-1';
    etiqueta.textContent = 'con justificación';
    titulo.appendChild(etiqueta);
  }

  const porcentaje = document.createElement('span');
  porcentaje.className = 'fw-semibold text-nowrap';
  porcentaje.textContent = valor === null ? '—' : valor.toLocaleString('es-AR') + ' %';

  encabezado.append(titulo, porcentaje);

  const barra = document.createElement('div');
  barra.className = 'progress';
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-label',
    (conLogro ? 'Logro con justificación de ' : 'Aciertos de ') + tema.actividad.titulo);
  barra.setAttribute('aria-valuenow', String(valor ?? 0));
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');

  // Verde (color institucional por defecto de .progress-bar) salvo que esté bajo el umbral.
  const relleno = document.createElement('div');
  relleno.className = valor !== null && valor < UMBRAL_DIFICULTAD ? 'progress-bar bg-danger' : 'progress-bar';
  relleno.style.width = (valor ?? 0) + '%';
  barra.appendChild(relleno);

  const pie = document.createElement('div');
  pie.className = 'd-flex justify-content-between gap-2 small mt-1';

  const detalle = document.createElement('span');
  detalle.className = 'text-body-secondary';
  if (tema.respuestas === 0) {
    detalle.textContent = 'Sin respuestas';
  } else if (conLogro) {
    // Logrados sobre resueltos; los pendientes de revisar quedan fuera del
    // total y se muestran aparte. Sin resueltos: "Sin datos".
    const logro = tema.logro;
    const partes = [logro.resueltos === 0 ? 'Sin datos' : logro.logrados + ' de ' + logro.resueltos + ' logrados'];
    if (logro.pendientes > 0) {
      partes.push(logro.pendientes === 1 ? '1 pendiente de revisar' : logro.pendientes + ' pendientes de revisar');
    }
    partes.push('opción correcta: ' + logro.aciertos_opcion + ' de ' + logro.respondidas);
    detalle.textContent = partes.join(' · ');
  } else {
    detalle.textContent = tema.correctas + ' de ' + tema.respuestas
      + (tema.respuestas === 1 ? ' respuesta correcta' : ' respuestas correctas');
  }

  // La misma pantalla que "Ver métricas" de la clase, con el detalle por paso.
  const enlace = document.createElement('a');
  enlace.className = 'text-nowrap';
  enlace.href = 'metricas.html?actividad=' + encodeURIComponent(tema.actividad.id)
    + '&clase=' + encodeURIComponent(claseId);
  enlace.textContent = 'Ver detalle';
  enlace.setAttribute('aria-label', 'Ver detalle de ' + tema.actividad.titulo);

  pie.append(detalle, enlace);
  item.append(encabezado, barra, pie);
  return item;
}

// ---- Carga ----

async function cargarMetricas() {
  if (actualizando) {
    return;
  }
  actualizando = true;
  btnActualizar.disabled = true;

  try {
    const { ok, status, cuerpo } = await getJson(
      'metricas_clase.php?clase=' + encodeURIComponent(claseId)
      + '&actividades=' + actividadIds.join(',')
    );

    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    if (!ok) {
      const detalle = cuerpo.errores ? Object.values(cuerpo.errores).join(' ') : cuerpo.error;
      mostrarAlerta(alertaMetricas, 'danger', detalle || 'No se pudieron cargar las métricas.');
      return;
    }

    alertaMetricas.classList.add('d-none');
    claseNombre.textContent = cuerpo.clase.nombre;
    actividadesElegidas.textContent = 'Actividades elegidas: '
      + cuerpo.actividades.map((actividad) => actividad.titulo).join(' · ');

    mostrarResumen(cuerpo.resumen);

    // El backend ya los manda ordenados de menor a mayor porcentaje de acierto,
    // con los que no tienen respuestas al final.
    listaDificultad.replaceChildren(...cuerpo.temas_dificultad.map(crearItemTema));

    listaApoyos.replaceChildren(...cuerpo.apoyos.map(crearItemApoyo));
    apoyosVacio.classList.toggle('d-none', cuerpo.apoyos.length > 0);

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

// ---- Arranque ----

// "Volver" regresa a la clase. Es solo navegación: clase.html vuelve a
// comprobar que la clase sea del docente.
const claseValida = Number.isInteger(claseId) && claseId > 0;
if (claseValida) {
  const enlaceVolver = document.getElementById('enlace-volver');
  enlaceVolver.href = 'clase.html?id=' + encodeURIComponent(claseId);
  enlaceVolver.textContent = '← Volver a la clase';
}

if (!claseValida || actividadIds.length === 0) {
  cargando.classList.add('d-none');
  btnActualizar.disabled = true;
  mostrarAlerta(alertaMetricas, 'danger',
    claseValida ? 'Elegí al menos una actividad en la página de la clase.' : 'Falta indicar la clase.');
} else {
  btnActualizar.addEventListener('click', cargarMetricas);
  cargarMetricas();
  // Solo se refrescan los datos, no la página.
  setInterval(cargarMetricas, RECARGA_MS);
}
