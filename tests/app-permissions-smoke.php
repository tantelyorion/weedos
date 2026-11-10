<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-app-perms-' . bin2hex(random_bytes(5));
mkdir($base . '/etc', 0700, true); mkdir($base . '/apps/demo-app', 0700, true);
putenv('WEED_DATA=' . $base);
require __DIR__ . '/../kernel/autoload.php';
file_put_contents($base . '/etc/apps.json', json_encode(['demo-app' => ['enabled' => true]]));
file_put_contents($base . '/apps/demo-app/manifest.json', json_encode(['id'=>'demo-app','name'=>'Demo','permissions'=>['app.demo-app.read','app.other.write','app.demo-app.read',42]]));
$r = Weed\AppPermissionManager::list();
if ($r['count'] !== 1 || $r['items'][0]['id'] !== 'demo-app' || $r['items'][0]['permission_count'] !== 1 || $r['items'][0]['permissions'] !== ['app.demo-app.read'] || $r['control'] !== 'read-only') throw new RuntimeException('app permission inventory failed');
if (Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('manifest declaration must not grant permission');
Weed\AppPermissionManager::grant('demo-app', 'app.demo-app.read');
if (!Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('explicit grant failed');
Weed\AppPermissionManager::revoke('demo-app', 'app.demo-app.read');
if (Weed\AppPermissionManager::isGranted('demo-app', 'app.demo-app.read')) throw new RuntimeException('revoke failed');

@unlink($base . '/etc/app-permissions.json'); @unlink($base . '/apps/demo-app/manifest.json'); @rmdir($base . '/apps/demo-app'); @rmdir($base . '/apps'); @unlink($base . '/etc/apps.json'); @rmdir($base . '/etc'); @rmdir($base);
echo "Application permissions smoke test OK\n";
