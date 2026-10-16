const formLogin = document.getElementById('form-login');
const alertaLogin = document.getElementById('alerta');
const btnLogin = document.getElementById('btn-enviar');
const capaBienvenida = document.getElementById('bienvenida');
const textoBienvenida = document.getElementById('bienvenida-texto');

// Muestra la capa de bienvenida. Se quita `hidden` y se fuerza un reflow
// antes de agregar la clase, para que la transición de opacidad arranque
// desde 0 en vez de aparecer de golpe.
function mostrarBienvenida(nombre) {
  textoBienvenida.textContent = `Bienvenido/a, ${nombre}`;
  capaBienvenida.hidden = false;
  void capaBienvenida.offsetWidth;
  capaBienvenida.classList.add('visible');
}

formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const email = formLogin.email.value.trim();
  const password = formLogin.password.value;

  if (!email || !password) {
    mostrarAlerta(alertaLogin, 'warning', 'Completá email y contraseña.');
    return;
  }

  btnLogin.disabled = true;
  try {
    const { ok, cuerpo } = await postJson('login.php', { email, password });

    if (ok) {
      const destino = cuerpo.usuario.rol === 'docente' ? 'panel-docente.html' : 'panel-estudiante.html';
      mostrarBienvenida(cuerpo.usuario.nombre);
      // El botón queda deshabilitado hasta que cambia la página.
      setTimeout(() => { window.location.href = destino; }, 1600);
      return;
    }
    mostrarAlerta(alertaLogin, 'danger', cuerpo.error || 'No se pudo iniciar sesión.');
  } catch {
    mostrarAlerta(alertaLogin, 'danger', 'No se pudo conectar con el servidor.');
  }
  btnLogin.disabled = false;
});
