<?php
// POST /backend/api/login.php
// Body JSON: { email, password }

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';

exigirMetodo('POST');
$datos = leerJson();

$email    = strtolower(trim((string) ($datos['email'] ?? '')));
$password = (string) ($datos['password'] ?? '');

if ($email === '' || $password === '') {
    responderJson(422, ['exito' => false, 'error' => 'Email y contraseña son obligatorios.']);
}

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare(
        'SELECT id, nombre, apellido, email, password_hash, rol, fecha_creacion
         FROM usuario WHERE email = :email'
    );
    $consulta->execute([':email' => $email]);
    $usuario = $consulta->fetch();
} catch (PDOException $e) {
    error_log('login.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

// Mismo mensaje para email inexistente y contraseña incorrecta,
// para no revelar qué emails están registrados.
if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
    responderJson(401, ['exito' => false, 'error' => 'Email o contraseña incorrectos.']);
}

unset($usuario['password_hash']);
$usuario['id'] = (int) $usuario['id'];

session_start();
session_regenerate_id(true);
$_SESSION['usuario_id'] = $usuario['id'];
$_SESSION['rol']        = $usuario['rol'];

responderJson(200, ['exito' => true, 'usuario' => $usuario]);
