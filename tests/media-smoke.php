<?php
declare(strict_types=1);

/** Service média FFmpeg : sonde, conversion, extraction audio, découpe, montage, miniature, URL signée, annulation, garde-fous.
 *  Ignoré (code 0) si FFmpeg n'est pas installé sur la machine de test. */
$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/weed-media-' . bin2hex(random_bytes(5));
mkdir($tmp, 0700, true);
putenv('WEED_ROOT=' . $root); putenv('WEED_DATA=' . $tmp);
define('WEED_ROOT', $root); define('WEED_DATA', $tmp);
require $root . '/kernel/autoload.php';

use Weed\{Media, Syscalls, Vfs, Programs, Auth};

function mcheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException('ÉCHEC : ' . $message); }
function mthrows(callable $fn, string $message): void {
    try { $fn(); } catch (Throwable $e) { return; }
    throw new RuntimeException('ÉCHEC (exception attendue) : ' . $message);
}
function mwait(Syscalls $sys, string $id, int $seconds = 90): array {
    $end = time() + $seconds;
    do {
        $j = $sys->call('media.job.status', ['id' => $id]);
        if (in_array($j['state'], ['done', 'failed', 'cancelled'], true)) return $j;
        usleep(150000);
    } while (time() < $end);
    throw new RuntimeException('ÉCHEC : délai dépassé pour la tâche ' . $id);
}
function mrm(string $p): void {
    if (is_link($p) || is_file($p)) { @unlink($p); return; }
    if (!is_dir($p)) return;
    foreach (scandir($p) ?: [] as $n) if ($n !== '.' && $n !== '..') mrm($p . '/' . $n);
    @rmdir($p);
}

try {
    if (!Media::available()) { echo "FFmpeg absent : test média ignoré\n"; return; }
    foreach (['etc', 'var/log', 'var/run', 'apps', 'appdata', 'home'] as $d) mkdir($tmp . '/' . $d, 0700, true);
    $user = ['name' => 'tester', 'role' => 'user'];
    $vfs = new Vfs('tester');
    $sys = new Syscalls($vfs, new Programs(), new Auth(), $user);
    $home = $tmp . '/home/tester';

    // Sources de test générées par FFmpeg lui-même.
    $gen = static function (string $args): void {
        exec('ffmpeg -hide_banner -loglevel error -y ' . $args . ' 2>&1', $out, $code);
        if ($code !== 0) throw new RuntimeException('génération de la source de test impossible : ' . implode("\n", $out));
    };
    $gen('-f lavfi -i testsrc=size=640x360:rate=25:duration=4 -f lavfi -i sine=frequency=440:duration=4 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest ' . escapeshellarg($home . '/a.mp4'));
    $gen('-f lavfi -i testsrc2=size=320x240:rate=30:duration=3 -c:v libx264 -pix_fmt yuv420p ' . escapeshellarg($home . '/muet.mp4'));

    // État et sonde
    $st = $sys->call('media.status', []);
    mcheck($st['available'] === true && isset($st['formats'][0]['id']), 'media.status');
    $pr = $sys->call('media.probe', ['path' => '/a.mp4']);
    mcheck($pr['has_video'] && $pr['has_audio'] && abs($pr['duration'] - 4.0) < 0.3, 'media.probe');
    mcheck(!str_contains(json_encode($pr), $tmp), 'la sonde ne doit pas exposer de chemin réel');

    // Conversion avec progression, redimensionnement et découpe
    $j = $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'webm', 'height' => 180, 'start' => 0.5, 'end' => 2.5, 'output' => '/a-180.webm']);
    mcheck(strlen($j['id']) === 16 && $j['output'] === '/a-180.webm', 'media.convert démarre une tâche');
    $r = mwait($sys, $j['id']);
    mcheck($r['state'] === 'done' && $r['progress'] === 1.0, 'conversion terminée : ' . ($r['error'] ?? ''));
    $o = $sys->call('media.probe', ['path' => '/a-180.webm']);
    mcheck($o['has_video'] && $o['streams'][0]['height'] === 180 && abs($o['duration'] - 2.0) < 0.4, 'sortie webm 180p de 2 s');
    mcheck(!is_file($home . '/a-180.webm.weedpart'), 'pas de fichier temporaire résiduel');

    // Le fichier existant n'est pas écrasé sans overwrite ; la source n'est jamais remplacée
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'webm', 'output' => '/a-180.webm']), 'écrasement sans overwrite');
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'mp4', 'output' => '/a.mp4', 'overwrite' => true]), 'sortie = source');
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'mp4', 'output' => '/mauvais.avi']), 'extension de sortie incohérente');

    // Extraction audio, découpe rapide
    $r = mwait($sys, $sys->call('media.extract_audio', ['path' => '/a.mp4', 'format' => 'mp3'])['id']);
    mcheck($r['state'] === 'done' && is_file($home . '/a.mp3'), 'extraction MP3 : ' . ($r['error'] ?? ''));
    mthrows(fn() => $sys->call('media.extract_audio', ['path' => '/muet.mp4']), 'extraction audio d\'une source muette');
    $r = mwait($sys, $sys->call('media.trim', ['path' => '/a.mp4', 'start' => 1, 'end' => 3])['id']);
    mcheck($r['state'] === 'done' && is_file($home . '/a-cut.mp4'), 'découpe rapide : ' . ($r['error'] ?? ''));

    // Montage : une source avec audio + une source muette (silence ajouté), taille et cadence imposées
    $r = mwait($sys, $sys->call('media.render', ['clips' => [['path' => '/a.mp4', 'start' => 0.5, 'end' => 3], ['path' => '/muet.mp4', 'end' => 2]],
        'width' => 640, 'height' => 360, 'fps' => 25, 'output' => '/montage.mp4'])['id']);
    mcheck($r['state'] === 'done', 'montage : ' . ($r['error'] ?? ''));
    $m = $sys->call('media.probe', ['path' => '/montage.mp4']);
    mcheck($m['has_video'] && $m['has_audio'] && abs($m['duration'] - 4.5) < 0.5, 'montage de 4,5 s avec piste audio continue');
    $r = mwait($sys, $sys->call('media.concat', ['inputs' => ['/a.mp4', '/a.mp4'], 'output' => '/double.mp4'])['id']);
    mcheck($r['state'] === 'done', 'concat : ' . ($r['error'] ?? ''));

    // Miniature (données ou fichier)
    $t = $sys->call('media.thumbnail', ['path' => '/a.mp4', 'time' => 1, 'width' => 200]);
    mcheck(str_starts_with($t['data_url'], 'data:image/jpeg;base64,') && $t['size'] > 500, 'miniature en data URL');
    $t = $sys->call('media.thumbnail', ['path' => '/a.mp4', 'time' => 1, 'type' => 'png', 'output' => '/th.png']);
    mcheck($t['path'] === '/th.png' && is_file($home . '/th.png'), 'miniature en fichier');
    mthrows(fn() => $sys->call('media.thumbnail', ['path' => '/a.mp3']), 'miniature d\'une source sans vidéo');

    // Annulation (acceptée aussi si la machine termine avant)
    $gen('-f lavfi -i testsrc=size=1280x720:rate=25:duration=120 -c:v libx264 -preset ultrafast -pix_fmt yuv420p ' . escapeshellarg($home . '/long.mp4'));
    $j = $sys->call('media.convert', ['path' => '/long.mp4', 'format' => 'mp4-h265', 'quality' => 'high', 'output' => '/long-265.mp4']);
    $until = time() + 20;
    do { usleep(200000); $s = $sys->call('media.job.status', ['id' => $j['id']]); } while ($s['state'] === 'queued' && time() < $until);
    $sys->call('media.job.cancel', ['id' => $j['id']]);
    $r = mwait($sys, $j['id'], 30);
    mcheck(in_array($r['state'], ['cancelled', 'done'], true), 'annulation : état ' . $r['state']);
    if ($r['state'] === 'cancelled') mcheck(!is_file($home . '/long-265.mp4') && !is_file($home . '/long-265.mp4.weedpart'), 'annulation nettoie les fichiers');

    // Garde-fous : chemins, formats, quotas, isolation des tâches, permissions de Programme
    mthrows(fn() => $sys->call('media.probe', ['path' => '/../../etc/passwd']), 'évasion de chemin');
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'exe']), 'format inconnu');
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'mp4', 'start' => '1; rm -rf /']), 'start non numérique');
    mthrows(fn() => $sys->call('media.convert', ['path' => '/a.mp4', 'format' => 'mp4', 'quality' => 'ultra']), 'qualité inconnue');
    mthrows(fn() => $sys->call('media.render', ['clips' => []]), 'montage sans clip');
    mthrows(fn() => $sys->call('media.job.status', ['id' => '../../etc/passwd']), 'identifiant de tâche invalide');
    mthrows(fn() => Media::jobStatus('autre', null, $j['id']), 'tâche d\'un autre utilisateur');
    mthrows(fn() => $sys->call('media.probe', ['path' => '/a.mp4', '__app' => 'inconnu']), 'Programme absent ou sans permission media');

    // URL signée : valide, falsifiée, restreinte aux médias
    $u = $sys->call('media.url', ['path' => '/a.mp4'])['url'];
    parse_str((string)parse_url($u, PHP_URL_QUERY), $q);
    $tk = Media::verifyToken($q['t']);
    mcheck($tk['u'] === 'tester' && $tk['p'] === '/a.mp4', 'jeton valide');
    mthrows(fn() => Media::verifyToken(substr($q['t'], 0, -1) . (substr($q['t'], -1) === 'a' ? 'b' : 'a')), 'jeton falsifié');
    file_put_contents($home . '/note.txt', 'x');
    mthrows(fn() => $sys->call('media.url', ['path' => '/note.txt']), 'URL signée pour un fichier non média');

    echo "Media FFmpeg smoke test OK\n";
} finally {
    mrm($tmp);
}
