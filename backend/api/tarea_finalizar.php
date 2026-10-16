<?php
// POST /backend/api/tarea_finalizar.php  (para la extensión, HU-007)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. Body JSON: { actividad_id, motivo } (la actividad tiene
// que ser la del token). motivo (HU-016) dice por qué termina y se guarda en
// finalizada_motivo: 'estudiante' si tocó Finalizar, 'salida' si la extensión
// la finalizó porque salió de la pestaña. Cualquier otro valor, 422.
// Pone finalizada_en en NOW(). Exige que la tarea esté en curso (empezada y
// sin finalizar); si no, 409 con el estado actual. Se puede finalizar con
// pasos pendientes: el aviso de pasos faltantes lo muestra la extensión.
// Respaldo para navigator.sendBeacon (finalización al salir de la página):
// un beacon no puede llevar encabezados, así que si no viene Authorization
// el token se toma del campo "token" del body y se valida exactamente igual.
// Es el único endpoint que acepta el token en el body.
// finalizada_en es siempre el NOW() del servidor al recibir el pedido: la
// extensión lo manda en el momento de la salida, pero si ese envío falla y
// se reintenta al volver a la pestaña, queda la hora de llegada del reintento.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('POST');

$token = leerTokenBearer();
if ($token === null) {
    // No se usa leerJson(): sin token válido la respuesta sigue siendo 401,
    // también si el body no es JSON.
    $cuerpo = json_decode(file_get_contents('php://input'), true);
    $token  = is_array($cuerpo) && is_string($cuerpo['token'] ?? null) ? $cuerpo['token'] : null;
}
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
$motivo = $datos['motivo'] ?? null;
if (!is_string($motivo) || !in_array($motivo, MOTIVOS_FINALIZACION, true)) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['motivo' => 'El motivo debe ser "estudiante" o "salida".']]);
}

$estudianteId = $datosToken['usuario_id'];

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 401, 'Token inválido.');

    // Las condiciones van en el mismo UPDATE: si llegan dos pedidos a la
    // vez, solo uno finaliza y el otro recibe el error.
    $fin = $pdo->prepare(
        'UPDATE actividad_estudiante
         SET finalizada_en = NOW(), finalizada_motivo = :motivo
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id
           AND iniciada_en IS NOT NULL AND finalizada_en IS NULL'
    );
    $fin->execute([':motivo' => $motivo, ':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $finalizo = $fin->rowCount() === 1;

    $estado = estadoTarea($pdo, $actividadId, $estudianteId);
} catch (PDOException $e) {
    error_log('tarea_finalizar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if ($estado === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}
if (!$finalizo) {
    $error = $estado['iniciada_en'] === null
        ? 'La tarea todavía no se empezó.'
        : 'La tarea ya estaba finalizada.';
    responderJson(409, ['exito' => false, 'error' => $error, 'tarea' => $estado]);
}

responderJson(200, ['exito' => true, 'tarea' => $estado]);
