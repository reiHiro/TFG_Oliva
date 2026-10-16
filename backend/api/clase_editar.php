<?php
// POST /backend/api/clase_editar.php  (solo docentes, HU-015)
// Body JSON: { id, nombre, materia?, descripcion? }
// Mismas validaciones que clase_crear.php (config/clase.php): 409 si el
// nombre ya lo usa otra clase del docente. Solo se editan clases activas:
// si no existe, es de otro docente o está dada de baja, 404.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/clase.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$cuerpo = leerJson();

$claseId = exigirId($cuerpo['id'] ?? null, 'id', 'La clase es obligatoria.');
$datos = validarDatosClase($cuerpo);

try {
    $pdo = obtenerConexion();

    $clase = claseDelDocente($pdo, $claseId, $docenteId);
    if ($clase === null || $clase['dada_de_baja_en'] !== null) {
        responderJson(404, ['exito' => false, 'error' => 'Clase no encontrada.']);
    }

    $edicion = $pdo->prepare(
        'UPDATE clase
         SET nombre = :nombre, materia = :materia, descripcion = :descripcion
         WHERE id = :id AND docente_id = :docente_id'
    );
    $edicion->execute([
        ':nombre'      => $datos['nombre'],
        ':materia'     => $datos['materia'],
        ':descripcion' => $datos['descripcion'],
        ':id'          => $claseId,
        ':docente_id'  => $docenteId,
    ]);

    $clase = claseDelDocente($pdo, $claseId, $docenteId);
} catch (PDOException $e) {
    // Igual que en clase_crear.php: el nombre choca con otra clase del docente.
    if ($e->getCode() === '23000') {
        responderNombreRepetido();
    }
    error_log('clase_editar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'   => true,
    'mensaje' => 'Clase actualizada correctamente.',
    'clase'   => $clase,
]);
