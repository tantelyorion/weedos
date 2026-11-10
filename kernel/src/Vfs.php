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


    /** Liste le contenu des archives ZIP et TAR (TAR, TAR.GZ, TGZ). */
    public function archiveList(string $path): array
    {
        $full = $this->real($path);
        if (!is_file($full) || is_link($full)) throw new \RuntimeException('Archive introuvable.');
        if (preg_match('/\.(tar|tgz)$/i', $path) || preg_match('/\.tar\.gz$/i', $path)) {
            if (!class_exists(\PharData::class)) throw new \RuntimeException('PharData indisponible pour lire les archives TAR.');
            $tar = new \PharData($full);
            $prefix = 'phar://' . $full . '/'; $items = [];
            $it = new \RecursiveIteratorIterator($tar, \RecursiveIteratorIterator::SELF_FIRST);
            foreach ($it as $entry) {
                $uri = str_replace('\\', '/', $entry->getPathname());
                $name = str_starts_with($uri, $prefix) ? substr($uri, strlen($prefix)) : $entry->getFilename();
                $items[] = ['name' => $name . ($entry->isDir() && !str_ends_with($name, '/') ? '/' : ''), 'size' => $entry->isFile() ? (int)$entry->getSize() : 0, 'compressed' => 0, 'dir' => $entry->isDir()];
            }
            return $items;
        }
        if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('Extension PHP zip indisponible pour les archives ZIP.');
        $zip = new \ZipArchive();
        if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        $items = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $st = $zip->statIndex($i);
            if (!$st) continue;
            $name = (string)$st['name'];
            $items[] = ['name' => $name, 'size' => (int)($st['size'] ?? 0), 'compressed' => (int)($st['comp_size'] ?? 0), 'dir' => str_ends_with($name, '/')];
        }
        $zip->close();
        return $items;
    }

    /** Crée une archive ZIP à partir de chemins du VFS. */
    public function archiveCreate(string $target, array $sources): bool
    {
        if (!$sources || count($sources) > 100) throw new \RuntimeException('Sélectionnez entre 1 et 100 éléments.');
        if (preg_match('/\.(tar|tgz)$/i', $target) || preg_match('/\.tar\.gz$/i', $target)) {
            if (!class_exists(\PharData::class)) throw new \RuntimeException('PharData indisponible pour créer les archives TAR.');
            $targetNorm = $this->norm($target); $targetFull = $this->real($targetNorm);
            if (is_dir($targetFull) || !is_dir(dirname($targetFull)) || is_link(dirname($targetFull))) throw new \RuntimeException('Chemin de destination invalide.');
            if (file_exists($targetFull)) throw new \RuntimeException('Un fichier du même nom existe déjà.');
            $tarPath = preg_match('/\.(tgz|tar\.gz)$/i', $target) ? preg_replace('/\.(tgz|tar\.gz)$/i', '.tar', $targetFull) : $targetFull;
            $tar = new \PharData($tarPath); $added = 0;
            $walk = function(string $full, string $entry) use (&$walk, $tar, &$added): void {
                if (is_link($full)) throw new \RuntimeException('Lien symbolique interdit dans une archive.');
                if (is_dir($full)) { foreach (scandir($full) ?: [] as $n) if ($n !== '.' && $n !== '..') $walk($full . '/' . $n, rtrim($entry, '/') . '/' . $n); }
                elseif (is_file($full)) { if (++$added > 2000) throw new \RuntimeException('Archive limitée à 2 000 fichiers.'); $tar->addFile($full, $entry); }
            };
            try { foreach ($sources as $source) { if (!is_string($source)) continue; $norm=$this->norm($source); if ($norm === '/' || $norm === $targetNorm) continue; $full=$this->real($norm); if (file_exists($full) && !is_link($full)) $walk($full, basename($norm)); } }
            catch (\Throwable $e) { unset($tar); @unlink($tarPath); throw $e; }
            unset($tar);
            if ($tarPath !== $targetFull) { $phar = new \PharData($tarPath); $phar->compress(\Phar::GZ); unset($phar); @unlink($tarPath); $gzPath = $tarPath . '.gz'; if (!rename($gzPath, $targetFull)) throw new \RuntimeException('Impossible de finaliser l’archive TAR.GZ.'); }
            return true;
        }
        if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('Extension PHP zip indisponible.');
        if (!$sources || count($sources) > 100) throw new \RuntimeException('Sélectionnez entre 1 et 100 éléments.');
        $targetNorm = $this->norm($target);
        $targetFull = $this->real($targetNorm);
        if (is_dir($targetFull) || !is_dir(dirname($targetFull))) throw new \RuntimeException('Chemin de destination invalide.');
        $zip = new \ZipArchive();
        if ($zip->open($targetFull, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) throw new \RuntimeException('Impossible de créer le ZIP.');
        $added = 0;
        $walk = function(string $full, string $entry) use (&$walk, $zip, &$added, $targetFull): void {
            if (is_link($full)) return;
            if (is_dir($full)) {
                $zip->addEmptyDir(rtrim($entry, '/') . '/');
                foreach (scandir($full) ?: [] as $n) {
                    if ($n === '.' || $n === '..') continue;
                    $walk($full . '/' . $n, rtrim($entry, '/') . '/' . $n);
                }
            } elseif (is_file($full) && $full !== $targetFull) {
                if (++$added > 2000) throw new \RuntimeException('Archive limitée à 2 000 fichiers.');
                $zip->addFile($full, $entry);
            }
        };
        try {
            foreach ($sources as $source) {
                if (!is_string($source)) continue;
                $norm = $this->norm($source);
                if ($norm === '/' || $norm === $targetNorm) continue;
                $full = $this->real($norm);
                if (!file_exists($full)) continue;
                $walk($full, basename($norm));
            }
            $zip->close();
        } catch (\Throwable $e) {
            $zip->close(); @unlink($targetFull); throw $e;
        }
        return true;
    }

    /** Extrait un ZIP en refusant traversées, liens symboliques et collisions de chemins. */
    public function archiveExtract(string $archive, string $destination, array $selected = []): array
    {
        $archiveFull = $this->real($archive);
        if (preg_match('/\.(tar|tgz)$/i', $archive) || preg_match('/\.tar\.gz$/i', $archive)) {
            if (!class_exists(\PharData::class)) throw new \RuntimeException('PharData indisponible pour extraire les archives TAR.');
            $destNorm=$this->norm($destination); $destFull=$this->real($destNorm);
            if (!is_file($archiveFull) || is_link($archiveFull) || !is_dir($destFull) || is_link($destFull)) throw new \RuntimeException('Archive ou dossier de destination invalide.');
            $tar=new \PharData($archiveFull); $prefix='phar://' . $archiveFull . '/'; $selection=array_fill_keys(array_filter(array_map('strval',$selected)),true); $files=0; $total=0; $count=0;
            $it=new \RecursiveIteratorIterator($tar, \RecursiveIteratorIterator::SELF_FIRST);
            foreach($it as $entry){
                $uri=str_replace('\\','/',$entry->getPathname()); $name=$uri; if(str_starts_with($uri,$prefix))$name=substr($uri,strlen($prefix));
                $name=str_replace('\\','/',$name);
                if($name==='' || str_starts_with($name,'/') || preg_match('/^[A-Za-z]:/',$name) || preg_match('#(^|/)\.\.?(/|$)#',$name) || preg_match('/[\x00-\x1f\x7f]/',$name)) throw new \RuntimeException('Chemin dangereux détecté dans le TAR.');
                if($entry->isLink()) throw new \RuntimeException('Lien symbolique interdit dans le TAR.');
                $match=!$selection || isset($selection[$name]) || isset($selection[rtrim($name,'/')]);
                if(!$match) foreach($selection as $chosen=>$_){$pre=rtrim((string)$chosen,'/').'/';if(str_starts_with($name,$pre)){$match=true;break;}}
                if(!$match)continue;
                $out=$destFull.'/'.$name;
                if($entry->isDir()){if(is_link($out))throw new \RuntimeException('Lien symbolique dans la destination.');if(!is_dir($out)&&!mkdir($out,0700,true))throw new \RuntimeException('Création de dossier impossible.');continue;}
                $size=(int)$entry->getSize();$total+=$size;if(++$files>2000 || $total>104857600)throw new \RuntimeException('Archive TAR trop volumineuse (2 000 fichiers / 100 Mo maximum).');
                $parent=dirname($out);if(!is_dir($parent)&&!mkdir($parent,0700,true))throw new \RuntimeException('Création de dossier impossible.');
                $cursor=$parent;while($cursor!==$destFull && str_starts_with($cursor,$destFull.DIRECTORY_SEPARATOR)){if(is_link($cursor))throw new \RuntimeException('Lien symbolique présent dans la destination.');$cursor=dirname($cursor);}
                if(file_exists($out)||is_link($out))throw new \RuntimeException('Collision avec un élément existant : '.$name);
                $content=$entry->getContent();if(file_put_contents($out,$content,LOCK_EX)===false)throw new \RuntimeException('Écriture impossible : '.$name);@chmod($out,0600);$count++;
            }
            return ['files'=>$count,'destination'=>$destNorm];
        }
        if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('Extension PHP zip indisponible.');
        $zipFull = $this->real($archive);
        $destNorm = $this->norm($destination);
        $destFull = $this->real($destNorm);
        if (!is_file($zipFull) || !is_dir($destFull) || is_link($destFull)) throw new \RuntimeException('Archive ou dossier de destination invalide.');
        $zip = new \ZipArchive();
        if ($zip->open($zipFull) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        $tmp = $destFull . '/.weed-extract-' . bin2hex(random_bytes(8));
        $names = []; $total = 0;
        $selection = array_fill_keys(array_filter(array_map('strval', $selected)), true);
        try {
            if ($zip->numFiles > 2000) throw new \RuntimeException('Archive trop volumineuse (2 000 entrées maximum).');
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $st = $zip->statIndex($i);
                if (!$st) throw new \RuntimeException('Entrée ZIP illisible.');
                $raw = (string)$st['name'];
                $name = str_replace('\\', '/', $raw);
                if ($name === '' || str_starts_with($name, '/') || preg_match('/^[A-Za-z]:/', $name) ||
                    preg_match('#(^|/)\.\.?(/|$)#', $name) || str_contains($name, "\0") ||
                    preg_match('/[\x00-\x1f\x7f]/', $name)) {
                    throw new \RuntimeException('Chemin dangereux détecté dans le ZIP.');
                }
                $opsys = 0; $attr = 0;
                if ($zip->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === \ZipArchive::OPSYS_UNIX) {
                    $kind = ($attr >> 16) & 0170000;
                    if ($kind === 0120000) throw new \RuntimeException('Lien symbolique interdit dans le ZIP.');
                }
                $key = strtolower(rtrim($name, '/'));
                if ($key === '' || isset($names[$key])) throw new \RuntimeException('Entrées ZIP dupliquées ou ambiguës.');
                if ($selection) {
                    $matched = isset($selection[$name]) || isset($selection[rtrim($name, '/')]);
                    if (!$matched) foreach ($selection as $chosen => $_) {
                        $prefix = rtrim((string)$chosen, '/') . '/';
                        if ($prefix !== '/' && str_starts_with($name, $prefix)) { $matched = true; break; }
                    }
                    if (!$matched) continue;
                }
                $names[$key] = ['index' => $i, 'name' => $name, 'dir' => str_ends_with($name, '/')];
                $total += (int)($st['size'] ?? 0);
                if ($total > 104857600) throw new \RuntimeException('Extraction limitée à 100 Mo.');
            }

            if (!mkdir($tmp, 0700)) throw new \RuntimeException('Impossible de préparer l’extraction.');
            $count = 0;
            foreach ($names as $entry) {
                $name = $entry['name'];
                $out = $tmp . '/' . rtrim($name, '/');
                if ($entry['dir']) {
                    if (!is_dir($out) && !mkdir($out, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                    continue;
                }
                $parent = dirname($out);
                if (!is_dir($parent) && !mkdir($parent, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                $data = $zip->getFromIndex($entry['index']);
                if ($data === false || file_put_contents($out, $data, LOCK_EX) === false) throw new \RuntimeException('Écriture impossible : ' . $name);
                @chmod($out, 0600);
                $count++;
            }

            // Déplace les fichiers sans suivre de liens préexistants dans la destination.
            foreach ($names as $entry) {
                $name = rtrim($entry['name'], '/');
                $src = $tmp . '/' . $name;
                $dst = $destFull . '/' . $name;
                $parent = dirname($dst);
                $cursor = $parent;
                while ($cursor !== $destFull && strpos($cursor, $destFull . DIRECTORY_SEPARATOR) === 0) {
                    if (is_link($cursor)) throw new \RuntimeException('Lien symbolique présent dans la destination.');
                    $cursor = dirname($cursor);
                }
                if ($entry['dir']) {
                    if (is_link($dst)) throw new \RuntimeException('Lien symbolique présent dans la destination.');
                    if (!is_dir($dst) && !mkdir($dst, 0700, true)) throw new \RuntimeException('Création de dossier impossible.');
                } else {
                    if (!is_dir($parent) && !mkdir($parent, 0755, true)) throw new \RuntimeException('Création de dossier impossible.');
                    if (is_link($dst) || is_dir($dst)) throw new \RuntimeException('Collision avec un élément existant.');
                    if (file_exists($dst) && !unlink($dst)) throw new \RuntimeException('Remplacement impossible.');
                    if (!rename($src, $dst)) throw new \RuntimeException('Déplacement impossible : ' . $name);
                    @chmod($dst, 0600);
                }
            }
            return ['files' => $count, 'destination' => $destNorm];
        } finally {
            $zip->close();
            if (is_dir($tmp)) {
                $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($tmp, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
                foreach ($it as $item) $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
                @rmdir($tmp);
            }
        }
    }

    /** Supprime des entrées sélectionnées d’un ZIP sans extraire son contenu. */
    public function archiveDelete(string $archive, array $entries): array
    {
        if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('Extension PHP zip indisponible.');
        if (!$entries || count($entries) > 500) throw new \RuntimeException('Sélectionnez entre 1 et 500 entrées.');
        $full = $this->real($archive);
        if (!is_file($full) || is_link($full)) throw new \RuntimeException('Archive introuvable ou non sécurisée.');
        $zip = new \ZipArchive();
        if ($zip->open($full) !== true) throw new \RuntimeException('Archive ZIP invalide.');
        $wanted = array_fill_keys(array_map(static fn($v) => str_replace('\\', '/', (string)$v), $entries), true);
        $deleted = 0;
        try {
            for ($i = $zip->numFiles - 1; $i >= 0; $i--) {
                $st = $zip->statIndex($i);
                if (!$st) continue;
                $name = str_replace('\\', '/', (string)$st['name']);
                $match = isset($wanted[$name]) || isset($wanted[rtrim($name, '/')]);
                if (!$match) foreach ($wanted as $chosen => $_) {
                    $prefix = rtrim((string)$chosen, '/') . '/';
                    if ($prefix !== '/' && str_starts_with($name, $prefix)) { $match = true; break; }
                }
                if (!$match) continue;
                if (!$zip->deleteIndex($i)) throw new \RuntimeException('Impossible de supprimer l’entrée : ' . $name);
                $deleted++;
            }
            if ($deleted === 0) throw new \RuntimeException('Aucune entrée sélectionnée trouvée.');
            if (!$zip->close()) throw new \RuntimeException('Impossible de finaliser la modification de l’archive.');
            return ['deleted' => $deleted];
        } catch (\Throwable $e) {
            $zip->close();
            throw $e;
        }
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
