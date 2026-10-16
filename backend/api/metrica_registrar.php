<?php
// POST /backend/api/metrica_registrar.php  (para la extensión, HU-008)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. El estudiante y la actividad salen del token.
// Si la tarea del estudiante ya está finalizada responde 403 y no guarda nada.
// Body JSON, uno de:
//   { tipo: "foco",  segundos: 1..120 }   -> tiempo_foco = segundos, apoyo_id NULL
//   { tipo: "apoyo", apoyo: "lectura_voz" | "modo_lectura" | "glosario" }
//                                          -> apoyo_id del apoyo, tiempo_foco NULL
// Los apoyos válidos son solo esos tres (APOYOS_VALIDOS), aunque la tabla
// apoyo tuviera otra fila: la Tarea no es un apoyo ("tarea" da 422).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

const FOCO_MAXIMO_SEGUNDOS = 120;
const APOYOS_VALIDOS = ['lectura_voz', 'modo_lectura', 'glosario'];

exigirMetodo('POST');

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

$datos = leerJson();
$tipo  = $datos['tipo'] ?? null;

$segundos  = null;
$tipoApoyo = null;
$errores   = [];

if ($tipo === 'foco') {
    // is_int: se rechazan "30", 30.5 y booleanos, no solo lo que está fuera de rango.
    $segundos = $datos['segundos'] ?? null;
    if (!is_int($segundos) || $segundos < 1 || $segundos > FOCO_MAXIMO_SEGUNDOS) {
        $errores['segundos'] = 'Los segundos deben ser un entero entre 1 y ' . FOCO_MAXIMO_SEGUNDOS . '.';
    }
} elseif ($tipo === 'apoyo') {
    $tipoApoyo = $datos['apoyo'] ?? null;
    if (!is_string($tipoApoyo) || $tipoApoyo === '') {
        $errores['apoyo'] = 'El apoyo es obligatorio.';
    } elseif (!in_array($tipoApoyo, APOYOS_VALIDOS, true)) {
        $errores['apoyo'] = 'El apoyo no existe.';
    }
} else {
    $errores['tipo'] = 'El tipo debe ser "foco" o "apoyo".';
}

if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
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

    // Con la tarea finalizada no se registran más métricas de la actividad.
    // Antes de empezarla sí: el tiempo en foco y los apoyos cuentan igual.
    if ($estado['finalizada_en'] !== null) {
        responderJson(403, ['exito' => false, 'error' => 'La tarea ya fue finalizada: no se registran más métricas.']);
    }

    $apoyoId = null;
    if ($tipo === 'apoyo') {
        $consultaApoyo = $pdo->prepare('SELECT id FROM apoyo WHERE tipo_apoyo = :tipo_apoyo');
        $consultaApoyo->execute([':tipo_apoyo' => $tipoApoyo]);
        $apoyoId = $consultaApoyo->fetchColumn();
        if ($apoyoId === false) {
            responderJson(422, [
                'exito'   => false,
                'error'   => 'Datos inválidos.',
                'errores' => ['apoyo' => 'El apoyo no existe.'],
            ]);
        }
    }

    $guardado = $pdo->prepare(
        'INSERT INTO metrica (estudiante_id, actividad_id, apoyo_id, tiempo_foco, fecha)
         VALUES (:estudiante_id, :actividad_id, :apoyo_id, :tiempo_foco, NOW())'
    );
    $guardado->bindValue(':estudiante_id', $estudianteId, PDO::PARAM_INT);
    $guardado->bindValue(':actividad_id', $actividadId, PDO::PARAM_INT);
    $guardado->bindValue(':apoyo_id', $apoyoId === null ? null : (int) $apoyoId,
        $apoyoId === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $guardado->bindValue(':tiempo_foco', $segundos,
        $segundos === null ? PDO::PARAM_NULL : PDO::PARAM_INT);
    $guardado->execute();
} catch (PDOException $e) {
    error_log('metrica_registrar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(201, ['exito' => true]);
