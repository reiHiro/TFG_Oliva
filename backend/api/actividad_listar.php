<?php
// GET /backend/api/actividad_listar.php  (solo docentes)
// Devuelve las actividades del docente logueado, de la más nueva a la más vieja,
// con los datos de su clase (la pantalla las filtra por clase_id).
// Siempre solo de clases activas: las de una clase dada de baja quedan
// ocultas junto con ella (HU-015). Por defecto solo las actividades activas;
// con ?bajas=1, solo las dadas de baja, de la baja más reciente a la más vieja.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$bajas = ($_GET['bajas'] ?? '') === '1';

// Las dos variantes son textos fijos: no entra nada del usuario en el SQL.
$filtroBaja = $bajas ? 'a.dada_de_baja_en IS NOT NULL' : 'a.dada_de_baja_en IS NULL';
$orden      = $bajas ? 'a.dada_de_baja_en DESC, a.id DESC' : 'a.fecha_creacion DESC, a.id DESC';

try {
    $pdo = obtenerConexion();

    $consulta = $pdo->prepare(
        "SELECT a.id, a.titulo, a.recurso_url, a.consigna, a.fecha_creacion, a.dada_de_baja_en,
                a.clase_id, c.nombre AS clase_nombre, c.materia AS clase_materia,
                (SELECT COUNT(*) FROM paso p WHERE p.actividad_id = a.id) AS cantidad_pasos
         FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.docente_id = :docente_id AND c.dada_de_baja_en IS NULL AND $filtroBaja
         ORDER BY $orden"
    );
    $consulta->execute([':docente_id' => $docenteId]);
    $actividades = $consulta->fetchAll();
} catch (PDOException $e) {
    error_log('actividad_listar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

foreach ($actividades as &$actividad) {
    $actividad['id']             = (int) $actividad['id'];
    $actividad['clase_id']       = (int) $actividad['clase_id'];
    $actividad['cantidad_pasos'] = (int) $actividad['cantidad_pasos'];
}
unset($actividad);

responderJson(200, ['exito' => true, 'actividades' => $actividades]);
