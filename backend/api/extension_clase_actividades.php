<?php
// GET /backend/api/extension_clase_actividades.php  (para la extensión, HU-017)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php (o actividad_enlace_estudiante.php). No recibe ningún
// parámetro: la actividad y el estudiante salen del token, y la clase, de esa
// actividad. Lo que venga en la URL se ignora.
// Devuelve el nombre de la clase y las actividades de ESA clase asignadas a
// ESE estudiante que siguen vigentes (config/vigencia.php), con: id, titulo,
// cantidad_pasos, estado de la Tarea (sin_empezar / en_curso / finalizada),
// actual (true en la del token) y url (recurso + "#apoyos=N.<token>", la
// misma que da actividad_abrir.php; null en la actual, que no se abre).
// Orden: en curso, sin empezar y al final las finalizadas; dentro de cada
// grupo, de la asignación más nueva a la más vieja.
// No salen consignas, respuestas, métricas, el docente ni otros estudiantes.
// Decisión tomada: el token de una actividad alcanza así a las demás del
// mismo estudiante en la misma clase (asignadas y vigentes), y a ninguna otra.
// Todo rechazo es 401 "Token inválido.", igual que en el resto de los
// endpoints de la extensión.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';

exigirMetodo('GET');

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

$actividadId  = $datosToken['actividad_id'];
$estudianteId = $datosToken['usuario_id'];

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 401, 'Token inválido.');

    // Se vuelve a comprobar la asignación por si se quitó después de emitir el token.
    if (estadoTarea($pdo, $actividadId, $estudianteId) === null) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    $consultaClase = $pdo->prepare(
        'SELECT c.id, c.nombre
         FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id'
    );
    $consultaClase->execute([':id' => $actividadId]);
    $clase = $consultaClase->fetch();

    if (!$clase) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    $consulta = $pdo->prepare(
        'SELECT a.id, a.titulo, a.recurso_url,
                (SELECT COUNT(*) FROM paso p WHERE p.actividad_id = a.id) AS cantidad_pasos
         FROM actividad_estudiante ae
         JOIN actividad a ON a.id = ae.actividad_id
         JOIN clase c     ON c.id = a.clase_id
         WHERE ae.estudiante_id = :estudiante_id AND a.clase_id = :clase_id
           AND ' . CONDICION_ACTIVIDAD_VIGENTE . '
         ORDER BY ae.fecha_asignacion DESC, ae.id DESC'
    );
    $consulta->execute([':estudiante_id' => $estudianteId, ':clase_id' => $clase['id']]);

    $actividades = [];
    foreach ($consulta->fetchAll() as $fila) {
        $id = (int) $fila['id'];
        $estado = estadoTarea($pdo, $id, $estudianteId);
        if ($estado === null) {
            continue; // se desasignó entre una consulta y la otra
        }
        $actual = $id === $actividadId;
        $actividades[] = [
            'id'             => $id,
            'titulo'         => $fila['titulo'],
            'cantidad_pasos' => (int) $fila['cantidad_pasos'],
            'estado'         => nombreEstadoTarea($estado),
            'actual'         => $actual,
            'url'            => $actual ? null : urlConApoyos($fila['recurso_url'], $estudianteId, $id),
        ];
    }
} catch (PDOException $e) {
    error_log('extension_clase_actividades.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

// usort es estable (PHP 8): dentro de cada estado queda el orden de la consulta.
$ordenEstado = ['en_curso' => 0, 'sin_empezar' => 1, 'finalizada' => 2];
usort($actividades, static fn(array $a, array $b): int => $ordenEstado[$a['estado']] <=> $ordenEstado[$b['estado']]);

responderJson(200, [
    'exito'       => true,
    'clase'       => ['nombre' => $clase['nombre']],
    'actividades' => $actividades,
]);
