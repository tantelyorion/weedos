<?php
declare(strict_types=1);
namespace Weed;

/** Système de fichiers virtuel par utilisateur : "/" = WEED_DATA/home/<user>. Aucune échappée possible hors de la racine. */
final class Vfs
{
    private string $root;
    private const MAX_READ = 2097152;

    public function __construct(string $user)
    {
        if (!Auth::validName($user)) throw new \RuntimeException('utilisateur invalide');
        $homeBase = WEED_DATA . '/home';
        if (is_link(WEED_DATA) || is_link($homeBase)) {
            throw new \RuntimeException('racine des données non sécurisée');
        }
        if (!is_dir($homeBase) && !@mkdir($homeBase, 0700, true) && !is_dir($homeBase)) {
            throw new \RuntimeException('répertoire home inaccessible');
        }
        @chmod($homeBase, 0700);

        $r = $homeBase . '/' . $user;
        if (is_link($r)) throw new \RuntimeException('racine utilisateur symbolique interdite');
        if (!is_dir($r) && !@mkdir($r, 0700)) {
            if (!is_dir($r) || is_link($r)) throw new \RuntimeException('création du home utilisateur impossible');
        }
        @chmod($r, 0700);
        foreach (['Documents', 'Bureau', 'Notes'] as $d) {
            $dir = $r . '/' . $d;
            if (is_link($dir)) throw new \RuntimeException('dossier utilisateur symbolique interdit');
            if (!is_dir($dir) && !@mkdir($dir, 0700)) throw new \RuntimeException('création du dossier utilisateur impossible');
            @chmod($dir, 0700);
        }
        $resolved = realpath($r);
        if ($resolved === false || $resolved !== realpath($homeBase) . DIRECTORY_SEPARATOR . $user) {
            throw new \RuntimeException('racine utilisateur inaccessible ou redirigée');
        }
        $this->root = $resolved;
    }

    public function norm(string $path): string
    {
        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $path)) as $p) {
            if ($p === '' || $p === '.') continue;
            if (strpos($p, "\0") !== false) throw new \RuntimeException('chemin invalide');
            if ($p === '..') { array_pop($parts); continue; }
            $parts[] = $p;
        }
        return '/' . implode('/', $parts);
    }

    private function real(string $path): string
    {
        $n = $this->norm($path);
        $full = $this->root . ($n === '/' ? '' : $n);
        // Vérifie la cible existante, ou le parent existant le plus proche.
        // Cela bloque aussi les écritures vers un nouveau fichier via un lien symbolique externe.
        $probe = $full;
        while (!file_exists($probe) && !is_link($probe) && $probe !== $this->root) {
            $parent = dirname($probe);
            if ($parent === $probe) break;
            $probe = $parent;
        }
        $resolved = realpath($probe);
        if ($resolved === false) {
            if (is_link($probe)) throw new \RuntimeException('lien symbolique invalide');
            throw new \RuntimeException('chemin inaccessible');
        }
        if ($resolved !== $this->root && strpos($resolved, $this->root . DIRECTORY_SEPARATOR) !== 0) {
            throw new \RuntimeException('accès refusé');
        }
        return $full;
    }

    public function list(string $path): array
    {
        $full = $this->real($path);
        if (!is_dir($full)) throw new \RuntimeException('dossier introuvable');
        $out = [];
        foreach (scandir($full) as $n) {
            if ($n === '.' || $n === '..') continue;
            $p = $full . '/' . $n;
            $out[] = ['name' => $n, 'dir' => is_dir($p), 'size' => is_file($p) ? filesize($p) : 0, 'mtime' => filemtime($p)];
        }
        usort($out, fn($a, $b) => [$b['dir'], strtolower($a['name'])] <=> [$a['dir'], strtolower($b['name'])]);
        return ['path' => $this->norm($path), 'items' => $out];
    }

    public function read(string $path): string
    {
        $full = $this->real($path);
        if (!is_file($full)) throw new \RuntimeException('fichier introuvable');
        if (filesize($full) > self::MAX_READ) throw new \RuntimeException('fichier trop gros (2 Mo max)');
        return (string)file_get_contents($full);
    }

    public function write(string $path, string $content): bool
    {
        $full = $this->real($path);
        if ($this->norm($path) === '/' || is_dir($full)) throw new \RuntimeException('cible invalide');
        if (!is_dir(dirname($full))) throw new \RuntimeException('dossier parent introuvable');
        if (strlen($content) > 8 * 1048576) throw new \RuntimeException('contenu trop gros');
        if (is_link($full)) throw new \RuntimeException('écriture via lien symbolique interdite');
        $tmp = dirname($full) . '/.weed-write-' . bin2hex(random_bytes(8));
        $fh = @fopen($tmp, 'xb');
        if ($fh === false) throw new \RuntimeException('création temporaire impossible');
        try {
            @chmod($tmp, 0600);
            $offset = 0;
            while ($offset < strlen($content)) {
                $n = fwrite($fh, substr($content, $offset));
                if ($n === false || $n === 0) throw new \RuntimeException('écriture incomplète');
                $offset += $n;
            }
            if (!fflush($fh)) throw new \RuntimeException('synchronisation impossible');
        } catch (\Throwable $e) {
            fclose($fh); @unlink($tmp); throw $e;
        }
        fclose($fh);
        if (!@rename($tmp, $full)) { @unlink($tmp); throw new \RuntimeException('remplacement du fichier impossible'); }
        @chmod($full, 0600);
        return true;
    }

    public function mkdir(string $path): bool
    {
        $full = $this->real($path);
        if (file_exists($full)) throw new \RuntimeException('existe déjà');
        return mkdir($full, 0700, true);
    }


    // ======================================================================================================
    //  Archives (ZIP, TAR, TAR.GZ, TGZ) — liste, création, ajout, extraction, suppression, test, aperçu
    // ======================================================================================================
    private const ARC_MAX_ENTRIES = 5000;
    private const ARC_MAX_BYTES = 314572800;      // 300 Mo extraits au maximum par opération
    private const ARC_PREVIEW_MAX = 4194304;      // 4 Mo pour l'aperçu d'un fichier de l'archive

    private function archiveFile(string $path): string
    {
        $full = $this->real($path);
        if (!is_file($full) || is_link($full)) throw new \RuntimeException('Archive introuvable ou non sécurisée.');
        return $full;
    }
    private function needZip(): void { if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('Extension PHP zip indisponible pour les archives ZIP.'); }
    private function needTar(): void { if (!TarArchive::available()) throw new \RuntimeException('Extension PHP zlib indisponible pour les archives TAR.'); }
    private static function arcSafeName(string $name): bool
    {
        return !($name === '' || str_starts_with($name, '/') || preg_match('/^[A-Za-z]:/', $name) || preg_match('#(^|/)\.\.?(/|$)#', $name) || preg_match('/[\x00-\x1f\x7f]/', $name));
    }
    /** @return callable|null fn(string $name): bool — null si aucune sélection (= tout). */
    private static function arcMatcher(array $selected): ?callable
    {
        $sel = array_fill_keys(array_filter(array_map(static fn($v) => str_replace('\\', '/', (string)$v), $selected), static fn($v) => $v !== ''), true);
        if (!$sel) return null;
        return static function (string $name) use ($sel): bool {
            if (isset($sel[$name]) || isset($sel[rtrim($name, '/')])) return true;
            foreach ($sel as $chosen => $_) { $pre = rtrim((string)$chosen, '/') . '/'; if ($pre !== '/' && str_starts_with($name, $pre)) return true; }
            return false;
        };
    }
    private static function arcUnique(string $dst): string
    {
        $dir = dirname($dst); $base = basename($dst);
        $ext = (($p = strrpos($base, '.')) !== false && $p > 0) ? substr($base, $p) : ''; $stem = $ext === '' ? $base : substr($base, 0, -strlen($ext));
        for ($i = 1; $i < 1000; $i++) { $c = $dir . '/' . $stem . ' (' . $i . ')' . $ext; if (!file_exists($c) && !is_link($c)) return $c; }
        throw new \RuntimeException('Impossible de trouver un nom libre pour : ' . $base);
    }

    /** Liste le contenu des archives ZIP et TAR (TAR, TAR.GZ, TGZ). */
    public function archiveList(string $path): array
    {
        $full = $this->archiveFile($path);
        if (TarArchive::isTarName($path)) { $this->needTar(); return TarArchive::listing($full); }
        $this->needZip();
        $zip = new \ZipArchive();
        if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        $items = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $st = $zip->statIndex($i);
            if (!$st) continue;
            $name = (string)$st['name'];
            $items[] = ['name' => $name, 'size' => (int)($st['size'] ?? 0), 'compressed' => (int)($st['comp_size'] ?? 0), 'dir' => str_ends_with($name, '/'), 'mtime' => (int)($st['mtime'] ?? 0)];
        }
        $zip->close();
        return $items;
    }

    /** Rassemble les éléments à archiver : [entrée, chemin réel, estDossier]. Les liens symboliques sont ignorés. */
    private function arcCollect(array $sources, string $skipFull, string $inner): array
    {
        if (!$sources || count($sources) > 100) throw new \RuntimeException('Sélectionnez entre 1 et 100 éléments.');
        $items = []; $files = 0; $prefix = $inner === '' ? '' : $inner . '/';
        $walk = function (string $full, string $entry) use (&$walk, &$items, &$files, $skipFull): void {
            if (is_link($full)) return;
            if (is_dir($full)) {
                $items[] = [rtrim($entry, '/') . '/', $full, true];
                foreach (scandir($full) ?: [] as $n) if ($n !== '.' && $n !== '..') $walk($full . '/' . $n, rtrim($entry, '/') . '/' . $n);
            } elseif (is_file($full) && $full !== $skipFull) {
                if (++$files > self::ARC_MAX_ENTRIES) throw new \RuntimeException('Archive limitée à ' . self::ARC_MAX_ENTRIES . ' fichiers.');
                $items[] = [$entry, $full, false];
            }
        };
        foreach ($sources as $source) {
            if (!is_string($source)) continue;
            $norm = $this->norm($source);
            if ($norm === '/') continue;
            $full = $this->real($norm);
            if (file_exists($full)) $walk($full, $prefix . basename($norm));
        }
        return $items;
    }

    /** Crée une archive ZIP / TAR / TAR.GZ à partir de chemins du VFS. */
    public function archiveCreate(string $target, array $sources): bool
    {
        if (!$sources || count($sources) > 100) throw new \RuntimeException('Sélectionnez entre 1 et 100 éléments.');
        $targetNorm = $this->norm($target); $targetFull = $this->real($targetNorm);
        if (is_dir($targetFull) || !is_dir(dirname($targetFull)) || is_link(dirname($targetFull))) throw new \RuntimeException('Chemin de destination invalide.');
        if (TarArchive::isTarName($target)) {
            $this->needTar();
            if (file_exists($targetFull)) throw new \RuntimeException('Un fichier du même nom existe déjà.');
            $items = $this->arcCollect($sources, $targetFull, '');
            if (!$items) throw new \RuntimeException('Aucun élément à archiver.');
            $tmp = $targetFull . '.weed-tmp-' . bin2hex(random_bytes(4));
            $w = TarArchive::openWrite($tmp, TarArchive::wantsGzip($target));
            try {
                foreach ($items as [$entry, $full, $isDir]) {
                    if ($isDir) TarArchive::writeHeader($w, $entry, 0, (int)@filemtime($full), true);
                    else TarArchive::addFile($w, $entry, $full);
                }
                TarArchive::closeWrite($w);
                if (!rename($tmp, $targetFull)) throw new \RuntimeException('Impossible de finaliser l’archive.');
            } catch (\Throwable $e) { TarArchive::abortWrite($w); @unlink($tmp); throw $e; }
            return true;
        }
        $this->needZip();
        $items = $this->arcCollect($sources, $targetFull, '');
        $zip = new \ZipArchive();
        if ($zip->open($targetFull, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) throw new \RuntimeException('Impossible de créer le ZIP.');
        try {
            foreach ($items as [$entry, $full, $isDir]) { if ($isDir) $zip->addEmptyDir($entry); else $zip->addFile($full, $entry); }
            if (!$zip->close()) throw new \RuntimeException('Impossible de finaliser le ZIP.');
        } catch (\Throwable $e) { @$zip->close(); @unlink($targetFull); throw $e; }
        return true;
    }

    /** Ajoute des fichiers/dossiers du VFS à une archive existante (remplace les entrées de même nom). */
    public function archiveAdd(string $archive, array $sources, string $dir = ''): array
    {
        $full = $this->archiveFile($archive);
        $inner = trim(str_replace('\\', '/', $dir), '/');
        if ($inner !== '' && !self::arcSafeName($inner)) throw new \RuntimeException('Dossier interne invalide.');
        $items = $this->arcCollect($sources, $full, $inner);
        if (!$items) throw new \RuntimeException('Aucun élément à ajouter.');
        $added = count(array_filter($items, static fn($i) => !$i[2]));
        if (TarArchive::isTarName($archive)) {
            $this->needTar();
            $new = []; foreach ($items as [$entry, , $isDir]) $new[rtrim($entry, '/')] = $isDir;
            $seenDirs = [];
            $tmp = $full . '.weed-tmp-' . bin2hex(random_bytes(4));
            TarArchive::rewrite($full, $tmp, TarArchive::wantsGzip($archive),
                static function (array $e) use ($new, &$seenDirs): bool {
                    $k = rtrim($e['name'], '/');
                    if ($e['dir']) { $seenDirs[$k] = true; return true; }
                    return !isset($new[$k]);
                },
                static function (array $w) use ($items, &$seenDirs): void {
                    foreach ($items as [$entry, $path, $isDir]) {
                        if ($isDir) { if (!isset($seenDirs[rtrim($entry, '/')])) TarArchive::writeHeader($w, $entry, 0, (int)@filemtime($path), true); }
                        else TarArchive::addFile($w, $entry, $path);
                    }
                });
            if (!rename($tmp, $full)) { @unlink($tmp); throw new \RuntimeException('Impossible de finaliser l’archive.'); }
            return ['added' => $added];
        }
        $this->needZip();
        $zip = new \ZipArchive();
        if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        try {
            foreach ($items as [$entry, $path, $isDir]) {
                if ($isDir) { if ($zip->locateName($entry) === false) $zip->addEmptyDir($entry); }
                else $zip->addFile($path, $entry, 0, 0, \ZipArchive::FL_OVERWRITE);
            }
            if (!$zip->close()) throw new \RuntimeException('Impossible de finaliser la modification de l’archive.');
        } catch (\Throwable $e) { @$zip->close(); throw $e; }
        return ['added' => $added];
    }

    /**
     * Extrait une archive (ZIP, TAR, TAR.GZ) en refusant traversées, liens symboliques et collisions dangereuses.
     * $mode (fichier déjà présent) : overwrite (remplacer), skip (ignorer), rename (garder les deux), error (refuser).
     */
    public function archiveExtract(string $archive, string $destination, array $selected = [], string $mode = 'overwrite'): array
    {
        if (!in_array($mode, ['overwrite', 'skip', 'rename', 'error'], true)) $mode = 'overwrite';
        $archiveFull = $this->archiveFile($archive);
        $destNorm = $this->norm($destination); $destFull = $this->real($destNorm);
        if (!is_dir($destFull) || is_link($destFull)) throw new \RuntimeException('Dossier de destination invalide.');
        $isTar = TarArchive::isTarName($archive);
        if ($isTar) $this->needTar(); else $this->needZip();
        $match = self::arcMatcher($selected);
        $tmp = $destFull . '/.weed-extract-' . bin2hex(random_bytes(8));
        $names = []; $total = 0; $zip = null;
        try {
            if (!mkdir($tmp, 0700)) throw new \RuntimeException('Impossible de préparer l’extraction.');
            if ($isTar) {
                TarArchive::walk($archiveFull, function (array $e, callable $read) use (&$names, &$total, $match, $tmp): void {
                    $name = str_replace('\\', '/', $e['name']);
                    if (!self::arcSafeName($name)) throw new \RuntimeException('Chemin dangereux détecté dans le TAR.');
                    if ($e['link']) throw new \RuntimeException('Lien symbolique interdit dans le TAR.');
                    if ($e['special'] || ($match && !$match($name))) return;
                    $key = strtolower(rtrim($name, '/'));
                    if (count($names) >= self::ARC_MAX_ENTRIES && !isset($names[$key])) throw new \RuntimeException('Archive trop volumineuse (' . self::ARC_MAX_ENTRIES . ' entrées maximum).');
                    $out = $tmp . '/' . rtrim($name, '/');
                    if ($e['dir']) {
                        if (!is_dir($out) && !mkdir($out, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                        $names[$key] = ['name' => $name, 'dir' => true]; return;
                    }
                    $total += $e['size'];
                    if ($total > self::ARC_MAX_BYTES) throw new \RuntimeException('Extraction limitée à 300 Mo.');
                    $parent = dirname($out);
                    if (!is_dir($parent) && !mkdir($parent, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                    $fh = fopen($out, 'wb'); if (!$fh) throw new \RuntimeException('Écriture impossible : ' . $name);
                    try { $read(static function (string $c) use ($fh, $name): void { if (fwrite($fh, $c) === false) throw new \RuntimeException('Écriture impossible : ' . $name); }); }
                    finally { fclose($fh); }
                    @chmod($out, 0600);
                    $names[$key] = ['name' => $name, 'dir' => false];
                });
            } else {
                $zip = new \ZipArchive();
                if ($zip->open($archiveFull) !== true) throw new \RuntimeException('Archive ZIP invalide.');
                if ($zip->numFiles > self::ARC_MAX_ENTRIES) throw new \RuntimeException('Archive trop volumineuse (' . self::ARC_MAX_ENTRIES . ' entrées maximum).');
                $chosen = [];
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $st = $zip->statIndex($i);
                    if (!$st) throw new \RuntimeException('Entrée ZIP illisible.');
                    $name = str_replace('\\', '/', (string)$st['name']);
                    if (!self::arcSafeName($name)) throw new \RuntimeException('Chemin dangereux détecté dans le ZIP.');
                    $opsys = 0; $attr = 0;
                    if ($zip->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === \ZipArchive::OPSYS_UNIX && ((($attr >> 16) & 0170000) === 0120000)) throw new \RuntimeException('Lien symbolique interdit dans le ZIP.');
                    $key = strtolower(rtrim($name, '/'));
                    if ($key === '' || isset($chosen[$key])) throw new \RuntimeException('Entrées ZIP dupliquées ou ambiguës.');
                    if ($match && !$match($name)) continue;
                    $chosen[$key] = ['index' => $i, 'name' => $name, 'dir' => str_ends_with($name, '/')];
                    $total += (int)($st['size'] ?? 0);
                    if ($total > self::ARC_MAX_BYTES) throw new \RuntimeException('Extraction limitée à 300 Mo.');
                }
                foreach ($chosen as $key => $entry) {
                    $out = $tmp . '/' . rtrim($entry['name'], '/');
                    if ($entry['dir']) { if (!is_dir($out) && !mkdir($out, 0700, true)) throw new \RuntimeException('Création de dossier impossible.'); $names[$key] = $entry; continue; }
                    $parent = dirname($out);
                    if (!is_dir($parent) && !mkdir($parent, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                    $in = $zip->getStream($zip->getNameIndex($entry['index']));
                    $fh = $in ? fopen($out, 'wb') : false;
                    if (!$in || !$fh) throw new \RuntimeException('Écriture impossible : ' . $entry['name']);
                    try { while (!feof($in)) { $c = fread($in, 65536); if ($c === false) throw new \RuntimeException('Lecture impossible : ' . $entry['name']); if ($c !== '' && fwrite($fh, $c) === false) throw new \RuntimeException('Écriture impossible : ' . $entry['name']); } }
                    finally { fclose($in); fclose($fh); }
                    @chmod($out, 0600);
                    $names[$key] = $entry;
                }
            }
            if (!$names) throw new \RuntimeException('Aucune entrée à extraire.');

            // Mise en place sans suivre de lien préexistant dans la destination.
            $count = 0; $skipped = 0; $renamed = 0;
            foreach ($names as $entry) {
                $name = rtrim($entry['name'], '/');
                $src = $tmp . '/' . $name; $dst = $destFull . '/' . $name; $parent = dirname($dst);
                for ($cursor = $parent; $cursor !== $destFull && strpos($cursor, $destFull . DIRECTORY_SEPARATOR) === 0; $cursor = dirname($cursor)) {
                    if (is_link($cursor)) throw new \RuntimeException('Lien symbolique présent dans la destination.');
                }
                if ($entry['dir']) {
                    if (is_link($dst)) throw new \RuntimeException('Lien symbolique présent dans la destination.');
                    if (file_exists($dst) && !is_dir($dst)) throw new \RuntimeException('Un fichier porte déjà le nom du dossier : ' . $name);
                    if (!is_dir($dst) && !mkdir($dst, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                    continue;
                }
                if (!is_dir($parent) && !mkdir($parent, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                if (is_link($dst) || is_dir($dst) || file_exists($dst)) {
                    if ($mode === 'skip') { $skipped++; continue; }
                    if ($mode === 'error') throw new \RuntimeException('Collision avec un élément existant : ' . $name);
                    if ($mode === 'rename' || is_link($dst) || is_dir($dst)) { $dst = self::arcUnique($dst); $renamed++; }
                    elseif (!unlink($dst)) throw new \RuntimeException('Remplacement impossible : ' . $name);
                }
                if (!rename($src, $dst)) throw new \RuntimeException('Déplacement impossible : ' . $name);
                @chmod($dst, 0600); $count++;
            }
            return ['files' => $count, 'skipped' => $skipped, 'renamed' => $renamed, 'destination' => $destNorm];
        } finally {
            if ($zip) @$zip->close();
            if (is_dir($tmp)) {
                $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($tmp, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
                foreach ($it as $item) ($item->isDir() && !$item->isLink()) ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
                @rmdir($tmp);
            }
        }
    }

    /** Supprime des entrées d’une archive (ZIP ou TAR/TAR.GZ) sans l’extraire. */
    public function archiveDelete(string $archive, array $entries): array
    {
        if (!$entries || count($entries) > 500) throw new \RuntimeException('Sélectionnez entre 1 et 500 entrées.');
        $full = $this->archiveFile($archive);
        $match = self::arcMatcher($entries);
        if (!$match) throw new \RuntimeException('Sélectionnez au moins une entrée.');
        if (TarArchive::isTarName($archive)) {
            $this->needTar();
            $tmp = $full . '.weed-tmp-' . bin2hex(random_bytes(4));
            [, $dropped] = TarArchive::rewrite($full, $tmp, TarArchive::wantsGzip($archive), static fn(array $e): bool => !$match(str_replace('\\', '/', $e['name'])));
            if ($dropped === 0) { @unlink($tmp); throw new \RuntimeException('Aucune entrée sélectionnée trouvée.'); }
            if (!rename($tmp, $full)) { @unlink($tmp); throw new \RuntimeException('Impossible de finaliser l’archive.'); }
            return ['deleted' => $dropped];
        }
        $this->needZip();
        $zip = new \ZipArchive();
        if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        $deleted = 0;
        try {
            for ($i = $zip->numFiles - 1; $i >= 0; $i--) {
                $st = $zip->statIndex($i); if (!$st) continue;
                if (!$match(str_replace('\\', '/', (string)$st['name']))) continue;
                if (!$zip->deleteIndex($i)) throw new \RuntimeException('Impossible de supprimer l’entrée : ' . $st['name']);
                $deleted++;
            }
            if ($deleted === 0) throw new \RuntimeException('Aucune entrée sélectionnée trouvée.');
            if (!$zip->close()) throw new \RuntimeException('Impossible de finaliser la modification de l’archive.');
            return ['deleted' => $deleted];
        } catch (\Throwable $e) { @$zip->close(); throw $e; }
    }

    /** Vérifie l’intégrité d’une archive (CRC ZIP / sommes de contrôle TAR). */
    public function archiveTest(string $archive): array
    {
        $full = $this->archiveFile($archive); $tested = 0; $errors = [];
        if (TarArchive::isTarName($archive)) {
            $this->needTar();
            try { TarArchive::walk($full, function (array $e, callable $read) use (&$tested) { if (!$e['dir'] && !$e['special']) { $read(static function (string $c): void {}); } $tested++; }); }
            catch (\Throwable $t) { $errors[] = $t->getMessage(); }
            return ['ok' => !$errors, 'tested' => $tested, 'errors' => $errors];
        }
        $this->needZip();
        $zip = new \ZipArchive();
        if ($zip->open($full, \ZipArchive::CHECKCONS) !== true) return ['ok' => false, 'tested' => 0, 'errors' => ['Structure ZIP invalide ou corrompue.']];
        for ($i = 0; $i < $zip->numFiles && count($errors) < 20; $i++) {
            $st = $zip->statIndex($i); if (!$st) { $errors[] = 'Entrée illisible #' . $i; continue; }
            $tested++;
            if (str_ends_with((string)$st['name'], '/')) continue;
            if ((int)$st['size'] > 67108864) continue;      // au-delà de 64 Mo : structure seulement
            if ($zip->getFromIndex($i) === false) $errors[] = 'Données corrompues : ' . $st['name'];
        }
        $zip->close();
        return ['ok' => !$errors, 'tested' => $tested, 'errors' => $errors];
    }

    /** Contenu d’une entrée (aperçu, 4 Mo max) encodé en base64. */
    public function archiveRead(string $archive, string $entry): array
    {
        $full = $this->archiveFile($archive);
        $entry = str_replace('\\', '/', $entry);
        if (!self::arcSafeName($entry) || str_ends_with($entry, '/')) throw new \RuntimeException('Entrée invalide.');
        $data = null;
        if (TarArchive::isTarName($archive)) {
            $this->needTar();
            TarArchive::walk($full, function (array $e, callable $read) use ($entry, &$data): mixed {
                if ($e['dir'] || str_replace('\\', '/', $e['name']) !== $entry) return null;
                if ($e['size'] > self::ARC_PREVIEW_MAX) throw new \RuntimeException('Fichier trop volumineux pour l’aperçu (4 Mo maximum).');
                $buf = ''; $read(static function (string $c) use (&$buf): void { $buf .= $c; }); $data = $buf; return false;
            });
        } else {
            $this->needZip();
            $zip = new \ZipArchive();
            if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
            $i = $zip->locateName($entry);
            if ($i !== false) {
                $st = $zip->statIndex($i);
                if ((int)($st['size'] ?? 0) > self::ARC_PREVIEW_MAX) { $zip->close(); throw new \RuntimeException('Fichier trop volumineux pour l’aperçu (4 Mo maximum).'); }
                $d = $zip->getFromIndex($i); if ($d !== false) $data = $d;
            }
            $zip->close();
        }
        if ($data === null) throw new \RuntimeException('Entrée introuvable dans l’archive.');
        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'bmp' => 'image/bmp', 'svg' => 'image/svg+xml', 'pdf' => 'application/pdf'][$ext]
            ?? (in_array($ext, ['txt', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'php', 'csv', 'log', 'ini', 'conf', 'sh', 'py', 'c', 'h', 'yml', 'yaml', 'sql'], true) ? 'text/plain' : 'application/octet-stream');
        return ['name' => $entry, 'size' => strlen($data), 'mime' => $mime, 'data' => base64_encode($data)];
    }

    /** Nom de fichier simple (sans séparateur ni caractère de contrôle). */
    public static function validFileName(string $name): bool
    {
        return $name !== '' && $name !== '.' && $name !== '..' && strlen($name) <= 200
            && !preg_match('#[/\\\\\x00-\x1f\x7f]#', $name);
    }

    /** v0.8.7 — copie un fichier ou dossier (récursif). La destination ne doit pas exister. */
    public function copy(string $src, string $dst): bool
    {
        [$sn, $dn, $s, $d] = $this->pair($src, $dst);
        if (is_dir($s) && ($dn === $sn || str_starts_with($dn . '/', $sn . '/'))) throw new \RuntimeException('impossible de copier un dossier dans lui-même');
        $count = 0; $bytes = 0;
        try { $this->copyTree($s, $d, $count, $bytes); }
        catch (\Throwable $e) { if (file_exists($d)) { try { $this->remove($dn); } catch (\Throwable $x) {} } throw $e; }
        return true;
    }

    /** v0.8.7 — déplace ou renomme un fichier ou dossier. La destination ne doit pas exister. */
    public function move(string $src, string $dst): bool
    {
        [$sn, $dn, $s, $d] = $this->pair($src, $dst, true);
        if ($sn === $dn) return true;
        if (is_dir($s) && str_starts_with($dn . '/', $sn . '/')) throw new \RuntimeException('impossible de déplacer un dossier dans lui-même');
        if (!@rename($s, $d)) throw new \RuntimeException('déplacement impossible');
        return true;
    }

    /** @return array{0:string,1:string,2:string,3:string} */
    private function pair(string $src, string $dst, bool $allowSame = false): array
    {
        $sn = $this->norm($src); $dn = $this->norm($dst);
        if ($sn === '/' || $dn === '/') throw new \RuntimeException('racine protégée');
        $s = $this->real($sn); $d = $this->real($dn);
        if (is_link($s) || !file_exists($s)) throw new \RuntimeException('source introuvable');
        if ($allowSame && $sn === $dn) return [$sn, $dn, $s, $d];
        if (file_exists($d) || is_link($d)) throw new \RuntimeException('un élément du même nom existe déjà');
        if (!is_dir(dirname($d))) throw new \RuntimeException('dossier de destination introuvable');
        return [$sn, $dn, $s, $d];
    }

    private function copyTree(string $s, string $d, int &$count, int &$bytes): void
    {
        if (is_link($s)) return; // les liens symboliques ne sont jamais copiés
        if (is_dir($s)) {
            if (!@mkdir($d, 0700)) throw new \RuntimeException('création de dossier impossible');
            foreach (scandir($s) ?: [] as $n) {
                if ($n === '.' || $n === '..') continue;
                $this->copyTree($s . '/' . $n, $d . '/' . $n, $count, $bytes);
            }
            return;
        }
        if (!is_file($s)) return;
        if (++$count > 5000) throw new \RuntimeException('copie limitée à 5 000 fichiers');
        $bytes += (int)filesize($s);
        if ($bytes > 2147483648) throw new \RuntimeException('copie limitée à 2 Go');
        if (!@copy($s, $d)) throw new \RuntimeException('copie impossible : ' . basename($s));
        @chmod($d, 0600);
    }

    /** v0.8.7 — enregistre un fichier envoyé (binaire inclus) dans un dossier du VFS. */
    public function importUpload(string $dir, string $name, string $tmp): string
    {
        if (!self::validFileName($name)) throw new \RuntimeException('nom de fichier invalide');
        $dn = $this->norm($dir);
        $dfull = $this->real($dn);
        if (!is_dir($dfull) || is_link($dfull)) throw new \RuntimeException('dossier de destination introuvable');
        $target = $this->norm($dn . '/' . $name);
        $full = $this->real($target);
        if (file_exists($full) || is_link($full)) throw new \RuntimeException('un élément du même nom existe déjà');
        if (!is_uploaded_file($tmp) || !@move_uploaded_file($tmp, $full)) throw new \RuntimeException('enregistrement du fichier impossible');
        @chmod($full, 0600);
        return $target;
    }

    /** v0.8.7 — informations pour servir un fichier (lecture en flux : vidéo, audio, images, PDF). */
    public function fileInfo(string $path): array
    {
        $n = $this->norm($path);
        $full = $this->real($n);
        if (is_link($full) || !is_file($full)) throw new \RuntimeException('fichier introuvable');
        return ['full' => $full, 'size' => (int)filesize($full), 'name' => basename($n), 'mtime' => (int)filemtime($full)];
    }

    public function remove(string $path): bool
    {
        if ($this->norm($path) === '/') throw new \RuntimeException('racine protégée');
        $full = $this->real($path);
        if (is_link($full) || is_file($full)) return unlink($full);
        if (!is_dir($full)) throw new \RuntimeException('introuvable');
        foreach (scandir($full) as $n) {
            if ($n !== '.' && $n !== '..') $this->remove($this->norm($path) . '/' . $n);
        }
        return rmdir($full);
    }
}
