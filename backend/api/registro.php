<?php
// POST /backend/api/registro.php
// Body JSON: { nombre, apellido, email, password, rol }

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';

// Únicos roles del sistema (no hay administrador ni familia).
const ROLES_REGISTRABLES = ['estudiante', 'docente'];
const PASSWORD_MIN = 8;

exigirMetodo('POST');
$datos = leerJson();

$nombre   = trim((string) ($datos['nombre'] ?? ''));
$apellido = trim((string) ($datos['apellido'] ?? ''));
$email    = strtolower(trim((string) ($datos['email'] ?? '')));
$password = (string) ($datos['password'] ?? '');
$rol      = (string) ($datos['rol'] ?? '');

$errores = [];
if ($nombre === '' || mb_strlen($nombre) > 100) {
    $errores['nombre'] = 'El nombre es obligatorio (máximo 100 caracteres).';
}
if ($apellido === '' || mb_strlen($apellido) > 100) {
    $errores['apellido'] = 'El apellido es obligatorio (máximo 100 caracteres).';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 255) {
    $errores['email'] = 'El email no es válido.';
}
if (mb_strlen($password) < PASSWORD_MIN) {
    $errores['password'] = 'La contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres.';
}
if (!in_array($rol, ROLES_REGISTRABLES, true)) {
    $errores['rol'] = 'El rol no es válido.';
}

if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare('SELECT id FROM usuario WHERE email = :email');
    $consulta->execute([':email' => $email]);
    if ($consulta->fetch()) {
        responderJson(409, ['exito' => false, 'error' => 'Ya existe un usuario registrado con ese email.']);
    }

    $insercion = $pdo->prepare(
        'INSERT INTO usuario (nombre, apellido, email, password_hash, rol)
         VALUES (:nombre, :apellido, :email, :password_hash, :rol)'
    );
    $insercion->execute([
        ':nombre'        => $nombre,
        ':apellido'      => $apellido,
        ':email'         => $email,
        ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ':rol'           => $rol,
    ]);

    responderJson(201, [
        'exito'   => true,
        'mensaje' => 'Usuario registrado correctamente.',
        'usuario' => [
            'id'       => (int) $pdo->lastInsertId(),
            'nombre'   => $nombre,
            'apellido' => $apellido,
            'email'    => $email,
            'rol'      => $rol,
        ],
    ]);
} catch (PDOException $e) {
    // Dos registros simultáneos con el mismo email: lo frena la restricción UNIQUE.
    if ($e->getCode() === '23000') {
        responderJson(409, ['exito' => false, 'error' => 'Ya existe un usuario registrado con ese email.']);
    }
    error_log('registro.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}
