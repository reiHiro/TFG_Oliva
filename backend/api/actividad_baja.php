<?php
// POST /backend/api/actividad_baja.php  (solo docentes, HU-015)
// Body JSON: { id }
// Baja lógica: pone dada_de_baja_en = NOW() y no borra nada (ni pasos, ni
// asignaciones, ni métricas, ni devoluciones). El estudiante deja de verla y
// de poder usarla (config/vigencia.php); el docente sigue viendo sus
// métricas y devoluciones.
// 404 si no existe o es de otro docente; 409 si ya estaba dada de baja o si
// su clase está dada de baja (se maneja desde la clase).

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
        responderJson(409, ['exito' => false, 'error' => 'La clase de esta actividad está dada de baja.']);
    }
    if ($actividad['dada_de_baja_en'] !== null) {
        responderJson(409, ['exito' => false, 'error' => 'La actividad ya está dada de baja.']);
    }

    $baja = $pdo->prepare(
        'UPDATE actividad SET dada_de_baja_en = NOW()
         WHERE id = :id AND docente_id = :docente_id AND dada_de_baja_en IS NULL'
    );
    $baja->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
} catch (PDOException $e) {
    error_log('actividad_baja.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'   => true,
    'mensaje' => 'La actividad "' . $actividad['titulo'] . '" se dio de baja. Podés reactivarla cuando quieras.',
]);
