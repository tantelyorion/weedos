<?php
declare(strict_types=1);
// Weed OS - autoloader du kernel (namespace Weed\ -> kernel/src/)
if (!defined('WEED_ROOT')) define('WEED_ROOT', getenv('WEED_ROOT') ?: dirname(__DIR__));
if (!defined('WEED_DATA')) define('WEED_DATA', getenv('WEED_DATA') ?: WEED_ROOT . '/data');
if (!defined('WEED_VERSION')) define('WEED_VERSION', '1.0.0');
spl_autoload_register(static function (string $class): void {
    if (strpos($class, 'Weed\\') !== 0) return;
    $file = WEED_ROOT . '/kernel/src/' . str_replace('\\', '/', substr($class, 5)) . '.php';
    if (is_file($file)) require $file;
});
