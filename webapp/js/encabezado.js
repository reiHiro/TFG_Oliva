// Encabezado de las páginas con sesión: saludo con el nombre del usuario y
// botón "Cerrar sesión". Se carga después de api.js en panel-docente, clase,
// panel-estudiante, actividad-nueva y metricas.

const saludoEncabezado = document.getElementById('encabezado-saludo');
const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');

async function cargarUsuarioEncabezado() {
  try {
    const { ok, status, cuerpo } = await getJson('sesion_actual.php');
    if (status === 401) {
      window.location.href = 'index.html';
      return;
    }
    // textContent: el nombre lo escribió el usuario al registrarse.
    if (ok) {
      saludoEncabezado.textContent = 'Hola, ' + cuerpo.usuario.nombre + ' ' + cuerpo.usuario.apellido;
    }
  } catch {
    // Sin conexión el saludo queda vacío; la página avisa con sus propios pedidos.
  }
}

btnCerrarSesion.addEventListener('click', async () => {
  btnCerrarSesion.disabled = true;
  try {
    const { ok } = await postJson('logout.php', {});
    if (ok) {
      window.location.href = 'index.html';
      return;
    }
  } catch {
    // Se avisa abajo.
  }
  btnCerrarSesion.disabled = false;
  mostrarAlerta(document.getElementById('alerta'), 'danger', 'No se pudo cerrar la sesión. Probá de nuevo.');
});

cargarUsuarioEncabezado();
