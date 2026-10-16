<?php
// Control de acceso para los endpoints que requieren sesión iniciada.
// Requiere respuesta.php cargado antes.

// Devuelve el id del usuario logueado. Corta con 401 si no hay sesión
// y con 403 si el rol no coincide con el exigido.
function exigirSesion(?string $rol = null): int
{
    session_start();

    if (!isset($_SESSION['usuario_id'])) {
        responderJson(401, ['exito' => false, 'error' => 'Tenés que iniciar sesión.']);
    }
    if ($rol !== null && ($_SESSION['rol'] ?? '') !== $rol) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para esta acción.']);
    }

    return (int) $_SESSION['usuario_id'];
}
