<?php
declare(strict_types=1);
require_once __DIR__ . '/../kernel/autoload.php';
$result = Weed\ProcessManager::list(25);
foreach (['available', 'processes', 'count', 'sampled_at'] as $key) {
    if (!array_key_exists($key, $result)) throw new RuntimeException("Champ manquant: $key");
}
if (!is_bool($result['available']) || !is_array($result['processes'])) throw new RuntimeException('Inventaire invalide');
if ($result['count'] !== count($result['processes']) || $result['count'] > 25) throw new RuntimeException('Limite de processus non respectée');
foreach ($result['processes'] as $p) {
    if (!is_int($p['pid']) || $p['pid'] < 1 || !is_string($p['name']) || !is_string($p['state'])) throw new RuntimeException('Entrée processus invalide');
}
echo "Process manager smoke test: OK\n";
