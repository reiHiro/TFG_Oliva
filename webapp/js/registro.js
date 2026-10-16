const formRegistro = document.getElementById('form-registro');
const alertaRegistro = document.getElementById('alerta');
const btnRegistro = document.getElementById('btn-enviar');

function limpiarErroresCampos() {
  formRegistro.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

function marcarErroresCampos(errores) {
  Object.entries(errores).forEach(([campo, mensaje]) => {
    const input = formRegistro.elements[campo];
    const feedback = formRegistro.querySelector(`[data-campo="${campo}"]`);
    if (input) input.classList.add('is-invalid');
    if (feedback) feedback.textContent = mensaje;
  });
}

formRegistro.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErroresCampos();

  const datos = {
    nombre: formRegistro.nombre.value.trim(),
    apellido: formRegistro.apellido.value.trim(),
    email: formRegistro.email.value.trim(),
    password: formRegistro.password.value,
    rol: formRegistro.rol.value,
  };

  btnRegistro.disabled = true;
  try {
    const { ok, cuerpo } = await postJson('registro.php', datos);

    if (ok) {
      mostrarAlerta(alertaRegistro, 'success', 'Cuenta creada. Redirigiendo al inicio de sesión…');
      formRegistro.reset();
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    } else {
      if (cuerpo.errores) marcarErroresCampos(cuerpo.errores);
      mostrarAlerta(alertaRegistro, 'danger', cuerpo.error || 'No se pudo completar el registro.');
    }
  } catch {
    mostrarAlerta(alertaRegistro, 'danger', 'No se pudo conectar con el servidor.');
  } finally {
    btnRegistro.disabled = false;
  }
});
