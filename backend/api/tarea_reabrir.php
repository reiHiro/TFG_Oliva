<?php
// POST /backend/api/tarea_reabrir.php  (solo docentes, HU-016)
// Body JSON: { actividad_id, estudiante_id }
// Reabre la Tarea finalizada de un estudiante en una actividad del docente
// (por ejemplo, si se finalizó porque salió de la pestaña por error). La
// Tarea vuelve a estar en curso: el estudiante conserva sus respuestas y el
// tiempo ya trabajado pasa a segundos_acumulados; el rato que estuvo
// finalizada no se cuenta (config/tarea.php). Cada reapertura queda en
// tarea_reapertura, con quién la hizo y cómo había terminado la Tarea.
//   422: faltan los ids.
//   403: la actividad no es del docente, o está dada de baja (ella o su clase).
//   404: el estudiante no está asignado a la actividad.
//   409: la Tarea no está finalizada (sin empezar o en curso), con su estado.
// Devuelve el estado de la Tarea y cuántas veces se reabrió.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');

$datos = leerJson();
$actividadId  = exigirId($datos['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($datos['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');

try {
    $pdo = obtenerConexion();

    if (actividadDelDocente($pdo, $actividadId, $docenteId) === null) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para reabrir Tareas de esta actividad.']);
    }
    if (!estudianteAsignado($pdo, $actividadId, $estudianteId)) {
        responderJson(404, ['exito' => false, 'error' => 'El estudiante no está asignado a esta actividad.']);
    }

    // HU-015: el estudiante no puede usar una actividad dada de baja (ni las
    // de una clase dada de baja), así que no se le reabre la Tarea.
    exigirActividadVigente($pdo, $actividadId, 403, 'La actividad está dada de baja: no se puede reabrir la Tarea.');

    // La fila se bloquea para leer cómo había terminado y reabrirla sin que
    // otro pedido se meta en el medio: de dos reaperturas a la vez, la
    // segunda ya la encuentra en curso y recibe el 409.
    $pdo->beginTransaction();
    $consulta = $pdo->prepare(
        'SELECT finalizada_en, finalizada_motivo
         FROM actividad_estudiante
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id
         FOR UPDATE'
    );
    $consulta->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $anterior = $consulta->fetch();
    $reabierta = $anterior && $anterior['finalizada_en'] !== null;

    if ($reabierta) {
        // MySQL aplica las asignaciones de un UPDATE en orden: los segundos
        // se acumulan con iniciada_en y finalizada_en todavía sin cambiar.
        $reapertura = $pdo->prepare(
            'UPDATE actividad_estudiante
             SET segundos_acumulados = segundos_acumulados + TIMESTAMPDIFF(SECOND, iniciada_en, finalizada_en),
                 iniciada_en = NOW(),
                 finalizada_en = NULL,
                 finalizada_motivo = NULL
             WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id'
        );
        $reapertura->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);

        $registro = $pdo->prepare(
            'INSERT INTO tarea_reapertura
                (actividad_id, estudiante_id, docente_id, fecha, finalizada_en_anterior, motivo_anterior)
             VALUES (:actividad_id, :estudiante_id, :docente_id, NOW(), :finalizada_en, :motivo)'
        );
        $registro->execute([
            ':actividad_id'  => $actividadId,
            ':estudiante_id' => $estudianteId,
            ':docente_id'    => $docenteId,
            ':finalizada_en' => $anterior['finalizada_en'],
            ':motivo'        => $anterior['finalizada_motivo'],
        ]);
    }
    $pdo->commit();

    $estado = estadoTarea($pdo, $actividadId, $estudianteId);

    $conteo = $pdo->prepare(
        'SELECT COUNT(*) FROM tarea_reapertura
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id'
    );
    $conteo->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $reaperturas = (int) $conteo->fetchColumn();
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('tarea_reabrir.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if ($estado === null) {
    responderJson(404, ['exito' => false, 'error' => 'El estudiante no está asignado a esta actividad.']);
}
if (!$reabierta) {
    $error = $estado['iniciada_en'] === null
        ? 'La Tarea todavía no se empezó: no hay nada que reabrir.'
        : 'La Tarea no está finalizada: sigue en curso.';
    responderJson(409, ['exito' => false, 'error' => $error, 'tarea' => $estado, 'reaperturas' => $reaperturas]);
}

responderJson(200, ['exito' => true, 'tarea' => $estado, 'reaperturas' => $reaperturas]);
