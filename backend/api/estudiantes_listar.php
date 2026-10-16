<?php
// GET /backend/api/estudiantes_listar.php  (solo docentes)
// Devuelve los usuarios con rol estudiante, ordenados por apellido y nombre.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';

exigirMetodo('GET');
exigirSesion('docente');

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare(
        'SELECT id, nombre, apellido
         FROM usuario
         WHERE rol = :rol
         ORDER BY apellido, nombre, id'
    );
    $consulta->execute([':rol' => 'estudiante']);
    $estudiantes = $consulta->fetchAll();
} catch (PDOException $e) {
    error_log('estudiantes_listar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

foreach ($estudiantes as &$estudiante) {
    $estudiante['id'] = (int) $estudiante['id'];
}
unset($estudiante);

responderJson(200, ['exito' => true, 'estudiantes' => $estudiantes]);
