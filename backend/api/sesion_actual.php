<?php
// GET /backend/api/sesion_actual.php  (cualquier usuario logueado)
// Devuelve nombre, apellido y rol del usuario de la sesión, para el
// encabezado de la webapp. Sin sesión: 401.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';

exigirMetodo('GET');
$usuarioId = exigirSesion();

try {
    $pdo = obtenerConexion();
    $consulta = $pdo->prepare('SELECT nombre, apellido, rol FROM usuario WHERE id = :id');
    $consulta->execute([':id' => $usuarioId]);
    $usuario = $consulta->fetch();
} catch (PDOException $e) {
    error_log('sesion_actual.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

// La sesión apunta a un usuario que ya no existe: se toma como sin sesión.
if (!$usuario) {
    responderJson(401, ['exito' => false, 'error' => 'Tenés que iniciar sesión.']);
}

responderJson(200, ['exito' => true, 'usuario' => $usuario]);
