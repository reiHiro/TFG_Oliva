<?php
// POST /backend/api/clase_baja.php  (solo docentes, HU-015)
// Body JSON: { id }
// Baja lógica: pone dada_de_baja_en = NOW() y no borra nada. Las actividades
// de la clase no se modifican: quedan ocultas junto con ella (para el docente
// en actividad_listar.php y para el estudiante en config/vigencia.php) y
// vuelven, cada una con su propio estado, al reactivar la clase.
// 404 si no existe o es de otro docente; 409 si ya estaba dada de baja.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/clase.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$claseId = exigirId(leerJson()['id'] ?? null, 'id', 'La clase es obligatoria.');

try {
    $pdo = obtenerConexion();

    $clase = claseDelDocente($pdo, $claseId, $docenteId);
    if ($clase === null) {
        responderJson(404, ['exito' => false, 'error' => 'Clase no encontrada.']);
    }
    if ($clase['dada_de_baja_en'] !== null) {
        responderJson(409, ['exito' => false, 'error' => 'La clase ya está dada de baja.']);
    }

    $baja = $pdo->prepare(
        'UPDATE clase SET dada_de_baja_en = NOW()
         WHERE id = :id AND docente_id = :docente_id AND dada_de_baja_en IS NULL'
    );
    $baja->execute([':id' => $claseId, ':docente_id' => $docenteId]);

    $clase = claseDelDocente($pdo, $claseId, $docenteId);
} catch (PDOException $e) {
    error_log('clase_baja.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'   => true,
    'mensaje' => 'La clase se dio de baja. Podés reactivarla cuando quieras.',
    'clase'   => $clase,
]);
