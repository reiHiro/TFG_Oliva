<?php
// POST /backend/api/correo_reenviar.php  (solo docentes, HU-019)
// Body JSON: { actividad_id, estudiante_id }
// Le manda (o le vuelve a mandar) por correo a un estudiante asignado el
// enlace personal de la actividad. Sirve también para quien nunca lo
// recibió: asignaciones anteriores a HU-019, pendientes o asignadas sin la
// casilla. La dirección sale de la base, nunca del pedido.
// 200 { resultado: 'enviado' | 'sin_correo', mensaje, correo: {resultado, fecha} }
// 403 la actividad no es del docente
// 404 el estudiante no está asignado, o la actividad (o su clase) está dada
//     de baja: el enlace no funcionaría
// 422 ids inválidos
// 429 hubo un intento hace menos de CORREO_SEGUNDOS_ENTRE_ENVIOS (reintentar_en)
// 502 el servidor de correo falló (queda registrado como error)
// 503 la configuración de correo es inválida (no se registra nada)

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/vigencia.php';
require_once __DIR__ . '/../config/correo_envio.php';

const CORREO_SEGUNDOS_ENTRE_ENVIOS = 60; // por estudiante y actividad

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$actividadId  = exigirId($datos['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($datos['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');

try {
    $pdo = obtenerConexion();
    $actividad = actividadDelDocente($pdo, $actividadId, $docenteId);
    $asignado  = $actividad !== null && estudianteAsignado($pdo, $actividadId, $estudianteId);
    // Después de la propiedad, para no contarle a otro docente si la
    // actividad existe o está dada de baja.
    $vigente   = $asignado && actividadVigente($pdo, $actividadId);
} catch (PDOException $e) {
    error_log('correo_reenviar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if ($actividad === null) {
    responderJson(403, ['exito' => false, 'error' => 'No tenés permiso sobre esta actividad.']);
}
if (!$asignado) {
    responderJson(404, ['exito' => false, 'error' => 'El estudiante no está asignado a esta actividad.']);
}
if (!$vigente) {
    responderJson(404, ['exito' => false, 'error' => 'La actividad está dada de baja: el enlace no funcionaría.']);
}

try {
    configCorreo();
} catch (CorreoConfigInvalida $e) {
    responderJson(503, ['exito' => false, 'error' => 'El envío por correo no está configurado: ' . $e->getMessage()]);
}

// El envío puede tardar: se libera la sesión para no trabar otras pestañas.
session_write_close();

try {
    // La fila de la asignación queda bloqueada hasta registrar el intento:
    // dos clics seguidos no mandan dos correos (el segundo espera y da 429).
    $pdo->beginTransaction();
    $pdo->prepare(
        'SELECT id FROM actividad_estudiante WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id FOR UPDATE'
    )->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);

    $consultaUltimo = $pdo->prepare(
        'SELECT TIMESTAMPDIFF(SECOND, MAX(fecha), NOW()) FROM correo_envio
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id'
    );
    $consultaUltimo->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $segundosDesdeUltimo = $consultaUltimo->fetchColumn();

    if ($segundosDesdeUltimo !== null && (int) $segundosDesdeUltimo < CORREO_SEGUNDOS_ENTRE_ENVIOS) {
        $pdo->rollBack();
        $espera = CORREO_SEGUNDOS_ENTRE_ENVIOS - max(0, (int) $segundosDesdeUltimo);
        header('Retry-After: ' . $espera);
        responderJson(429, [
            'exito'         => false,
            'error'         => 'Ya se le envió hace menos de un minuto. Probá de nuevo en ' . $espera . ' segundos.',
            'reintentar_en' => $espera,
        ]);
    }

    $envio = enviarCorreosActividad($pdo, $actividadId, $docenteId, [$estudianteId], 'reenvio');
    $pdo->commit();

    $correo = ultimosCorreos($pdo, $actividadId, $estudianteId)[$estudianteId] ?? null;
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // Sin el mensaje: podría traer datos del estudiante.
    error_log('correo_reenviar.php: ' . get_class($e));
    responderJson(500, ['exito' => false, 'error' => 'No se pudo enviar el correo por un error interno.']);
}

$resultado = $envio['resultados'][$estudianteId] ?? 'error';

if ($resultado === 'enviado') {
    responderJson(200, ['exito' => true, 'resultado' => $resultado, 'mensaje' => 'Correo enviado.', 'correo' => $correo]);
}
if ($resultado === 'sin_correo') {
    responderJson(200, [
        'exito'     => true,
        'resultado' => $resultado,
        'mensaje'   => 'El estudiante no tiene una dirección de correo válida: no se envió nada.',
        'correo'    => $correo,
    ]);
}
responderJson(502, [
    'exito'     => false,
    'resultado' => $resultado,
    'error'     => $envio['aviso'] ?? 'No se pudo enviar el correo.',
    'correo'    => $correo,
]);
