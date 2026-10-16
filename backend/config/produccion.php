<?php
// Producción propia (HU-018): en una actividad con produccion_propia, por
// cada paso el estudiante justifica su respuesta de una sola manera, la
// modalidad de la actividad (produccion_modo):
//   cita_texto:    cita un fragmento del material (tipo_cita 'texto' y
//                  cita_texto); no escribe explicación.
//   texto_libre:   justifica con sus palabras (explicacion); no cita.
//   momento_video: cita un momento del video o audio (tipo_cita 'tiempo' y
//                  cita_segundos) y cuenta qué se dice o se ve (explicacion).
// Se guarda en paso_produccion, aparte de paso_completado: no cambia si el
// paso está completado ni el acierto, que sigue saliendo de la opción elegida.
//   tipo_cita 'texto':  cita_texto (un fragmento del material)
//   tipo_cita 'tiempo': cita_segundos (un momento del video o audio)

// La cita la arma la extensión a partir de lo seleccionado en la página: el
// backend valida el formato y los límites, no puede comprobar que el texto
// salga del material.

const CITA_TEXTO_MAX    = 1000;
const EXPLICACION_MAX   = 2000;
const CITA_SEGUNDOS_MAX = 86400; // 24 horas

// Campos de paso_produccion que usa cada modalidad. Los demás tienen que
// llegar vacíos (ausentes o null): si no, 422.
const CAMPOS_PRODUCCION_POR_MODO = [
    'cita_texto'    => ['tipo_cita', 'cita_texto'],
    'texto_libre'   => ['explicacion'],
    'momento_video' => ['tipo_cita', 'cita_segundos', 'explicacion'],
];

// Tipo de cita que corresponde a cada modalidad que cita algo.
const TIPO_CITA_POR_MODO = ['cita_texto' => 'texto', 'momento_video' => 'tiempo'];

// Producciones de un estudiante en los pasos de una actividad:
// [paso_id => ['tipo_cita', 'cita_texto', 'cita_segundos', 'explicacion',
//              'justificacion_valida']]. Solo los pasos en los que cargó algo.
// justificacion_valida es la marca del docente (true, false o null = sin
// revisar): quien arma una respuesta para el estudiante la tiene que quitar.
function produccionesDelEstudiante(PDO $pdo, int $actividadId, int $estudianteId): array
{
    $consulta = $pdo->prepare(
        'SELECT pp.paso_id, pp.tipo_cita, pp.cita_texto, pp.cita_segundos, pp.explicacion,
                pp.justificacion_valida
         FROM paso_produccion pp
         JOIN paso p ON p.id = pp.paso_id
         WHERE p.actividad_id = :actividad_id AND pp.estudiante_id = :estudiante_id'
    );
    $consulta->execute([':actividad_id' => $actividadId, ':estudiante_id' => $estudianteId]);

    $producciones = [];
    foreach ($consulta->fetchAll() as $fila) {
        $producciones[(int) $fila['paso_id']] = [
            'tipo_cita'            => $fila['tipo_cita'],
            'cita_texto'           => $fila['cita_texto'],
            'cita_segundos'        => $fila['cita_segundos'] === null ? null : (int) $fila['cita_segundos'],
            'explicacion'          => $fila['explicacion'],
            'justificacion_valida' => $fila['justificacion_valida'] === null ? null : (bool) $fila['justificacion_valida'],
        ];
    }
    return $producciones;
}

// Valida la cita y la explicación del body para una actividad con esa
// modalidad. Devuelve [valores normalizados, errores por campo].
// Todo es opcional (se guarda de a poco): sin cita, tipo_cita va en null.
// Un campo que la modalidad no usa tiene que venir vacío.
function validarProduccion(array $datos, string $modo): array
{
    $valores = ['tipo_cita' => null, 'cita_texto' => null, 'cita_segundos' => null, 'explicacion' => null];
    $errores = [];

    $usados = CAMPOS_PRODUCCION_POR_MODO[$modo];
    foreach (array_keys($valores) as $campo) {
        if (($datos[$campo] ?? null) !== null && !in_array($campo, $usados, true)) {
            $errores[$campo] = 'Esta actividad no usa este campo.';
        }
    }
    if ($errores) {
        return [$valores, $errores];
    }

    $tipo = $datos['tipo_cita'] ?? null;
    $citaTexto = $datos['cita_texto'] ?? null;
    $citaSegundos = $datos['cita_segundos'] ?? null;

    if ($tipo === null) {
        if ($citaTexto !== null || $citaSegundos !== null) {
            $errores['tipo_cita'] = 'Falta indicar el tipo de cita.';
        }
    } elseif ($tipo !== (TIPO_CITA_POR_MODO[$modo] ?? null)) {
        $errores['tipo_cita'] = 'El tipo de cita no corresponde a esta actividad.';
    } elseif ($tipo === 'texto') {
        // Los espacios y saltos de línea seguidos de la selección quedan en uno.
        $texto = is_string($citaTexto) ? trim(preg_replace('/\s+/u', ' ', $citaTexto) ?? '') : '';
        if ($texto === '' || mb_strlen($texto) > CITA_TEXTO_MAX || $citaSegundos !== null) {
            $errores['cita_texto'] = 'La cita es obligatoria (máximo ' . CITA_TEXTO_MAX . ' caracteres).';
        } else {
            $valores['tipo_cita'] = 'texto';
            $valores['cita_texto'] = $texto;
        }
    } else {
        if (!is_int($citaSegundos) || $citaSegundos < 0 || $citaSegundos > CITA_SEGUNDOS_MAX || $citaTexto !== null) {
            $errores['cita_segundos'] = 'El momento citado no es válido.';
        } else {
            $valores['tipo_cita'] = 'tiempo';
            $valores['cita_segundos'] = $citaSegundos;
        }
    }

    $explicacion = $datos['explicacion'] ?? '';
    if (!is_string($explicacion)) {
        $errores['explicacion'] = 'La explicación no tiene un formato válido.';
    } else {
        $explicacion = trim($explicacion);
        if (mb_strlen($explicacion) > EXPLICACION_MAX) {
            $errores['explicacion'] = 'La explicación puede tener hasta ' . EXPLICACION_MAX . ' caracteres.';
        } elseif ($explicacion !== '') {
            $valores['explicacion'] = $explicacion;
        }
    }

    return [$valores, $errores];
}
