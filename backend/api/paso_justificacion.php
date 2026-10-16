<?php
// POST /backend/api/paso_justificacion.php  (para la extensión, HU-018)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. Body JSON: { paso_id }
// Es el único lugar por donde la justificación del docente le llega al
// estudiante (el botón "¿Por qué?" de la Tarea). Solo la devuelve si se
// cumple todo esto, comprobado acá y no en la extensión:
//   - la actividad tiene mostrar_justificacion y no tiene produccion_propia,
//   - el paso es de la actividad del token y tiene justificación,
//   - el estudiante del token ya respondió ese paso.
// Si algo no se cumple responde 404 con el mismo mensaje, sin decir qué
// faltó (tampoco si el paso tiene o no una justificación cargada).
// Es POST porque cambia algo: deja justificacion_vista_en en paso_completado
// (la primera vez), y desde ahí paso_marcar.php no deja cambiar la respuesta
// de ese paso. La marca se guarda antes de responder con el texto.
// Funciona con la Tarea en curso o ya finalizada (la marca queda igual, por
// si el docente después la reabre). No registra ninguna métrica.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

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
    if (estadoTarea($pdo, $actividadId, $estudianteId) === null) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    // Todas las condiciones en una sola consulta: si falta cualquiera no hay fila.
    $consulta = $pdo->prepare(
        'SELECT p.justificacion, pc.id AS paso_completado_id
         FROM paso p
         JOIN actividad a ON a.id = p.actividad_id
         JOIN paso_completado pc
              ON pc.paso_id = p.id AND pc.estudiante_id = :estudiante_id AND pc.completado = 1
         WHERE p.id = :paso_id AND p.actividad_id = :actividad_id
           AND a.mostrar_justificacion = 1 AND a.produccion_propia = 0
           AND p.justificacion IS NOT NULL AND p.justificacion <> \'\''
    );
    $consulta->execute([
        ':estudiante_id' => $estudianteId,
        ':paso_id'       => $pasoId,
        ':actividad_id'  => $actividadId,
    ]);
    $fila = $consulta->fetch();
    if (!$fila) {
        responderJson(404, ['exito' => false, 'error' => 'No hay una justificación para mostrar en este paso.']);
    }

    // Queda la fecha de la primera vez que la vio.
    $marca = $pdo->prepare(
        'UPDATE paso_completado SET justificacion_vista_en = NOW()
         WHERE id = :id AND justificacion_vista_en IS NULL'
    );
    $marca->execute([':id' => $fila['paso_completado_id']]);
} catch (PDOException $e) {
    error_log('paso_justificacion.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'               => true,
    'paso_id'             => $pasoId,
    'justificacion'       => $fila['justificacion'],
    'respuesta_bloqueada' => true,
]);
