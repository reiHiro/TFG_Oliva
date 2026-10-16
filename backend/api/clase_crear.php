<?php
// POST /backend/api/clase_crear.php  (solo docentes)
// Body JSON: { nombre, materia?, descripcion? }
// Una clase es solo un agrupador de actividades (HU-014): no tiene
// estudiantes miembros ni código de unión. El nombre no se puede repetir
// entre las clases del mismo docente (409), contando las dadas de baja.
// Materia y descripción son opcionales: si llegan vacías o solo con
// espacios se guardan como NULL (config/clase.php).

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/respuesta.php';
require_once __DIR__ . '/../config/sesion.php';
require_once __DIR__ . '/../config/clase.php';

exigirMetodo('POST');
$docenteId = exigirSesion('docente');
$datos = validarDatosClase(leerJson());

try {
    $pdo = obtenerConexion();

    $insercion = $pdo->prepare(
        'INSERT INTO clase (docente_id, nombre, materia, descripcion)
         VALUES (:docente_id, :nombre, :materia, :descripcion)'
    );
    $insercion->execute([
        ':docente_id'  => $docenteId,
        ':nombre'      => $datos['nombre'],
        ':materia'     => $datos['materia'],
        ':descripcion' => $datos['descripcion'],
    ]);

    $clase = claseDelDocente($pdo, (int) $pdo->lastInsertId(), $docenteId);
} catch (PDOException $e) {
    // La única restricción que puede fallar acá es uq_clase_docente_nombre.
    // Se detecta con el error en vez de consultar antes, así no hay carrera
    // entre dos pedidos iguales. La colación no distingue mayúsculas ni
    // tildes: "5.º A" y "5.º a" cuentan como el mismo nombre.
    if ($e->getCode() === '23000') {
        responderNombreRepetido();
    }
    error_log('clase_crear.php: ' . $e->getMessage());
    responderJson(500, ['exito' => false, 'error' => 'Error interno del servidor.']);
}

responderJson(201, [
    'exito'   => true,
    'mensaje' => 'Clase creada correctamente.',
    'clase'   => $clase,
]);
