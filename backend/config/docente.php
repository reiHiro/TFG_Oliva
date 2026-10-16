<?php
// Comprobaciones de los endpoints del docente que trabajan con un estudiante
// puntual de una de sus actividades (enlace directo y devoluciones).
// Requiere respuesta.php y tarea.php cargados antes.

// Valida un id positivo que vino en la petición; corta con 422 si no lo es.
function exigirId(mixed $valor, string $campo, string $mensaje): int
{
    $id = filter_var($valor, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false) {
        responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => [$campo => $mensaje]]);
    }
    return $id;
}

// Devuelve la actividad (id, recurso_url) si es del docente; si no, null.
function actividadDelDocente(PDO $pdo, int $actividadId, int $docenteId): ?array
{
    $consulta = $pdo->prepare(
        'SELECT id, recurso_url FROM actividad WHERE id = :id AND docente_id = :docente_id'
    );
    $consulta->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    return $consulta->fetch() ?: null;
}

// El estudiante está asignado si tiene fila en actividad_estudiante
// (estadoTarea devuelve null si no la tiene).
function estudianteAsignado(PDO $pdo, int $actividadId, int $estudianteId): bool
{
    return estadoTarea($pdo, $actividadId, $estudianteId) !== null;
}
