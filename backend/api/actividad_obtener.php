<?php
// GET /backend/api/actividad_obtener.php?id=N  (solo docentes, HU-015)
// Devuelve una actividad del docente con sus pasos, en el mismo formato que
// recibe actividad_crear.php, para cargar el formulario de edición.
// iniciada: true si un estudiante ya la empezó (config/actividad.php); en
// ese caso solo se pueden editar el título, la consigna, modo_lectura_inicial
// y mostrar_justificacion.
// Cada paso trae su justificacion (HU-018, null si no tiene): este endpoint
// es del docente dueño, que la lee sin condiciones.
// Solo actividades activas de clases activas: si no, 404.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/actividad.php';

exigirMetodo('GET');
$docenteId = exigirSesion('docente');
$actividadId = exigirId($_GET['id'] ?? null, 'id', 'La actividad es obligatoria.');

try {
    $pdo = obtenerConexion();

    $actividad = actividadConClase($pdo, $actividadId, $docenteId);
    if ($actividad === null || $actividad['dada_de_baja_en'] !== null
        || $actividad['clase_dada_de_baja_en'] !== null) {
        responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
    }

    $consultaPasos = $pdo->prepare(
        'SELECT id, descripcion, tipo, justificacion FROM paso WHERE actividad_id = :id ORDER BY orden, id'
    );
    $consultaPasos->execute([':id' => $actividadId]);
    $filasPasos = $consultaPasos->fetchAll();

    $consultaOpciones = $pdo->prepare(
        'SELECT po.paso_id, po.texto, po.es_correcta
         FROM paso_opcion po
         JOIN paso p ON p.id = po.paso_id
         WHERE p.actividad_id = :id
         ORDER BY po.paso_id, po.id'
    );
    $consultaOpciones->execute([':id' => $actividadId]);
    $opcionesPorPaso = [];
    foreach ($consultaOpciones->fetchAll() as $fila) {
        $opcionesPorPaso[(int) $fila['paso_id']][] = [
            'texto'       => $fila['texto'],
            'es_correcta' => (bool) $fila['es_correcta'],
        ];
    }

    $verdaderoFalso = pasosVerdaderoFalso($pdo, $actividadId);
    $iniciada = actividadIniciada($pdo, $actividadId);
} catch (PDOException $e) {
    error_log('actividad_obtener.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

$pasos = [];
foreach ($filasPasos as $fila) {
    $pasoId = (int) $fila['id'];
    $tipo = tipoInformado($fila, $verdaderoFalso);
    $paso = ['descripcion' => $fila['descripcion'], 'tipo' => $tipo, 'justificacion' => $fila['justificacion']];

    if ($tipo === 'verdadero_falso') {
        // La primera opción es "Verdadero" (config/pasos.php).
        $paso['correcta'] = $opcionesPorPaso[$pasoId][0]['es_correcta'] ? 'verdadero' : 'falso';
    } elseif ($tipo === 'opcion_multiple' || $tipo === 'opcion_unica') {
        $paso['opciones'] = $opcionesPorPaso[$pasoId] ?? [];
    }
    $pasos[] = $paso;
}

responderJson(200, [
    'exito'     => true,
    'actividad' => [
        'id'            => $actividad['id'],
        'clase_id'      => $actividad['clase_id'],
        'clase_nombre'  => $actividad['clase_nombre'],
        'clase_materia' => $actividad['clase_materia'],
        'titulo'        => $actividad['titulo'],
        'consigna'      => $actividad['consigna'],
        'recurso_url'   => $actividad['recurso_url'],
        'modo_lectura_inicial' => $actividad['modo_lectura_inicial'],
        'mostrar_justificacion' => $actividad['mostrar_justificacion'],
        'produccion_propia'    => $actividad['produccion_propia'],
        'produccion_modo'  => $actividad['produccion_modo'],
        'iniciada'      => $iniciada,
        'pasos'         => $pasos,
    ],
]);
