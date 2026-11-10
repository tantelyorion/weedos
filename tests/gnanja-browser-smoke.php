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
    if (($initial['homepage'] ?? '') !== 'https://duckduckgo.com') throw new RuntimeException('page initiale incorrecte');
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
    echo "gnanja-browser-smoke: OK\n";
} finally {
    foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
    @rmdir($dir);
}
