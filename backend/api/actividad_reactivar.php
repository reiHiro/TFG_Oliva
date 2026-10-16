<?php
// POST /backend/api/actividad_reactivar.php  (solo docentes, HU-015)
// Body JSON: { id }
// Deshace la baja lógica: dada_de_baja_en vuelve a NULL. Las asignaciones,
// el estado de la Tarea y las métricas siguen como estaban.
// 404 si no existe o es de otro docente; 409 si ya estaba activa o si su
// clase está dada de baja (primero hay que reactivar la clase).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/actividad.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$actividadId = exigirId(leerJson()['id'] ?? null, 'id', 'La actividad es obligatoria.');

try {
    $pdo = obtenerConexion();

    $actividad = actividadConClase($pdo, $actividadId, $docenteId);
    if ($actividad === null) {
        responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
    }
    if ($actividad['clase_dada_de_baja_en'] !== null) {
        responderJson(409, ['exito' => false, 'error' => 'La clase de esta actividad está dada de baja: reactivá la clase primero.']);
    }
    if ($actividad['dada_de_baja_en'] === null) {
        responderJson(409, ['exito' => false, 'error' => 'La actividad ya está activa.']);
    }

    $reactivacion = $pdo->prepare(
        'UPDATE actividad SET dada_de_baja_en = NULL
         WHERE id = :id AND docente_id = :docente_id'
    );
    $reactivacion->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
} catch (PDOException $e) {
    error_log('actividad_reactivar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'   => true,
    'mensaje' => 'La actividad "' . $actividad['titulo'] . '" se reactivó.',
]);
