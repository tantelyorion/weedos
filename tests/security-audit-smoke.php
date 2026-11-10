<?php
declare(strict_types=1);
require_once __DIR__ . '/../kernel/autoload.php';
$r = Weed\SecurityAudit::run();
if (!isset($r['checks'], $r['summary'], $r['mutations']) || $r['mutations'] !== false) throw new RuntimeException('Audit sécurité invalide');
foreach ($r['checks'] as $c) if (!isset($c['name'], $c['status'], $c['detail'])) throw new RuntimeException('Contrôle incomplet');
echo "Security audit smoke test: OK\n";
