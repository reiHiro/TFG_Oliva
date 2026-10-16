<?php
// POST /backend/api/mensajes_marcar_leidos.php  (para la extensión)
// No usa la sesión: exige "Authorization: Bearer <token>". Body JSON:
// { actividad_id } (tiene que ser la del token). Marca como leídas, con la
// fecha actual, todas las devoluciones no leídas de esa actividad para el
// estudiante del token. Las ya leídas conservan su fecha_leido.
// No depende del estado de la Tarea.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('POST');

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

$datos = leerJson();
$actividadId = filter_var($datos['actividad_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['actividad_id' => 'La actividad es obligatoria.']]);
}
if ($actividadId !== $datosToken['actividad_id']) {
    responderJson(403, ['exito' => false, 'error' => 'La actividad no corresponde a este acceso.']);
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

    $marcado = $pdo->prepare(
        'UPDATE mensaje
         SET leido = TRUE, fecha_leido = NOW()
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id
           AND leido = FALSE'
    );
    $marcado->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
} catch (PDOException $e) {
    error_log('mensajes_marcar_leidos.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, ['exito' => true, 'marcados' => $marcado->rowCount()]);
