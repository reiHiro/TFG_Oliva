<?php
// Validaciones y consultas compartidas de las clases (HU-014 / HU-015), para
// que crear y editar usen exactamente las mismas reglas.
// Requiere respuesta.php cargado antes.

const CLASE_NOMBRE_MAX      = 100;
const CLASE_MATERIA_MAX     = 100;
const CLASE_DESCRIPCION_MAX = 500;

// Una clase dada de baja sigue ocupando su nombre (uq_clase_docente_nombre),
// por eso el mensaje lo aclara.
const CLASE_NOMBRE_REPETIDO = 'Ya tenés una clase con ese nombre (puede estar entre las dadas de baja).';

// Texto recortado; si no vino como string, se toma como vacío.
function textoRecortado(mixed $valor): string
{
    return is_string($valor) ? trim($valor) : '';
}

// Valida nombre, materia y descripción del body. Corta con 422 si algo está
// mal; si no, devuelve los tres valores, con materia y descripción en null
// cuando llegaron vacías o solo con espacios.
function validarDatosClase(array $datos): array
{
    $nombre      = textoRecortado($datos['nombre'] ?? null);
    $materia     = textoRecortado($datos['materia'] ?? null);
    $descripcion = textoRecortado($datos['descripcion'] ?? null);

    $errores = [];
    if ($nombre === '' || mb_strlen($nombre) > CLASE_NOMBRE_MAX) {
        $errores['nombre'] = 'El nombre es obligatorio (máximo ' . CLASE_NOMBRE_MAX . ' caracteres).';
    }
    if (mb_strlen($materia) > CLASE_MATERIA_MAX) {
        $errores['materia'] = 'La materia puede tener como máximo ' . CLASE_MATERIA_MAX . ' caracteres.';
    }
    if (mb_strlen($descripcion) > CLASE_DESCRIPCION_MAX) {
        $errores['descripcion'] = 'La descripción puede tener como máximo ' . CLASE_DESCRIPCION_MAX . ' caracteres.';
    }

    if ($errores) {
        responderJson(422, ['exito' => false, 'error' => 'Datos inválidos.', 'errores' => $errores]);
    }

    return [
        'nombre'      => $nombre,
        'materia'     => $materia === '' ? null : $materia,
        'descripcion' => $descripcion === '' ? null : $descripcion,
    ];
}

// Respuesta 409 de nombre repetido, con el error en el campo para la pantalla.
function responderNombreRepetido(): void
{
    responderJson(409, [
        'exito'   => false,
        'error'   => CLASE_NOMBRE_REPETIDO,
        'errores' => ['nombre' => CLASE_NOMBRE_REPETIDO],
    ]);
}

// Devuelve la clase completa si es del docente (activa o no); si no, null.
// cantidad_actividades cuenta solo las actividades activas.
function claseDelDocente(PDO $pdo, int $claseId, int $docenteId): ?array
{
    $consulta = $pdo->prepare(
        'SELECT c.id, c.nombre, c.materia, c.descripcion, c.fecha_creacion, c.dada_de_baja_en,
                (SELECT COUNT(*) FROM actividad a
                 WHERE a.clase_id = c.id AND a.dada_de_baja_en IS NULL) AS cantidad_actividades
         FROM clase c
         WHERE c.id = :id AND c.docente_id = :docente_id'
    );
    $consulta->execute([':id' => $claseId, ':docente_id' => $docenteId]);
    $clase = $consulta->fetch();
    if (!$clase) {
        return null;
    }

    $clase['id']                   = (int) $clase['id'];
    $clase['cantidad_actividades'] = (int) $clase['cantidad_actividades'];
    return $clase;
}
