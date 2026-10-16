<?php
// POST /backend/api/paso_produccion_guardar.php  (para la extensión, HU-018)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. El estudiante y la actividad salen del token.
// Body JSON: { paso_id, tipo_cita?, cita_texto?, cita_segundos?, explicacion? }
// Solo los campos de la modalidad de la actividad (produccion_modo); otro
// campo con valor da 422 (config/produccion.php, validarProduccion):
//   cita_texto:    tipo_cita 'texto' (o null) y cita_texto (1 a 1000 caracteres)
//   texto_libre:   explicacion (hasta 2000 caracteres; puede ir vacía)
//   momento_video: tipo_cita 'tiempo' (o null), cita_segundos (0 a 86400) y
//                  explicacion
// Cada envío reemplaza la producción completa del estudiante en ese paso
// (la extensión guarda de a poco). Si llega todo vacío, la fila se borra.
// Solo con la Tarea en curso: ni antes de "Empezar" ni después de
// finalizarla (403, igual que paso_marcar.php). Solo en actividades con
// produccion_propia (403). No cambia paso_completado ni el acierto.
// Si el contenido cambia, la marca del docente (justificacion_valida) vuelve
// a "sin revisar": lo que había revisado ya no es lo que está guardado.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';
require_once __DIR__ . '/../config/produccion.php';

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

    if (!tareaEnCurso($estado)) {
        responderJson(403, [
            'exito' => false,
            'error' => $estado['iniciada_en'] === null
                ? 'Tenés que empezar la tarea para escribir.'
                : 'La tarea ya fue finalizada: no se pueden guardar más cambios.',
        ]);
    }

    // El paso tiene que ser de la actividad del token. Si no existe se
    // responde igual que si fuera de otra actividad.
    $consultaPaso = $pdo->prepare(
        'SELECT a.produccion_propia, a.produccion_modo
         FROM paso p
         JOIN actividad a ON a.id = p.actividad_id
         WHERE p.id = :paso_id AND p.actividad_id = :actividad_id'
    );
    $consultaPaso->execute([':paso_id' => $pasoId, ':actividad_id' => $actividadId]);
    $actividad = $consultaPaso->fetch();
    if (!$actividad) {
        responderJson(403, ['exito' => false, 'error' => 'El paso no pertenece a esta actividad.']);
    }
    if (!$actividad['produccion_propia']) {
        responderJson(403, ['exito' => false, 'error' => 'Esta actividad no pide producción propia.']);
    }

    [$valores, $errores] = validarProduccion($datos, $actividad['produccion_modo']);
    if ($errores) {
        responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
    }

    $parametros = [':paso_id' => $pasoId, ':estudiante_id' => $estudianteId];

    if ($valores['tipo_cita'] === null && $valores['explicacion'] === null) {
        $borrado = $pdo->prepare(
            'DELETE FROM paso_produccion WHERE paso_id = :paso_id AND estudiante_id = :estudiante_id'
        );
        $borrado->execute($parametros);
    } else {
        // La clave única (paso_id, estudiante_id) hace que se actualice la
        // fila existente. justificacion_valida va primero: MariaDB asigna de
        // izquierda a derecha, así que ahí las columnas todavía tienen el
        // valor anterior y se pueden comparar con el nuevo (BINARY: la
        // colación no distingue mayúsculas ni tildes, y eso también es un cambio).
        $guardado = $pdo->prepare(
            'INSERT INTO paso_produccion (paso_id, estudiante_id, tipo_cita, cita_texto, cita_segundos, explicacion, fecha)
             VALUES (:paso_id, :estudiante_id, :tipo_cita, :cita_texto, :cita_segundos, :explicacion, NOW())
             ON DUPLICATE KEY UPDATE
                 justificacion_valida = IF(tipo_cita <=> VALUES(tipo_cita)
                                           AND BINARY cita_texto <=> BINARY VALUES(cita_texto)
                                           AND cita_segundos <=> VALUES(cita_segundos)
                                           AND BINARY explicacion <=> BINARY VALUES(explicacion),
                                           justificacion_valida, NULL),
                 tipo_cita = VALUES(tipo_cita),
                 cita_texto = VALUES(cita_texto),
                 cita_segundos = VALUES(cita_segundos),
                 explicacion = VALUES(explicacion),
                 fecha = VALUES(fecha)'
        );
        $guardado->execute($parametros + [
            ':tipo_cita'     => $valores['tipo_cita'],
            ':cita_texto'    => $valores['cita_texto'],
            ':cita_segundos' => $valores['cita_segundos'],
            ':explicacion'   => $valores['explicacion'],
        ]);
    }
} catch (PDOException $e) {
    error_log('paso_produccion_guardar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, ['exito' => true, 'paso_id' => $pasoId, 'produccion' => $valores]);
