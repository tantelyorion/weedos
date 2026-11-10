<?php
declare(strict_types=1);
require __DIR__ . '/../kernel/autoload.php';
$base = sys_get_temp_dir() . '/weed-startup-' . bin2hex(random_bytes(5));
mkdir($base . '/.config/autostart', 0700, true);
file_put_contents($base . '/.config/autostart/editor.desktop', "[Desktop Entry]\nName=Editor\nExec=editor --open\n");
file_put_contents($base . '/.config/autostart/disabled.desktop', "[Desktop Entry]\nName=Disabled\nExec=bad\nHidden=true\n");
$r = Weed\StartupManager::list($base);
$userItems = array_values(array_filter($r['items'], static fn($x) => $x['source'] === 'user'));
if (count($userItems) !== 1 || $userItems[0]['name'] !== 'Editor' || $userItems[0]['control'] !== 'read-only') throw new RuntimeException('startup inventory failed');
@unlink($base . '/.config/autostart/editor.desktop'); @unlink($base . '/.config/autostart/disabled.desktop'); @rmdir($base . '/.config/autostart'); @rmdir($base . '/.config'); @rmdir($base);
echo "Startup manager smoke test OK\n";
