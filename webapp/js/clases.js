// Clases (HU-014): una clase es solo un agrupador de actividades.
// Lo usan panel-docente (lista de clases y modal "Crear clase"), clase
// (actividades de una clase) y actividad-nueva (selector de clase). Se carga
// después de api.js.

// Texto de una clase en listas, selectores y encabezados: "5.º A — Biología".
function textoClase(nombre, materia) {
  return materia ? nombre + ' — ' + materia : nombre;
}

// Muestra un aviso dentro de una región aria-live que está siempre en la
// página (role="status"): si la región se ocultara con display:none, algunos
// lectores de pantalla no leerían el mensaje al aparecer.
function avisar(region, tipo, mensaje) {
  const aviso = document.createElement('div');
  aviso.className = 'alert alert-' + tipo + ' mb-3';
  aviso.textContent = mensaje;
  region.replaceChildren(aviso);
}

// Conecta un formulario para crear o editar una clase. Los campos se buscan
// por form.elements.
// Cada campo tiene su mensaje de error en un elemento con id "<id>-error",
// ya enlazado desde el campo con aria-describedby.
// En la región se muestran los errores; el aviso de éxito lo da quien llama,
// en alGuardar(clase, editada), porque cada pantalla lo muestra en un lugar
// distinto.
// Devuelve:
//   reiniciar():   campos vacíos y sin errores, en modo "crear".
//   editar(clase): campos con los datos de la clase, en modo "editar"
//                  (el envío va a clase_editar.php con su id).
function prepararFormClase(form, region, alGuardar) {
  const campos = ['nombre', 'descripcion', 'materia'].map((nombre) => form.elements[nombre]);
  const boton = Array.from(form.elements).find((el) => el.type === 'submit');
  // null mientras se crea; el id de la clase mientras se edita.
  let claseEditandoId = null;

  function limpiarErrores() {
    campos.forEach((campo) => {
      campo.classList.remove('is-invalid');
      campo.removeAttribute('aria-invalid');
    });
    region.replaceChildren();
  }

  function marcarError(campo, mensaje) {
    campo.classList.add('is-invalid');
    campo.setAttribute('aria-invalid', 'true');
    document.getElementById(campo.id + '-error').textContent = mensaje;
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limpiarErrores();

    const datos = {
      nombre: form.elements.nombre.value.trim(),
      descripcion: form.elements.descripcion.value.trim(),
      materia: form.elements.materia.value.trim(),
    };

    // El backend también lo valida; esto evita el viaje en el caso más común.
    if (datos.nombre === '') {
      marcarError(form.elements.nombre, 'El nombre es obligatorio.');
      avisar(region, 'danger', 'Revisá los datos de la clase.');
      form.elements.nombre.focus();
      return;
    }

    const editando = claseEditandoId !== null;
    if (editando) datos.id = claseEditandoId;

    boton.disabled = true;
    try {
      const { ok, status, cuerpo } = await postJson(editando ? 'clase_editar.php' : 'clase_crear.php', datos);

      if (status === 401 || status === 403) {
        window.location.href = 'index.html';
        return;
      }
      if (!ok) {
        const errores = cuerpo.errores || {};
        Object.entries(errores).forEach(([nombre, mensaje]) => {
          if (form.elements[nombre]) marcarError(form.elements[nombre], mensaje);
        });
        const primero = campos.find((campo) => campo.classList.contains('is-invalid'));
        if (primero) primero.focus();
        avisar(region, 'danger', cuerpo.error || 'No se pudo guardar la clase.');
        return;
      }

      campos.forEach((campo) => { campo.value = ''; });
      claseEditandoId = null;
      alGuardar(cuerpo.clase, editando);
    } catch {
      avisar(region, 'danger', 'No se pudo conectar con el servidor.');
    } finally {
      boton.disabled = false;
    }
  });

  return {
    reiniciar() {
      claseEditandoId = null;
      campos.forEach((campo) => { campo.value = ''; });
      limpiarErrores();
    },
    editar(clase) {
      claseEditandoId = clase.id;
      form.elements.nombre.value = clase.nombre;
      form.elements.descripcion.value = clase.descripcion || '';
      form.elements.materia.value = clase.materia || '';
      limpiarErrores();
    },
  };
}
