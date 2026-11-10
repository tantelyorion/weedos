<?php
declare(strict_types=1);

/** Weed Unix Isolation Core (0.8.6) — test RÉEL de l'abandon des privilèges.
 *  À lancer en root, sur un système où le compte weedworker (UID/GID 990) existe :  sudo php tests/isolation-smoke.php
 *  Hors root : le test est ignoré (code 0) car aucune isolation Unix n'est possible. */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-isolation-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function iso(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException('ÉCHEC : ' . $message);
    echo "  ok  $message\n";
}
function isoRemove(string $path): void {
    if (is_link($path) || is_file($path)) { @unlink($path); return; }
    if (!is_dir($path)) return;
    foreach (scandir($path) ?: [] as $n) if ($n !== '.' && $n !== '..') isoRemove($path . '/' . $n);
    @rmdir($path);
}
$missing = Weed\Isolation::missingRequirements();
if ($missing !== []) { fwrite(STDERR, "ÉCHEC : extension/fonctions absentes : " . implode(', ', $missing) . "\n"); exit(1); }
iso(true, 'extension POSIX et fonctions setuid/setgid/initgroups disponibles');
if (!Weed\Isolation::isRoot()) { echo "IGNORÉ : lancez ce test en root pour vérifier l'abandon réel des privilèges.\n"; exit(0); }
try {
    $pw = Weed\Isolation::accountInfo();
    iso((int)$pw['uid'] === 990 && (int)$pw['gid'] === 990, 'compte weedworker = UID/GID 990');
} catch (Throwable $e) { fwrite(STDERR, 'ÉCHEC : ' . $e->getMessage() . "\n"); exit(1); }

try {
    mkdir($data . '/etc', 0700, true); mkdir($data . '/var/log', 0700, true);
    mkdir($data . '/appdata/iso-demo', 0700, true);
    chown($data . '/appdata/iso-demo', 990); chgrp($data . '/appdata/iso-demo', 990);
    chmod($data, 0711); chmod($data . '/appdata', 0711);
    mkdir($data . '/apps', 0755); $dir = $data . '/apps/iso-demo'; mkdir($dir, 0755);
    file_put_contents($dir . '/manifest.json', json_encode(['id' => 'iso-demo', 'name' => 'Iso', 'version' => '1.0.0', 'hooks' => 'hooks.php']));
    file_put_contents($dir . '/hooks.php', <<<'HOOK'
<?php
$app = dirname(__FILE__);
return ['syscalls' => [
    'ids' => static fn(array $a, array $u): array => [posix_getuid(), posix_geteuid(), posix_getgid(), posix_getegid(), posix_getgroups()],
    'regainRoot' => static fn(array $a, array $u): bool => @posix_setuid(0) || @posix_seteuid(0) || @posix_setgid(0),
    'writeCode' => static fn(array $a, array $u): bool => @file_put_contents($app . '/hooks.php', '<?php return [];') !== false,
    'writeOwnData' => static fn(array $a, array $u): bool => @file_put_contents((string)getenv('WEED_PROGRAM_DATA') . '/note.txt', 'ok') !== false,
    'readKey' => static fn(array $a, array $u): bool => @file_get_contents((string)getenv('WEED_DATA') . '/etc/security.key') !== false,
    'listHome' => static fn(array $a, array $u): bool => @scandir((string)getenv('WEED_DATA') . '/home') !== false,
    'writeOther' => static fn(array $a, array $u): bool => @file_put_contents((string)getenv('WEED_DATA') . '/apps/autre.txt', 'x') !== false,
]];
HOOK);
    chmod($dir . '/manifest.json', 0644); chmod($dir . '/hooks.php', 0644);
    Weed\Security::signProgram('iso-demo', $dir);
    mkdir($data . '/home', 0700);
    $w = new Weed\ProgramWorker(5, 64);
    $u = ['name' => 'tester'];
    echo "Isolation Unix des Workers :\n";
    $ids = $w->call('iso-demo', 'ids', [], $u);
    iso(array_slice($ids, 0, 4) === [990, 990, 990, 990], 'worker en UID/GID réels et effectifs 990');
    iso(!in_array(0, $ids[4], true), 'aucun groupe root conservé');
    iso($w->call('iso-demo', 'regainRoot', [], $u) === false, 'impossible de reprendre root (setuid(0) refusé)');
    iso($w->call('iso-demo', 'writeCode', [], $u) === false, 'le code du Programme est en lecture seule');
    iso($w->call('iso-demo', 'writeOwnData', [], $u) === true, 'écriture permise dans appdata/<id>');
    iso($w->call('iso-demo', 'readKey', [], $u) === false, 'security.key (0600 root) illisible par le worker');
    iso($w->call('iso-demo', 'listHome', [], $u) === false, 'data/home (0700 root) inaccessible au worker');
    iso($w->call('iso-demo', 'writeOther', [], $u) === false, 'écriture hors de appdata/<id> refusée');
    iso(fileowner($data . '/appdata/iso-demo/note.txt') === 990, 'fichier créé appartenant à weedworker');
    echo "Weed Unix Isolation : OK\n";
} finally {
    isoRemove($data);
}
