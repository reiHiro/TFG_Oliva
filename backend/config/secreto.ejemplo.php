<?php
// Plantilla del secreto para firmar tokens. Copiar como secreto.php
// y reemplazar el valor por uno aleatorio generado con:
//   php -r "echo bin2hex(random_bytes(64));"
// secreto.php no se sube al repositorio.

const TOKEN_SECRETO = 'reemplazar-por-un-string-largo-y-aleatorio';
