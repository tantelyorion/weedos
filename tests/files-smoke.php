<?php
declare(strict_types=1);

/** v0.8.7 — copier, déplacer, importer et lire en flux (Range) les fichiers du VFS. */
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-files-' . bin2hex(random_bytes(8));
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';

function fexpect(bool $ok, string $m): void { if (!$ok) throw new RuntimeException('ÉCHEC : ' . $m); }
function fthrows(callable $fn, string $m): void { try { $fn(); } catch (RuntimeException $e) { return; } throw new RuntimeException('ÉCHEC (aucune erreur) : ' . $m); }
function frm(string $p): void { if (is_link($p) || is_file($p)) { @unlink($p); return; } if (!is_dir($p)) return; foreach (scandir($p) ?: [] as $n) if ($n !== '.' && $n !== '..') frm($p . '/' . $n); @rmdir($p); }
try {
    mkdir($data . '/etc', 0700, true); mkdir($data . '/var/log', 0700, true);
    $v = new Weed\Vfs('tester');
    $v->mkdir('/Bureau/dossier'); $v->write('/Bureau/dossier/a.txt', 'AAA'); $v->write('/Bureau/b.txt', 'BBB');
    $v->copy('/Bureau/b.txt', '/Documents/b-copie.txt');
    fexpect($v->read('/Documents/b-copie.txt') === 'BBB' && $v->read('/Bureau/b.txt') === 'BBB', 'copie d’un fichier (source conservée)');
    $v->copy('/Bureau/dossier', '/Documents/dossier2');
    fexpect($v->read('/Documents/dossier2/a.txt') === 'AAA', 'copie récursive d’un dossier');
    fthrows(fn() => $v->copy('/Bureau/b.txt', '/Documents/b-copie.txt'), 'copie vers un nom existant refusée');
    fthrows(fn() => $v->copy('/Bureau/dossier', '/Bureau/dossier/sous'), 'copie d’un dossier dans lui-même refusée');
    $v->move('/Documents/b-copie.txt', '/Notes/deplace.txt');
    fexpect($v->read('/Notes/deplace.txt') === 'BBB' && !file_exists($data . '/home/tester/Documents/b-copie.txt'), 'déplacement (source supprimée)');
    $v->move('/Notes/deplace.txt', '/Notes/renomme.txt');
    fexpect($v->read('/Notes/renomme.txt') === 'BBB', 'renommage');
    fthrows(fn() => $v->move('/Bureau/dossier', '/Bureau/dossier/x'), 'déplacement d’un dossier dans lui-même refusé');
    fthrows(fn() => $v->move('/', '/Notes/x'), 'racine protégée');
    fthrows(fn() => $v->move('/Bureau/b.txt', '/../../etc/passwd'), 'sortie du VFS refusée');
    fexpect(!file_exists($data . '/etc/passwd'), 'aucune écriture hors du VFS');
    symlink('/etc/hostname', $data . '/home/tester/Bureau/lien');
    fthrows(fn() => $v->copy('/Bureau/lien', '/Documents/lien'), 'lien symbolique non copié');
    fthrows(fn() => $v->fileInfo('/Bureau/lien'), 'lien symbolique non servi');
    if (class_exists(PharData::class)) {
        $v->write('/Bureau/archive-test.txt', 'contenu TAR de test');
        $v->archiveCreate('/Bureau/test.tar.gz', ['/Bureau/archive-test.txt']);
        $entries = $v->archiveList('/Bureau/test.tar.gz');
        fexpect(count($entries) === 1 && $entries[0]['name'] === 'archive-test.txt', 'création et liste TAR.GZ');
        $v->mkdir('/Documents/archive-test');
        $out = $v->archiveExtract('/Bureau/test.tar.gz', '/Documents/archive-test');
        fexpect($out['files'] === 1 && $v->read('/Documents/archive-test/archive-test.txt') === 'contenu TAR de test', 'extraction TAR.GZ sécurisée');
    }
    $v->write('/Bureau/video.mp4', str_repeat('0123456789', 100));
    $i = $v->fileInfo('/Bureau/video.mp4');
    fexpect($i['size'] === 1000 && $i['name'] === 'video.mp4', 'fileInfo');
    fthrows(fn() => $v->importUpload('/Bureau', '../x.mp3', '/tmp/x'), 'nom d’import invalide refusé');
    echo "Weed Files : OK\n";
} finally { frm($data); }
