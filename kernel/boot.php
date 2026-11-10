<?php
declare(strict_types=1);
// Weed OS - point d'entrée du Kernel PHP.
//   php kernel/boot.php --dev     (développement : serveur shell seul)
//   lancé par weedinit (PID 1)    (système réel : shell + affichage)
define('WEED_ROOT', getenv('WEED_ROOT') ?: dirname(__DIR__));
require_once __DIR__ . '/autoload.php';
(new Weed\Kernel())->boot($argv);
