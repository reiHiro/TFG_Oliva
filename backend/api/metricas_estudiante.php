<?php
// GET /backend/api/metricas_estudiante.php?actividad=N&estudiante=M  (solo docentes, HU-009)
// Detalle de un estudiante en una actividad del docente logueado: los pasos
// con su estado (y, en los de opción múltiple, las opciones elegidas y si acertó),
// el tiempo en foco total y los apoyos usados con sus cantidades. Los de
// verdadero o falso llegan con tipo "verdadero_falso" y el mismo formato que
// los de opción múltiple.
// HU-018: cada paso trae además la justificacion del docente (o null) y, si
// la actividad tiene producción propia, "produccion": la cita y la
// explicación de ese estudiante (o null si no cargó nada), con la marca del
// docente justificacion_valida (true, false o null = sin revisar,
// produccion_marcar.php). Son los textos tal cual, sin comparación ni
// indicadores: el docente evalúa leyendo. Con producción propia cada paso
// respondido trae también estado_logro (config/metricas.php, estadoLogro):
// 'logrado', 'opcion_incorrecta', 'sin_justificacion' (según produccion_modo:
// produccionCuenta en config/metricas.php),
// 'justificacion_no_valida' o 'pendiente'; null si no lo respondió.
// actividad: produccion_propia, produccion_modo y recurso_url.
// Solo el docente dueño de la actividad (403 si no lo es).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/produccion.php';
require_once __DIR__ . '/../config/metricas.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$opcionesId   = ['options' => ['min_range' => 1]];
$actividadId  = filter_var($_GET['actividad'] ?? null, FILTER_VALIDATE_INT, $opcionesId);
$estudianteId = filter_var($_GET['estudiante'] ?? null, FILTER_VALIDATE_INT, $opcionesId);

$errores = [];
if ($actividadId === false) {
    $errores['actividad'] = 'La actividad es obligatoria.';
}
if ($estudianteId === false) {
    $errores['estudiante'] = 'El estudiante es obligatorio.';
}
if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}

try {
    $pdo = obtenerConexion();

    $consultaActividad = $pdo->prepare(
        'SELECT id, recurso_url, produccion_propia, produccion_modo
         FROM actividad WHERE id = :id AND docente_id = :docente_id'
    );
    $consultaActividad->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    $actividad = $consultaActividad->fetch();
    if (!$actividad) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para ver esta actividad.']);
    }

    $consultaEstudiante = $pdo->prepare(
        'SELECT u.id, u.nombre, u.apellido, ae.iniciada_en
         FROM actividad_estudiante ae
         JOIN usuario u ON u.id = ae.estudiante_id
         WHERE ae.actividad_id = :actividad_id AND ae.estudiante_id = :estudiante_id'
    );
    $consultaEstudiante->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $estudiante = $consultaEstudiante->fetch();
    if (!$estudiante) {
        responderJson(404, ['exito' => false, 'error' => 'El estudiante no tiene asignada esta actividad.']);
    }

    // Sin fila en paso_completado el LEFT JOIN deja completado en NULL: pendiente.
    $consultaPasos = $pdo->prepare(
        'SELECT p.id, p.descripcion, p.orden, p.tipo, p.justificacion, pc.completado
         FROM paso p
         LEFT JOIN paso_completado pc
                ON pc.paso_id = p.id AND pc.estudiante_id = :estudiante_id
         WHERE p.actividad_id = :actividad_id
         ORDER BY p.orden, p.id'
    );
    $consultaPasos->execute([':estudiante_id' => $estudianteId, ':actividad_id' => $actividadId]);
    $verdaderoFalso = pasosVerdaderoFalso($pdo, $actividadId);
    // En los pasos de opción múltiple y verdadero o falso: las opciones que
    // eligió y si acertó (el conjunto elegido es exactamente el de las correctas).
    $correctasPorPaso = opcionesCorrectas($pdo, $actividadId);
    $respuestas = respuestasPorEstudiante($pdo, $actividadId, $estudianteId)[$estudianteId] ?? [];
    $conProduccion = (bool) $actividad['produccion_propia'];
    $produccionModo = $actividad['produccion_modo'];
    $producciones = $conProduccion ? produccionesDelEstudiante($pdo, $actividadId, $estudianteId) : [];
    $pasos = array_map(function (array $fila) use ($verdaderoFalso, $correctasPorPaso, $respuestas, $conProduccion, $producciones, $produccionModo) {
        $paso = [
            'id'          => (int) $fila['id'],
            'descripcion' => $fila['descripcion'],
            'orden'       => (int) $fila['orden'],
            'tipo'        => tipoInformado($fila, $verdaderoFalso),
            'completado'  => (bool) $fila['completado'],
        ];
        $respuesta = $respuestas[$paso['id']] ?? null;
        $paso['opciones_elegidas'] = $respuesta['textos'] ?? [];
        $paso['correcta'] = $respuesta === null
            ? null
            : esAcierto($respuesta['ids'], $correctasPorPaso[$paso['id']] ?? []);
        $paso['justificacion'] = $fila['justificacion'];
        if ($conProduccion) {
            $paso['produccion'] = $producciones[$paso['id']] ?? null;
            $cuenta = $paso['produccion'] !== null
                && produccionCuenta($paso['produccion'], $produccionModo);
            $paso['estado_logro'] = $paso['correcta'] === null
                ? null
                : estadoLogro($paso['correcta'], $cuenta ? $paso['produccion'] : null);
        }
        return $paso;
    }, $consultaPasos->fetchAll());

    $consultaFoco = $pdo->prepare(
        'SELECT COUNT(*) AS filas, COALESCE(SUM(tiempo_foco), 0) AS tiempo_foco
         FROM metrica
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id'
    );
    $consultaFoco->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $foco = $consultaFoco->fetch();

    // Igual que en metricas_actividad.php: solo los tres apoyos (la Tarea no
    // es un apoyo y no se registra en metrica).
    $consultaApoyos = $pdo->prepare(
        'SELECT ap.tipo_apoyo, COUNT(*) AS veces
         FROM metrica m
         JOIN apoyo ap ON ap.id = m.apoyo_id
         WHERE m.actividad_id = :actividad_id AND m.estudiante_id = :estudiante_id
         GROUP BY ap.id, ap.tipo_apoyo
         ORDER BY veces DESC, ap.tipo_apoyo'
    );
    $consultaApoyos->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $apoyos = array_map(fn (array $fila) => [
        'apoyo' => $fila['tipo_apoyo'],
        'veces' => (int) $fila['veces'],
    ], $consultaApoyos->fetchAll());
} catch (PDOException $e) {
    error_log('metricas_estudiante.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'      => true,
    'actividad'  => [
        'id'                  => (int) $actividad['id'],
        'recurso_url'         => $actividad['recurso_url'],
        'produccion_propia'   => (bool) $actividad['produccion_propia'],
        'produccion_modo' => $actividad['produccion_modo'],
    ],
    'estudiante' => [
        'id'       => (int) $estudiante['id'],
        'nombre'   => $estudiante['nombre'],
        'apellido' => $estudiante['apellido'],
    ],
    // Igual que en metricas_actividad.php: alguna fila en metrica o tocó Empezar.
    'abrio'       => (int) $foco['filas'] > 0 || $estudiante['iniciada_en'] !== null,
    'tiempo_foco' => (int) $foco['tiempo_foco'],
    'pasos'       => $pasos,
    'apoyos'      => $apoyos,
]);
