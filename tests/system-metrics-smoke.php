<?php
declare(strict_types=1);
require_once __DIR__ . '/../kernel/autoload.php';

$metrics = Weed\SystemMetrics::collect();
$required = ['sampled_at', 'uptime_seconds', 'memory', 'load_average', 'disks', 'cpu_count', 'process_model'];
foreach ($required as $key) {
    if (!array_key_exists($key, $metrics)) throw new RuntimeException("Métrique absente: $key");
}
if (!is_int($metrics['sampled_at']) || $metrics['sampled_at'] <= 0) throw new RuntimeException('Horodatage invalide');
if (!is_int($metrics['uptime_seconds']) || $metrics['uptime_seconds'] < 0) throw new RuntimeException('Uptime invalide');
if (!is_array($metrics['memory']) || ($metrics['memory']['total'] ?? -1) < 0) throw new RuntimeException('Mémoire invalide');
if (!is_array($metrics['disks'])) throw new RuntimeException('Disques invalides');
foreach ($metrics['disks'] as $disk) {
    if (($disk['total'] ?? -1) < 0 || ($disk['free'] ?? -1) < 0 || ($disk['used'] ?? -1) < 0) throw new RuntimeException('Valeurs disque invalides');
    if ($disk['free'] > $disk['total'] || $disk['used'] > $disk['total']) throw new RuntimeException('Bornes disque invalides');
}
echo "System metrics smoke test: OK\n";
