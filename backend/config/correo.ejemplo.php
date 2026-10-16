<?php
// Plantilla de la configuración de correo (HU-019). Copiar como correo.php
// y completar. correo.php no se sube al repositorio: tiene la clave SMTP.
// Si correo.php no existe, el backend usa el modo 'archivo'.
//
// modo:
//   'archivo' -> no manda nada: guarda cada correo como .eml en
//                backend/correos_salida/ (para desarrollar y para la demo).
//   'smtp'    -> lo manda por el servidor SMTP de abajo.
// cifrado: 'tls' (STARTTLS, puerto 587), 'ssl' (puerto 465) o '' (sin cifrar,
//          solo para un servidor local de prueba como Mailpit en el 1025).
// remitente: la dirección que figura como "De". Con Gmail tiene que ser la
//            misma cuenta que usuario.
// responder_a: dirección para "Responder a"; '' = no se agrega.

return [
    'modo'             => 'archivo',
    'host'             => '',
    'puerto'           => 587,
    'cifrado'          => 'tls',
    'usuario'          => '',
    'clave'            => '',
    'remitente'        => '',
    'remitente_nombre' => 'Apoyos educativos',
    'responder_a'      => '',
];
