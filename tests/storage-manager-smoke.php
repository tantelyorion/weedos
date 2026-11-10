<?php
declare(strict_types=1);
require_once __DIR__ . '/../kernel/autoload.php';

$result = Weed\StorageManager::inventory();
if (!is_array($result['mounts'] ?? null) || !is_int($result['count'] ?? null)) throw new RuntimeException('Inventaire stockage invalide');
if (($result['control'] ?? '') !== 'read-only') throw new RuntimeException('Contrôle stockage inattendu');
if (count($result['mounts']) > 100) throw new RuntimeException('Trop de points de montage');
foreach ($result['mounts'] as $mount) {
    foreach (['mountpoint','filesystem','total','free','used','read_only','pseudo','space_available'] as $key) {
        if (!array_key_exists($key, $mount)) throw new RuntimeException("Champ stockage absent: $key");
    }
    if (!is_string($mount['mountpoint']) || $mount['mountpoint'] === '' || $mount['mountpoint'][0] !== '/') throw new RuntimeException('Point de montage invalide');
    if (!is_int($mount['total']) || !is_int($mount['free']) || !is_int($mount['used'])) throw new RuntimeException('Capacité non numérique');
    if ($mount['free'] > $mount['total'] || $mount['used'] > $mount['total']) throw new RuntimeException('Capacité hors limites');
    if (array_key_exists('device', $mount) || array_key_exists('source', $mount)) throw new RuntimeException('Une source de périphérique ne doit pas être exposée');
}
echo "Storage manager smoke test: OK (" . $result['count'] . " mounts)\n";
