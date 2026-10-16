<?php
// POST /backend/api/actividad_asignar.php  (solo docentes)
// Body JSON: { actividad_id, estudiante_ids: [1, 2, ...], enviar_correo?: bool }
// Los estudiantes que ya tenían la actividad asignada se omiten
// (no se duplica el par actividad-estudiante).
//
// HU-019: con enviar_correo = true (por defecto false), después de asignar se
// le manda a cada estudiante NUEVO su enlace personal por correo
// (config/correo_envio.php). A quienes ya la tenían no se les reenvía. Un
// problema con el correo nunca deshace la asignación ni da 500: la respuesta
// suma "correo" con el resultado por estudiante y, si hace falta, un aviso.
// Si la actividad no está vigente, se asigna igual pero no se envía nada (el
// enlace no funcionaría).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/vigencia.php';
require_once __DIR__ . '/../config/correo_envio.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$actividadId = filter_var($datos['actividad_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
$idsCrudo    = $datos['estudiante_ids'] ?? null;
$enviarCorreo = $datos['enviar_correo'] ?? false;

$errores = [];
if ($actividadId === false) {
    $errores['actividad_id'] = 'La actividad es obligatoria.';
}
if (!is_bool($enviarCorreo)) {
    $errores['enviar_correo'] = 'enviar_correo tiene que ser true o false.';
}

$estudianteIds = [];
if (!is_array($idsCrudo) || !array_is_list($idsCrudo)) {
    $errores['estudiante_ids'] = 'Los estudiantes deben enviarse como una lista.';
} else {
    foreach ($idsCrudo as $idCrudo) {
        $id = filter_var($idCrudo, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) {
            $errores['estudiante_ids'] = 'La lista de estudiantes tiene un valor inválido.';
            break;
        }
        $estudianteIds[$id] = $id; // la clave elimina repetidos del pedido
    }
    if (!isset($errores['estudiante_ids']) && count($estudianteIds) === 0) {
        $errores['estudiante_ids'] = 'Elegí al menos un estudiante.';
    }
}

if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}
$estudianteIds = array_values($estudianteIds);

try {
    $pdo = obtenerConexion();

    // La actividad tiene que existir y ser del docente logueado. Si es de
    // otro docente se responde igual que si no existiera.
    $consultaActividad = $pdo->prepare(
        'SELECT id FROM actividad WHERE id = :id AND docente_id = :docente_id'
    );
    $consultaActividad->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    if (!$consultaActividad->fetch()) {
        responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
    }

    // Solo se generan los signos "?" según la cantidad; los valores van
    // siempre como parámetros de la consulta preparada.
    $marcadores = implode(',', array_fill(0, count($estudianteIds), '?'));

    $consultaEstudiantes = $pdo->prepare(
        "SELECT id FROM usuario WHERE rol = 'estudiante' AND id IN ($marcadores)"
    );
    $consultaEstudiantes->execute($estudianteIds);
    $validos = array_map('intval', $consultaEstudiantes->fetchAll(PDO::FETCH_COLUMN));

    if (count($validos) !== count($estudianteIds)) {
        responderJson(422, [
            'exito'   => false,
            'error'   => 'Datos inválidos.',
            'errores' => ['estudiante_ids' => 'Alguno de los usuarios elegidos no es un estudiante.'],
        ]);
    }

    $pdo->beginTransaction();

    $consultaYaAsignados = $pdo->prepare(
        "SELECT estudiante_id FROM actividad_estudiante
         WHERE actividad_id = ? AND estudiante_id IN ($marcadores)
         FOR UPDATE"
    );
    $consultaYaAsignados->execute(array_merge([$actividadId], $estudianteIds));
    $yaAsignados = array_map('intval', $consultaYaAsignados->fetchAll(PDO::FETCH_COLUMN));

    $nuevos = array_values(array_diff($estudianteIds, $yaAsignados));

    $insercion = $pdo->prepare(
        'INSERT INTO actividad_estudiante (actividad_id, estudiante_id, fecha_asignacion)
         VALUES (:actividad_id, :estudiante_id, NOW())'
    );
    foreach ($nuevos as $estudianteId) {
        $insercion->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    }

    $pdo->commit();
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // 23000: la restricción UNIQUE (actividad_id, estudiante_id) frenó un
    // duplicado que entró en paralelo con este pedido.
    if ($e->getCode() === '23000') {
        responderJson(409, ['exito' => false, 'error' => 'Alguno de los estudiantes ya tenía la actividad asignada. Probá de nuevo.']);
    }
    error_log('actividad_asignar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

if (count($nuevos) === 0) {
    $mensaje = 'Los estudiantes elegidos ya tenían la actividad asignada.';
} elseif (count($nuevos) === 1) {
    $mensaje = 'Se asignó la actividad a 1 estudiante.';
} else {
    $mensaje = 'Se asignó la actividad a ' . count($nuevos) . ' estudiantes.';
}
if (count($nuevos) > 0 && count($yaAsignados) === 1) {
    $mensaje .= ' 1 ya la tenía asignada.';
} elseif (count($yaAsignados) > 1) {
    $mensaje .= ' ' . count($yaAsignados) . ' ya la tenían asignada.';
}

// HU-019: la asignación ya quedó guardada; desde acá nada la deshace.
$correo = null;
if ($enviarCorreo && count($nuevos) > 0) {
    // El envío puede tardar: se libera la sesión para no trabar otras
    // pestañas del docente mientras tanto.
    session_write_close();
    $sinIntentar = [
        'enviados' => 0, 'sin_correo' => 0, 'errores' => 0, 'pendientes' => count($nuevos),
        'resultados' => array_fill_keys($nuevos, 'pendiente'),
    ];
    try {
        if (!actividadVigente($pdo, $actividadId)) {
            $correo = $sinIntentar + ['aviso' => 'La actividad está dada de baja: no se enviaron correos.'];
        } else {
            $correo = enviarCorreosActividad($pdo, $actividadId, $docenteId, $nuevos, 'asignacion');
        }
    } catch (Throwable $e) {
        // Sin el mensaje: podría traer datos del estudiante.
        error_log('actividad_asignar.php: falló el envío de correos (' . get_class($e) . ')');
        $correo = $sinIntentar + ['aviso' => 'La actividad se asignó, pero no se pudieron enviar los correos. '
            . 'Revisá el estado de cada estudiante en la pantalla de métricas.'];
    }
    $correo['resumen'] = textoResumenCorreo($correo);
    $correo['resultados'] = array_map(
        fn($id, $resultado) => ['estudiante_id' => $id, 'resultado' => $resultado],
        array_keys($correo['resultados']),
        array_values($correo['resultados'])
    );
}

responderJson(200, [
    'exito'        => true,
    'mensaje'      => $mensaje,
    'asignados'    => $nuevos,
    'ya_asignados' => $yaAsignados,
    // null si no se pidió el envío o no hubo estudiantes nuevos.
    'correo'       => $correo,
]);
