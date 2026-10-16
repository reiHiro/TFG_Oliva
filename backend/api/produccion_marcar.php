<?php
// POST /backend/api/produccion_marcar.php  (solo docentes, HU-018)
// Body JSON: { actividad_id, estudiante_id, paso_id, valida: true | false | null }
// Marca de "Justificación válida" del docente sobre la producción propia de
// un estudiante en un paso: true = Sí, false = No, null = Sin revisar.
// Es solo la lectura del docente: no cambia el acierto ni ningún cálculo, y
// el estudiante no la ve. Las pantallas de métricas muestran cuántas hay.
// 403 si la actividad no es del docente; 404 si ese estudiante no tiene una
// producción guardada en ese paso de esa actividad (incluye paso de otra
// actividad o estudiante no asignado); 422 si faltan los ids o valida no es
// true, false ni null. Se puede marcar también con la actividad dada de baja:
// es revisión del docente y no le llega nada al estudiante.
// Si después el estudiante cambia su producción (con la Tarea reabierta),
// la marca vuelve a "sin revisar" (paso_produccion_guardar.php).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$actividadId  = exigirId($datos['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($datos['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');
$pasoId       = exigirId($datos['paso_id'] ?? null, 'paso_id', 'El paso es obligatorio.');

// La clave tiene que venir: un body sin "valida" no se toma como "sin revisar".
$valida = $datos['valida'] ?? null;
if (!array_key_exists('valida', $datos) || !in_array($valida, [true, false, null], true)) {
    responderJson(422, [
        'exito'   => false,
        'error'   => 'Datos inválidos.',
        'errores' => ['valida' => 'La marca tiene que ser sí, no o sin revisar.'],
    ]);
}

try {
    $pdo = obtenerConexion();

    if (actividadDelDocente($pdo, $actividadId, $docenteId) === null) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para ver esta actividad.']);
    }

    // La producción tiene que ser de un paso de esta actividad y de un
    // estudiante asignado a ella.
    $consulta = $pdo->prepare(
        'SELECT pp.id
         FROM paso_produccion pp
         JOIN paso p ON p.id = pp.paso_id
         JOIN actividad_estudiante ae
              ON ae.actividad_id = p.actividad_id AND ae.estudiante_id = pp.estudiante_id
         WHERE pp.paso_id = :paso_id AND pp.estudiante_id = :estudiante_id
           AND p.actividad_id = :actividad_id'
    );
    $consulta->execute([':paso_id' => $pasoId, ':estudiante_id' => $estudianteId, ':actividad_id' => $actividadId]);
    $produccionId = $consulta->fetchColumn();
    if ($produccionId === false) {
        responderJson(404, ['exito' => false, 'error' => 'El estudiante no tiene una producción en este paso.']);
    }

    $marca = $pdo->prepare('UPDATE paso_produccion SET justificacion_valida = :valida WHERE id = :id');
    $marca->execute([':valida' => $valida === null ? null : (int) $valida, ':id' => $produccionId]);
} catch (PDOException $e) {
    error_log('produccion_marcar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'                => true,
    'paso_id'              => $pasoId,
    'estudiante_id'        => $estudianteId,
    'justificacion_valida' => $valida,
]);
