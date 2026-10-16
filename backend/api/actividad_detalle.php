<?php
// GET /backend/api/actividad_detalle.php?id=N  (para la extensión)
// No usa la sesión: exige "Authorization: Bearer <token>" emitido por
// actividad_abrir.php. Devuelve título y consigna de la actividad, y sus
// pasos (HU-007) indicando cuáles ya completó el estudiante del token.
// Los pasos de opción múltiple y verdadero o falso traen además sus opciones
// (sin decir cuáles son correctas). Los de verdadero o falso (tipo
// "verdadero_falso") y los de opción única ("opcion_unica") traen la opción
// que eligió el estudiante, o null, en
// opcion_elegida_id; los de opción múltiple, las que tildó en
// opciones_elegidas_ids (lista, vacía si no tildó ninguna).
// También trae el estado de la Tarea del estudiante (config/tarea.php):
// iniciada_en, finalizada_en, segundos_desde_inicio y duracion_segundos.
// Y el nombre y apellido del estudiante del token, y el nombre y la materia
// (opcional, puede ser null) de la clase de la actividad, para el encabezado
// del panel. De la clase no sale nada más: ni el docente ni otros estudiantes.
// modo_lectura_inicial (true/false): si la extensión tiene que abrir la
// actividad con la vista de lectura limpia.
// HU-018: la justificación del docente NO sale nunca de acá (no se
// selecciona paso.justificacion). Cada paso trae solo dos banderas:
//   justificacion_disponible: el estudiante ya lo respondió y puede pedirla
//                             con paso_justificacion.php. Antes de responder
//                             es false también en los pasos que tienen una.
//   respuesta_bloqueada:      ya la vio, así que no puede cambiar su respuesta.
// produccion_propia (true/false) y produccion_modo ('cita_texto',
// 'texto_libre' o 'momento_video'):
// si es true, cada paso trae en "produccion" lo que ya guardó este
// estudiante (tipo_cita, cita_texto, cita_segundos, explicacion), o null.
// La marca del docente (justificacion_valida) no sale de acá.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/token.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/tarea.php';
require_once __DIR__ . '/../config/vigencia.php';
require_once __DIR__ . '/../config/produccion.php';

exigirMetodo('GET');

$actividadId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($actividadId === false) {
    responderJson(422, ['exito' => false, 'error' => 'La actividad es obligatoria.']);
}

$token = leerTokenBearer();
$datosToken = $token === null ? null : verificarToken($token);

if ($datosToken === null || $datosToken['actividad_id'] !== $actividadId) {
    responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
}

try {
    $pdo = obtenerConexion();

    // HU-015: una actividad dada de baja (o de una clase dada de baja) se
    // trata igual que una que no está asignada (config/vigencia.php).
    exigirActividadVigente($pdo, $actividadId, 401, 'Token inválido.');

    // Se vuelve a comprobar la asignación por si se quitó después de emitir el token.
    $consulta = $pdo->prepare(
        'SELECT a.titulo, a.consigna, a.modo_lectura_inicial, a.produccion_propia, a.produccion_modo,
                u.nombre, u.apellido,
                c.nombre AS clase_nombre, c.materia AS clase_materia
         FROM actividad a
         JOIN actividad_estudiante ae ON ae.actividad_id = a.id
         JOIN usuario u ON u.id = ae.estudiante_id
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id AND ae.estudiante_id = :estudiante_id'
    );
    $consulta->execute([':id' => $actividadId, ':estudiante_id' => $datosToken['usuario_id']]);
    $actividad = $consulta->fetch();

    $estado = estadoTarea($pdo, $actividadId, $datosToken['usuario_id']);

    if (!$actividad || $estado === null) {
        responderJson(401, ['exito' => false, 'error' => 'Token inválido.']);
    }

    // Si el estudiante nunca marcó un paso no hay fila en paso_completado:
    // el LEFT JOIN deja completado en NULL y se toma como no completado.
    $consultaPasos = $pdo->prepare(
        'SELECT p.id, p.descripcion, p.orden, p.tipo, pc.completado, pc.opcion_elegida_id,
                pc.justificacion_vista_en
         FROM paso p
         LEFT JOIN paso_completado pc
                ON pc.paso_id = p.id AND pc.estudiante_id = :estudiante_id
         WHERE p.actividad_id = :actividad_id
         ORDER BY p.orden, p.id'
    );
    $consultaPasos->execute([':estudiante_id' => $datosToken['usuario_id'], ':actividad_id' => $actividadId]);
    $filasPasos = $consultaPasos->fetchAll();

    // Opciones de todos los pasos de la actividad en una sola consulta.
    // No se selecciona es_correcta: la respuesta correcta no sale del servidor.
    $consultaOpciones = $pdo->prepare(
        'SELECT po.id, po.paso_id, po.texto
         FROM paso_opcion po
         JOIN paso p ON p.id = po.paso_id
         WHERE p.actividad_id = :actividad_id
         ORDER BY po.id'
    );
    $consultaOpciones->execute([':actividad_id' => $actividadId]);
    $opcionesPorPaso = [];
    foreach ($consultaOpciones->fetchAll() as $opcion) {
        $opcionesPorPaso[(int) $opcion['paso_id']][] = [
            'id'    => (int) $opcion['id'],
            'texto' => $opcion['texto'],
        ];
    }

    $verdaderoFalso = pasosVerdaderoFalso($pdo, $actividadId);
    $respuestas = respuestasPorEstudiante($pdo, $actividadId, $datosToken['usuario_id'])[$datosToken['usuario_id']] ?? [];

    $conJustificacion = pasosConJustificacionVisible($pdo, $actividadId);
    $conProduccion = (bool) $actividad['produccion_propia'];
    $producciones = $conProduccion
        ? produccionesDelEstudiante($pdo, $actividadId, $datosToken['usuario_id'])
        : [];

    $pasos = array_map(function (array $fila) use ($opcionesPorPaso, $verdaderoFalso, $respuestas, $conJustificacion, $conProduccion, $producciones) {
        $paso = [
            'id'          => (int) $fila['id'],
            'descripcion' => $fila['descripcion'],
            'orden'       => (int) $fila['orden'],
            'tipo'        => tipoInformado($fila, $verdaderoFalso),
            'completado'  => (bool) $fila['completado'],
        ];
        $paso['opciones'] = $opcionesPorPaso[$paso['id']] ?? [];
        // Verdadero o falso y opción única: una sola opción elegida.
        if ($paso['tipo'] === 'verdadero_falso' || $paso['tipo'] === 'opcion_unica') {
            $paso['opcion_elegida_id'] = $fila['opcion_elegida_id'] === null ? null : (int) $fila['opcion_elegida_id'];
        } else {
            $paso['opciones_elegidas_ids'] = $respuestas[$paso['id']]['ids'] ?? [];
        }
        $paso['justificacion_disponible'] = $paso['completado'] && isset($conJustificacion[$paso['id']]);
        $paso['respuesta_bloqueada'] = $fila['justificacion_vista_en'] !== null;
        if ($conProduccion) {
            $produccion = $producciones[$paso['id']] ?? null;
            unset($produccion['justificacion_valida']);
            $paso['produccion'] = $produccion ?: null;
        }
        return $paso;
    }, $filasPasos);
} catch (PDOException $e) {
    error_log('actividad_detalle.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

$actividad['estudiante'] = ['nombre' => $actividad['nombre'], 'apellido' => $actividad['apellido']];
$actividad['clase'] = ['nombre' => $actividad['clase_nombre'], 'materia' => $actividad['clase_materia']];
unset($actividad['nombre'], $actividad['apellido'], $actividad['clase_nombre'], $actividad['clase_materia']);
$actividad['modo_lectura_inicial'] = (bool) $actividad['modo_lectura_inicial'];
$actividad['produccion_propia'] = (bool) $actividad['produccion_propia'];
$actividad += $estado;
$actividad['pasos'] = $pasos;

responderJson(200, ['exito' => true, 'actividad' => $actividad]);
