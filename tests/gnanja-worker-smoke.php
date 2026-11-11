<?php
declare(strict_types=1);

/** Gnanja Browser 0.5 : le proxy « fetch » tourne dans le worker isolé et refuse les adresses internes (SSRF). */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-gnanja-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function gwok(bool $ok, string $m): void { if (!$ok) throw new RuntimeException('ÉCHEC : ' . $m); echo "  ok  $m\n"; }
function gwrm(string $p): void { if (is_link($p) || is_file($p)) { @unlink($p); return; } if (!is_dir($p)) return; foreach (scandir($p) ?: [] as $n) if ($n !== '.' && $n !== '..') gwrm($p . '/' . $n); @rmdir($p); }
try {
    mkdir($data . '/etc', 0700, true); mkdir($data . '/var/log', 0700, true);
    $dir = $data . '/apps/gnanja-browser'; mkdir($dir, 0700, true);
    foreach (['manifest.json', 'hooks.php'] as $f) copy($root . '/apps-src/gnanja-browser/' . $f, $dir . '/' . $f);
    Weed\Security::signProgram('gnanja-browser', $dir);
    mkdir($data . '/appdata/gnanja-browser', 0700, true);
    if (Weed\Isolation::isRoot()) { chown($data . '/appdata/gnanja-browser', 990); chgrp($data . '/appdata/gnanja-browser', 990); chmod($data . '/appdata', 0711); chmod($data, 0711); chmod($data . '/apps', 0755); chmod($dir, 0755); chmod($dir . '/manifest.json', 0644); chmod($dir . '/hooks.php', 0644); }
    $m = json_decode((string)file_get_contents($dir . '/manifest.json'), true);
    gwok(in_array('app.gnanja-browser.fetch', $m['permissions'], true) && ($m['worker']['timeout'] ?? 0) >= 20, 'manifest : permission fetch et limites du worker déclarées');
    $w = new Weed\ProgramWorker(5, 64);
    $st = $w->call('gnanja-browser', 'state_get', [], ['name' => 'tester']);
    gwok(($st['homepage'] ?? '') === 'https://html.duckduckgo.com/html/' && ($st['scripts'] ?? null) === false, 'état initial dans le worker (accueil sans JavaScript, scripts désactivés)');
    foreach (['http://127.0.0.1/', 'http://localhost:8080/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/', 'http://10.0.0.1/', 'file:///etc/passwd', 'gopher://x/'] as $bad) {
        $refused = false;
        try { $w->call('gnanja-browser', 'fetch', ['url' => $bad], ['name' => 'tester']); } catch (RuntimeException $e) { $refused = true; }
        gwok($refused, 'worker : adresse refusée ' . $bad);
    }
    echo "gnanja-worker-smoke: OK\n";
} finally { gwrm($data); }
