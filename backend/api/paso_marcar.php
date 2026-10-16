<?php
// POST /backend/api/paso_marcar.php  (para la extensión, HU-007)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. Solo acepta marcas con la tarea en curso (empezada
// con tarea_iniciar.php y sin finalizar); si no, 403.
// Body JSON según el tipo del paso:
//   verdadero_falso:  { paso_id, opcion_id }  (elegir una opción lo deja completado)
//   opcion_unica:     { paso_id, opcion_id }  (igual: una sola opción; una lista
//                     opcion_ids con más o menos de una se rechaza con 422)
//   opcion_multiple:  { paso_id, opcion_ids: [id, ...] }  (todas las tildadas en
//                     ese momento; queda completado si hay al menos una)
// Guarda una fila por paso y estudiante en paso_completado; en opción
// múltiple, las opciones tildadas van en paso_completado_opcion.
// HU-018: si el estudiante ya vio la justificación del paso
// (justificacion_vista_en, paso_justificacion.php) la respuesta no se puede
// cambiar: 403 con respuesta_bloqueada. Vale también después de que el
// docente reabra la Tarea. La respuesta trae justificacion_disponible: si
// ahora puede pedir la justificación de ese paso.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

// Deja la fila de paso_completado del estudiante con estos valores.
// La clave única (paso_id, estudiante_id) hace que se actualice la fila
// existente en vez de insertar otra (justificacion_vista_en no se toca).
// Se usa VALUES() porque XAMPP trae
// MariaDB, que no admite el alias "AS nuevo" de MySQL 8.
function guardarPasoCompletado(PDO $pdo, int $pasoId, int $estudianteId, bool $completado, ?int $opcionId): void
{
    $guardado = $pdo->prepare(
        'INSERT INTO paso_completado (paso_id, estudiante_id, completado, opcion_elegida_id, fecha)
         VALUES (:paso_id, :estudiante_id, :completado, :opcion_elegida_id, NOW())
         ON DUPLICATE KEY UPDATE completado = VALUES(completado),
                                 opcion_elegida_id = VALUES(opcion_elegida_id),
                                 fecha = VALUES(fecha)'
    );
    $guardado->execute([
        ':paso_id'           => $pasoId,
        ':estudiante_id'     => $estudianteId,
        ':completado'        => (int) $completado,
        ':opcion_elegida_id' => $opcionId,
    ]);
}

exigirMetodo('POST');

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

$datos = leerJson();

$pasoId = filter_var($datos['paso_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($pasoId === false) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['paso_id' => 'El paso es obligatorio.']]);
}

$estudianteId = $datosToken['usuario_id'];
$actividadId  = $datosToken['actividad_id'];

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 401, 'Token inválido.');

    // Se vuelve a comprobar la asignación por si se quitó después de emitir el token.
    $estado = estadoTarea($pdo, $actividadId, $estudianteId);
    if ($estado === null) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    // Solo se marcan pasos con la tarea en curso: ni antes de "Empezar" ni
    // después de finalizarla.
    if (!tareaEnCurso($estado)) {
        responderJson(403, [
            'exito' => false,
            'error' => $estado['iniciada_en'] === null
                ? 'Tenés que empezar la tarea para marcar pasos.'
                : 'La tarea ya fue finalizada: no se pueden marcar más pasos.',
        ]);
    }

    // El paso tiene que ser de la actividad del token. Si no existe se
    // responde igual que si fuera de otra actividad.
    $consultaPaso = $pdo->prepare(
        'SELECT id, tipo FROM paso WHERE id = :paso_id AND actividad_id = :actividad_id'
    );
    $consultaPaso->execute([':paso_id' => $pasoId, ':actividad_id' => $actividadId]);
    $paso = $consultaPaso->fetch();
    if (!$paso) {
        responderJson(403, ['exito' => false, 'error' => 'El paso no pertenece a esta actividad.']);
    }

    $consultaVista = $pdo->prepare(
        'SELECT justificacion_vista_en FROM paso_completado
         WHERE paso_id = :paso_id AND estudiante_id = :estudiante_id'
    );
    $consultaVista->execute([':paso_id' => $pasoId, ':estudiante_id' => $estudianteId]);
    if ($consultaVista->fetchColumn()) {
        responderJson(403, [
            'exito' => false,
            'error' => 'Ya viste la justificación de este paso: no se puede cambiar la respuesta.',
            'respuesta_bloqueada' => true,
        ]);
    }

    $esVerdaderoFalso = isset(pasosVerdaderoFalso($pdo, $actividadId)[$pasoId]);
    $esOpcionUnica = $paso['tipo'] === 'opcion_unica';

    // Opción única: se elige exactamente una. Una lista con una sola vale
    // como opcion_id; con más (o ninguna), 422.
    if ($esOpcionUnica && array_key_exists('opcion_ids', $datos)) {
        if (!is_array($datos['opcion_ids']) || count($datos['opcion_ids']) !== 1) {
            responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['opcion_ids' => 'En este paso se elige una sola opción.']]);
        }
        $datos['opcion_id'] = $datos['opcion_ids'][array_key_first($datos['opcion_ids'])];
    }

    if ($esVerdaderoFalso || $esOpcionUnica) {
        $opcionId = filter_var($datos['opcion_id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($opcionId === false) {
            responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['opcion_id' => 'La opción es obligatoria.']]);
        }

        $consultaOpcion = $pdo->prepare(
            'SELECT id FROM paso_opcion WHERE id = :opcion_id AND paso_id = :paso_id'
        );
        $consultaOpcion->execute([':opcion_id' => $opcionId, ':paso_id' => $pasoId]);
        if (!$consultaOpcion->fetch()) {
            responderJson(422, ['exito' => false, 'error' => 'La opción no pertenece a este paso.']);
        }

        $completado = true;
        guardarPasoCompletado($pdo, $pasoId, $estudianteId, $completado, $opcionId);
        $respuesta = ['opcion_id' => $opcionId];
    } else {
        $opcionIds = $datos['opcion_ids'] ?? null;
        $sonIds = is_array($opcionIds) && array_is_list($opcionIds)
            && array_filter($opcionIds, static fn($id): bool => !is_int($id) || $id < 1) === [];
        if (!$sonIds) {
            responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => ['opcion_ids' => 'Las opciones deben enviarse como una lista de ids.']]);
        }
        $opcionIds = array_values(array_unique($opcionIds));
        sort($opcionIds);

        $consultaOpciones = $pdo->prepare('SELECT id FROM paso_opcion WHERE paso_id = :paso_id');
        $consultaOpciones->execute([':paso_id' => $pasoId]);
        $opcionesDelPaso = array_map('intval', $consultaOpciones->fetchAll(PDO::FETCH_COLUMN));
        if (array_diff($opcionIds, $opcionesDelPaso) !== []) {
            responderJson(422, ['exito' => false, 'error' => 'La opción no pertenece a este paso.']);
        }

        $completado = count($opcionIds) > 0;

        // La fila del paso y sus opciones se reemplazan juntas: si algo
        // falla no quedan opciones de un envío mezcladas con las de otro.
        $pdo->beginTransaction();
        guardarPasoCompletado($pdo, $pasoId, $estudianteId, $completado, null);

        $consultaFila = $pdo->prepare(
            'SELECT id FROM paso_completado WHERE paso_id = :paso_id AND estudiante_id = :estudiante_id'
        );
        $consultaFila->execute([':paso_id' => $pasoId, ':estudiante_id' => $estudianteId]);
        $pasoCompletadoId = (int) $consultaFila->fetchColumn();

        $borrado = $pdo->prepare('DELETE FROM paso_completado_opcion WHERE paso_completado_id = :id');
        $borrado->execute([':id' => $pasoCompletadoId]);

        $insercion = $pdo->prepare(
            'INSERT INTO paso_completado_opcion (paso_completado_id, opcion_id)
             VALUES (:paso_completado_id, :opcion_id)'
        );
        foreach ($opcionIds as $opcionId) {
            $insercion->execute([':paso_completado_id' => $pasoCompletadoId, ':opcion_id' => $opcionId]);
        }
        $pdo->commit();

        $respuesta = ['opcion_ids' => $opcionIds];
    }

    $respuesta['justificacion_disponible'] = $completado
        && isset(pasosConJustificacionVisible($pdo, $actividadId)[$pasoId]);
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('paso_marcar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, ['exito' => true, 'paso_id' => $pasoId, 'completado' => $completado] + $respuesta);
