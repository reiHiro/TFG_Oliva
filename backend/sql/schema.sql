-- Esquema de la base apoyos_educativos (DER actualizado).
-- La base se crea antes a mano desde phpMyAdmin; este script solo crea las tablas.
-- Ejecutar con la base apoyos_educativos seleccionada.
--
-- ATENCIÓN: el script arranca de cero. Borra todas las tablas (y sus datos:
-- usuarios, actividades, métricas...) y las vuelve a crear.

SET NAMES utf8mb4;

-- Todas las claves primarias son INT UNSIGNED, y todas las columnas que las
-- referencian (las *_id) también: un FK con distinto tipo o signo que la
-- columna apuntada hace fallar el CREATE TABLE (errno 150).

-- Se desactivan las claves foráneas solo para poder borrar en cualquier orden.
-- consentimiento y actividad_apoyo son tablas viejas que ya no se usan.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS correo_envio;
DROP TABLE IF EXISTS mensaje;
DROP TABLE IF EXISTS tarea_reapertura;
DROP TABLE IF EXISTS paso_produccion;
DROP TABLE IF EXISTS paso_completado_opcion;
DROP TABLE IF EXISTS paso_completado;
DROP TABLE IF EXISTS paso_opcion;
DROP TABLE IF EXISTS paso;
DROP TABLE IF EXISTS metrica;
DROP TABLE IF EXISTS actividad_estudiante;
DROP TABLE IF EXISTS actividad_apoyo;
DROP TABLE IF EXISTS consentimiento;
DROP TABLE IF EXISTS apoyo;
DROP TABLE IF EXISTS actividad;
DROP TABLE IF EXISTS clase;
DROP TABLE IF EXISTS usuario;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE usuario (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    apellido        VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    rol             ENUM('estudiante', 'docente') NOT NULL,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_usuario_email UNIQUE (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Una clase es solo un agrupador de actividades que crea el docente: no
-- tiene estudiantes miembros ni código de unión (HU-014). El nombre no se
-- repite entre las clases del mismo docente; con utf8mb4_unicode_ci la
-- comparación no distingue mayúsculas ni tildes ("5.º A" = "5.º a").
CREATE TABLE clase (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    docente_id      INT UNSIGNED NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    materia         VARCHAR(100) NULL,
    descripcion     VARCHAR(500) NULL,
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Baja lógica (HU-015): NULL = activa. Una clase dada de baja oculta
    -- también sus actividades, pero no se borra nada y se puede reactivar.
    -- Sigue ocupando su nombre en uq_clase_docente_nombre.
    dada_de_baja_en DATETIME NULL,
    CONSTRAINT uq_clase_docente_nombre UNIQUE (docente_id, nombre),
    CONSTRAINT fk_clase_docente FOREIGN KEY (docente_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Toda actividad pertenece a una clase. RESTRICT: no se puede borrar una
-- clase que todavía tiene actividades.
CREATE TABLE actividad (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    docente_id      INT UNSIGNED NOT NULL,
    clase_id        INT UNSIGNED NOT NULL,
    titulo          VARCHAR(150) NOT NULL,
    recurso_url     VARCHAR(2048) NOT NULL,
    consigna        TEXT NOT NULL,
    -- 1 = la extensión abre la actividad con la vista de lectura limpia a la
    -- vista (el estudiante puede volver a la página original). Se puede
    -- cambiar siempre, también con la actividad ya iniciada.
    modo_lectura_inicial TINYINT(1) NOT NULL DEFAULT 0,
    -- HU-018: 1 = la extensión ofrece "¿Por qué?" en los pasos que tienen
    -- justificación, después de responderlos. Con produccion_propia en 1 no
    -- se muestra nunca (queda solo para el docente).
    mostrar_justificacion TINYINT(1) NOT NULL DEFAULT 0,
    -- HU-018: 1 = en cada paso el estudiante justifica su respuesta con una
    -- producción propia (paso_produccion). produccion_modo dice cómo (una
    -- sola modalidad por actividad):
    --   cita_texto:    cita un fragmento del material (texto), sin explicación
    --   texto_libre:   justifica con sus palabras, sin cita
    --   momento_video: cita un momento del video o audio y cuenta qué se dice
    --                  o se ve en ese momento
    produccion_propia TINYINT(1) NOT NULL DEFAULT 0,
    produccion_modo ENUM('cita_texto', 'texto_libre', 'momento_video') NOT NULL DEFAULT 'cita_texto',
    fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Baja lógica (HU-015): NULL = activa. Dada de baja (o de una clase dada
    -- de baja), el estudiante no la ve ni la puede usar (config/vigencia.php);
    -- el docente sigue viendo sus métricas y devoluciones.
    dada_de_baja_en DATETIME NULL,
    CONSTRAINT fk_actividad_docente FOREIGN KEY (docente_id)
        REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT fk_actividad_clase FOREIGN KEY (clase_id)
        REFERENCES clase (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE actividad_estudiante (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actividad_id      INT UNSIGNED NOT NULL,
    estudiante_id     INT UNSIGNED NOT NULL,
    fecha_asignacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Cuándo tocó "Empezar" en la Tarea (tarea_iniciar.php). Si el docente la
    -- reabrió (HU-016, tarea_reabrir.php), es el momento de la última
    -- reapertura: el inicio del tramo en curso.
    iniciada_en       DATETIME NULL,
    finalizada_en     DATETIME NULL,  -- cuándo la finalizó (tarea_finalizar.php); después no se marcan pasos
    -- HU-016: segundos trabajados en los tramos anteriores a la última
    -- reapertura. El tiempo total de la Tarea es esto más el tramo actual
    -- (config/tarea.php); el tiempo que estuvo finalizada no se cuenta.
    segundos_acumulados INT UNSIGNED NOT NULL DEFAULT 0,
    -- HU-016: 'estudiante' si la finalizó con el botón Finalizar, 'salida' si
    -- se finalizó sola porque salió de la pestaña. NULL si no está finalizada.
    finalizada_motivo ENUM('estudiante', 'salida') NULL,
    CONSTRAINT uq_actividad_estudiante UNIQUE (actividad_id, estudiante_id),
    -- No se puede finalizar sin haber empezado, ni con fecha anterior al inicio.
    CONSTRAINT ck_ae_tarea CHECK (finalizada_en IS NULL
        OR (iniciada_en IS NOT NULL AND finalizada_en >= iniciada_en)),
    -- Solo una Tarea finalizada tiene motivo de finalización.
    CONSTRAINT ck_ae_motivo CHECK (finalizada_motivo IS NULL OR finalizada_en IS NOT NULL),
    CONSTRAINT fk_ae_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE,
    CONSTRAINT fk_ae_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE apoyo (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tipo_apoyo  VARCHAR(50) NOT NULL,
    CONSTRAINT uq_apoyo_tipo UNIQUE (tipo_apoyo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los pasos de verdadero o falso se guardan como opcion_multiple con las
-- opciones "Verdadero" y "Falso" y una sola correcta (backend/config/pasos.php).
-- opcion_unica: entre 2 y 4 opciones y exactamente una correcta; el
-- estudiante elige una sola (radio), guardada en paso_completado.opcion_elegida_id.
CREATE TABLE paso (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actividad_id  INT UNSIGNED NOT NULL,
    descripcion   TEXT NOT NULL,
    orden         INT UNSIGNED NOT NULL,
    tipo          ENUM('opcion_multiple', 'opcion_unica') NOT NULL DEFAULT 'opcion_multiple',
    -- HU-018: fragmento del material que respalda la respuesta correcta
    -- (opcional, hasta 2000 caracteres: config/actividad.php). No sale nunca
    -- en actividad_detalle.php: solo por paso_justificacion.php.
    justificacion TEXT NULL,
    CONSTRAINT fk_paso_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opciones de un paso de opción múltiple: entre 2 y 4, al menos una
-- correcta (lo valida actividad_crear.php).
CREATE TABLE paso_opcion (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    paso_id      INT UNSIGNED NOT NULL,
    texto        VARCHAR(255) NOT NULL,
    es_correcta  BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_po_paso FOREIGN KEY (paso_id)
        REFERENCES paso (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paso_completado (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    paso_id            INT UNSIGNED NOT NULL,
    estudiante_id      INT UNSIGNED NOT NULL,
    completado         BOOLEAN NOT NULL DEFAULT FALSE,
    opcion_elegida_id  INT UNSIGNED NULL,  -- solo en los de verdadero o falso
    fecha              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- HU-018: cuándo vio la justificación del paso (paso_justificacion.php).
    -- Desde ahí paso_marcar.php no deja cambiar la respuesta, tampoco si el
    -- docente reabre la Tarea (HU-016): no se borra nunca.
    justificacion_vista_en DATETIME NULL,
    CONSTRAINT uq_paso_estudiante UNIQUE (paso_id, estudiante_id),
    CONSTRAINT fk_pc_paso FOREIGN KEY (paso_id)
        REFERENCES paso (id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT fk_pc_opcion FOREIGN KEY (opcion_elegida_id)
        REFERENCES paso_opcion (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opciones que tildó el estudiante en un paso de opción múltiple (puede
-- tildar varias). Los tipos coinciden con paso_completado.id y
-- paso_opcion.id (INT UNSIGNED).
CREATE TABLE paso_completado_opcion (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    paso_completado_id  INT UNSIGNED NOT NULL,
    opcion_id           INT UNSIGNED NOT NULL,
    CONSTRAINT uq_pco_opcion UNIQUE (paso_completado_id, opcion_id),
    CONSTRAINT fk_pco_paso_completado FOREIGN KEY (paso_completado_id)
        REFERENCES paso_completado (id) ON DELETE CASCADE,
    CONSTRAINT fk_pco_opcion FOREIGN KEY (opcion_id)
        REFERENCES paso_opcion (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- HU-018: producción propia del estudiante en un paso (solo en actividades
-- con produccion_propia): la cita del material y su explicación. Va aparte
-- de paso_completado porque no cambia si el paso está completado ni el
-- acierto, y porque se puede citar antes de elegir una opción.
-- tipo_cita 'texto' usa cita_texto; 'tiempo' usa cita_segundos (el momento
-- del video o audio). justificacion_valida es la marca del docente: 1 = sí,
-- 0 = no, NULL = sin revisar.
CREATE TABLE paso_produccion (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    paso_id               INT UNSIGNED NOT NULL,
    estudiante_id         INT UNSIGNED NOT NULL,
    tipo_cita             ENUM('texto', 'tiempo') NULL,
    cita_texto            VARCHAR(1000) NULL,
    cita_segundos         INT UNSIGNED NULL,
    explicacion           VARCHAR(2000) NULL,
    justificacion_valida  TINYINT(1) NULL,
    fecha                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_produccion_paso_estudiante UNIQUE (paso_id, estudiante_id),
    CONSTRAINT fk_produccion_paso FOREIGN KEY (paso_id)
        REFERENCES paso (id) ON DELETE CASCADE,
    CONSTRAINT fk_produccion_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE metrica (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    estudiante_id  INT UNSIGNED NOT NULL,
    actividad_id   INT UNSIGNED NOT NULL,
    apoyo_id       INT UNSIGNED NULL,
    tiempo_foco    INT UNSIGNED NULL,  -- en segundos; NULL en las filas de uso de un apoyo
    fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_metrica_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT fk_metrica_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE,
    CONSTRAINT fk_metrica_apoyo FOREIGN KEY (apoyo_id)
        REFERENCES apoyo (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Devoluciones del docente a un estudiante en una actividad. Las manda desde
-- el panel de métricas (mensaje_enviar.php) y el estudiante las lee en la
-- barra de la extensión, que las marca como leídas (mensajes_marcar_leidos.php).
CREATE TABLE mensaje (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actividad_id   INT UNSIGNED NOT NULL,
    estudiante_id  INT UNSIGNED NOT NULL,
    texto          TEXT NOT NULL,
    fecha_envio    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    leido          BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_leido    DATETIME NULL,
    INDEX idx_mensaje_actividad_estudiante (actividad_id, estudiante_id, fecha_envio),
    CONSTRAINT fk_mensaje_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE,
    CONSTRAINT fk_mensaje_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- HU-016: cada vez que el docente reabre la Tarea finalizada de un estudiante
-- (tarea_reabrir.php). Al reabrir, finalizada_en y finalizada_motivo de
-- actividad_estudiante vuelven a NULL: acá queda cómo había terminado.
CREATE TABLE tarea_reapertura (
    id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actividad_id           INT UNSIGNED NOT NULL,
    estudiante_id          INT UNSIGNED NOT NULL,
    docente_id             INT UNSIGNED NOT NULL,  -- quién la reabrió
    fecha                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizada_en_anterior DATETIME NOT NULL,
    motivo_anterior        ENUM('estudiante', 'salida') NULL,
    INDEX idx_reapertura_actividad_estudiante (actividad_id, estudiante_id),
    CONSTRAINT fk_reapertura_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE,
    CONSTRAINT fk_reapertura_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT fk_reapertura_docente FOREIGN KEY (docente_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- HU-019: cada intento de mandarle a un estudiante, por correo, el enlace de
-- una actividad (al asignarla o con Reenviar). El estado que ve el docente es
-- el último intento. No se guarda el token, el enlace, la dirección ni el
-- texto del correo; de un error, solo un código corto ('config', 'smtp'...).
-- IF NOT EXISTS: este bloque se puede pegar solo en una base ya creada.
CREATE TABLE IF NOT EXISTS correo_envio (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actividad_id  INT UNSIGNED NOT NULL,
    estudiante_id INT UNSIGNED NOT NULL,
    docente_id    INT UNSIGNED NOT NULL,  -- quién lo disparó
    motivo        ENUM('asignacion', 'reenvio') NOT NULL,
    resultado     ENUM('enviado', 'sin_correo', 'error') NOT NULL,
    error_codigo  VARCHAR(30) NULL,
    fecha         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_correo_actividad_estudiante (actividad_id, estudiante_id, fecha),
    CONSTRAINT fk_correo_actividad FOREIGN KEY (actividad_id)
        REFERENCES actividad (id) ON DELETE CASCADE,
    CONSTRAINT fk_correo_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT fk_correo_docente FOREIGN KEY (docente_id)
        REFERENCES usuario (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los tres apoyos de la barra. La Tarea no es un apoyo: su estado vive en
-- actividad_estudiante (iniciada_en, finalizada_en...) y no se registra en
-- metrica.
INSERT INTO apoyo (tipo_apoyo) VALUES
    ('lectura_voz'),
    ('modo_lectura'),
    ('glosario');
