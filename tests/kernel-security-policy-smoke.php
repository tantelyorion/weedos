<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-policy-' . bin2hex(random_bytes(5));
mkdir($base . '/etc', 0700, true); mkdir($base . '/apps/demo-app', 0700, true);
putenv('WEED_DATA=' . $base);
require __DIR__ . '/../kernel/autoload.php';
file_put_contents($base . '/etc/apps.json', json_encode(['demo-app' => ['enabled' => true]]));
file_put_contents($base . '/apps/demo-app/manifest.json', json_encode(['id'=>'demo-app','name'=>'Demo','permissions'=>['app.demo-app.read','app.demo-app.write']]));
if (Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('permission accordée implicitement');
Weed\AppPermissionManager::grant('demo-app', 'app.demo-app.read');
if (!Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('octroi explicite non appliqué');
if (Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.write')) throw new RuntimeException('privilège voisin hérité');
Weed\AppPermissionManager::revoke('demo-app', 'app.demo-app.read');
if (Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('révocation non appliquée');
try { Weed\AppPermissionManager::grant('demo-app', 'app.autre.read'); throw new RuntimeException('permission étrangère acceptée'); }
catch (RuntimeException $e) { if ($e->getMessage() === 'permission étrangère acceptée') throw $e; }
@unlink($base.'/etc/app-permissions.json'); @unlink($base.'/etc/apps.json'); @unlink($base.'/apps/demo-app/manifest.json'); @rmdir($base.'/apps/demo-app'); @rmdir($base.'/apps'); @rmdir($base.'/etc'); @rmdir($base);
echo "Kernel security policy smoke test OK\n";
