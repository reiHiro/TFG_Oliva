<?php
// Utilidades compartidas por los endpoints: respuestas JSON y lectura del body.

function responderJson(int $codigo, array $datos): void
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

function exigirMetodo(string $metodo): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) {
        header('Allow: ' . $metodo);
        responderJson(405, ['exito' => false, 'error' => 'Método no permitido.']);
    }
}

function leerJson(): array
{
    $datos = json_decode(file_get_contents('php://input'), true);

    if (!is_array($datos)) {
        responderJson(400, ['exito' => false, 'error' => 'El cuerpo de la petición debe ser JSON válido.']);
    }

    return $datos;
}
