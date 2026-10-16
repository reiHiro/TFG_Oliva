<?php
// HU-019: envío por correo del enlace personal de una actividad.
// La configuración está en correo.php (no se sube; plantilla en
// correo.ejemplo.php). Sin correo.php se usa el modo 'archivo'.
//
// Privacidad: la dirección del estudiante se lee acá, del lado del servidor,
// y no sale nunca en una respuesta ni en error_log. Tampoco el enlace: es una
// credencial (token sin vencimiento). En correo_envio queda solo el resultado.
//
// Quien llame a enviarCorreosActividad() tiene que haber comprobado antes que
// la actividad es del docente y que está vigente (config/vigencia.php).

require_once __DIR__ . '/token.php';
require_once __DIR__ . '/../lib/phpmailer/Exception.php';
require_once __DIR__ . '/../lib/phpmailer/PHPMailer.php';
require_once __DIR__ . '/../lib/phpmailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

const CORREO_MAX_POR_PEDIDO      = 60;  // destinatarios por pedido; el resto queda pendiente
const CORREO_SEGUNDOS_POR_PEDIDO = 20;  // después de esto no se empieza otro envío
const CORREO_TIMEOUT_SMTP        = 10;  // segundos por operación SMTP
const CORREO_CARPETA_SALIDA      = __DIR__ . '/../correos_salida';
// Remitente del modo 'archivo' si no se configuró uno (.invalid: no existe).
const CORREO_REMITENTE_ARCHIVO   = 'no-responder@apoyos-educativos.invalid';

// Configuración inválida: el mensaje se le puede mostrar al docente tal cual.
class CorreoConfigInvalida extends RuntimeException
{
}

// Lee y valida correo.php. Sin el archivo, modo 'archivo'. Cualquier
// problema (incluso un error de sintaxis en correo.php) es CorreoConfigInvalida.
function configCorreo(): array
{
    $ruta = __DIR__ . '/correo.php';
    $config = ['modo' => 'archivo'];

    if (is_file($ruta)) {
        try {
            $config = include $ruta;
        } catch (Throwable $e) {
            throw new CorreoConfigInvalida('backend/config/correo.php tiene un error y no se pudo leer.');
        }
        if (!is_array($config)) {
            throw new CorreoConfigInvalida('backend/config/correo.php tiene que devolver un array (ver correo.ejemplo.php).');
        }
    }

    $normal = [
        'modo'             => (string) ($config['modo'] ?? 'archivo'),
        'host'             => trim((string) ($config['host'] ?? '')),
        'puerto'           => filter_var($config['puerto'] ?? 587, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 65535]]),
        'cifrado'          => (string) ($config['cifrado'] ?? 'tls'),
        'usuario'          => (string) ($config['usuario'] ?? ''),
        'clave'            => (string) ($config['clave'] ?? ''),
        'remitente'        => trim((string) ($config['remitente'] ?? '')),
        'remitente_nombre' => limpiarLineaCorreo((string) ($config['remitente_nombre'] ?? '')),
        'responder_a'      => trim((string) ($config['responder_a'] ?? '')),
    ];

    if (!in_array($normal['modo'], ['archivo', 'smtp'], true)) {
        throw new CorreoConfigInvalida("El modo de correo tiene que ser 'archivo' o 'smtp'.");
    }
    if ($normal['remitente'] !== '' && !PHPMailer::validateAddress($normal['remitente'])) {
        throw new CorreoConfigInvalida('El remitente configurado no es una dirección de correo válida.');
    }
    if ($normal['responder_a'] !== '' && !PHPMailer::validateAddress($normal['responder_a'])) {
        throw new CorreoConfigInvalida('La dirección de "responder a" configurada no es válida.');
    }

    if ($normal['modo'] === 'smtp') {
        if ($normal['host'] === '' || $normal['puerto'] === false) {
            throw new CorreoConfigInvalida('Falta configurar el servidor SMTP (host y puerto) en backend/config/correo.php.');
        }
        if (!in_array($normal['cifrado'], ['tls', 'ssl', ''], true)) {
            throw new CorreoConfigInvalida("El cifrado tiene que ser 'tls', 'ssl' o vacío.");
        }
        if ($normal['remitente'] === '') {
            throw new CorreoConfigInvalida('Falta configurar el remitente en backend/config/correo.php.');
        }
    } elseif ($normal['remitente'] === '') {
        $normal['remitente'] = CORREO_REMITENTE_ARCHIVO;
    }

    return $normal;
}

// Un texto de una sola línea: sin saltos ni caracteres de control (evita la
// inyección de encabezados en el asunto y en los nombres).
function limpiarLineaCorreo(string $texto): string
{
    return trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $texto) ?? '');
}

// Asunto, texto plano y HTML del correo de una actividad. Todo lo que viene
// de la base se escapa en el HTML.
function armarCorreoActividad(string $nombreEstudiante, string $tituloActividad, string $nombreClase, string $url): array
{
    $nombre = limpiarLineaCorreo($nombreEstudiante);
    $titulo = limpiarLineaCorreo($tituloActividad);
    $clase  = limpiarLineaCorreo($nombreClase);

    $avisoPersonal  = 'Este enlace es personal: no lo compartas.';
    $avisoExtension = 'Para ver las ayudas de lectura, abrí el enlace en un navegador de computadora con la extensión instalada (Edge o Chrome).';

    $texto = "Hola, $nombre:\n\n"
        . "Tenés una nueva actividad.\n\n"
        . "Actividad: $titulo\n"
        . "Clase: $clase\n\n"
        . "Abrila con este enlace:\n$url\n\n"
        . "$avisoPersonal\n"
        . "$avisoExtension\n";

    $e = fn(string $valor): string => htmlspecialchars($valor, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>' . $e($titulo) . '</title></head>'
        . '<body style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #1f2933;">'
        . '<p>Hola, ' . $e($nombre) . ':</p>'
        . '<p>Tenés una nueva actividad.</p>'
        . '<p><strong>Actividad:</strong> ' . $e($titulo) . '<br><strong>Clase:</strong> ' . $e($clase) . '</p>'
        . '<p><a href="' . $e($url) . '">Abrir la actividad</a></p>'
        . '<p>' . $e($avisoPersonal) . '</p>'
        . '<p>' . $e($avisoExtension) . '</p>'
        . '</body></html>';

    return [
        'asunto' => "Nueva actividad: $titulo — $clase",
        'texto'  => $texto,
        'html'   => $html,
    ];
}

function crearMailer(array $config): PHPMailer
{
    $mailer = new PHPMailer(true);
    $mailer->CharSet = PHPMailer::CHARSET_UTF8;
    $mailer->XMailer = ' '; // sin el encabezado con la versión de la librería
    $mailer->setFrom($config['remitente'], $config['remitente_nombre'], false);
    if ($config['responder_a'] !== '') {
        $mailer->addReplyTo($config['responder_a']);
    }

    if ($config['modo'] === 'smtp') {
        $mailer->isSMTP();
        $mailer->Host          = $config['host'];
        $mailer->Port          = $config['puerto'];
        $mailer->Timeout       = CORREO_TIMEOUT_SMTP;
        $mailer->SMTPKeepAlive = true; // una sola conexión para todos los envíos del pedido
        $mailer->SMTPSecure    = $config['cifrado'] === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS
                               : ($config['cifrado'] === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : '');
        $mailer->SMTPAutoTLS   = $config['cifrado'] !== '';
        if ($config['usuario'] !== '') {
            $mailer->SMTPAuth = true;
            $mailer->Username = $config['usuario'];
            $mailer->Password = $config['clave'];
        }
    }

    return $mailer;
}

// Modo 'archivo': arma el mensaje completo y lo guarda como .eml. El nombre
// no lleva la dirección del estudiante.
function guardarCorreoEnArchivo(PHPMailer $mailer, int $actividadId, int $estudianteId): void
{
    if (!$mailer->preSend()) {
        throw new RuntimeException('preSend');
    }
    if (!is_dir(CORREO_CARPETA_SALIDA) && !mkdir(CORREO_CARPETA_SALIDA, 0700, true)) {
        throw new RuntimeException('carpeta');
    }
    $nombre = date('Ymd-His') . '_act' . $actividadId . '_est' . $estudianteId . '_' . bin2hex(random_bytes(3)) . '.eml';
    if (file_put_contents(CORREO_CARPETA_SALIDA . '/' . $nombre, $mailer->getSentMIMEMessage()) === false) {
        throw new RuntimeException('archivo');
    }
}

// Para error_log: sin direcciones de correo ni tokens.
function textoErrorSeguro(string $texto): string
{
    $texto = preg_replace('/[^\s<>"\'(),;:]+@[^\s<>"\'(),;:]+/u', '[correo]', $texto) ?? '';
    $texto = preg_replace('/apoyos=\S+/u', 'apoyos=[enlace]', $texto) ?? '';
    return limpiarLineaCorreo(mb_substr($texto, 0, 300));
}

function registrarIntentoCorreo(PDO $pdo, int $actividadId, int $estudianteId, int $docenteId, string $motivo, string $resultado, ?string $errorCodigo): void
{
    $pdo->prepare(
        'INSERT INTO correo_envio (actividad_id, estudiante_id, docente_id, motivo, resultado, error_codigo)
         VALUES (:actividad_id, :estudiante_id, :docente_id, :motivo, :resultado, :error_codigo)'
    )->execute([
        ':actividad_id'  => $actividadId,
        ':estudiante_id' => $estudianteId,
        ':docente_id'    => $docenteId,
        ':motivo'        => $motivo,
        ':resultado'     => $resultado,
        ':error_codigo'  => $errorCodigo,
    ]);
}

// Último intento de envío de cada estudiante de la actividad (para la
// pantalla del docente): [estudiante_id => ['resultado' => ..., 'fecha' => ...]].
// Quien no tiene ninguno no aparece.
function ultimosCorreos(PDO $pdo, int $actividadId, ?int $estudianteId = null): array
{
    $sql = 'SELECT ce.estudiante_id, ce.resultado, ce.fecha
            FROM correo_envio ce
            WHERE ce.actividad_id = :actividad_id
              AND ce.id = (SELECT MAX(x.id) FROM correo_envio x
                           WHERE x.actividad_id = ce.actividad_id AND x.estudiante_id = ce.estudiante_id)';
    $parametros = [':actividad_id' => $actividadId];
    if ($estudianteId !== null) {
        $sql .= ' AND ce.estudiante_id = :estudiante_id';
        $parametros[':estudiante_id'] = $estudianteId;
    }
    $consulta = $pdo->prepare($sql);
    $consulta->execute($parametros);

    $ultimos = [];
    foreach ($consulta->fetchAll() as $fila) {
        $ultimos[(int) $fila['estudiante_id']] = ['resultado' => $fila['resultado'], 'fecha' => $fila['fecha']];
    }
    return $ultimos;
}

// Resumen para el docente: "Enviado a N · Sin correo M · Error K · Pendientes P"
// (solo las partes que no son cero, salvo "Enviado a").
function textoResumenCorreo(array $envio): string
{
    $partes = ['Enviado a ' . $envio['enviados']];
    if ($envio['sin_correo'] > 0) {
        $partes[] = 'Sin correo ' . $envio['sin_correo'];
    }
    if ($envio['errores'] > 0) {
        $partes[] = 'Error ' . $envio['errores'];
    }
    if ($envio['pendientes'] > 0) {
        $partes[] = 'Pendientes ' . $envio['pendientes'];
    }
    return 'Correo: ' . implode(' · ', $partes) . '.';
}

// Manda el enlace de la actividad a cada estudiante de la lista que esté
// asignado a ella. Los destinatarios y sus direcciones salen de la base.
// Envío secuencial: hasta CORREO_MAX_POR_PEDIDO y CORREO_SEGUNDOS_POR_PEDIDO;
// lo que no se llegó a intentar queda 'pendiente' (sin fila en correo_envio).
// Cada intento hecho se registra. $motivo: 'asignacion' | 'reenvio'.
//
// Devuelve: [
//   'resultados' => [estudiante_id => 'enviado'|'sin_correo'|'error'|'pendiente'],
//   'enviados' => N, 'sin_correo' => N, 'errores' => N, 'pendientes' => N,
//   'aviso' => ?string,   // explicación para el docente si algo falló en general
// ]
function enviarCorreosActividad(PDO $pdo, int $actividadId, int $docenteId, array $estudianteIds, string $motivo): array
{
    $inicio = microtime(true);
    $salida = ['resultados' => [], 'enviados' => 0, 'sin_correo' => 0, 'errores' => 0, 'pendientes' => 0, 'aviso' => null];
    if (count($estudianteIds) === 0) {
        return $salida;
    }

    $consultaActividad = $pdo->prepare(
        'SELECT a.titulo, a.recurso_url, c.nombre AS clase_nombre
         FROM actividad a JOIN clase c ON c.id = a.clase_id
         WHERE a.id = :id'
    );
    $consultaActividad->execute([':id' => $actividadId]);
    $actividad = $consultaActividad->fetch();
    if (!$actividad) {
        return $salida;
    }

    $marcadores = implode(',', array_fill(0, count($estudianteIds), '?'));
    $consultaEstudiantes = $pdo->prepare(
        "SELECT u.id, u.nombre, u.email
         FROM actividad_estudiante ae
         JOIN usuario u ON u.id = ae.estudiante_id AND u.rol = 'estudiante'
         WHERE ae.actividad_id = ? AND u.id IN ($marcadores)
         ORDER BY u.apellido, u.nombre, u.id"
    );
    $consultaEstudiantes->execute(array_merge([$actividadId], array_values($estudianteIds)));
    $estudiantes = $consultaEstudiantes->fetchAll();

    $anotar = function (int $estudianteId, string $resultado, ?string $errorCodigo) use ($pdo, $actividadId, $docenteId, $motivo, &$salida): void {
        if ($resultado !== 'pendiente') {
            registrarIntentoCorreo($pdo, $actividadId, $estudianteId, $docenteId, $motivo, $resultado, $errorCodigo);
        }
        $salida['resultados'][$estudianteId] = $resultado;
        $clave = ['enviado' => 'enviados', 'sin_correo' => 'sin_correo', 'error' => 'errores', 'pendiente' => 'pendientes'][$resultado];
        $salida[$clave]++;
    };

    try {
        $config = configCorreo();
    } catch (CorreoConfigInvalida $e) {
        foreach ($estudiantes as $estudiante) {
            $anotar((int) $estudiante['id'], 'error', 'config');
        }
        $salida['aviso'] = $e->getMessage();
        return $salida;
    }

    $esquema = strtolower((string) parse_url($actividad['recurso_url'], PHP_URL_SCHEME));
    if (!in_array($esquema, ['http', 'https'], true)) {
        foreach ($estudiantes as $estudiante) {
            $anotar((int) $estudiante['id'], 'error', 'recurso');
        }
        $salida['aviso'] = 'El enlace del recurso de la actividad no es http o https.';
        return $salida;
    }

    if (function_exists('set_time_limit')) {
        set_time_limit(CORREO_SEGUNDOS_POR_PEDIDO + 4 * CORREO_TIMEOUT_SMTP);
    }

    $mailer = null;
    $cortar = false;
    try {
        $mailer = crearMailer($config);

        foreach ($estudiantes as $indice => $estudiante) {
            $estudianteId = (int) $estudiante['id'];

            if ($cortar || $indice >= CORREO_MAX_POR_PEDIDO
                || microtime(true) - $inicio > CORREO_SEGUNDOS_POR_PEDIDO) {
                $anotar($estudianteId, 'pendiente', null);
                continue;
            }

            $email = trim((string) $estudiante['email']);
            if ($email === '' || !PHPMailer::validateAddress($email)) {
                $anotar($estudianteId, 'sin_correo', null);
                continue;
            }

            $correo = armarCorreoActividad(
                $estudiante['nombre'],
                $actividad['titulo'],
                $actividad['clase_nombre'],
                urlConApoyos($actividad['recurso_url'], $estudianteId, $actividadId)
            );

            $mailer->clearAddresses();
            $mailer->clearAttachments();
            $mailer->addAddress($email, limpiarLineaCorreo($estudiante['nombre']));
            $mailer->Subject = $correo['asunto'];
            $mailer->isHTML(true);
            $mailer->Body    = $correo['html'];
            $mailer->AltBody = $correo['texto'];

            try {
                if ($config['modo'] === 'archivo') {
                    guardarCorreoEnArchivo($mailer, $actividadId, $estudianteId);
                } else {
                    $mailer->send();
                }
                $anotar($estudianteId, 'enviado', null);
            } catch (Throwable $e) {
                $codigo = $config['modo'] === 'archivo' ? 'archivo' : 'smtp';
                error_log('correo_envio.php: actividad ' . $actividadId . ', estudiante ' . $estudianteId
                    . ': ' . textoErrorSeguro($mailer->ErrorInfo !== '' ? $mailer->ErrorInfo : $e->getMessage()));
                $anotar($estudianteId, 'error', $codigo);

                // Sin conexión con el servidor no tiene sentido seguir
                // probando (cada intento esperaría el timeout): el resto
                // queda pendiente.
                $smtp = $config['modo'] === 'smtp' ? $mailer->getSMTPInstance() : null;
                if ($config['modo'] === 'archivo' || ($smtp !== null && !$smtp->connected())) {
                    $cortar = true;
                    $salida['aviso'] = $config['modo'] === 'archivo'
                        ? 'No se pudo guardar el correo en backend/correos_salida.'
                        : 'No se pudo enviar por el servidor de correo (revisá la configuración SMTP).';
                }
            }
        }
    } finally {
        if ($mailer !== null && $config['modo'] === 'smtp') {
            try {
                $mailer->smtpClose();
            } catch (Throwable $e) {
                // ya está cerrada o nunca se abrió
            }
        }
    }

    if ($salida['pendientes'] > 0 && $salida['aviso'] === null) {
        $salida['aviso'] = 'Se alcanzó el límite de envíos de un solo pedido ('
            . CORREO_MAX_POR_PEDIDO . ' correos o ' . CORREO_SEGUNDOS_POR_PEDIDO . ' segundos).';
    }

    return $salida;
}
