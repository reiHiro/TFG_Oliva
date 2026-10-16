// Cliente mínimo para la API del backend.
const API_BASE = 'http://localhost/apoyos-educativos/backend/api/';

async function postJson(endpoint, datos) {
  return pedir(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
}

async function getJson(endpoint) {
  return pedir(endpoint, { method: 'GET' });
}

async function pedir(endpoint, opciones) {
  const respuesta = await fetch(API_BASE + endpoint, {
    ...opciones,
    credentials: 'include', // para que viaje la cookie de sesión PHP
  });

  let cuerpo;
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = { exito: false, error: 'Respuesta inválida del servidor.' };
  }

  return { ok: respuesta.ok, status: respuesta.status, cuerpo };
}

function formatearFecha(fechaMysql) {
  // "2026-09-28 14:05:00" -> fecha local legible
  const fecha = new Date(fechaMysql.replace(' ', 'T'));
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearFechaHora(fechaMysql) {
  // "2026-09-28 14:05:00" -> "28/09/2026 14:05"
  const fecha = new Date(fechaMysql.replace(' ', 'T'));
  return fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ---- Íconos SVG (sin librería) ----

// Dos cuadrados superpuestos (copiar) y una tilde (copiado).
const TRAZOS_COPIAR = ['M5.5 5.5h8v8h-8z', 'M10.5 2.5h-8v8'];
const TRAZOS_COPIADO = ['M3 8.5l3.5 3.5 6.5-7'];

function crearIcono(trazos) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  trazos.forEach((d) => {
    const trazo = document.createElementNS(ns, 'path');
    trazo.setAttribute('d', d);
    svg.appendChild(trazo);
  });
  return svg;
}

// Cambia el ícono de copiar por una tilde durante 2 segundos. Si se hace
// clic de nuevo antes, se reinicia la cuenta.
function mostrarCopiado(boton) {
  clearTimeout(boton.temporizador);
  boton.replaceChildren(crearIcono(TRAZOS_COPIADO));
  boton.classList.add('copiado');
  boton.temporizador = setTimeout(() => {
    boton.replaceChildren(crearIcono(TRAZOS_COPIAR));
    boton.classList.remove('copiado');
  }, 2000);
}

function mostrarAlerta(contenedor, tipo, mensaje) {
  contenedor.className = 'alert alert-' + tipo;
  contenedor.textContent = mensaje;
  contenedor.classList.remove('d-none');
}
