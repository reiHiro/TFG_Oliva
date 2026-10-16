<?php
// GET /backend/api/actividad_abrir.php?id=N  (solo estudiantes)
// Si la actividad está asignada al estudiante logueado, devuelve la URL del
// recurso con el fragmento "#apoyos=N.<token>" que activa la extensión.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('GET');
$estudianteId = exigirSesion('estudiante');

$actividadId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, ['exito' => false, 'error' => 'La actividad es obligatoria.']);
}

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 404, 'Actividad no encontrada.');

    $consulta = $pdo->prepare(
        'SELECT a.recurso_url
         FROM actividad a
         JOIN actividad_estudiante ae ON ae.actividad_id = a.id
         WHERE a.id = :id AND ae.estudiante_id = :estudiante_id'
    );
    $consulta->execute([':id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $actividad = $consulta->fetch();
} catch (PDOException $e) {
    error_log('actividad_abrir.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

// No asignada o inexistente: misma respuesta, para no revelar qué ids existen.
if (!$actividad) {
    responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
}

responderJson(200, ['exito' => true, 'url' => urlConApoyos($actividad['recurso_url'], $estudianteId, $actividadId)]);
