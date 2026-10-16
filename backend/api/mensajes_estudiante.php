<?php
// GET /backend/api/mensajes_estudiante.php?actividad_id=N  (para la extensión)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php (o actividad_enlace_estudiante.php). La actividad tiene
// que ser la del token. Devuelve las devoluciones del docente para el
// estudiante del token, de la más nueva a la más vieja, y cuántas no leyó.
// No depende del estado de la Tarea: funciona sin empezar y ya finalizada.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/mensaje.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('GET');

$actividadId = filter_var($_GET['actividad_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, ['exito' => false, 'error' => 'La actividad es obligatoria.']);
}

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null || $datosToken['actividad_id'] !== $actividadId) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

$estudianteId = $datosToken['usuario_id'];

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 401, 'Token inválido.');

    // Se vuelve a comprobar la asignación por si se quitó después de emitir el token.
    if (estadoTarea($pdo, $actividadId, $estudianteId) === null) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    $mensajes = listarMensajes($pdo, $actividadId, $estudianteId);
} catch (PDOException $e) {
    error_log('mensajes_estudiante.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

$noLeidos = count(array_filter($mensajes, static fn(array $mensaje): bool => !$mensaje['leido']));

responderJson(200, ['exito' => true, 'mensajes' => $mensajes, 'no_leidos' => $noLeidos]);
