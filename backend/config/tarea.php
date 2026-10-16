<?php
// Estado de la Tarea (HU-007) de un estudiante en una actividad, guardado en
// actividad_estudiante.iniciada_en / finalizada_en:
//   sin empezar: iniciada_en NULL
//   en curso:    iniciada_en con valor, finalizada_en NULL
//   finalizada:  las dos con valor
//
// Los segundos se calculan en MySQL con su propio NOW(), para que el
// cronómetro de la extensión no dependa de que el reloj o la zona horaria
// de la computadora del estudiante coincidan con los del servidor.
//
// HU-016: el docente puede reabrir una Tarea finalizada (tarea_reabrir.php).
// Al reabrir, lo trabajado hasta ahí pasa a segundos_acumulados e
// iniciada_en queda en el momento de la reapertura, así que el tiempo es
// siempre "acumulado + tramo actual" y el rato que estuvo finalizada no se
// cuenta. Mientras está en curso sigue sin poder pausarse.

// Motivos de finalización que acepta tarea_finalizar.php (los mismos del
// ENUM finalizada_motivo): el botón Finalizar o la salida de la pestaña.
const MOTIVOS_FINALIZACION = ['estudiante', 'salida'];

// Devuelve el estado, o null si la actividad no está asignada al estudiante.
function estadoTarea(PDO $pdo, int $actividadId, int $estudianteId): ?array
{
    $consulta = $pdo->prepare(
        'SELECT iniciada_en, finalizada_en, finalizada_motivo,
                segundos_acumulados + TIMESTAMPDIFF(SECOND, iniciada_en, NOW()) AS segundos_desde_inicio,
                segundos_acumulados + TIMESTAMPDIFF(SECOND, iniciada_en, finalizada_en) AS duracion_segundos
         FROM actividad_estudiante
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id'
    );
    $consulta->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);
    $fila = $consulta->fetch();

    if (!$fila) {
        return null;
    }

    // segundos_desde_inicio solo sirve mientras está en curso; duracion_segundos, al finalizar.
    // Los dos incluyen lo trabajado antes de una reapertura.
    $enCurso = $fila['iniciada_en'] !== null && $fila['finalizada_en'] === null;
    return [
        'iniciada_en'           => $fila['iniciada_en'],
        'finalizada_en'         => $fila['finalizada_en'],
        'finalizada_motivo'     => $fila['finalizada_motivo'],
        'segundos_desde_inicio' => $enCurso ? max(0, (int) $fila['segundos_desde_inicio']) : null,
        'duracion_segundos'     => $fila['finalizada_en'] === null ? null : (int) $fila['duracion_segundos'],
    ];
}

function tareaEnCurso(array $estado): bool
{
    return $estado['iniciada_en'] !== null && $estado['finalizada_en'] === null;
}

// Nombre del estado para quien solo necesita saber en cuál está, sin fechas
// ni tiempos (HU-017): 'sin_empezar', 'en_curso' o 'finalizada'.
function nombreEstadoTarea(array $estado): string
{
    if ($estado['iniciada_en'] === null) {
        return 'sin_empezar';
    }
    return $estado['finalizada_en'] === null ? 'en_curso' : 'finalizada';
}
