<?php
// Pasos de verdadero o falso: no son un tipo aparte en la base. Se guardan
// como opcion_multiple con dos opciones, "Verdadero" y "Falso" en ese orden,
// y una sola correcta (las crea actividad_crear.php). Al leer, los endpoints
// los informan con tipo "verdadero_falso".
// Los de opción única (tipo opcion_unica) son un tipo propio: nunca se toman
// como verdadero o falso, aunque sus opciones se llamen así. Se responden
// como verdadero o falso, con una sola opción en opcion_elegida_id.
//
// Respuestas: en verdadero o falso la opción elegida está en
// paso_completado.opcion_elegida_id; en opción múltiple, las opciones
// tildadas están en paso_completado_opcion (pueden ser varias).
// Un paso se acierta si el conjunto elegido es exactamente el de las
// correctas; en verdadero o falso eso es lo mismo que elegir la correcta.

const TEXTOS_VERDADERO_FALSO = ['Verdadero', 'Falso'];

// Ids de los pasos de verdadero o falso de una actividad, como claves.
function pasosVerdaderoFalso(PDO $pdo, int $actividadId): array
{
    $consulta = $pdo->prepare(
        'SELECT po.paso_id, po.texto, po.es_correcta
         FROM paso_opcion po
         JOIN paso p ON p.id = po.paso_id
         WHERE p.actividad_id = :actividad_id AND p.tipo = \'opcion_multiple\'
         ORDER BY po.paso_id, po.id'
    );
    $consulta->execute([':actividad_id' => $actividadId]);

    $textosPorPaso = [];
    $correctasPorPaso = [];
    foreach ($consulta->fetchAll() as $fila) {
        $pasoId = (int) $fila['paso_id'];
        $textosPorPaso[$pasoId][] = $fila['texto'];
        $correctasPorPaso[$pasoId] = ($correctasPorPaso[$pasoId] ?? 0) + (int) $fila['es_correcta'];
    }

    $verdaderoFalso = [];
    foreach ($textosPorPaso as $pasoId => $textos) {
        if ($textos === TEXTOS_VERDADERO_FALSO && $correctasPorPaso[$pasoId] === 1) {
            $verdaderoFalso[$pasoId] = true;
        }
    }
    return $verdaderoFalso;
}

// Tipo que se informa al leer un paso: el de la base, salvo los de verdadero o falso.
function tipoInformado(array $fila, array $verdaderoFalso): string
{
    return isset($verdaderoFalso[(int) $fila['id']]) ? 'verdadero_falso' : $fila['tipo'];
}

// Ids de las opciones correctas de cada paso de la actividad:
// [paso_id => [opcion_id, ...]], ordenados.
function opcionesCorrectas(PDO $pdo, int $actividadId): array
{
    $consulta = $pdo->prepare(
        'SELECT po.paso_id, po.id
         FROM paso_opcion po
         JOIN paso p ON p.id = po.paso_id
         WHERE p.actividad_id = :actividad_id AND po.es_correcta = 1
         ORDER BY po.paso_id, po.id'
    );
    $consulta->execute([':actividad_id' => $actividadId]);

    $correctas = [];
    foreach ($consulta->fetchAll() as $fila) {
        $correctas[(int) $fila['paso_id']][] = (int) $fila['id'];
    }
    return $correctas;
}

// Respuestas de los estudiantes asignados a los pasos de la actividad (de
// uno solo si se pasa $estudianteId):
// [estudiante_id => [paso_id => ['ids' => [...], 'textos' => [...]]]].
// Solo aparecen los pasos en los que eligió al menos una opción.
// po.paso_id = p.id descarta una opción que no fuera de ese paso.
function respuestasPorEstudiante(PDO $pdo, int $actividadId, ?int $estudianteId = null): array
{
    // Con prepares nativos un marcador con nombre no se puede repetir: cada
    // mitad del UNION lleva los suyos.
    $filtro = $estudianteId === null ? '' : ' AND pc.estudiante_id = :estudiante_id';
    $filtro2 = $estudianteId === null ? '' : ' AND pc.estudiante_id = :estudiante_id2';

    $consulta = $pdo->prepare(
        'SELECT pc.estudiante_id, pc.paso_id, po.id AS opcion_id, po.texto
         FROM paso_completado pc
         JOIN paso p ON p.id = pc.paso_id
         JOIN actividad_estudiante ae
              ON ae.actividad_id = p.actividad_id AND ae.estudiante_id = pc.estudiante_id
         JOIN paso_opcion po ON po.id = pc.opcion_elegida_id AND po.paso_id = p.id
         WHERE p.actividad_id = :actividad_id' . $filtro . '
         UNION ALL
         SELECT pc.estudiante_id, pc.paso_id, po.id AS opcion_id, po.texto
         FROM paso_completado pc
         JOIN paso p ON p.id = pc.paso_id
         JOIN actividad_estudiante ae
              ON ae.actividad_id = p.actividad_id AND ae.estudiante_id = pc.estudiante_id
         JOIN paso_completado_opcion pco ON pco.paso_completado_id = pc.id
         JOIN paso_opcion po ON po.id = pco.opcion_id AND po.paso_id = p.id
         WHERE p.actividad_id = :actividad_id2' . $filtro2 . '
         ORDER BY estudiante_id, paso_id, opcion_id'
    );
    $parametros = [':actividad_id' => $actividadId, ':actividad_id2' => $actividadId];
    if ($estudianteId !== null) {
        $parametros[':estudiante_id'] = $estudianteId;
        $parametros[':estudiante_id2'] = $estudianteId;
    }
    $consulta->execute($parametros);

    $respuestas = [];
    foreach ($consulta->fetchAll() as $fila) {
        $respuesta = &$respuestas[(int) $fila['estudiante_id']][(int) $fila['paso_id']];
        $respuesta['ids'][] = (int) $fila['opcion_id'];
        $respuesta['textos'][] = $fila['texto'];
        unset($respuesta);
    }
    return $respuestas;
}

// HU-018: ids (como claves) de los pasos de la actividad cuya justificación
// se le puede mostrar al estudiante: la actividad tiene mostrar_justificacion,
// no tiene produccion_propia (ahí queda solo para el docente) y el paso tiene
// una cargada. Falta que el estudiante lo haya respondido: eso lo comprueba
// quien llama. No devuelve el texto: ese sale solo por paso_justificacion.php.
function pasosConJustificacionVisible(PDO $pdo, int $actividadId): array
{
    $consulta = $pdo->prepare(
        'SELECT p.id
         FROM paso p
         JOIN actividad a ON a.id = p.actividad_id
         WHERE p.actividad_id = :actividad_id
           AND a.mostrar_justificacion = 1 AND a.produccion_propia = 0
           AND p.justificacion IS NOT NULL AND p.justificacion <> \'\''
    );
    $consulta->execute([':actividad_id' => $actividadId]);
    return array_fill_keys(array_map('intval', $consulta->fetchAll(PDO::FETCH_COLUMN)), true);
}

// Acierto: las elegidas son exactamente las correctas, ni de más ni de menos.
// Las dos listas vienen ordenadas por id.
function esAcierto(array $idsElegidos, array $idsCorrectos): bool
{
    return $idsElegidos === $idsCorrectos;
}
