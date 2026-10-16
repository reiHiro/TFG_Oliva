<?php
// GET /backend/api/metricas_actividad.php?id=N  (solo docentes, HU-009)
// Métricas de una actividad del docente logueado:
//   resumen:        asignados, cuántos la abrieron (tienen al menos una fila
//                   en metrica o tocaron Empezar), tiempo en foco promedio entre los que la
//                   abrieron y porcentaje de pasos completados
//                   (completados / (asignados x total de pasos)).
//                   correctas_totales: respuestas correctas sobre respuestas
//                   dadas en los pasos de opción múltiple, entre los asignados.
//   por_estudiante: cada estudiante asignado, aunque no tenga datos. Incluye
//                   qué opciones eligió en cada paso de opción múltiple y si
//                   acertó, y finalizada_en de su Tarea (NULL si no la finalizó).
//                   HU-016: finalizada_motivo ('estudiante', 'salida' o null)
//                   y reaperturas (veces que el docente le reabrió la Tarea).
//                   HU-019: correo = último intento de mandarle el enlace
//                   ({resultado: 'enviado'|'sin_correo'|'error', fecha}) o
//                   null si nunca se intentó. Nunca la dirección.
//   actividad.vigente: false si la actividad o su clase están dadas de baja
//                   (no se puede reabrir la Tarea de nadie).
//   actividad.produccion_propia (HU-018): si es true, resumen, por_estudiante
//                   y cada paso de pasos_dificultad traen "logro": un paso
//                   está logrado solo con la opción correcta y la marca del
//                   docente "Justificación válida: Sí" (config/metricas.php,
//                   estadoLogro). logrados, no_logrados (con sus motivos),
//                   pendientes de revisión (fuera del total), porcentaje =
//                   logrados / (logrados + no logrados), dificultad = 100 -
//                   porcentaje, y aciertos_opcion (el acierto crudo). Los
//                   pasos se ordenan por ese porcentaje. Cada respuesta de
//                   por_estudiante trae su estado_logro. Sin producción
//                   propia "logro" es null y nada cambia.
//   pasos_dificultad (HU-010): cada paso con cuántos lo respondieron, cuántos
//                   acertaron y el porcentaje de acierto entre los que lo
//                   respondieron.
// Los pasos de verdadero o falso se guardan como opción múltiple
// (config/pasos.php): cuentan igual en todo lo anterior y solo cambia el
// tipo que se informa en pasos_dificultad.
// Acierto: el conjunto de opciones elegidas es exactamente el de las
// correctas (esAcierto en config/pasos.php). En verdadero o falso equivale
// a haber elegido la correcta.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/metricas.php';
require_once __DIR__ . '/../config/vigencia.php';
require_once __DIR__ . '/../config/correo_envio.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$actividadId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, ['exito' => false, 'error' => 'La actividad es obligatoria.']);
}

try {
    $pdo = obtenerConexion();

    $consultaActividad = $pdo->prepare(
        'SELECT id, titulo FROM actividad WHERE id = :id AND docente_id = :docente_id'
    );
    $consultaActividad->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    $actividad = $consultaActividad->fetch();
    if (!$actividad) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para ver esta actividad.']);
    }

    $metricas = metricasDeActividad($pdo, $actividadId);
    $vigente  = actividadVigente($pdo, $actividadId);

    $correos = ultimosCorreos($pdo, $actividadId);
    foreach ($metricas['por_estudiante'] as &$estudiante) {
        $estudiante['correo'] = $correos[$estudiante['id']] ?? null;
    }
    unset($estudiante);
} catch (PDOException $e) {
    error_log('metricas_actividad.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'     => true,
    'actividad' => [
        'id'                => (int) $actividad['id'],
        'titulo'            => $actividad['titulo'],
        'vigente'           => $vigente,
        'produccion_propia' => $metricas['produccion_propia'],
    ],
    'resumen'   => $metricas['resumen'],
    'por_estudiante'   => $metricas['por_estudiante'],
    // Ordenados de menor a mayor porcentaje (el más difícil primero).
    'pasos_dificultad' => $metricas['pasos_dificultad'],
]);
