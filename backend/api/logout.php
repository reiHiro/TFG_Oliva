<?php
// POST /backend/api/logout.php
// Cierra la sesión del usuario: vacía los datos, borra la cookie y destruye
// la sesión. Sin sesión iniciada también responde éxito (no hay nada que cerrar).

require_once __DIR__ . '/../config/respuesta.php';

exigirMetodo('POST');

session_start();
$_SESSION = [];

// Se borra la cookie con los mismos parámetros con que se creó.
if (ini_get('session.use_cookies')) {
    $parametros = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $parametros['path'],
        'domain'   => $parametros['domain'],
        'secure'   => $parametros['secure'],
        'httponly' => $parametros['httponly'],
        'samesite' => $parametros['samesite'],
    ]);
}

session_destroy();

responderJson(200, ['exito' => true, 'mensaje' => 'Sesión cerrada.']);
