<?php
declare(strict_types=1);
$dir = sys_get_temp_dir() . '/weed-browser-' . bin2hex(random_bytes(5));
mkdir($dir, 0700, true);
putenv('WEED_PROGRAM_DATA=' . $dir);
try {
    $hooks = require dirname(__DIR__) . '/apps-src/gnanja-browser/hooks.php';
    $get = $hooks['syscalls']['state_get'];
    $save = $hooks['syscalls']['state_save'];
    $user = ['name'=>'testuser','role'=>'user'];
    $initial = $get([], $user);
    if (($initial['homepage'] ?? '') !== 'https://html.duckduckgo.com/html/') throw new RuntimeException('page initiale incorrecte');
    $save(['state'=>[
        'homepage'=>'https://example.com',
        'history'=>[['url'=>'https://example.com/a','title'=>'Exemple','at'=>123]],
        'bookmarks'=>[['url'=>'https://example.com','title'=>'Favori'],['url'=>'javascript:alert(1)','title'=>'Interdit']],
        'downloads'=>[['url'=>'https://example.com/file.zip','name'=>'file.zip','at'=>456]],
    ]], $user);
    $stored = $get([], $user);
    if ($stored['homepage'] !== 'https://example.com') throw new RuntimeException('page d’accueil non persistée');
    if (count($stored['history']) !== 1 || count($stored['bookmarks']) !== 1 || count($stored['downloads']) !== 1) throw new RuntimeException('filtrage ou persistance des données incorrect');
    if (is_link($dir . '/browser-state.json') || (fileperms($dir . '/browser-state.json') & 0777) !== 0600) throw new RuntimeException('permissions du stockage incorrectes');
    $js = file_get_contents(dirname(__DIR__) . '/apps-src/gnanja-browser/app.js');
    if (!str_contains($js, 'add&&!t.private') || !str_contains($js, '!current().private') || !str_contains($js, 'privateOn') || !str_contains($js, "ar:{")) throw new RuntimeException('mode privé ou langues Gnanja incomplets');
    // Proxy de navigation : validation réseau et préparation du HTML (sans accès Internet)
    if (!isset($hooks['syscalls']['fetch'])) throw new RuntimeException('syscall fetch absent');
    foreach (['http://127.0.0.1/', 'http://localhost/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://169.254.169.254/', 'http://100.64.0.1/', 'http://[::1]/', 'ftp://example.com/', 'javascript:alert(1)'] as $bad) {
        try { $hooks['syscalls']['fetch'](['url' => $bad], $user); throw new RuntimeException('adresse interdite acceptée : ' . $bad); }
        catch (RuntimeException $e) { if (str_contains($e->getMessage(), 'acceptée')) throw $e; }
    }
    $p = gnanja_prepare('<html><head><title>T &amp; U</title><meta http-equiv="Content-Security-Policy" content="frame-ancestors none"><script>x()</script></head><body onload="y()"><img src="a.png"><a href="/b">b</a></body></html>', 'https://example.com/dir/', false);
    foreach (['<script>x()', 'onload', 'frame-ancestors'] as $gone) if (str_contains($p['html'], $gone)) throw new RuntimeException('contenu non neutralisé : ' . $gone);
    foreach (['<base href="https://example.com/dir/">', 'weed:"nav"', 'loading="lazy"'] as $need) if (!str_contains($p['html'], $need)) throw new RuntimeException('injection manquante : ' . $need);
    if ($p['title'] !== 'T & U') throw new RuntimeException('titre incorrect');
    if (gnanja_abs('http://a.com/x/y/z.html', '../q') !== 'http://a.com/x/q') throw new RuntimeException('résolution d’URL incorrecte');
    if (!str_contains($js, 'app.gnanja-browser.fetch') || str_contains($js, 'page.src=url')) throw new RuntimeException('Gnanja n’utilise pas le proxy');
    echo "gnanja-browser-smoke: OK\n";
} finally {
    foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
    @rmdir($dir);
}
