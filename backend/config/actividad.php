<?php
// Validaciones y operaciones compartidas de las actividades, para que crear
// (actividad_crear.php) y editar (actividad_editar.php, HU-015) usen
// exactamente las mismas reglas.
// Requiere pasos.php cargado antes.

const ACTIVIDAD_TITULO_MAX = 150;
const ACTIVIDAD_URL_MAX    = 2048;
const OPCION_MAX           = 255;
const OPCIONES_MIN         = 2;
const OPCIONES_MAX         = 4;
const JUSTIFICACION_MAX    = 2000;

// Aviso cuando se quiere cambiar el recurso o los pasos de una actividad
// que ya fue iniciada (actividadIniciada).
const ACTIVIDAD_YA_INICIADA = 'Esta actividad ya fue iniciada por un estudiante. '
    . 'Para cambiar los pasos o el recurso, duplicala.';

// Casillas de la actividad (sí o no), con su mensaje de error.
const OPCIONES_ACTIVIDAD = [
    'modo_lectura_inicial'  => 'La opción de abrir en modo lectura tiene que ser sí o no.',
    'mostrar_justificacion' => 'La opción de mostrar la justificación tiene que ser sí o no.',
    'produccion_propia'     => 'La opción de producción propia tiene que ser sí o no.',
];

// HU-018: cómo justifica el estudiante en una actividad con producción propia
// (ENUM produccion_modo): cita un fragmento del texto, justifica con texto
// libre, o cita un momento del video o audio y cuenta qué se ve.
const MODOS_PRODUCCION = ['cita_texto', 'texto_libre', 'momento_video'];

// Valida los campos pedidos ('titulo', 'consigna', 'recurso_url', 'pasos',
// 'modo_lectura_inicial', 'mostrar_justificacion', 'produccion_propia',
// 'produccion_modo') del body. Devuelve
// [valores normalizados, errores por campo]; si errores no está vacío, quien
// llama responde 422.
// Las casillas (OPCIONES_ACTIVIDAD) son opcionales: si una no vino en el body
// no aparece en los valores (al crear vale 0 y al editar no se toca). Si vino
// tiene que ser true, false, 0 o 1, y queda como 0 o 1.
// produccion_modo también es opcional: 'cita_texto', 'texto_libre' o 'momento_video'.
function validarCamposActividad(array $datos, array $campos): array
{
    $valores = [];
    $errores = [];

    if (in_array('titulo', $campos, true)) {
        $valores['titulo'] = trim((string) ($datos['titulo'] ?? ''));
        if ($valores['titulo'] === '' || mb_strlen($valores['titulo']) > ACTIVIDAD_TITULO_MAX) {
            $errores['titulo'] = 'El título es obligatorio (máximo ' . ACTIVIDAD_TITULO_MAX . ' caracteres).';
        }
    }
    if (in_array('consigna', $campos, true)) {
        $valores['consigna'] = trim((string) ($datos['consigna'] ?? ''));
        if ($valores['consigna'] === '') {
            $errores['consigna'] = 'La consigna es obligatoria.';
        }
    }
    // Solo http/https: la URL se muestra después como enlace, y un esquema
    // como javascript: sería una puerta a XSS.
    if (in_array('recurso_url', $campos, true)) {
        $valores['recurso_url'] = trim((string) ($datos['recurso_url'] ?? ''));
        $esquema = strtolower((string) parse_url($valores['recurso_url'], PHP_URL_SCHEME));
        if (!filter_var($valores['recurso_url'], FILTER_VALIDATE_URL)
            || !in_array($esquema, ['http', 'https'], true)
            || strlen($valores['recurso_url']) > ACTIVIDAD_URL_MAX) {
            $errores['recurso_url'] = 'El enlace del recurso debe ser una URL válida (http o https).';
        }
    }
    if (in_array('pasos', $campos, true)) {
        $pasos = validarPasos($datos['pasos'] ?? null);
        if (is_string($pasos)) {
            $errores['pasos'] = $pasos;
        } else {
            $valores['pasos'] = $pasos;
        }
    }
    foreach (OPCIONES_ACTIVIDAD as $opcion => $error) {
        if (!in_array($opcion, $campos, true) || !array_key_exists($opcion, $datos)) {
            continue;
        }
        // Comparación estricta: "1", 2, null o un texto no pasan.
        if (in_array($datos[$opcion], [true, false, 0, 1], true)) {
            $valores[$opcion] = (int) $datos[$opcion];
        } else {
            $errores[$opcion] = $error;
        }
    }
    if (in_array('produccion_modo', $campos, true) && array_key_exists('produccion_modo', $datos)) {
        if (in_array($datos['produccion_modo'], MODOS_PRODUCCION, true)) {
            $valores['produccion_modo'] = $datos['produccion_modo'];
        } else {
            $errores['produccion_modo'] = 'Elegí cómo justifica el estudiante: cita del texto, texto libre o momento del video.';
        }
    }

    return [$valores, $errores];
}

// Valida la lista completa de pasos (al menos uno). Devuelve los pasos
// normalizados, o un string con el error.
function validarPasos(mixed $pasosCrudo): array|string
{
    if (!is_array($pasosCrudo) || !array_is_list($pasosCrudo)) {
        return 'Los pasos deben enviarse como una lista.';
    }
    $pasos = [];
    foreach ($pasosCrudo as $i => $pasoCrudo) {
        $paso = validarPaso($pasoCrudo, $i + 1);
        if (is_string($paso)) {
            return $paso;
        }
        $pasos[] = $paso;
    }
    if (count($pasos) === 0) {
        return 'La actividad necesita al menos un paso.';
    }
    return $pasos;
}

// Cada paso es uno de:
//   { descripcion, tipo: "opcion_unica",
//     opciones: [{ texto, es_correcta: true | false }, ...] }  (2 a 4, exactamente una correcta)
//   { descripcion, tipo: "opcion_multiple",
//     opciones: [{ texto, es_correcta: true | false }, ...] }  (2 a 4, al menos una correcta)
//   { descripcion, tipo: "verdadero_falso", correcta: "verdadero" | "falso" }
//     (se guarda como opción múltiple con las opciones "Verdadero" y "Falso",
//     ver config/pasos.php)
// Los dos pueden traer justificacion (HU-018): el fragmento del material que
// respalda la respuesta correcta. Es opcional; vacía o ausente queda en null.
// Devuelve el paso normalizado, o un string con el error.
function validarPaso(mixed $paso, int $numero): array|string
{
    if (!is_array($paso)) {
        return "El paso $numero no tiene un formato válido.";
    }

    $descripcion = is_string($paso['descripcion'] ?? null) ? trim($paso['descripcion']) : '';
    if ($descripcion === '') {
        return "El paso $numero está vacío.";
    }

    $justificacion = $paso['justificacion'] ?? null;
    if ($justificacion !== null && !is_string($justificacion)) {
        return "La justificación del paso $numero no tiene un formato válido.";
    }
    $justificacion = trim((string) $justificacion);
    if (mb_strlen($justificacion) > JUSTIFICACION_MAX) {
        return "La justificación del paso $numero puede tener hasta " . JUSTIFICACION_MAX . ' caracteres.';
    }
    $justificacion = $justificacion === '' ? null : $justificacion;

    $tipo = $paso['tipo'] ?? null;
    if ($tipo === 'verdadero_falso') {
        $correcta = $paso['correcta'] ?? null;
        if ($correcta !== 'verdadero' && $correcta !== 'falso') {
            return "En el paso $numero elegí si la respuesta correcta es Verdadero o Falso.";
        }
        [$textoVerdadero, $textoFalso] = TEXTOS_VERDADERO_FALSO;
        return ['descripcion' => $descripcion, 'tipo' => 'opcion_multiple', 'justificacion' => $justificacion, 'opciones' => [
            ['texto' => $textoVerdadero, 'es_correcta' => $correcta === 'verdadero'],
            ['texto' => $textoFalso,     'es_correcta' => $correcta === 'falso'],
        ]];
    }
    if ($tipo !== 'opcion_multiple' && $tipo !== 'opcion_unica') {
        return "El paso $numero tiene un tipo inválido.";
    }

    $opcionesCrudo = $paso['opciones'] ?? null;
    if (!is_array($opcionesCrudo) || !array_is_list($opcionesCrudo)
        || count($opcionesCrudo) < OPCIONES_MIN || count($opcionesCrudo) > OPCIONES_MAX) {
        return "El paso $numero necesita entre " . OPCIONES_MIN . ' y ' . OPCIONES_MAX . ' opciones.';
    }

    $opciones = [];
    $correctas = 0;
    foreach ($opcionesCrudo as $j => $opcion) {
        $texto = is_array($opcion) && is_string($opcion['texto'] ?? null) ? trim($opcion['texto']) : '';
        if ($texto === '' || mb_strlen($texto) > OPCION_MAX) {
            return "La opción " . ($j + 1) . " del paso $numero es obligatoria (máximo " . OPCION_MAX . ' caracteres).';
        }
        $esCorrecta = $opcion['es_correcta'] ?? false;
        if (!is_bool($esCorrecta)) {
            return "La opción " . ($j + 1) . " del paso $numero tiene un valor de correcta inválido.";
        }
        $correctas += (int) $esCorrecta;
        $opciones[] = ['texto' => $texto, 'es_correcta' => $esCorrecta];
    }
    if ($tipo === 'opcion_unica' && $correctas !== 1) {
        return "En el paso $numero marcá una sola opción correcta.";
    }
    if ($correctas < 1) {
        return "El paso $numero tiene que tener al menos una opción correcta.";
    }

    return ['descripcion' => $descripcion, 'tipo' => $tipo, 'justificacion' => $justificacion, 'opciones' => $opciones];
}

// Inserta los pasos ya validados (con sus opciones), en el orden de la lista.
// Se llama dentro de la transacción de quien la usa.
function insertarPasos(PDO $pdo, int $actividadId, array $pasos): void
{
    $insercionPaso = $pdo->prepare(
        'INSERT INTO paso (actividad_id, descripcion, orden, tipo, justificacion)
         VALUES (:actividad_id, :descripcion, :orden, :tipo, :justificacion)'
    );
    $insercionOpcion = $pdo->prepare(
        'INSERT INTO paso_opcion (paso_id, texto, es_correcta)
         VALUES (:paso_id, :texto, :es_correcta)'
    );
    foreach ($pasos as $i => $paso) {
        $insercionPaso->execute([
            ':actividad_id' => $actividadId,
            ':descripcion'  => $paso['descripcion'],
            ':orden'        => $i + 1,
            ':tipo'         => $paso['tipo'],
            ':justificacion' => $paso['justificacion'] ?? null,
        ]);
        $pasoId = (int) $pdo->lastInsertId();

        foreach ($paso['opciones'] as $opcion) {
            $insercionOpcion->execute([
                ':paso_id'     => $pasoId,
                ':texto'       => $opcion['texto'],
                ':es_correcta' => (int) $opcion['es_correcta'],
            ]);
        }
    }
}

// Devuelve la actividad del docente con el estado de baja propio y el de su
// clase, o null si no existe o es de otro docente.
function actividadConClase(PDO $pdo, int $actividadId, int $docenteId): ?array
{
    $consulta = $pdo->prepare(
        'SELECT a.id, a.clase_id, a.titulo, a.recurso_url, a.consigna, a.modo_lectura_inicial,
                a.mostrar_justificacion, a.produccion_propia, a.produccion_modo,
                a.dada_de_baja_en,
                c.nombre AS clase_nombre, c.materia AS clase_materia,
                c.dada_de_baja_en AS clase_dada_de_baja_en
         FROM actividad a
         JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id AND a.docente_id = :docente_id'
    );
    $consulta->execute([':id' => $actividadId, ':docente_id' => $docenteId]);
    $actividad = $consulta->fetch();
    if (!$actividad) {
        return null;
    }
    $actividad['id']       = (int) $actividad['id'];
    $actividad['clase_id'] = (int) $actividad['clase_id'];
    $actividad['modo_lectura_inicial'] = (bool) $actividad['modo_lectura_inicial'];
    $actividad['mostrar_justificacion'] = (bool) $actividad['mostrar_justificacion'];
    $actividad['produccion_propia'] = (bool) $actividad['produccion_propia'];
    return $actividad;
}

// Una actividad está iniciada apenas un estudiante dejó algún rastro en ella:
// tocó Empezar (iniciada_en), marcó un paso (paso_completado) o hay una
// métrica (alcanza con abrir el recurso con la extensión, que registra el
// tiempo en foco). Desde ahí ya no se cambian el recurso ni los pasos.
function actividadIniciada(PDO $pdo, int $actividadId): bool
{
    $consulta = $pdo->prepare(
        'SELECT
            EXISTS (SELECT 1 FROM actividad_estudiante
                    WHERE actividad_id = :id1 AND iniciada_en IS NOT NULL)
         OR EXISTS (SELECT 1 FROM paso_completado pc JOIN paso p ON p.id = pc.paso_id
                    WHERE p.actividad_id = :id2)
         OR EXISTS (SELECT 1 FROM metrica WHERE actividad_id = :id3) AS iniciada'
    );
    // Con prepares nativos un marcador con nombre no se puede repetir.
    $consulta->execute([':id1' => $actividadId, ':id2' => $actividadId, ':id3' => $actividadId]);
    return (bool) $consulta->fetchColumn();
}
