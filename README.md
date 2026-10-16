# Sistema Integrado de Apoyos Digitales y Métricas Pedagógicas

Prototipo de Trabajo Final de Grado (Licenciatura en Informática).

Una extensión de navegador da **apoyos de accesibilidad** a los estudiantes
mientras resuelven una actividad sobre contenido web. Una aplicación web les
muestra a los docentes **métricas pedagógicas** de esas actividades.

## Qué hace

**Docente (aplicación web)**
- Organiza sus actividades en clases. Cada actividad tiene un recurso web,
  una consigna y pasos de opción única, opción múltiple o verdadero/falso.
- Asigna actividades a estudiantes y, si quiere, les manda el enlace por
  correo. También puede duplicar, editar, dar de baja y reactivar (la baja
  es lógica y se puede revertir).
- Puede pedir que el estudiante justifique cada paso con su propia
  producción: un fragmento citado del material, texto libre o un momento de
  un video o audio. Después marca si esa justificación es válida.
- Ve métricas por actividad y por estudiante: tiempo en foco, uso de cada
  apoyo, acierto por paso y pasos con mayor dificultad. Desde ahí manda
  devoluciones al estudiante y puede reabrir una Tarea ya finalizada.

**Estudiante (extensión)**
- Panel lateral sobre la página del recurso, con:
  - Lectura en voz alta (Web Speech API), con resaltado de la palabra leída.
  - Modo lectura (tamaño, espaciado, contraste, foco de línea y vista de
    lectura limpia).
  - Tarea: los pasos de la actividad, con Empezar/Finalizar y cronómetro.
  - Mensajes del docente.
  - Mi clase: las otras actividades asignadas de la misma clase.
- Glosario con pictogramas: **pendiente**.

El sistema muestra datos en bruto (conteos, tiempos, porcentajes). La
interpretación pedagógica queda siempre a cargo del docente.

## Arquitectura

```
extension/  →  fetch() desde background.js  →  backend/api/*.php  →  MySQL
webapp/     →  fetch()                      ↗
```

- **`backend/`**: PHP sin framework. Expone una API REST simple que recibe y
  devuelve JSON. Todas las consultas usan PDO con prepared statements, y las
  contraseñas se guardan con `password_hash()`.
- **`webapp/`**: HTML, Bootstrap y JavaScript vanilla. Usa la sesión de PHP.
- **`extension/`**: Manifest V3, solo JavaScript, HTML y CSS. Se autentica
  con un token firmado con HMAC-SHA256, que viaja en el enlace de la
  actividad (nunca con la cookie de sesión). Cada endpoint vuelve a
  comprobar la asignación y la vigencia de la actividad.

## Requisitos

- [XAMPP](https://www.apachefriends.org/) con PHP 8 o posterior (trae
  Apache, PHP y MySQL/MariaDB con phpMyAdmin).
- Google Chrome o Microsoft Edge de escritorio, versión 123 o posterior.
  La extensión no funciona en celulares.

## Instalación local paso a paso

Los ejemplos usan Windows con XAMPP en `C:\xampp`. En otra ubicación o
sistema, reemplazá esa ruta por la carpeta `htdocs` de tu XAMPP.

### Resumen: qué archivos hay que crear o cambiar

| Archivo | ¿Hace falta? | Qué hacer |
|---|---|---|
| `backend/config/secreto.php` | **Sí, siempre** | No viene en el repositorio. Se crea copiando `secreto.ejemplo.php` (paso 4). |
| `backend/config/correo.php` | No (opcional) | No viene en el repositorio. Solo si querés mandar correos de verdad: se crea copiando `correo.ejemplo.php` (paso 5). |
| `backend/config/db.php` | Solo si tu MySQL no es el de fábrica | Cambiar `DB_USER` / `DB_PASS` (paso 3). |
| Archivos con la dirección del backend | Solo si no usás `http://localhost/apoyos-educativos/` | Ver [Usar otra carpeta o dirección](#usar-otra-carpeta-o-dirección). |

Todo lo demás se usa tal como viene.

### Archivos que no vienen en el repositorio

Algunos archivos están en `.gitignore`: existen en cada instalación, pero no
se suben nunca, porque tienen claves o datos personales. Por eso, quien
descarga el proyecto **no los recibe** y tiene que generarlos (o el sistema
los genera solo):

| Archivo ignorado | Por qué no se sube | Qué hacer al instalar |
|---|---|---|
| `backend/config/secreto.php` | Tiene la clave que firma los enlaces de los estudiantes. Con ella, cualquiera podría armar un enlace válido. | **Crearlo** a partir de `secreto.ejemplo.php`, con un valor propio (paso 4). Cada instalación tiene que tener el suyo. |
| `backend/config/correo.php` | Tiene el usuario y la contraseña del servidor de correo. | **Opcional.** Crearlo a partir de `correo.ejemplo.php` solo para enviar correos de verdad (paso 5). Sin él, se usa el modo archivo. |
| `backend/correos_salida/*.eml` | Cada uno tiene el enlace personal de un estudiante, que funciona como su contraseña para esa actividad. | Nada. La carpeta ya viene (con su `.htaccess`, que impide verla desde el navegador) y los `.eml` se crean solos al asignar actividades. Se pueden borrar cuando quieras. |

Las plantillas `secreto.ejemplo.php` y `correo.ejemplo.php` sí vienen en el
repositorio y **no hay que editarlas**: se copian y se edita la copia.

Si publicás tu propia copia del proyecto, revisá con `git status` antes de
cada commit que ninguno de estos archivos aparezca para subir.

### 1. Descargar el proyecto en la carpeta correcta

La aplicación espera estar en `http://localhost/apoyos-educativos/`. **La
carpeta tiene que llamarse exactamente `apoyos-educativos`** y estar dentro
de `htdocs`.

- **Con git:**

  ```
  cd C:\xampp\htdocs
  git clone <URL-de-este-repositorio> apoyos-educativos
  ```

- **Con el ZIP** (botón verde *Code* → *Download ZIP*): descomprimilo y
  renombrá la carpeta que se crea (por ejemplo `nombre-del-repo-main`) a
  `apoyos-educativos`. Después movela a `C:\xampp\htdocs\`.

Tiene que quedar así: `C:\xampp\htdocs\apoyos-educativos\backend`,
`...\webapp` y `...\extension`.

### 2. Iniciar Apache y MySQL

Abrí el *XAMPP Control Panel* y tocá *Start* en **Apache** y en **MySQL**.
Los dos tienen que quedar en verde.

### 3. Crear la base de datos

1. Entrá a `http://localhost/phpmyadmin`.
2. *Nueva* → nombre `apoyos_educativos`, cotejamiento
   `utf8mb4_unicode_ci` → *Crear*.
3. Con la base seleccionada, andá a *Importar*, elegí el archivo
   `backend/sql/schema.sql` y tocá *Importar* (abajo de todo).

La conexión está en `backend/config/db.php`. Viene configurada para el MySQL
de fábrica de XAMPP (usuario `root`, sin contraseña). Si le pusiste
contraseña o usás otro usuario, cambiá estas líneas:

```php
const DB_USER = 'root';   // tu usuario de MySQL
const DB_PASS = '';       // tu contraseña de MySQL
```

Si cambiás `db.php` con tu contraseña, no subas ese cambio a un repositorio.

> No hay migraciones. Si `schema.sql` cambia al actualizar el proyecto, hay
> que borrar la base, crearla vacía otra vez e importar de nuevo (se pierden
> los datos de prueba).

### 4. Crear el secreto de los tokens (obligatorio)

1. En `backend/config/`, copiá `secreto.ejemplo.php` y llamá a la copia
   `secreto.php`.
2. Generá un valor aleatorio. Con el PHP de XAMPP:

   ```
   C:\xampp\php\php.exe -r "echo bin2hex(random_bytes(64));"
   ```

3. En `secreto.php`, reemplazá `reemplazar-por-un-string-largo-y-aleatorio`
   por el valor generado, dejando las comillas. Queda algo así (con tu
   propio valor, no este):

   ```php
   const TOKEN_SECRETO = '9f3c...a71b';   // 128 caracteres
   ```

Sin este archivo la extensión no puede abrir las actividades. Si más
adelante cambiás el secreto, los enlaces de actividades que ya se
generaron (incluidos los enviados por correo) dejan de funcionar y hay que
volver a abrirlos desde el panel.

### 5. Correo (opcional)

No hace falta configurar nada. Sin configuración, los correos no se envían:
cada uno se guarda como archivo `.eml` en `backend/correos_salida/`, y se
puede abrir con cualquier programa de correo para ver el enlace.

Para mandarlos de verdad por SMTP, copiá `backend/config/correo.ejemplo.php`
como `backend/config/correo.php` y completá estos valores:

| Clave | Qué poner |
|---|---|
| `modo` | `'smtp'` para enviar (`'archivo'` = guardar `.eml`, como sin el archivo). |
| `host` | Servidor SMTP, por ejemplo `'smtp.gmail.com'`. |
| `puerto` | `587` con `cifrado` `'tls'`, o `465` con `'ssl'`. |
| `cifrado` | `'tls'`, `'ssl'` o `''` (sin cifrar, solo para un servidor de prueba local). |
| `usuario` | La cuenta con la que se entra al servidor SMTP. |
| `clave` | Su contraseña. En Gmail tiene que ser una *contraseña de aplicación* (requiere verificación en dos pasos), no la contraseña normal. |
| `remitente` | La dirección que figura como "De". En Gmail, la misma que `usuario`. |
| `remitente_nombre` | El nombre que figura como "De" (viene `'Apoyos educativos'`). |
| `responder_a` | Dirección para "Responder a", o `''` para no agregarla. |

> `secreto.php` y `correo.php` están en `.gitignore`. **No los subas nunca
> a un repositorio**: tienen la clave de los tokens y la del correo.

### 6. Abrir la aplicación web

Entrá a `http://localhost/apoyos-educativos/webapp/`. Tiene que aparecer la
pantalla de inicio de sesión.

### 7. Instalar la extensión

1. Abrí `chrome://extensions` (Chrome) o `edge://extensions` (Edge).
2. Activá el **Modo de desarrollador**.
3. Tocá **Cargar extensión sin empaquetar** y elegí la carpeta
   `C:\xampp\htdocs\apoyos-educativos\extension`.
4. En Edge, si vas a probar en una ventana InPrivate, entrá a los
   *Detalles* de la extensión y activá *Permitir en InPrivate*.

### 8. Probarlo

En el mismo navegador se puede tener una sola sesión a la vez, así que se va
cerrando sesión para cambiar de usuario.

1. Registrate como **estudiante** y cerrá sesión.
2. Registrate como **docente**.
3. Creá una clase y, dentro de ella, una actividad: un recurso (la dirección
   de una página web), una consigna y al menos un paso.
4. Asigná la actividad al estudiante y cerrá sesión.
5. Entrá como estudiante y tocá **Abrir** en la actividad. Se abre el
   recurso en otra pestaña y la extensión muestra la barra lateral con los
   apoyos.
6. Volvé a entrar como docente y abrí las métricas de la actividad.

### Usar otra carpeta o dirección

Lo más simple es respetar `http://localhost/apoyos-educativos/`. Si
necesitás otra carpeta, otro puerto u otro servidor, la dirección del
backend está escrita en estos archivos y hay que cambiarla en **todos**:

| Archivo | Qué cambiar |
|---|---|
| `webapp/js/api.js` | `const API_BASE = 'http://localhost/apoyos-educativos/backend/api/';` |
| `extension/background.js` | `const API_BASE = 'http://localhost/apoyos-educativos/backend/api/';` |
| `extension/content_script.js` | `const URL_FINALIZAR_RESPALDO = 'http://localhost/apoyos-educativos/backend/api/tarea_finalizar.php';` |
| `extension/manifest.json` | `"host_permissions": ["http://localhost/*"]`, si el backend deja de estar en `localhost`. |

Después de cambiar algo en `extension/`, recargá la extensión en
`chrome://extensions` o `edge://extensions`.

### Si algo no funciona

| Problema | Qué revisar |
|---|---|
| `http://localhost/apoyos-educativos/webapp/` da "Not Found" | Que la carpeta se llame `apoyos-educativos` y esté dentro de `htdocs`. |
| Apache no arranca | Otro programa usa el puerto 80 (por ejemplo Skype o IIS). Cerralo: la aplicación espera Apache en el puerto 80, sin número de puerto en la dirección. |
| Error de conexión a la base | Que MySQL esté iniciado, que la base se llame `apoyos_educativos` y que se haya importado `schema.sql`. |
| La barra no aparece en el recurso | Que la extensión esté cargada y activada, que la actividad se haya abierto con **Abrir** desde el panel del estudiante (no escribiendo la dirección a mano) y que exista `secreto.php`. En una ventana privada, la extensión tiene que tener permiso para funcionar ahí. Probá recargar la página. |
| Cambiaste algo en `extension/` y no se nota | En la página de extensiones, tocá el botón de recargar de la extensión. |

## Estructura

```
backend/
  api/        endpoints (un archivo PHP por acción)
  config/     conexión, validaciones y helpers compartidos
  lib/        PHPMailer (sin acceso por web)
  sql/        schema.sql
webapp/       pantallas del docente y del estudiante (HTML, CSS, JS)
extension/    manifest, background.js, content scripts y vendor/
```

## Software de terceros

- [PHPMailer](https://github.com/PHPMailer/PHPMailer) 6.12.0, licencia
  LGPL 2.1. Está en `backend/lib/phpmailer/`, con su licencia y su origen.
- [Readability.js](https://github.com/mozilla/readability) de Mozilla,
  licencia Apache 2.0. Está en `extension/vendor/`, con su licencia y su
  origen.
- [Bootstrap](https://getbootstrap.com/) 5.3.3 (desde CDN), licencia MIT.
- Tipografías [Fraunces](https://fonts.google.com/specimen/Fraunces) y
  [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans),
  desde Google Fonts (SIL Open Font License).
- Ilustración de [unDraw](https://undraw.co/), recoloreada.

## Autora

Débora Oliva — Trabajo Final de Grado, Licenciatura en Informática.
