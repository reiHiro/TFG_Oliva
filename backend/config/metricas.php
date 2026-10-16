<?php
// Cálculo de las métricas de una actividad (HU-009 / HU-010), compartido por
// metricas_actividad.php (una actividad) y metricas_clase.php (varias
// actividades de una clase, sumadas), para que las dos pantallas midan
// exactamente lo mismo.
// Requiere pasos.php cargado antes.

// Devuelve resumen, por_estudiante y pasos_dificultad de la actividad, con el
// significado que documenta metricas_actividad.php. No comprueba de quién es
// la actividad: eso lo hace antes quien llama. Deja pasar la PDOException.
// HU-018: produccion_propia dice si la actividad pide producción propia. Si
// la pide, cada paso respondido por un estudiante tiene un estado de logro
// (estadoLogro) y pasos_dificultad, por_estudiante y resumen traen un bloque
// "logro" (bloqueLogro); el orden de dificultad usa su porcentaje. Sin
// producción propia "logro" vale null y todo se calcula como antes, por
// acierto de opción. El acierto de opción crudo se sigue informando igual
// (acertaron, porcentaje_acierto, correctas, correctas_totales) y además
// dentro de "logro" como aciertos_opcion.
function metricasDeActividad(PDO $pdo, int $actividadId): array
{
    $consultaPasos = $pdo->prepare(
        'SELECT id, orden, tipo FROM paso WHERE actividad_id = :id ORDER BY orden, id'
    );
    $consultaPasos->execute([':id' => $actividadId]);
    $filasPasos = $consultaPasos->fetchAll();
    $totalPasos = count($filasPasos);
    // Pasos con opciones: opción múltiple (incluye verdadero o falso) y
    // opción única. Todos se miden por acierto.
    $pasosOpcionMultiple = array_values(array_filter(
        $filasPasos,
        static fn(array $paso): bool => in_array($paso['tipo'], ['opcion_multiple', 'opcion_unica'], true)
    ));

    // Respuestas a pasos de opción múltiple y verdadero o falso, solo de
    // estudiantes asignados (igual que el resto del panel), con el acierto ya
    // calculado. Para cada paso se cuentan además cuántos respondieron y
    // cuántos acertaron (pasos_dificultad).
    $correctasPorPaso = opcionesCorrectas($pdo, $actividadId);
    $respuestasPorEstudiante = respuestasPorEstudiante($pdo, $actividadId);
    $conteoPorPaso = [];
    foreach ($respuestasPorEstudiante as &$respuestasDelEstudiante) {
        foreach ($respuestasDelEstudiante as $pasoId => &$respuesta) {
            $respuesta['acerto'] = esAcierto($respuesta['ids'], $correctasPorPaso[$pasoId] ?? []);
            $conteoPorPaso[$pasoId]['respondieron'] = ($conteoPorPaso[$pasoId]['respondieron'] ?? 0) + 1;
            $conteoPorPaso[$pasoId]['acertaron'] = ($conteoPorPaso[$pasoId]['acertaron'] ?? 0) + (int) $respuesta['acerto'];
        }
        unset($respuesta);
    }
    unset($respuestasDelEstudiante);

    $consultaProduccion = $pdo->prepare('SELECT produccion_propia, produccion_modo FROM actividad WHERE id = :id');
    $consultaProduccion->execute([':id' => $actividadId]);
    $filaProduccion = $consultaProduccion->fetch();
    $produccionPropia = (bool) $filaProduccion['produccion_propia'];
    $produccionModo = $filaProduccion['produccion_modo'];

    // HU-018: estado de logro de cada respuesta, sumado por paso, por
    // estudiante y para toda la actividad. Cada respuesta (un estudiante en
    // un paso, si eligió alguna opción) se cuenta una sola vez en cada suma.
    $logroPorPaso = [];
    $logroPorEstudiante = [];
    $logroTotal = logroVacio();
    if ($produccionPropia) {
        $producciones = produccionesDeLaActividad($pdo, $actividadId, $produccionModo);
        foreach ($respuestasPorEstudiante as $estudianteId => &$respuestasDelEstudiante) {
            foreach ($respuestasDelEstudiante as $pasoId => &$respuesta) {
                $respuesta['estado_logro'] = estadoLogro($respuesta['acerto'], $producciones[$estudianteId][$pasoId] ?? null);
                $logroPorPaso[$pasoId] ??= logroVacio();
                $logroPorEstudiante[$estudianteId] ??= logroVacio();
                sumarLogro($logroPorPaso[$pasoId], $respuesta['estado_logro'], $respuesta['acerto']);
                sumarLogro($logroPorEstudiante[$estudianteId], $respuesta['estado_logro'], $respuesta['acerto']);
                sumarLogro($logroTotal, $respuesta['estado_logro'], $respuesta['acerto']);
            }
            unset($respuesta);
        }
        unset($respuestasDelEstudiante);
    }

    // Una fila por estudiante asignado. Las subconsultas se correlacionan con
    // ae.actividad_id para no repetir el parámetro :id (con prepares nativos
    // MySQL no admite el mismo marcador con nombre dos veces).
    $consultaEstudiantes = $pdo->prepare(
        'SELECT u.id, u.nombre, u.apellido, ae.iniciada_en, ae.finalizada_en, ae.finalizada_motivo,
                (SELECT COUNT(*) FROM tarea_reapertura tr
                  WHERE tr.actividad_id = ae.actividad_id AND tr.estudiante_id = u.id) AS reaperturas,
                (SELECT COUNT(*) FROM metrica m
                  WHERE m.actividad_id = ae.actividad_id AND m.estudiante_id = u.id) AS filas_metrica,
                (SELECT COALESCE(SUM(m.tiempo_foco), 0) FROM metrica m
                  WHERE m.actividad_id = ae.actividad_id AND m.estudiante_id = u.id) AS tiempo_foco,
                (SELECT COUNT(*) FROM paso_completado pc
                   JOIN paso p ON p.id = pc.paso_id
                  WHERE p.actividad_id = ae.actividad_id AND pc.estudiante_id = u.id
                    AND pc.completado = 1) AS pasos_completados
         FROM actividad_estudiante ae
         JOIN usuario u ON u.id = ae.estudiante_id
         WHERE ae.actividad_id = :id
         ORDER BY u.apellido, u.nombre, u.id'
    );
    $consultaEstudiantes->execute([':id' => $actividadId]);
    $filasEstudiantes = $consultaEstudiantes->fetchAll();

    // Usos de cada apoyo por estudiante (solo filas con apoyo_id): glosario,
    // lectura en voz alta y modo lectura. La Tarea no es un apoyo y no se
    // registra en metrica.
    $consultaApoyos = $pdo->prepare(
        'SELECT m.estudiante_id, ap.tipo_apoyo, COUNT(*) AS veces
         FROM metrica m
         JOIN apoyo ap ON ap.id = m.apoyo_id
         WHERE m.actividad_id = :id
         GROUP BY m.estudiante_id, ap.id, ap.tipo_apoyo
         ORDER BY veces DESC, ap.tipo_apoyo'
    );
    $consultaApoyos->execute([':id' => $actividadId]);
    $apoyosPorEstudiante = [];
    foreach ($consultaApoyos->fetchAll() as $fila) {
        $apoyosPorEstudiante[(int) $fila['estudiante_id']][] = [
            'apoyo' => $fila['tipo_apoyo'],
            'veces' => (int) $fila['veces'],
        ];
    }

    // Pasos con más dificultad (HU-010): por cada paso, cuántos respondieron
    // y cuántos acertaron ($conteoPorPaso). El JOIN con actividad_estudiante
    // deja fuera los pasos si no hay asignados (no hay porcentaje que calcular).
    $consultaDificultad = $pdo->prepare(
        'SELECT p.id, p.descripcion, p.orden, p.tipo,
                COUNT(ae.estudiante_id) AS asignados
         FROM paso p
         JOIN actividad_estudiante ae ON ae.actividad_id = p.actividad_id
         WHERE p.actividad_id = :id
         GROUP BY p.id, p.descripcion, p.orden, p.tipo'
    );
    $consultaDificultad->execute([':id' => $actividadId]);
    $verdaderoFalso = pasosVerdaderoFalso($pdo, $actividadId);
    $pasosDificultad = array_map(static function (array $fila) use ($verdaderoFalso, $conteoPorPaso, $produccionPropia, $logroPorPaso): array {
        $id = (int) $fila['id'];
        $respondieron = $conteoPorPaso[$id]['respondieron'] ?? 0;
        $acertaron    = $conteoPorPaso[$id]['acertaron'] ?? 0;
        return [
            'id'           => $id,
            'descripcion'  => $fila['descripcion'],
            'orden'        => (int) $fila['orden'],
            'tipo'         => tipoInformado($fila, $verdaderoFalso),
            'asignados'    => (int) $fila['asignados'],
            'respondieron' => $respondieron,
            'acertaron'    => $acertaron,
            // null si nadie lo respondió: no hay acierto que calcular.
            'porcentaje_acierto' => $respondieron > 0 ? round(100 * $acertaron / $respondieron, 1) : null,
            // HU-018: con producción propia; con eso se ordena la dificultad.
            'logro' => $produccionPropia ? bloqueLogro($logroPorPaso[$id] ?? logroVacio()) : null,
        ];
    }, $consultaDificultad->fetchAll());

    usort($pasosDificultad, 'compararDificultad');

    $porEstudiante    = [];
    $abrieron         = 0;
    $focoAbrieron     = 0;
    $pasosCompletados = 0;
    $correctasTotales = 0;
    $respuestasTotales = 0;

    foreach ($filasEstudiantes as $fila) {
        $id         = (int) $fila['id'];
        // Abrió: tiene alguna fila en metrica (tiempo en foco o uso de un
        // apoyo) o tocó Empezar en la Tarea.
        $abrio      = (int) $fila['filas_metrica'] > 0 || $fila['iniciada_en'] !== null;
        $tiempoFoco = (int) $fila['tiempo_foco'];
        $completos  = (int) $fila['pasos_completados'];

        if ($abrio) {
            $abrieron++;
            $focoAbrieron += $tiempoFoco;
        }
        $pasosCompletados += $completos;

        // Una entrada por paso de opción múltiple o verdadero o falso; opciones
        // vacías y correcta en null si todavía no lo respondió.
        $respuestas = [];
        $correctas  = 0;
        foreach ($pasosOpcionMultiple as $paso) {
            $respuesta = $respuestasPorEstudiante[$id][(int) $paso['id']] ?? null;
            $respuestas[] = [
                'paso_id'               => (int) $paso['id'],
                'orden'                 => (int) $paso['orden'],
                'opciones_elegidas_ids' => $respuesta['ids'] ?? [],
                'opciones_elegidas'     => $respuesta['textos'] ?? [],
                'correcta'              => $respuesta['acerto'] ?? null,
                // HU-018: null si no lo respondió o si no hay producción propia.
                'estado_logro'          => $respuesta['estado_logro'] ?? null,
            ];
            if ($respuesta !== null) {
                $correctas += (int) $respuesta['acerto'];
            }
        }
        $respondidas = count($respuestasPorEstudiante[$id] ?? []);
        $correctasTotales  += $correctas;
        $respuestasTotales += $respondidas;

        $porEstudiante[] = [
            'id'                => $id,
            'nombre'            => $fila['nombre'],
            'apellido'          => $fila['apellido'],
            'finalizada_en'     => $fila['finalizada_en'],
            // HU-016: por qué terminó ('estudiante', 'salida' o null) y
            // cuántas veces el docente le reabrió la Tarea.
            'finalizada_motivo' => $fila['finalizada_motivo'],
            'reaperturas'       => (int) $fila['reaperturas'],
            'abrio'            => $abrio,
            'tiempo_foco'       => $tiempoFoco,
            'pasos_completados' => $completos,
            'total_pasos'       => $totalPasos,
            'apoyos'            => $apoyosPorEstudiante[$id] ?? [],
            'respuestas'        => $respuestas,
            'correctas'         => $correctas,
            'respondidas'       => $respondidas,
            'logro'             => $produccionPropia ? bloqueLogro($logroPorEstudiante[$id] ?? logroVacio()) : null,
        ];
    }

    $asignados = count($porEstudiante);
    $pasosPosibles = $asignados * $totalPasos;

    return [
        'produccion_propia' => $produccionPropia,
        'resumen' => [
            'asignados'            => $asignados,
            'abrieron'             => $abrieron,
            'tiempo_foco_promedio' => $abrieron > 0 ? (int) round($focoAbrieron / $abrieron) : 0,
            'total_pasos'          => $totalPasos,
            // null cuando no hay pasos o no hay asignados: no hay porcentaje que calcular.
            'porcentaje_pasos'     => $pasosPosibles > 0 ? round(100 * $pasosCompletados / $pasosPosibles, 1) : null,
            // Pasos de opción múltiple y verdadero o falso acertados sobre respuestas dadas;
            // porcentaje en null si todavía no hay respuestas.
            'correctas_totales'    => [
                'correctas'  => $correctasTotales,
                'respuestas' => $respuestasTotales,
                'porcentaje' => $respuestasTotales > 0 ? round(100 * $correctasTotales / $respuestasTotales, 1) : null,
            ],
            // HU-018: la misma lógica de logro para toda la actividad.
            'logro' => $produccionPropia ? bloqueLogro($logroTotal) : null,
        ],
        'por_estudiante'   => $porEstudiante,
        // Ordenados de menor a mayor porcentaje (el más difícil primero).
        'pasos_dificultad' => $pasosDificultad,
    ];
}

// ---------------------------------------------------------------------------
// HU-018: logro en actividades con producción propia.
// Un paso está "logrado" solo si la opción es correcta Y el docente marcó la
// justificación como válida. Estados de una respuesta (un estudiante que
// eligió alguna opción en un paso):
//   opcion_incorrecta        no logrado (no hace falta revisar nada)
//   sin_justificacion        no logrado: opción correcta, pero no guardó lo
//                            que pide la modalidad (produccionCuenta)
//   justificacion_no_valida  no logrado: el docente marcó "No"
//   pendiente                opción correcta con producción, sin revisar: no
//                            cuenta como logrado ni como no logrado
//   logrado                  opción correcta y el docente marcó "Sí"
// Se calcula con lo que ya está guardado (paso_produccion): no hay columnas
// nuevas. Un paso que no respondió no tiene estado (igual que el acierto).

const MOTIVOS_NO_LOGRADO = ['opcion_incorrecta', 'sin_justificacion', 'justificacion_no_valida'];

// $produccion: la del estudiante en ese paso (con justificacion_valida true,
// false o null), o null si no guardó nada.
function estadoLogro(bool $acerto, ?array $produccion): string
{
    if (!$acerto) {
        return 'opcion_incorrecta';
    }
    if ($produccion === null) {
        return 'sin_justificacion';
    }
    return match ($produccion['justificacion_valida']) {
        true    => 'logrado',
        false   => 'justificacion_no_valida',
        default => 'pendiente',
    };
}

// Si la producción guardada tiene lo que pide la modalidad de la actividad:
//   cita_texto:    una cita de texto
//   texto_libre:   un texto (explicacion)
//   momento_video: un momento citado o un texto
// Si no, el paso cuenta como "sin justificación".
function produccionCuenta(array $produccion, string $modo): bool
{
    return match ($modo) {
        'cita_texto'  => $produccion['tipo_cita'] === 'texto' && $produccion['cita_texto'] !== null,
        'texto_libre' => $produccion['explicacion'] !== null,
        default       => $produccion['tipo_cita'] === 'tiempo' || $produccion['explicacion'] !== null,
    };
}

// Producciones de los estudiantes asignados que tienen lo que pide la
// modalidad (produccionCuenta):
// [estudiante_id => [paso_id => ['justificacion_valida' => ...]]].
function produccionesDeLaActividad(PDO $pdo, int $actividadId, string $modo): array
{
    $consulta = $pdo->prepare(
        'SELECT pp.estudiante_id, pp.paso_id, pp.tipo_cita, pp.cita_texto, pp.explicacion,
                pp.justificacion_valida
         FROM paso_produccion pp
         JOIN paso p ON p.id = pp.paso_id
         JOIN actividad_estudiante ae
              ON ae.actividad_id = p.actividad_id AND ae.estudiante_id = pp.estudiante_id
         WHERE p.actividad_id = :id'
    );
    $consulta->execute([':id' => $actividadId]);
    $producciones = [];
    foreach ($consulta->fetchAll() as $fila) {
        if (!produccionCuenta($fila, $modo)) {
            continue;
        }
        $producciones[(int) $fila['estudiante_id']][(int) $fila['paso_id']] = [
            'justificacion_valida' => $fila['justificacion_valida'] === null ? null : (bool) $fila['justificacion_valida'],
        ];
    }
    return $producciones;
}

// Contadores en cero de un bloque de logro.
function logroVacio(): array
{
    return [
        'respondidas'     => 0,
        'aciertos_opcion' => 0,
        'logrados'        => 0,
        'no_logrados'     => 0,
        'pendientes'      => 0,
        'motivos'         => array_fill_keys(MOTIVOS_NO_LOGRADO, 0),
    ];
}

function sumarLogro(array &$logro, string $estado, bool $acerto): void
{
    $logro['respondidas']++;
    $logro['aciertos_opcion'] += (int) $acerto;
    if ($estado === 'logrado') {
        $logro['logrados']++;
    } elseif ($estado === 'pendiente') {
        $logro['pendientes']++;
    } else {
        $logro['no_logrados']++;
        $logro['motivos'][$estado]++;
    }
}

// Suma dos bloques de logro (metricas_clase.php, por tema): son conteos de
// respuestas distintas, así que se suman sin contar nada dos veces.
function sumarBloquesLogro(array $a, array $b): array
{
    $suma = logroVacio();
    foreach (['respondidas', 'aciertos_opcion', 'logrados', 'no_logrados', 'pendientes'] as $clave) {
        $suma[$clave] = $a[$clave] + $b[$clave];
    }
    foreach (MOTIVOS_NO_LOGRADO as $motivo) {
        $suma['motivos'][$motivo] = $a['motivos'][$motivo] + $b['motivos'][$motivo];
    }
    return $suma;
}

// El bloque con sus porcentajes: logro = logrados / (logrados + no logrados).
// Los pendientes no entran en el total ni cuentan como fallidos. Sin ninguna
// respuesta resuelta, porcentaje y dificultad van en null ("sin datos"),
// sin dividir por cero. dificultad = 100 - logro.
function bloqueLogro(array $logro): array
{
    $resueltos = $logro['logrados'] + $logro['no_logrados'];
    $porcentaje = $resueltos > 0 ? round(100 * $logro['logrados'] / $resueltos, 1) : null;
    return $logro + [
        'resueltos'  => $resueltos,
        'porcentaje' => $porcentaje,
        'dificultad' => $porcentaje === null ? null : round(100 - $porcentaje, 1),
    ];
}

// Porcentaje con el que se ordena la dificultad de un paso: el de logro si la
// actividad tiene producción propia, el de acierto si no.
function porcentajeDificultad(array $paso): ?float
{
    return isset($paso['logro']) ? $paso['logro']['porcentaje'] : $paso['porcentaje_acierto'];
}

// Orden de pasos_dificultad: por el porcentaje (porcentajeDificultad), de
// menor a mayor y, si empatan, por orden. Los que no tienen porcentaje van
// al final: todavía no hay datos para saber si son difíciles.
function compararDificultad(array $a, array $b): int
{
    [$claveA, $claveB] = [porcentajeDificultad($a), porcentajeDificultad($b)];
    if (($claveA === null) !== ($claveB === null)) {
        return $claveA === null ? 1 : -1;
    }
    return [$claveA, $a['orden']] <=> [$claveB, $b['orden']];
}
