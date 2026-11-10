<?php
declare(strict_types=1);

/** Tests locaux non destructifs : comptes, permissions Unix et isolation VFS. */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-security-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function removeTree(string $path): void
{
    if (is_link($path) || is_file($path)) { @unlink($path); return; }
    if (!is_dir($path)) return;
    foreach (scandir($path) ?: [] as $name) {
        if ($name !== '.' && $name !== '..') removeTree($path . '/' . $name);
    }
    @rmdir($path);
}
function expect(bool $ok, string $message): void
{
    if (!$ok) throw new RuntimeException('ÉCHEC : ' . $message);
}
try {
    $auth = new Weed\Auth();
    $auth->setup('tester', 'secret123');
    $_COOKIE[Weed\Auth::cookieName()] = $auth->login('tester', 'secret123');

    $alice = new Weed\Vfs('tester');
    $alice->write('/Documents/private.txt', 'donnée privée');
    $home = $data . '/home/tester';
    $file = $home . '/Documents/private.txt';
    expect((fileperms($home) & 0777) === 0700, 'home en 0700');
    expect((fileperms($file) & 0777) === 0600, 'fichier en 0600');
    expect($alice->read('/Documents/private.txt') === 'donnée privée', 'lecture du fichier créé');

    $program = $data . '/apps/demo';
    mkdir($program, 0700, true);
    file_put_contents($program . '/index.php', '<?php return true;');
    Weed\Security::signProgram('demo', $program);
    expect(Weed\Security::verifyProgram('demo', $program), 'signature HMAC valide');
    file_put_contents($program . '/index.php', '<?php return false;');
    expect(!Weed\Security::verifyProgram('demo', $program), 'altération du Programme détectée');
    expect(is_file($data . '/var/log/security.jsonl'), 'journal de sécurité centralisé');
    expect((fileperms($data . '/etc/security.key') & 0777) === 0600, 'clé de signature privée');

    $bob = new Weed\Vfs('another');
    $isolated = false;
    try { $bob->read('/Documents/private.txt'); } catch (RuntimeException $e) { $isolated = true; }
    expect($isolated, 'séparation des racines VFS');

    $auth->setPassword('tester', 'newsecret123');
    expect($auth->current() === null, 'révocation de session après changement de mot de passe');

    echo "Sécurité Weed OS : OK\n";
} finally {
    removeTree($data);
}
