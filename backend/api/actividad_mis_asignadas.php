<?php
// GET /backend/api/actividad_mis_asignadas.php  (solo estudiantes)
// Devuelve las actividades asignadas al estudiante logueado,
// de la asignación más nueva a la más vieja, con los datos de su clase y del
// docente: dos docentes pueden tener clases con el mismo nombre, por eso la
// pantalla agrupa por clase_id y muestra quién es el docente.
// No lista las actividades dadas de baja ni las de clases dadas de baja
// (HU-015, config/vigencia.php).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('GET');
$estudianteId = exigirSesion('estudiante');

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare(
        'SELECT a.id, a.titulo, a.recurso_url, a.consigna, ae.fecha_asignacion,
                a.clase_id, c.nombre AS clase_nombre, c.materia AS clase_materia,
                d.nombre AS docente_nombre, d.apellido AS docente_apellido,
                (SELECT COUNT(*) FROM paso p WHERE p.actividad_id = a.id) AS cantidad_pasos
         FROM actividad_estudiante ae
         JOIN actividad a ON a.id = ae.actividad_id
         JOIN clase c     ON c.id = a.clase_id
         JOIN usuario d   ON d.id = a.docente_id
         WHERE ae.estudiante_id = :estudiante_id AND ' . CONDICION_ACTIVIDAD_VIGENTE . '
         ORDER BY ae.fecha_asignacion DESC, ae.id DESC'
    );
    $consulta->execute([':estudiante_id' => $estudianteId]);
    $actividades = $consulta->fetchAll();
} catch (PDOException $e) {
    error_log('actividad_mis_asignadas.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

foreach ($actividades as &$actividad) {
    $actividad['id']             = (int) $actividad['id'];
    $actividad['clase_id']       = (int) $actividad['clase_id'];
    $actividad['cantidad_pasos'] = (int) $actividad['cantidad_pasos'];
}
unset($actividad);

responderJson(200, ['exito' => true, 'actividades' => $actividades]);
