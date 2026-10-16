<?php
// GET /backend/api/actividad_enlace_estudiante.php?actividad_id=N&estudiante_id=M  (solo docentes)
// Enlace directo de un estudiante asignado: la misma URL que le da
// actividad_abrir.php al estudiante (recurso + "#apoyos=N.<token>", token sin
// vencimiento). Quien lo abra usa la barra en nombre de ese estudiante.
// 403 si la actividad no es del docente; 404 si el estudiante no está asignado
// o si la actividad (o su clase) está dada de baja: el enlace no serviría.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$actividadId  = exigirId($_GET['actividad_id'] ?? null, 'actividad_id', 'La actividad es obligatoria.');
$estudianteId = exigirId($_GET['estudiante_id'] ?? null, 'estudiante_id', 'El estudiante es obligatorio.');

try {
    $pdo = obtenerConexion();
    $actividad = actividadDelDocente($pdo, $actividadId, $docenteId);
    $asignado  = $actividad !== null && estudianteAsignado($pdo, $actividadId, $estudianteId);

    // HU-015: se comprueba después de la propiedad, para no contarle a otro
    // docente si la actividad existe o está dada de baja.
    if ($asignado) {
        exigirActividadVigente($pdo, $actividadId, 404, 'La actividad está dada de baja: el enlace no funcionaría.');
    }
} catch (PDOException $e) {
    error_log('actividad_enlace_estudiante.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if ($actividad === null) {
    responderJson(403, ['exito' => false, 'error' => 'No tenés permiso sobre esta actividad.']);
}
if (!$asignado) {
    responderJson(404, ['exito' => false, 'error' => 'El estudiante no está asignado a esta actividad.']);
}

responderJson(200, ['exito' => true, 'url' => urlConApoyos($actividad['recurso_url'], $estudianteId, $actividadId)]);
