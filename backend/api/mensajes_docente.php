<?php
// GET /backend/api/mensajes_docente.php?actividad_id=N&estudiante_id=M  (solo docentes)
// Devoluciones que el docente ya le mandó a ese estudiante en esa actividad,
// de la más nueva a la más vieja (para el cuadro "Enviar devolución" del
// panel de métricas). 403 si la actividad no es del docente o el estudiante
// no está asignado.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/mensaje.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$actividadId  = exigirId($_GET['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($_GET['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');

try {
    $pdo = obtenerConexion();

    if (actividadDelDocente($pdo, $actividadId, $docenteId) === null
        || !estudianteAsignado($pdo, $actividadId, $estudianteId)) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para ver las devoluciones de este estudiante.']);
    }

    $mensajes = listarMensajes($pdo, $actividadId, $estudianteId);
} catch (PDOException $e) {
    error_log('mensajes_docente.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, ['exito' => true, 'mensajes' => $mensajes]);
