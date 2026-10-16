<?php
// POST /backend/api/tarea_iniciar.php  (para la extensión, HU-007)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. Body JSON: { actividad_id } (tiene que ser la del token).
// Si la tarea no estaba empezada, pone iniciada_en en NOW(). Si ya estaba
// empezada (o finalizada) no toca nada y devuelve el estado actual, sin error.
// La Tarea no es un apoyo: empezarla no escribe nada en metrica.

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

    // El WHERE iniciada_en IS NULL hace que dos pedidos a la vez no se pisen:
    // solo uno cambia la fila.
    $inicio = $pdo->prepare(
        'UPDATE actividad_estudiante
         SET iniciada_en = NOW()
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id
           AND iniciada_en IS NULL'
    );
    $inicio->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);

    // Si no cambió ninguna fila puede ser que ya estuviera empezada o que
    // la asignación se haya quitado: el estado lo distingue.
    $estado = estadoTarea($pdo, $actividadId, $estudianteId);
} catch (PDOException $e) {
    error_log('tarea_iniciar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if ($estado === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

responderJson(200, ['exito' => true, 'tarea' => $estado]);
