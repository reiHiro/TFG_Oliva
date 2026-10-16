<?php
// POST /backend/api/actividad_editar.php  (solo docentes, HU-015)
// Body JSON: { id, titulo, consigna, recurso_url?, pasos?, modo_lectura_inicial?,
//              mostrar_justificacion?, produccion_propia?, produccion_modo? }
// - titulo y consigna se pueden editar siempre.
// - modo_lectura_inicial y mostrar_justificacion (true/false o 1/0) son
//   opcionales y también se pueden cambiar siempre, aunque la actividad esté
//   iniciada: no alteran el recurso ni los pasos. Si no vienen, quedan como
//   estaban. La justificación de cada paso (HU-018) viaja con los pasos.
// - produccion_propia y produccion_modo (HU-018, la modalidad) cambian lo que tiene que
//   hacer el estudiante: se tratan igual que recurso_url y pasos.
//   Con producción propia, mostrar_justificacion se guarda en no.
// - recurso_url y pasos son opcionales: si vienen, solo se aceptan cuando
//   ningún estudiante inició la actividad (actividadIniciada en
//   config/actividad.php); si ya la iniciaron, 409 y no se cambia nada.
//   La salida para cambiarlos es duplicar la actividad.
// - Si vienen pasos, reemplazan a todos los anteriores en una transacción.
// - Mismas validaciones que actividad_crear.php. La clase no se cambia.
// Solo actividades activas de clases activas: si no, 404.

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/docente.php';
require_once __DIR__ . '/../config/pasos.php';
require_once __DIR__ . '/../config/actividad.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = leerJson();

$actividadId = exigirId($datos['id'] ?? null, 'id', 'La actividad es obligatoria.');

// Recurso y pasos solo se validan (y se cambian) si vinieron en el body.
$campos = ['titulo', 'consigna', 'modo_lectura_inicial', 'mostrar_justificacion'];
if (array_key_exists('recurso_url', $datos)) {
    $campos[] = 'recurso_url';
}
if (array_key_exists('pasos', $datos)) {
    $campos[] = 'pasos';
}
// El recurso, los pasos y la producción propia son "contenido": lo único que
// no se puede cambiar con la actividad iniciada.
const CAMPOS_CONTENIDO = ['recurso_url', 'pasos', 'produccion_propia', 'produccion_modo'];
foreach (['produccion_propia', 'produccion_modo'] as $campo) {
    if (array_key_exists($campo, $datos)) {
        $campos[] = $campo;
    }
}
$cambiaContenido = array_intersect(CAMPOS_CONTENIDO, $campos) !== [];

[$valores, $errores] = validarCamposActividad($datos, $campos);
if ($errores) {
    responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
}

try {
    $pdo = obtenerConexion();
    $pdo->beginTransaction();

    // FOR UPDATE: dos ediciones a la vez de la misma actividad se ordenan.
    $consulta = $pdo->prepare(
        'SELECT a.id, a.clase_id, a.recurso_url, a.modo_lectura_inicial, a.mostrar_justificacion,
                a.produccion_propia, a.produccion_modo
         FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id AND a.docente_id = :docente_id
           AND a.dada_de_baja_en IS NULL AND c.dada_de_baja_en IS NULL
         FOR UPDATE'
    );
    $consulta->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    $actual = $consulta->fetch();
    if (!$actual) {
        $pdo->rollBack();
        responderJson(404, ['exito' => false, 'error' => 'Actividad no encontrada.']);
    }

    if ($cambiaContenido) {
        // Se bloquean las asignaciones para que un "Empezar" (tarea_iniciar.php
        // hace UPDATE sobre estas filas) no se cuele entre la comprobación y el
        // reemplazo de los pasos.
        $bloqueo = $pdo->prepare('SELECT id FROM actividad_estudiante WHERE actividad_id = :id FOR UPDATE');
        $bloqueo->execute([':id' => $actividadId]);

        if (actividadIniciada($pdo, $actividadId)) {
            $pdo->rollBack();
            responderJson(409, ['exito' => false, 'error' => ACTIVIDAD_YA_INICIADA, 'iniciada' => true]);
        }
    }

    $recursoUrl = $valores['recurso_url'] ?? $actual['recurso_url'];
    $modoLecturaInicial = $valores['modo_lectura_inicial'] ?? (int) $actual['modo_lectura_inicial'];
    $produccionPropia = $valores['produccion_propia'] ?? (int) $actual['produccion_propia'];
    $produccionModo = $valores['produccion_modo'] ?? $actual['produccion_modo'];
    // Con producción propia la justificación queda solo para el docente.
    $mostrarJustificacion = $produccionPropia
        ? 0
        : ($valores['mostrar_justificacion'] ?? (int) $actual['mostrar_justificacion']);
    $edicion = $pdo->prepare(
        'UPDATE actividad
         SET titulo = :titulo, consigna = :consigna, recurso_url = :recurso_url,
             modo_lectura_inicial = :modo_lectura_inicial,
             mostrar_justificacion = :mostrar_justificacion,
             produccion_propia = :produccion_propia,
             produccion_modo = :produccion_modo
         WHERE id = :id'
    );
    $edicion->execute([
        ':titulo'      => $valores['titulo'],
        ':consigna'    => $valores['consigna'],
        ':recurso_url' => $recursoUrl,
        ':modo_lectura_inicial' => $modoLecturaInicial,
        ':mostrar_justificacion' => $mostrarJustificacion,
        ':produccion_propia'     => $produccionPropia,
        ':produccion_modo'   => $produccionModo,
        ':id'          => $actividadId,
    ]);

    // Borrar el paso borra en cascada sus opciones. No hay respuestas que
    // perder: si las hubiera, la actividad estaría iniciada y no se llega acá.
    if (isset($valores['pasos'])) {
        $borrado = $pdo->prepare('DELETE FROM paso WHERE actividad_id = :id');
        $borrado->execute([':id' => $actividadId]);
        insertarPasos($pdo, $actividadId, $valores['pasos']);
    }

    $conteo = $pdo->prepare('SELECT COUNT(*) FROM paso WHERE actividad_id = :id');
    $conteo->execute([':id' => $actividadId]);
    $cantidadPasos = (int) $conteo->fetchColumn();

    $pdo->commit();
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('actividad_editar.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(200, [
    'exito'     => true,
    'mensaje'   => 'Actividad actualizada correctamente.',
    'actividad' => [
        'id'             => $actividadId,
        'clase_id'       => (int) $actual['clase_id'],
        'titulo'         => $valores['titulo'],
        'recurso_url'    => $recursoUrl,
        'consigna'       => $valores['consigna'],
        'modo_lectura_inicial' => (bool) $modoLecturaInicial,
        'mostrar_justificacion' => (bool) $mostrarJustificacion,
        'produccion_propia'    => (bool) $produccionPropia,
        'produccion_modo'  => $produccionModo,
        'cantidad_pasos' => $cantidadPasos,
    ],
]);
