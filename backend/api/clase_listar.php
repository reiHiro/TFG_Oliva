<?php
// GET /backend/api/clase_listar.php  (solo docentes)
// Devuelve las clases del docente logueado, ordenadas por nombre, con la
// cantidad de actividades activas de cada una.
// Por defecto solo las clases activas; con ?bajas=1, solo las dadas de baja
// (HU-015), de la baja más reciente a la más vieja.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$bajas = ($_GET['bajas'] ?? '') === '1';

// Las dos variantes son textos fijos: no entra nada del usuario en el SQL.
$filtroBaja = $bajas ? 'c.dada_de_baja_en IS NOT NULL' : 'c.dada_de_baja_en IS NULL';
$orden      = $bajas ? 'c.dada_de_baja_en DESC, c.id DESC' : 'c.nombre, c.id';

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare(
        "SELECT c.id, c.nombre, c.materia, c.descripcion, c.fecha_creacion, c.dada_de_baja_en,
                (SELECT COUNT(*) FROM actividad a
                 WHERE a.clase_id = c.id AND a.dada_de_baja_en IS NULL) AS cantidad_actividades
         FROM clase c
         WHERE c.docente_id = :docente_id AND $filtroBaja
         ORDER BY $orden"
    );
    $consulta->execute([':docente_id' => $docenteId]);
    $clases = $consulta->fetchAll();
} catch (PDOException $e) {
    error_log('clase_listar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

foreach ($clases as &$clase) {
    $clase['id']                   = (int) $clase['id'];
    $clase['cantidad_actividades'] = (int) $clase['cantidad_actividades'];
}
unset($clase);

responderJson(200, ['exito' => true, 'clases' => $clases]);
