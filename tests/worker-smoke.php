<?php
declare(strict_types=1);

/** Vérifie l'appel d'un hook dans un processus PHP enfant. */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-worker-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function workerExpect(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException('ÉCHEC : ' . $message);
}
function workerRemove(string $path): void {
    if (is_link($path) || is_file($path)) { @unlink($path); return; }
    if (!is_dir($path)) return;
    foreach (scandir($path) ?: [] as $n) if ($n !== '.' && $n !== '..') workerRemove($path . '/' . $n);
    @rmdir($path);
}
try {
    mkdir($data . '/etc', 0700, true);
    mkdir($data . '/var/log', 0700, true);
    $dir = $data . '/apps/worker-demo';
    mkdir($dir, 0700, true);
    file_put_contents($dir . '/manifest.json', json_encode([
        'id' => 'worker-demo', 'name' => 'Worker demo', 'version' => '1.0.0', 'hooks' => 'hooks.php',
    ]));
    file_put_contents($dir . '/hooks.php', <<<'HOOK'
<?php
return ['syscalls' => [
    'sum' => static fn(array $a, array $u): int => (int)($a['x'] ?? 0) + (int)($a['y'] ?? 0),
    'whoami' => static fn(array $a, array $u): string => (string)($u['name'] ?? ''),
]];
HOOK
    );
    Weed\Security::signProgram('worker-demo', $dir);
    if (Weed\Isolation::isRoot()) {   // mêmes permissions que Kernel::boot() et Programs::lockdown()
        chmod($data, 0711); chmod($data . '/apps', 0755); chmod($dir, 0755);
        chmod($dir . '/manifest.json', 0644); chmod($dir . '/hooks.php', 0644);
    }
    $worker = new Weed\ProgramWorker(3, 64);
    workerExpect($worker->call('worker-demo', 'sum', ['x' => 19, 'y' => 23], ['name' => 'tester']) === 42, 'résultat du worker');
    workerExpect($worker->call('worker-demo', 'whoami', [], ['name' => 'tester']) === 'tester', 'contexte utilisateur');
    file_put_contents($dir . '/hooks.php', '<?php return [];');
    $rejected = false;
    try { $worker->call('worker-demo', 'sum', [], []); } catch (RuntimeException $e) { $rejected = true; }
    workerExpect($rejected, 'worker refuse un Programme altéré');
    echo "Weed Program Worker : OK\n";
} finally {
    workerRemove($data);
}
