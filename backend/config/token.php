<?php
// Tokens firmados con HMAC-SHA256 para que la extensión pida datos de una
// actividad sin depender de la cookie de sesión.
// Formato: base64url(payload JSON) . "." . base64url(firma)
// Payload: { "usuario_id": int, "actividad_id": int }
// No vence: cada endpoint vuelve a comprobar que la actividad siga asignada
// al estudiante, así que quitar la asignación corta el acceso.

require_once __DIR__ . '/secreto.php';

function base64urlCodificar(string $datos): string
{
    return rtrim(strtr(base64_encode($datos), '+/', '-_'), '=');
}

function base64urlDecodificar(string $texto): string|false
{
    return base64_decode(strtr($texto, '-_', '+/'), true);
}

function crearToken(int $usuarioId, int $actividadId): string
{
    $payload = base64urlCodificar(json_encode([
        'usuario_id'   => $usuarioId,
        'actividad_id' => $actividadId,
    ]));
    $firma = base64urlCodificar(hash_hmac('sha256', $payload, TOKEN_SECRETO, true));

    return $payload . '.' . $firma;
}

// URL del recurso con el fragmento "#apoyos=<actividad_id>.<token>" que
// activa la extensión. Si el recurso ya trae un fragmento se reemplaza.
function urlConApoyos(string $recursoUrl, int $usuarioId, int $actividadId): string
{
    $urlBase = explode('#', $recursoUrl, 2)[0];
    return $urlBase . '#apoyos=' . $actividadId . '.' . crearToken($usuarioId, $actividadId);
}

// Devuelve el payload si la firma es correcta; si no, null. Si un token
// viejo trae un campo "vence", se ignora.
function verificarToken(string $token): ?array
{
    $partes = explode('.', $token);
    if (count($partes) !== 2) {
        return null;
    }
    [$payload, $firma] = $partes;

    $firmaEsperada = base64urlCodificar(hash_hmac('sha256', $payload, TOKEN_SECRETO, true));
    if (!hash_equals($firmaEsperada, $firma)) { // comparación en tiempo constante
        return null;
    }

    $json = base64urlDecodificar($payload);
    $datos = $json === false ? null : json_decode($json, true);
    if (!is_array($datos)
        || !is_int($datos['usuario_id'] ?? null)
        || !is_int($datos['actividad_id'] ?? null)) {
        return null;
    }

    return $datos;
}

// Lee "Authorization: Bearer <token>". Apache con mod_php no siempre
// deja el encabezado en $_SERVER, por eso se prueba también apache_request_headers().
function leerTokenBearer(): ?string
{
    $encabezado = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

    if ($encabezado === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $nombre => $valor) {
            if (strcasecmp($nombre, 'Authorization') === 0) {
                $encabezado = $valor;
                break;
            }
        }
    }

    if (preg_match('/^Bearer\s+(\S+)$/i', trim($encabezado), $coincidencia) !== 1) {
        return null;
    }

    return $coincidencia[1];
}
