<?php
/**
 * Modulo protesi acustiche — reindirizza al form sul sito pubblico.
 * Caricare questo file nella root del gestionale (stesso livello di richiesta_isee.php).
 */
declare(strict_types=1);

$dest = 'https://servizialcittadino.org/protesi-acustiche-napoli/#wp-block-themeisle-blocks-form-c8e2f21a';

if (!headers_sent()) {
    header('Cache-Control: no-store');
    header('Location: ' . $dest, true, 302);
    exit;
}
?>
<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=<?= htmlspecialchars($dest, ENT_QUOTES, 'UTF-8') ?>">
<title>Protesi acustiche — Servizi al Cittadino</title>
</head>
<body>
<p><a href="<?= htmlspecialchars($dest, ENT_QUOTES, 'UTF-8') ?>">Vai al modulo richiesta protesi acustiche</a></p>
</body>
</html>