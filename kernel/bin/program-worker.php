<?php
declare(strict_types=1);

/** Point d'entrée isolé des actions PHP des Programmes. Protocole JSON stdin/stdout.
 *  v0.8.6 : démarre éventuellement en root (lancé par le Kernel), puis devient weedworker (990)
 *  AVANT de charger le moindre code de Programme. L'intégrité est vérifiée par le Kernel. */
define('WEED_ROOT', getenv('WEED_ROOT') ?: dirname(__DIR__, 2));
putenv('WEED_WORKER=1');

try {
    require_once WEED_ROOT . '/kernel/src/Isolation.php';
    if (getenv('WEED_ISOLATE') === '1') {
        Weed\Isolation::dropPrivileges();           // fail-closed : exception si non prouvé
    } elseif (Weed\Isolation::isRoot()) {
        throw new RuntimeException('worker root sans isolation refusé');
    }
    // Le code du Kernel est chargé APRÈS l'abandon : il doit donc être lisible par weedworker.
    require_once WEED_ROOT . '/kernel/autoload.php';

    $id = (string)($argv[1] ?? '');
    $action = (string)($argv[2] ?? '');
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id) ||
        !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/', $action)) {
        throw new RuntimeException('identifiant ou action invalide');
    }
    $base = WEED_DATA . '/apps/' . $id;
    if (is_link($base) || !is_dir($base)) throw new RuntimeException('Programme introuvable');
    $manifest = json_decode((string)file_get_contents($base . '/manifest.json'), true);
    $hook = is_array($manifest) ? ($manifest['hooks'] ?? null) : null;
    if (!is_string($hook) || !preg_match('#^[A-Za-z0-9_./-]+\.php$#', $hook) || str_contains($hook, '..')) {
        throw new RuntimeException('hook du Programme invalide');
    }
    $hookPath = $base . '/' . $hook;
    if (!is_file($hookPath) || is_link($hookPath)) throw new RuntimeException('hook introuvable');
    $request = json_decode((string)file_get_contents('php://stdin'), true);
    if (!is_array($request) || !is_array($request['args'] ?? null) || !is_array($request['user'] ?? null)) {
        throw new RuntimeException('requête worker invalide');
    }
    $hooks = (static function (string $file) { return require $file; })($hookPath);
    $fn = is_array($hooks) ? ($hooks['syscalls'][$action] ?? null) : null;
    if (!is_callable($fn)) throw new RuntimeException('action du Programme inconnue');
    $result = $fn($request['args'], $request['user']);
    $encoded = json_encode(['ok' => true, 'result' => $result], JSON_THROW_ON_ERROR);
    fwrite(STDOUT, $encoded);
} catch (Throwable $e) {
    fwrite(STDOUT, json_encode(['ok' => false, 'error' => $e->getMessage()], JSON_INVALID_UTF8_SUBSTITUTE));
    exit(1);
}
