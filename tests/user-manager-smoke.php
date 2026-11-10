<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-users-' . bin2hex(random_bytes(5));
mkdir($base, 0700, true);
putenv('WEED_DATA=' . $base);
require __DIR__ . '/../kernel/autoload.php';
$auth = new Weed\Auth();
$auth->setup('adminone', 'strong-pass-1');
$auth->create('testuser', 'strong-pass-2', 'user');
$rows = $auth->listUsers();
if (count($rows) !== 2 || $rows[0]['name'] !== 'adminone' || $rows[1]['role'] !== 'user') {
    throw new RuntimeException('user listing failed');
}
$token = $auth->login('testuser', 'strong-pass-2');
if (!is_string($token) || strlen($token) !== 64) throw new RuntimeException('login token failed');
$auth->remove('testuser');
$sessionPath = $base . '/var/run/sessions/' . hash('sha256', $token) . '.json';
if (is_file($sessionPath)) throw new RuntimeException('user sessions were not revoked');
$blocked = false;
try { $auth->remove('adminone'); } catch (RuntimeException $e) { $blocked = str_contains($e->getMessage(), 'dernier administrateur'); }
if (!$blocked) throw new RuntimeException('last administrator protection failed');
$usersFile = $base . '/etc/users.json';
$contents = (string)file_get_contents($usersFile);
if (str_contains($contents, 'strong-pass-1') || str_contains($contents, 'strong-pass-2')) throw new RuntimeException('plaintext password leaked');
function rrmdir(string $dir): void { foreach (scandir($dir) ?: [] as $item) { if ($item === '.' || $item === '..') continue; $p=$dir.'/'.$item; is_dir($p) && !is_link($p) ? rrmdir($p) : @unlink($p); } @rmdir($dir); }
rrmdir($base);
echo "User manager smoke test OK\n";
