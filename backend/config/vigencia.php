<?php
// Vigencia de una actividad (HU-015, baja lógica): una actividad está
// vigente si ni ella ni su clase están dadas de baja. Una actividad que no
// está vigente no la ve ni la usa el estudiante: la condición se comprueba
// acá, en un solo lugar, desde actividad_mis_asignadas.php y desde cada
// endpoint del estudiante y de la extensión (y de los dos del docente que
// actúan sobre un estudiante: mensaje_enviar.php y
// actividad_enlace_estudiante.php), siempre antes de escribir nada.
// Las pantallas de métricas y devoluciones del docente no la usan: el
// docente sigue viendo los datos de una actividad dada de baja.
// Requiere respuesta.php cargado antes.

// Condición SQL de vigencia, para consultas que ya unen actividad (alias a)
// con clase (alias c). Es un texto fijo: no lleva datos del usuario.
const CONDICION_ACTIVIDAD_VIGENTE = 'a.dada_de_baja_en IS NULL AND c.dada_de_baja_en IS NULL';

function actividadVigente(PDO $pdo, int $actividadId): bool
{
    $consulta = $pdo->prepare(
        'SELECT 1 FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id AND ' . CONDICION_ACTIVIDAD_VIGENTE
    );
    $consulta->execute([':id' => $actividadId]);
    return (bool) $consulta->fetchColumn();
}

// Corta con el código y el mensaje que ya usa cada endpoint cuando la
// actividad no le corresponde (401 "Token inválido." en los de la extensión,
// 404 en actividad_abrir.php...), así una actividad dada de baja se trata
// igual que una que no está asignada. Se llama antes de abrir una transacción.
function exigirActividadVigente(PDO $pdo, int $actividadId, int $codigo, string $error): void
{
    if (!actividadVigente($pdo, $actividadId)) {
        responderJson($codigo, ['exito' => false, 'error' => $error]);
    }
}
