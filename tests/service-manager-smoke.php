<?php
declare(strict_types=1);
require_once __DIR__ . '/../kernel/autoload.php';
$r = Weed\ServiceManager::list();
foreach (['available','control','services','count','sampled_at'] as $k) if (!array_key_exists($k, $r)) throw new RuntimeException("Champ manquant: $k");
if ($r['control'] !== 'read-only' || $r['count'] !== count($r['services'])) throw new RuntimeException('Inventaire service invalide');
foreach ($r['services'] as $s) if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/', $s['name'])) throw new RuntimeException('Nom de service invalide');
echo "Service manager smoke test: OK\n";
