<?php
// POST /backend/api/actividad_duplicar.php  (solo docentes)
// Body JSON: { actividad_id }
// Crea una actividad nueva con el título "Copia de ...", la misma consigna,
// el mismo recurso, la misma clase y una copia de todos sus pasos (con su tipo y, si son de
// opción múltiple, sus opciones; y su justificación) y los mismos modo_lectura_inicial,
// mostrar_justificacion, produccion_propia y produccion_modo (la modalidad). No copia asignaciones
// y no modifica la actividad original.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';

const TITULO_MAX = 150;

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$actividadId = filter_var($datos['actividad_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, [
        'exito'   => false,
        'error'   => 'Datos inválidos.',
        'errores' => ['actividad_id' => 'La actividad es obligatoria.'],
    ]);
}

try {
    $pdo = obtenerConexion();

    // Si la actividad es de otro docente, o ella o su clase están dadas de
    // baja (HU-015), se responde igual que si no existiera: la copia quedaría
    // en la misma clase.
    $consulta = $pdo->prepare(
        'SELECT a.clase_id, a.titulo, a.recurso_url, a.consigna, a.modo_lectura_inicial,
                a.mostrar_justificacion, a.produccion_propia, a.produccion_modo
         FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id AND a.docente_id = :docente_id
           AND a.dada_de_baja_en IS NULL AND c.dada_de_baja_en IS NULL'
    );
    $consulta->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    $original = $consulta->fetch();

    if (!$original) {
        responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
    }

    // El prefijo puede hacer que el título pase el máximo de la columna.
    $titulo = mb_substr('Copia de ' . $original['titulo'], 0, TITULO_MAX);

    $pdo->beginTransaction();

    $insercion = $pdo->prepare(
        'INSERT INTO actividad (docente_id, clase_id, titulo, recurso_url, consigna, modo_lectura_inicial,
                                mostrar_justificacion, produccion_propia, produccion_modo)
         VALUES (:docente_id, :clase_id, :titulo, :recurso_url, :consigna, :modo_lectura_inicial,
                 :mostrar_justificacion, :produccion_propia, :produccion_modo)'
    );
    $insercion->execute([
        ':docente_id'  => $docenteId,
        ':clase_id'    => $original['clase_id'],
        ':titulo'      => $titulo,
        ':recurso_url' => $original['recurso_url'],
        ':consigna'    => $original['consigna'],
        ':modo_lectura_inicial' => (int) $original['modo_lectura_inicial'],
        ':mostrar_justificacion' => (int) $original['mostrar_justificacion'],
        ':produccion_propia'     => (int) $original['produccion_propia'],
        ':produccion_modo'   => $original['produccion_modo'],
    ]);
    $nuevaId = (int) $pdo->lastInsertId();

    // Los pasos se copian de a uno para conocer el id nuevo de cada paso y
    // colgarle la copia de sus opciones (pasos de opción múltiple).
    $consultaPasos = $pdo->prepare(
        'SELECT id, descripcion, orden, tipo, justificacion
         FROM paso
         WHERE actividad_id = :original_id
         ORDER BY orden, id'
    );
    $consultaPasos->execute([':original_id' => $actividadId]);
    $pasosOriginales = $consultaPasos->fetchAll();

    $copiaPaso = $pdo->prepare(
        'INSERT INTO paso (actividad_id, descripcion, orden, tipo, justificacion)
         VALUES (:nueva_id, :descripcion, :orden, :tipo, :justificacion)'
    );
    $copiaOpciones = $pdo->prepare(
        'INSERT INTO paso_opcion (paso_id, texto, es_correcta)
         SELECT :paso_nuevo_id, texto, es_correcta
         FROM paso_opcion
         WHERE paso_id = :paso_original_id
         ORDER BY id'
    );
    foreach ($pasosOriginales as $paso) {
        $copiaPaso->execute([
            ':nueva_id'    => $nuevaId,
            ':descripcion' => $paso['descripcion'],
            ':orden'       => $paso['orden'],
            ':tipo'        => $paso['tipo'],
            ':justificacion' => $paso['justificacion'],
        ]);
        $copiaOpciones->execute([
            ':paso_nuevo_id'    => (int) $pdo->lastInsertId(),
            ':paso_original_id' => $paso['id'],
        ]);
    }
    $cantidadPasos = count($pasosOriginales);

    $pdo->commit();
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('actividad_duplicar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(201, [
    'exito'     => true,
    'mensaje'   => 'Actividad duplicada correctamente.',
    'actividad' => [
        'id'             => $nuevaId,
        'clase_id'       => (int) $original['clase_id'],
        'titulo'         => $titulo,
        'recurso_url'    => $original['recurso_url'],
        'consigna'       => $original['consigna'],
        'modo_lectura_inicial' => (bool) $original['modo_lectura_inicial'],
        'mostrar_justificacion' => (bool) $original['mostrar_justificacion'],
        'produccion_propia'    => (bool) $original['produccion_propia'],
        'produccion_modo'  => $original['produccion_modo'],
        'cantidad_pasos' => $cantidadPasos,
    ],
]);
