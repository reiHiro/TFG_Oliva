<?php
// POST /backend/api/clase_reactivar.php  (solo docentes, HU-015)
// Body JSON: { id }
// Deshace la baja lógica: dada_de_baja_en vuelve a NULL. Sus actividades
// reaparecen con el estado que tenían (las que estaban dadas de baja por
// su cuenta siguen así).
// 404 si no existe o es de otro docente; 409 si ya estaba activa.

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
    if ($clase['dada_de_baja_en'] === null) {
        responderJson(409, ['exito' => false, 'error' => 'La clase ya está activa.']);
    }

    $reactivacion = $pdo->prepare(
        'UPDATE clase SET dada_de_baja_en = NULL
         WHERE id = :id AND docente_id = :docente_id'
    );
    $reactivacion->execute([':id' => $claseId, ':docente_id' => $docenteId]);

    $clase = claseDelDocente($pdo, $claseId, $docenteId);
} catch (PDOException $e) {
    error_log('clase_reactivar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'   => true,
    'mensaje' => 'La clase se reactivó.',
    'clase'   => $clase,
]);
