<?php
declare(strict_types=1);

/** Archives : ZIP / TAR / TAR.GZ — création, liste, extraction (modes), ajout, suppression, test, aperçu, sécurité. */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-arc-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function aok(bool $ok, string $m): void { if (!$ok) throw new RuntimeException('ÉCHEC : ' . $m); echo "  ok  $m\n"; }
function athrows(callable $fn, string $m, string $needle = ''): void {
    try { $fn(); } catch (RuntimeException $e) { if ($needle === '' || str_contains($e->getMessage(), $needle)) { echo "  ok  $m\n"; return; } throw new RuntimeException("ÉCHEC ($m) : message inattendu « {$e->getMessage()} »"); }
    throw new RuntimeException('ÉCHEC (aucune erreur) : ' . $m);
}
function arm(string $p): void { if (is_link($p) || is_file($p)) { @unlink($p); return; } if (!is_dir($p)) return; foreach (scandir($p) ?: [] as $n) if ($n !== '.' && $n !== '..') arm($p . '/' . $n); @rmdir($p); }
function names(array $l): array { $n = array_map(static fn($x) => $x['name'], $l); sort($n); return $n; }

try {
    mkdir($data . '/etc', 0700, true); mkdir($data . '/var/log', 0700, true);
    $v = new Weed\Vfs('tester');
    $home = $data . '/home/tester';
    $v->mkdir('/Bureau/projet'); $v->mkdir('/Bureau/projet/sous');
    $v->write('/Bureau/projet/a.txt', 'AAA'); $v->write('/Bureau/projet/sous/b.txt', 'BBBB'); $v->write('/Bureau/projet/é à ü.txt', 'accents');
    $v->write('/Bureau/seul.txt', 'seul');
    $big = str_repeat('0123456789abcdef', 400000);   // 6,4 Mo : plus d'un bloc de lecture, plusieurs blocs gzip
    file_put_contents($home . '/Bureau/gros.bin', $big);

    foreach (['zip' => 'test.zip', 'tgz' => 'test.tar.gz', 'tar' => 'test.tar'] as $kind => $file) {
        echo "== $kind ==\n";
        $v->write('/Bureau/seul.txt', 'seul');
        $arc = '/Bureau/' . $file;
        $v->archiveCreate($arc, ['/Bureau/projet', '/Bureau/seul.txt', '/Bureau/gros.bin']);
        $l = $v->archiveList($arc); $n = names($l);
        aok(in_array('projet/a.txt', $n, true) && in_array('projet/sous/b.txt', $n, true) && in_array('seul.txt', $n, true) && in_array('projet/é à ü.txt', $n, true), "$kind : création et liste");
        aok(in_array('projet/', $n, true) && in_array('projet/sous/', $n, true), "$kind : dossiers listés");
        $g = array_values(array_filter($l, static fn($x) => $x['name'] === 'gros.bin'))[0] ?? null;
        aok($g && $g['size'] === strlen($big), "$kind : taille d'un gros fichier correcte");
        aok($v->archiveTest($arc)['ok'] === true, "$kind : test d'intégrité");

        $v->mkdir("/Documents/ex-$kind");
        $out = $v->archiveExtract($arc, "/Documents/ex-$kind");
        aok($out['files'] === 4 + 1 - 0 || $out['files'] >= 5, "$kind : extraction complète ({$out['files']} fichiers)");
        aok($v->read("/Documents/ex-$kind/projet/a.txt") === 'AAA' && $v->read("/Documents/ex-$kind/projet/sous/b.txt") === 'BBBB', "$kind : contenu des fichiers (non vide)");
        aok($v->read("/Documents/ex-$kind/projet/é à ü.txt") === 'accents', "$kind : noms accentués");
        aok(md5_file($home . "/Documents/ex-$kind/gros.bin") === md5($big), "$kind : gros fichier identique octet pour octet");
        aok(!glob($home . "/Documents/ex-$kind/.weed-extract-*"), "$kind : aucun résidu temporaire");

        // modes de collision
        $v->write("/Documents/ex-$kind/seul.txt", 'MODIFIE');
        $o = $v->archiveExtract($arc, "/Documents/ex-$kind", ['seul.txt'], 'skip');
        aok($o['skipped'] === 1 && $v->read("/Documents/ex-$kind/seul.txt") === 'MODIFIE', "$kind : mode ignorer");
        $o = $v->archiveExtract($arc, "/Documents/ex-$kind", ['seul.txt'], 'rename');
        aok($o['renamed'] === 1 && $v->read("/Documents/ex-$kind/seul.txt") === 'MODIFIE' && $v->read("/Documents/ex-$kind/seul (1).txt") === 'seul', "$kind : mode renommer");
        athrows(fn() => $v->archiveExtract($arc, "/Documents/ex-$kind", ['seul.txt'], 'error'), "$kind : mode erreur", 'Collision');
        $o = $v->archiveExtract($arc, "/Documents/ex-$kind", ['seul.txt'], 'overwrite');
        aok($o['files'] === 1 && $v->read("/Documents/ex-$kind/seul.txt") === 'seul', "$kind : mode écraser");

        // extraction sélective d'un dossier
        $v->mkdir("/Documents/sel-$kind");
        $o = $v->archiveExtract($arc, "/Documents/sel-$kind", ['projet/sous/']);
        aok($v->read("/Documents/sel-$kind/projet/sous/b.txt") === 'BBBB' && !file_exists($home . "/Documents/sel-$kind/projet/a.txt"), "$kind : extraction sélective");

        // aperçu
        $r = $v->archiveRead($arc, 'projet/a.txt');
        aok(base64_decode($r['data']) === 'AAA' && $r['mime'] === 'text/plain', "$kind : aperçu d'un fichier");
        athrows(fn() => $v->archiveRead($arc, 'gros.bin'), "$kind : aperçu limité à 4 Mo", 'volumineux');
        athrows(fn() => $v->archiveRead($arc, 'inexistant.txt'), "$kind : aperçu d'une entrée absente", 'introuvable');

        // ajout (nouveau fichier + remplacement)
        $v->write('/Bureau/nouveau.txt', 'NOUVEAU'); $v->write('/Bureau/seul.txt', 'seul v2');
        $a = $v->archiveAdd($arc, ['/Bureau/nouveau.txt', '/Bureau/seul.txt'], 'ajouts');
        $v->archiveAdd($arc, ['/Bureau/seul.txt']);
        $n = names($v->archiveList($arc));
        aok(in_array('ajouts/nouveau.txt', $n, true) && in_array('ajouts/seul.txt', $n, true), "$kind : ajout dans un sous-dossier");
        aok(count(array_keys($n, 'seul.txt', true)) === 1, "$kind : remplacement sans doublon");
        $v->mkdir("/Documents/add-$kind"); $v->archiveExtract($arc, "/Documents/add-$kind");
        aok($v->read("/Documents/add-$kind/seul.txt") === 'seul v2' && $v->read("/Documents/add-$kind/ajouts/nouveau.txt") === 'NOUVEAU', "$kind : contenu après ajout");
        aok(md5_file($home . "/Documents/add-$kind/gros.bin") === md5($big), "$kind : fichiers existants intacts après ajout");
        athrows(fn() => $v->archiveAdd($arc, ['/Bureau/nouveau.txt'], '../evil'), "$kind : dossier interne dangereux refusé");

        // suppression
        $d = $v->archiveDelete($arc, ['ajouts/', 'projet/sous/', 'seul.txt']);
        $n = names($v->archiveList($arc));
        aok($d['deleted'] >= 3 && !in_array('ajouts/nouveau.txt', $n, true) && !in_array('projet/sous/b.txt', $n, true) && !in_array('seul.txt', $n, true), "$kind : suppression d'entrées et de dossiers ({$d['deleted']})");
        aok(in_array('projet/a.txt', $n, true) && in_array('gros.bin', $n, true), "$kind : autres entrées conservées");
        aok($v->archiveTest($arc)['ok'] === true, "$kind : archive valide après modifications");
        athrows(fn() => $v->archiveDelete($arc, ['n-existe-pas']), "$kind : suppression d'une entrée absente", 'Aucune entrée');
    }

    echo "== compatibilité avec l'outil tar du système ==\n";
    if (trim((string)shell_exec('command -v tar')) !== '') {
        $v->archiveCreate('/Bureau/compat.tar.gz', ['/Bureau/projet']);
        $x = sys_get_temp_dir() . '/weed-x-' . bin2hex(random_bytes(4)); mkdir($x);
        exec('tar -xzf ' . escapeshellarg($home . '/Bureau/compat.tar.gz') . ' -C ' . escapeshellarg($x) . ' 2>&1', $o1, $rc);
        aok($rc === 0 && file_get_contents($x . '/projet/a.txt') === 'AAA', 'archive créée par Weed lisible par tar');
        // archive créée par tar : noms longs, liens refusés
        $src = sys_get_temp_dir() . '/weed-s-' . bin2hex(random_bytes(4)); $deep = $src . '/' . str_repeat('dossier-long-', 12) . '/' . str_repeat('sous-', 20);
        mkdir($deep, 0700, true); file_put_contents($deep . '/' . str_repeat('nom-de-fichier-', 8) . '.txt', 'LONG');
        file_put_contents($src . '/ok.txt', 'OK');
        copy($src . '/ok.txt', $home . '/Bureau/ok.txt');
        exec('tar -czf ' . escapeshellarg($home . '/Bureau/fromtar.tar.gz') . ' -C ' . escapeshellarg($src) . ' . 2>&1', $o2, $rc);
        $l = $v->archiveList('/Bureau/fromtar.tar.gz');
        $long = array_values(array_filter($l, static fn($e) => strlen($e['name']) > 255));
        aok($rc === 0 && $long !== [], 'noms de plus de 255 caractères lus (tar GNU)');
        $v->mkdir('/Documents/fromtar'); $v->archiveExtract('/Bureau/fromtar.tar.gz', '/Documents/fromtar');
        aok($v->read('/Documents/fromtar/ok.txt') === 'OK', 'archive créée par tar extraite');
        $v->archiveCreate('/Bureau/long.tar.gz', ['/Bureau/projet']);
        // nom long écrit par Weed puis relu par tar
        $v->mkdir('/Bureau/' . str_repeat('x', 90)); $v->mkdir('/Bureau/' . str_repeat('x', 90) . '/' . str_repeat('y', 90)); $v->write('/Bureau/' . str_repeat('x', 90) . '/' . str_repeat('y', 90) . '/' . str_repeat('z', 90) . '.txt', 'PROFOND');
        $v->archiveCreate('/Bureau/profond.tar', ['/Bureau/' . str_repeat('x', 90)]);
        exec('tar -tf ' . escapeshellarg($home . '/Bureau/profond.tar') . ' 2>&1', $o3, $rc);
        aok($rc === 0 && count(array_filter($o3, static fn($l) => str_ends_with($l, 'zzz.txt') || strlen($l) > 270)) >= 1, 'noms longs écrits par Weed lus par tar');
        $v->mkdir('/Documents/profond'); $v->archiveExtract('/Bureau/profond.tar', '/Documents/profond');
        aok($v->read('/Documents/profond/' . str_repeat('x', 90) . '/' . str_repeat('y', 90) . '/' . str_repeat('z', 90) . '.txt') === 'PROFOND', 'noms longs relus par Weed');
        arm($x); arm($src);
    } else echo "  --  tar système absent : étape ignorée\n";

    echo "== sécurité ==\n";
    $mk = function (string $path, array $entries): void {   // fabrique un TAR hostile à la main
        $w = Weed\TarArchive::openWrite($path, false);
        foreach ($entries as [$name, $data, $type]) {
            if ($type === 'raw') { $h = new ReflectionMethod(Weed\TarArchive::class, 'header'); $h->setAccessible(true); fwrite($w['h'], $h->invoke(null, $name, strlen($data), 0, 0644, '0') . str_pad($data, 512, "\0")); continue; }
            if ($type === 'link') { $h = new ReflectionMethod(Weed\TarArchive::class, 'header'); $h->setAccessible(true); fwrite($w['h'], $h->invoke(null, $name, 0, 0, 0777, '2')); continue; }
            Weed\TarArchive::writeHeader($w, $name, strlen($data), 0, false); Weed\TarArchive::writeData($w, $data); Weed\TarArchive::writePad($w, strlen($data));
        }
        Weed\TarArchive::closeWrite($w);
    };
    $mk($home . '/Bureau/evil1.tar', [['../../evil.txt', 'x', 'file']]);
    $v->mkdir('/Documents/sec');
    athrows(fn() => $v->archiveExtract('/Bureau/evil1.tar', '/Documents/sec'), 'TAR avec « .. » refusé', 'dangereux');
    $mk($home . '/Bureau/evil2.tar', [['lien', '', 'link']]);
    athrows(fn() => $v->archiveExtract('/Bureau/evil2.tar', '/Documents/sec'), 'TAR avec lien symbolique refusé', 'Lien symbolique');
    $mk($home . '/Bureau/evil3.tar', [['/etc/passwd', 'x', 'raw']]);
    athrows(fn() => $v->archiveExtract('/Bureau/evil3.tar', '/Documents/sec'), 'TAR avec chemin absolu refusé', 'dangereux');
    athrows(fn() => $v->archiveExtract('/Bureau/evil1.tar', '/Documents/inexistant'), 'destination inexistante refusée');
    athrows(fn() => $v->archiveList('/Bureau/introuvable.zip'), 'archive introuvable');
    file_put_contents($home . '/Bureau/corrompu.tar', random_bytes(2048));
    athrows(fn() => $v->archiveList('/Bureau/corrompu.tar'), 'TAR corrompu détecté', 'corrompu');
    $t = file_get_contents($home . '/Bureau/test.tar'); file_put_contents($home . '/Bureau/tronque.tar', substr($t, 0, 3000));
    aok($v->archiveTest('/Bureau/tronque.tar')['ok'] === false, 'TAR tronqué détecté par le test');
    file_put_contents($home . '/Bureau/faux.zip', 'PK pas vraiment un zip');
    athrows(fn() => $v->archiveList('/Bureau/faux.zip'), 'ZIP invalide refusé', 'ZIP');
    // un ZIP avec chemin « .. »
    $z = new ZipArchive(); $z->open($home . '/Bureau/evil.zip', ZipArchive::CREATE); $z->addFromString('../../evil.txt', 'x'); $z->close();
    athrows(fn() => $v->archiveExtract('/Bureau/evil.zip', '/Documents/sec'), 'ZIP avec « .. » refusé', 'dangereux');
    aok(!file_exists($data . '/home/evil.txt') && !file_exists($data . '/evil.txt'), 'aucune écriture hors du VFS');
    // création : refus d'écraser un TAR existant, aucun résidu
    athrows(fn() => $v->archiveCreate('/Bureau/test.tar', ['/Bureau/seul.txt']), 'création sur un nom existant refusée', 'existe déjà');
    aok(!glob($home . '/Bureau/*.weed-tmp-*'), 'aucun fichier temporaire laissé');

    echo "archive-smoke: OK\n";
} finally { arm($data); }
