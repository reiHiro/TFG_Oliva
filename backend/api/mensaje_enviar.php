<?php
// POST /backend/api/mensaje_enviar.php  (solo docentes)
// Body JSON: { actividad_id, estudiante_id, texto }
// Guarda una devolución del docente para un estudiante asignado a una de sus
// actividades. 403 si la actividad no es del docente o el estudiante no está
// asignado. Devuelve el mensaje guardado.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/mensaje.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');

$datos = leerJson();
$actividadId  = exigirId($datos['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($datos['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');

$texto = is_string($datos['texto'] ?? null) ? trim($datos['texto']) : '';
if ($texto === '') {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['texto' => 'Escribí la devolución.']]);
}
if (mb_strlen($texto) > MENSAJE_MAXIMO_CARACTERES) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.',
        'errores' => ['texto' => 'La devolución puede tener hasta ' . MENSAJE_MAXIMO_CARACTERES . ' caracteres.']]);
}

try {
    $pdo = obtenerConexion();

    if (actividadDelDocente($pdo, $actividadId, $docenteId) === null
        || !estudianteAsignado($pdo, $actividadId, $estudianteId)) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para enviarle una devolución a este estudiante.']);
    }

    // HU-015: el estudiante ya no ve una actividad dada de baja (ni las de una
    // clase dada de baja), así que no se le mandan devoluciones nuevas. Las
    // anteriores el docente las sigue viendo (mensajes_docente.php).
    exigirActividadVigente($pdo, $actividadId, 403, 'La actividad está dada de baja: no se pueden enviar devoluciones nuevas.');

    $insercion = $pdo->prepare(
        'INSERT INTO mensaje (actividad_id, estudiante_id, texto, fecha_envio)
         VALUES (:actividad_id, :estudiante_id, :texto, NOW())'
    );
    $insercion->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId, ':texto' => $texto]);
    $mensajeId = (int) $pdo->lastInsertId();

    $consulta = $pdo->prepare('SELECT fecha_envio FROM mensaje WHERE id = :id');
    $consulta->execute([':id' => $mensajeId]);
    $fechaEnvio = $consulta->fetchColumn();
} catch (PDOException $e) {
    error_log('mensaje_enviar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(201, ['exito' => true, 'mensaje' => [
    'id'          => $mensajeId,
    'texto'       => $texto,
    'fecha_envio' => $fechaEnvio,
    'leido'       => false,
    'fecha_leido' => null,
]]);
