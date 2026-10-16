<?php
// Devoluciones del docente a un estudiante en una actividad (tabla mensaje).
// Las leen mensajes_docente.php (panel de métricas) y mensajes_estudiante.php
// (barra de la extensión).

const MENSAJE_MAXIMO_CARACTERES = 2000;

// Mensajes del estudiante en esa actividad, del más nuevo al más viejo.
function listarMensajes(PDO $pdo, int $actividadId, int $estudianteId): array
{
    $consulta = $pdo->prepare(
        'SELECT id, texto, fecha_envio, leido, fecha_leido
         FROM mensaje
         WHERE actividad_id = :actividad_id AND estudiante_id = :estudiante_id
         ORDER BY fecha_envio DESC, id DESC'
    );
    $consulta->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);

    return array_map(static fn(array $fila): array => [
        'id'          => (int) $fila['id'],
        'texto'       => $fila['texto'],
        'fecha_envio' => $fila['fecha_envio'],
        'leido'       => (bool) $fila['leido'],
        'fecha_leido' => $fila['fecha_leido'],
    ], $consulta->fetchAll());
}
