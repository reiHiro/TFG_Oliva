<?php
// POST /backend/api/actividad_crear.php  (solo docentes)
// Body JSON: { clase_id, titulo, consigna, recurso_url, pasos: [paso, ...],
//              modo_lectura_inicial?, mostrar_justificacion?,
//              produccion_propia?, produccion_modo? }
// modo_lectura_inicial (true/false o 1/0, opcional, por defecto no): la
// extensión abre la actividad con la vista de lectura limpia.
// mostrar_justificacion (igual, HU-018): la extensión ofrece "¿Por qué?" en
// los pasos que tienen justificación, después de responderlos.
// produccion_propia (igual, HU-018): en cada paso el estudiante justifica su
// respuesta con una producción propia. Con producción propia la
// justificación del docente no se le muestra: mostrar_justificacion se
// guarda en no.
// produccion_modo ('cita_texto', 'texto_libre' o 'momento_video', por
// defecto 'cita_texto'): cómo la justifica (config/produccion.php).
// clase_id es obligatorio y tiene que ser una clase del docente (HU-014):
// si falta o no es un id válido, 422; si no existe, es de otro docente o está
// dada de baja, 404.
// El formato de cada paso y las validaciones están en config/actividad.php
// (las mismas que usa actividad_editar.php). El orden de los pasos es el
// orden en que llegan en la lista.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/actividad.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$claseId = filter_var($datos['clase_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
[$valores, $errores] = validarCamposActividad($datos, ['titulo', 'consigna', 'recurso_url', 'pasos', 'modo_lectura_inicial', 'mostrar_justificacion',
    'produccion_propia', 'produccion_modo']);
$modoLecturaInicial = $valores['modo_lectura_inicial'] ?? 0;
$produccionPropia = $valores['produccion_propia'] ?? 0;
$produccionModo = $valores['produccion_modo'] ?? 'cita_texto';
$mostrarJustificacion = $produccionPropia ? 0 : ($valores['mostrar_justificacion'] ?? 0);

if ($claseId === false) {
    // Primero en la lista, como en el formulario.
    $errores = ['clase_id' => 'Elegí la clase de la actividad.'] + $errores;
}

if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}

try {
    $pdo = obtenerConexion();

    // Si la clase es de otro docente o está dada de baja (HU-015) se responde
    // igual que si no existiera.
    $consultaClase = $pdo->prepare(
        'SELECT id FROM clase
         WHERE id = :id AND docente_id = :docente_id AND dada_de_baja_en IS NULL'
    );
    $consultaClase->execute([':id' => $claseId, ':docente_id' => $docenteId]);
    if (!$consultaClase->fetch()) {
        responderJson(404, ['exito' => false, 'error' => 'Clase no encontrada.']);
    }

    $pdo->beginTransaction();

    $insercion = $pdo->prepare(
        'INSERT INTO actividad (docente_id, clase_id, titulo, recurso_url, consigna, modo_lectura_inicial,
                                mostrar_justificacion, produccion_propia, produccion_modo)
         VALUES (:docente_id, :clase_id, :titulo, :recurso_url, :consigna, :modo_lectura_inicial,
                 :mostrar_justificacion, :produccion_propia, :produccion_modo)'
    );
    $insercion->execute([
        ':docente_id'  => $docenteId,
        ':clase_id'    => $claseId,
        ':titulo'      => $valores['titulo'],
        ':recurso_url' => $valores['recurso_url'],
        ':consigna'    => $valores['consigna'],
        ':modo_lectura_inicial' => $modoLecturaInicial,
        ':mostrar_justificacion' => $mostrarJustificacion,
        ':produccion_propia'     => $produccionPropia,
        ':produccion_modo'   => $produccionModo,
    ]);
    $actividadId = (int) $pdo->lastInsertId();

    insertarPasos($pdo, $actividadId, $valores['pasos']);

    $pdo->commit();
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('actividad_crear.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(201, [
    'exito'     => true,
    'mensaje'   => 'Actividad creada correctamente.',
    'actividad' => [
        'id'             => $actividadId,
        'clase_id'       => $claseId,
        'titulo'         => $valores['titulo'],
        'recurso_url'    => $valores['recurso_url'],
        'consigna'       => $valores['consigna'],
        'modo_lectura_inicial' => (bool) $modoLecturaInicial,
        'mostrar_justificacion' => (bool) $mostrarJustificacion,
        'produccion_propia'    => (bool) $produccionPropia,
        'produccion_modo'  => $produccionModo,
        'cantidad_pasos' => count($valores['pasos']),
    ],
]);
