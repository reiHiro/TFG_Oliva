<?php
// GET /backend/api/metricas_clase.php?clase=N&actividades=1,2,3  (solo docentes)
// Métricas agregadas de varias actividades de una clase del docente logueado.
// No calcula nada por su cuenta: pide a metricasDeActividad (config/metricas.php)
// las métricas de cada actividad elegida, las mismas de metricas_actividad.php,
// y las suma. Como allá, solo cuentan los estudiantes asignados.
//   resumen:
//     actividades:          cuántas se eligieron.
//     estudiantes:          estudiantes distintos asignados a al menos una.
//     asignaciones:         pares estudiante-actividad asignados.
//     tareas_finalizadas:   cuántos de esos pares tienen la Tarea finalizada.
//     estudiantes_finalizaron_todas: estudiantes que finalizaron la Tarea en
//                           todas las actividades elegidas que tienen asignadas.
//     abrieron:             estudiantes que abrieron al menos una (tienen al
//                           menos una fila en metrica o tocaron Empezar).
//     tiempo_foco_total:    suma del tiempo en foco de todos los pares.
//     tiempo_foco_promedio: tiempo_foco_total / abrieron. Es el acumulado de
//                           cada estudiante en el conjunto elegido (crece con
//                           la cantidad de actividades), no un promedio de
//                           los promedios de cada actividad.
//   por_estudiante: las sumas de cada estudiante en las actividades elegidas
//                   que tiene asignadas (total_pasos es el de esas actividades).
//   apoyos:         usos de cada apoyo sumados y cuántos estudiantes distintos
//                   lo usaron. La Tarea no se informa como apoyo.
//   pasos_dificultad: los pasos de todas las actividades elegidas, cada uno
//                   con su porcentaje de acierto tal como lo calcula su
//                   actividad y la actividad a la que pertenece.
//   temas_dificultad: una entrada por actividad elegida (un tema): sus
//                   respuestas correctas sobre sus respuestas dadas, sumando
//                   acertaron y respondieron de todos sus pasos de
//                   pasos_dificultad (el acierto es el de config/pasos.php).
//                   porcentaje_acierto en null si no tiene respuestas.
//                   De menor a mayor porcentaje; las sin respuestas, al final.
//                   HU-018: criterio 'logro' en las actividades con
//                   producción propia (porcentaje = el de su bloque "logro",
//                   la suma de los de sus pasos: cada respuesta una vez) y
//                   'acierto' en las demás (porcentaje = porcentaje_acierto).
//                   Se ordenan por "porcentaje"; la pantalla avisa cuáles
//                   son "con justificación" para no mezclar criterios.
//                   porcentaje_acierto sigue siendo el acierto crudo.
// La clase tiene que ser del docente y estar activa (403 si no). Todas las
// actividades tienen que ser de esa clase y de ese docente (403 si alguna no)
// y estar activas (422 si alguna está dada de baja).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/clase.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/metricas.php';

// Cada actividad cuesta varias consultas: se limita cuántas entran en un pedido.
const METRICAS_CLASE_ACTIVIDADES_MAX = 100;

exigirMetodo('GET');
$docenteId = exigirSesion('docente');

$opcionesId = ['options' => ['min_range' => 1]];
$claseId    = filter_var($_GET['clase'] ?? null, FILTER_VALIDATE_INT, $opcionesId);
$idsCrudo   = $_GET['actividades'] ?? null;

$errores = [];
if ($claseId === false) {
    $errores['clase'] = 'La clase es obligatoria.';
}

// Ids separados por coma. El largo del texto se limita antes de partirlo:
// ningún id ocupa más de 10 cifras.
$actividadIds = [];
if (!is_string($idsCrudo) || trim($idsCrudo) === '') {
    $errores['actividades'] = 'Elegí al menos una actividad.';
} elseif (strlen($idsCrudo) > METRICAS_CLASE_ACTIVIDADES_MAX * 11) {
    $errores['actividades'] = 'Podés elegir como máximo ' . METRICAS_CLASE_ACTIVIDADES_MAX . ' actividades.';
} else {
    foreach (explode(',', $idsCrudo) as $idCrudo) {
        $id = filter_var(trim($idCrudo), FILTER_VALIDATE_INT, $opcionesId);
        if ($id === false) {
            $errores['actividades'] = 'La lista de actividades tiene un valor inválido.';
            break;
        }
        $actividadIds[$id] = $id; // la clave elimina repetidos del pedido
    }
    if (!isset($errores['actividades']) && count($actividadIds) > METRICAS_CLASE_ACTIVIDADES_MAX) {
        $errores['actividades'] = 'Podés elegir como máximo ' . METRICAS_CLASE_ACTIVIDADES_MAX . ' actividades.';
    }
}

if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}
$actividadIds = array_values($actividadIds);

try {
    $pdo = obtenerConexion();

    // Una clase de otro docente se responde igual que una que no existe.
    $clase = claseDelDocente($pdo, $claseId, $docenteId);
    if ($clase === null || $clase['dada_de_baja_en'] !== null) {
        responderJson(403, ['exito' => false, 'error' => 'No tenés permiso para ver esta clase.']);
    }

    // Solo se generan los signos "?" según la cantidad; los valores van
    // siempre como parámetros de la consulta preparada.
    $marcadores = implode(',', array_fill(0, count($actividadIds), '?'));
    $consultaActividades = $pdo->prepare(
        "SELECT id, titulo, dada_de_baja_en FROM actividad
         WHERE docente_id = ? AND clase_id = ? AND id IN ($marcadores)
         ORDER BY titulo, id"
    );
    $consultaActividades->execute(array_merge([$docenteId, $claseId], $actividadIds));
    $actividades = $consultaActividades->fetchAll();

    // Si falta alguna (no existe, es de otro docente o de otra clase) se
    // rechaza el pedido entero, sin decir cuál.
    if (count($actividades) !== count($actividadIds)) {
        responderJson(403, ['exito' => false, 'error' => 'Alguna de las actividades elegidas no es de esta clase.']);
    }
    foreach ($actividades as $actividad) {
        if ($actividad['dada_de_baja_en'] !== null) {
            responderJson(422, [
                'exito'   => false,
                'error'   => 'Datos inválidos.',
                'errores' => ['actividades' => 'Alguna de las actividades elegidas está dada de baja.'],
            ]);
        }
    }

    $metricasPorActividad = [];
    foreach ($actividades as $actividad) {
        $metricasPorActividad[(int) $actividad['id']] = metricasDeActividad($pdo, (int) $actividad['id']);
    }
} catch (PDOException $e) {
    error_log('metricas_clase.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

$listaActividades = [];
$estudiantes      = []; // por id de estudiante
$apoyos           = []; // por tipo de apoyo
$pasosDificultad  = [];
$temasDificultad  = [];
$asignaciones    = 0;
$tareasFinalizadas = 0;

foreach ($actividades as $actividad) {
    $datosActividad = ['id' => (int) $actividad['id'], 'titulo' => $actividad['titulo']];
    $listaActividades[] = $datosActividad;
    $metricas = $metricasPorActividad[$datosActividad['id']];

    foreach ($metricas['por_estudiante'] as $fila) {
        $id = $fila['id'];
        $estudiantes[$id] ??= [
            'id'                => $id,
            'nombre'            => $fila['nombre'],
            'apellido'          => $fila['apellido'],
            'asignadas'         => 0,
            'finalizadas'       => 0,
            'abrio'             => false,
            'tiempo_foco'       => 0,
            'pasos_completados' => 0,
            'total_pasos'       => 0,
            'correctas'         => 0,
            'respondidas'       => 0,
            'apoyos'            => [],
        ];
        $finalizada = $fila['finalizada_en'] !== null;

        $estudiantes[$id]['asignadas']++;
        $estudiantes[$id]['finalizadas']       += (int) $finalizada;
        $estudiantes[$id]['abrio']              = $estudiantes[$id]['abrio'] || $fila['abrio'];
        $estudiantes[$id]['tiempo_foco']       += $fila['tiempo_foco'];
        $estudiantes[$id]['pasos_completados'] += $fila['pasos_completados'];
        $estudiantes[$id]['total_pasos']       += $fila['total_pasos'];
        $estudiantes[$id]['correctas']         += $fila['correctas'];
        $estudiantes[$id]['respondidas']       += $fila['respondidas'];
        foreach ($fila['apoyos'] as $apoyo) {
            $tipo = $apoyo['apoyo'];
            $estudiantes[$id]['apoyos'][$tipo] = ($estudiantes[$id]['apoyos'][$tipo] ?? 0) + $apoyo['veces'];
            $apoyos[$tipo]['veces'] = ($apoyos[$tipo]['veces'] ?? 0) + $apoyo['veces'];
            $apoyos[$tipo]['estudiantes'][$id] = true;
        }

        $asignaciones++;
        $tareasFinalizadas += (int) $finalizada;
    }

    $correctasTema  = 0;
    $respuestasTema = 0;
    $logroTema      = logroVacio();
    foreach ($metricas['pasos_dificultad'] as $paso) {
        $correctasTema  += $paso['acertaron'];
        $respuestasTema += $paso['respondieron'];
        if ($paso['logro'] !== null) {
            $logroTema = sumarBloquesLogro($logroTema, $paso['logro']);
        }

        $paso['actividad'] = $datosActividad;
        $pasosDificultad[] = $paso;
    }
    $porcentajeAcierto = $respuestasTema > 0 ? round(100 * $correctasTema / $respuestasTema, 1) : null;
    $logro = $metricas['produccion_propia'] ? bloqueLogro($logroTema) : null;
    $temasDificultad[] = [
        'actividad'  => $datosActividad,
        'correctas'  => $correctasTema,
        'respuestas' => $respuestasTema,
        // null si nadie respondió nada: no hay acierto que calcular.
        'porcentaje_acierto' => $porcentajeAcierto,
        'produccion_propia'  => $metricas['produccion_propia'],
        'criterio'   => $logro === null ? 'acierto' : 'logro',
        'logro'      => $logro,
        // El del criterio de la actividad; null si no hay datos.
        'porcentaje' => $logro === null ? $porcentajeAcierto : $logro['porcentaje'],
    ];
}

// Lista [['apoyo' => tipo, 'veces' => n, ...]] ordenada como en
// metricas_actividad.php: más usados primero y, si empatan, por tipo.
function listaApoyos(array $filas): array
{
    usort($filas, static fn(array $a, array $b): int => [$b['veces'], $a['apoyo']] <=> [$a['veces'], $b['apoyo']]);
    return $filas;
}

$porEstudiante     = [];
$abrieron          = 0;
$finalizaronTodas  = 0;
$tiempoFocoTotal   = 0;
foreach ($estudiantes as $estudiante) {
    $abrieron         += (int) $estudiante['abrio'];
    $finalizaronTodas += (int) ($estudiante['finalizadas'] === $estudiante['asignadas']);
    $tiempoFocoTotal  += $estudiante['tiempo_foco'];

    $apoyosEstudiante = [];
    foreach ($estudiante['apoyos'] as $tipo => $veces) {
        $apoyosEstudiante[] = ['apoyo' => $tipo, 'veces' => $veces];
    }
    $estudiante['apoyos'] = listaApoyos($apoyosEstudiante);
    $porEstudiante[] = $estudiante;
}
usort($porEstudiante, static fn(array $a, array $b): int =>
    [$a['apellido'], $a['nombre'], $a['id']] <=> [$b['apellido'], $b['nombre'], $b['id']]);

$apoyosTotales = [];
foreach ($apoyos as $tipo => $apoyo) {
    $apoyosTotales[] = ['apoyo' => $tipo, 'veces' => $apoyo['veces'], 'estudiantes' => count($apoyo['estudiantes'])];
}

// El mismo orden que dentro de una actividad (compararDificultad); si
// empatan pasos de actividades distintas, por título de la actividad.
usort($pasosDificultad, static fn(array $a, array $b): int =>
    compararDificultad($a, $b) ?: [$a['actividad']['titulo'], $a['actividad']['id']] <=> [$b['actividad']['titulo'], $b['actividad']['id']]);

// De menor a mayor porcentaje (el del criterio de cada tema); los temas sin
// datos van al final y, si empatan, por título.
usort($temasDificultad, static function (array $a, array $b): int {
    [$claveA, $claveB] = [$a['porcentaje'], $b['porcentaje']];
    if (($claveA === null) !== ($claveB === null)) {
        return $claveA === null ? 1 : -1;
    }
    return [$claveA, $a['actividad']['titulo'], $a['actividad']['id']]
        <=> [$claveB, $b['actividad']['titulo'], $b['actividad']['id']];
});

responderJson(200, [
    'exito'       => true,
    'clase'      => ['id' => $clase['id'], 'nombre' => $clase['nombre']],
    'actividades' => $listaActividades,
    'resumen'     => [
        'actividades'                   => count($listaActividades),
        'estudiantes'                   => count($porEstudiante),
        'asignaciones'                  => $asignaciones,
        'tareas_finalizadas'            => $tareasFinalizadas,
        'estudiantes_finalizaron_todas' => $finalizaronTodas,
        'abrieron'                      => $abrieron,
        'tiempo_foco_total'             => $tiempoFocoTotal,
        'tiempo_foco_promedio'          => $abrieron > 0 ? (int) round($tiempoFocoTotal / $abrieron) : 0,
    ],
    'por_estudiante'   => $porEstudiante,
    'apoyos'           => listaApoyos($apoyosTotales),
    // Ordenados de menor a mayor porcentaje (el más difícil primero).
    'pasos_dificultad' => $pasosDificultad,
    'temas_dificultad' => $temasDificultad,
]);
