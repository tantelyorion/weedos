<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-sessions-' . bin2hex(random_bytes(5));
mkdir($base . '/var/run/sessions', 0700, true);
putenv('WEED_DATA=' . $base);
require __DIR__ . '/../kernel/autoload.php';
file_put_contents($base . '/var/run/sessions/' . str_repeat('a', 64) . '.json', json_encode(['user'=>'tester','exp'=>time()+600]));
file_put_contents($base . '/var/run/sessions/' . str_repeat('b', 64) . '.json', json_encode(['user'=>'tester','exp'=>time()-10]));
$r=Weed\SessionManager::list();
if ($r['count'] !== 2 || $r['active'] !== 1 || $r['control'] !== 'read-only' || isset($r['sessions'][0]['token'])) throw new RuntimeException('session inventory failed');
foreach (glob($base . '/var/run/sessions/*') ?: [] as $f) unlink($f);
rmdir($base . '/var/run/sessions'); rmdir($base . '/var/run'); rmdir($base . '/var'); rmdir($base);
echo "Session manager smoke test OK\n";
