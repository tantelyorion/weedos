<?php
declare(strict_types=1);
namespace Weed;

/**
 * Gestionnaire de Programmes (.zip) : chaque Programme est une app installable.
 * Un Programme .zip contient manifest.json à la racine (ou dans un unique dossier racine).
 * manifest.json : { "id","name","version","description","author","permissions":[],
 *                   "app":{"title","icon","entry","width","height"}, "hooks":"hooks.php" }
 * app.icon accepte une classe fa-* ou un chemin d’image PNG/JPG/JPEG/ICO/SVG/WEBP/GIF dans le paquet.
 * v0.8.6 : hooks.php s'exécute dans un worker sous le compte Unix weedworker (UID/GID 990), jamais en root.
 */
final class Programs
{
    private const MAX_UNPACKED = 20971520;
    private string $dir;
    private string $reg;

    public function __construct()
    {
        $this->dir = WEED_DATA . '/apps';
        $this->reg = WEED_DATA . '/etc/apps.json';
        if (!is_dir($this->dir)) @mkdir($this->dir, 0755, true);
        if (!is_dir(dirname($this->reg))) @mkdir(dirname($this->reg), 0755, true);
    }

    private function registry(): array
    {
        $j = is_file($this->reg) ? json_decode((string)file_get_contents($this->reg), true) : [];
        return is_array($j) ? $j : [];
    }

    private function save(array $r): void
    {
        file_put_contents($this->reg, json_encode($r, JSON_PRETTY_PRINT), LOCK_EX);
    }

    private static function validId(string $id): bool
    {
        return (bool)preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id);
    }

    public function manifest(string $id): ?array
    {
        if (!self::validId($id)) return null;
        $f = $this->dir . '/' . $id . '/manifest.json';
        $m = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
        return is_array($m) ? $m : null;
    }

    public function isEnabled(string $id): bool
    {
        $r = $this->registry();
        return !empty($r[$id]['enabled']);
    }

    public function list(): array
    {
        $out = [];
        foreach ($this->registry() as $id => $info) {
            $m = $this->manifest((string)$id);
            if (!$m) continue;
            $out[] = [
                'id' => $id, 'name' => $m['name'] ?? $id, 'version' => $m['version'] ?? '?',
                'description' => $m['description'] ?? '', 'author' => $m['author'] ?? '',
                'permissions' => $m['permissions'] ?? [], 'app' => $m['app'] ?? null,
                'enabled' => !empty($info['enabled']),
            ];
        }
        return $out;
    }

    public function install(string $zipFile): array
    {
        if (!class_exists(\ZipArchive::class)) throw new \RuntimeException('module PHP zip absent');
        $zip = new \ZipArchive();
        if ($zip->open($zipFile) !== true) throw new \RuntimeException('archive .zip invalide');
        $stage = null;
        try {
            $prefix = '';
            $mi = $zip->locateName('manifest.json');
            if ($mi === false) {
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    if (preg_match('#^([^/]+)/manifest\.json$#', (string)$zip->getNameIndex($i), $m)) { $prefix = $m[1] . '/'; $mi = $i; break; }
                }
            }
            if ($mi === false) throw new \RuntimeException('manifest.json introuvable');
            $man = json_decode((string)$zip->getFromIndex($mi), true);
            if (!is_array($man) || !isset($man['id'], $man['name'], $man['version'])) throw new \RuntimeException('manifest.json incomplet (id, name, version)');
            $id = (string)$man['id'];
            if (!self::validId($id)) throw new \RuntimeException('id invalide (a-z, 0-9, tirets)');
            if ($zip->numFiles > 2000) throw new \RuntimeException('archive trop volumineuse (2 000 entrées maximum)');

            $entries = []; $total = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $raw = (string)$zip->getNameIndex($i);
                if ($prefix !== '' && strpos($raw, $prefix) !== 0) continue;
                $rel = substr($raw, strlen($prefix));
                if ($rel === '' || $rel === false) continue;
                $name = str_replace('\\', '/', $rel);
                if (str_starts_with($name, '/') || preg_match('/^[A-Za-z]:/', $name) ||
                    preg_match('#(^|/)\.\.?(/|$)#', $name) || str_contains($name, "\0") ||
                    preg_match('/[\x00-\x1f\x7f]/', $name)) throw new \RuntimeException('chemin dangereux dans l’archive');
                $opsys = 0; $attr = 0;
                if ($zip->getExternalAttributesIndex($i, $opsys, $attr) && $opsys === \ZipArchive::OPSYS_UNIX) {
                    if ((($attr >> 16) & 0170000) === 0120000) throw new \RuntimeException('lien symbolique interdit dans l’archive');
                }
                $key = strtolower(rtrim($name, '/'));
                if ($key === '' || isset($entries[$key])) throw new \RuntimeException('entrées dupliquées ou ambiguës');
                $st = $zip->statIndex($i);
                if (!$st) throw new \RuntimeException('entrée ZIP illisible');
                $total += (int)($st['size'] ?? 0);
                if ($total > self::MAX_UNPACKED) throw new \RuntimeException('archive trop volumineuse');
                $entries[$key] = ['index' => $i, 'name' => $name, 'dir' => str_ends_with($name, '/')];
            }

            $stage = $this->dir . '/.install-' . $id . '-' . bin2hex(random_bytes(6));
            if (!mkdir($stage, 0700)) throw new \RuntimeException('préparation de l’installation impossible');
            foreach ($entries as $entry) {
                $target = $stage . '/' . rtrim($entry['name'], '/');
                if ($entry['dir']) {
                    if (!is_dir($target) && !mkdir($target, 0700, true)) throw new \RuntimeException('création de dossier impossible');
                    continue;
                }
                if (!is_dir(dirname($target)) && !mkdir(dirname($target), 0700, true)) throw new \RuntimeException('création de dossier impossible');
                $data = $zip->getFromIndex($entry['index']);
                if ($data === false || file_put_contents($target, $data, LOCK_EX) === false) throw new \RuntimeException('extraction impossible');
                @chmod($target, 0644);
            }
            if (!is_file($stage . '/manifest.json')) throw new \RuntimeException('manifest.json absent du dossier installé');

            // Remplacement avec retour arrière : une mise à jour ratée conserve l’application précédente.
            $dest = $this->dir . '/' . $id;
            $backup = $this->dir . '/.backup-' . $id . '-' . bin2hex(random_bytes(6));
            $hadOld = file_exists($dest) || is_link($dest);
            if ($hadOld && !rename($dest, $backup)) throw new \RuntimeException('sauvegarde de l’ancienne version impossible');
            if (!rename($stage, $dest)) {
                if ($hadOld) @rename($backup, $dest);
                throw new \RuntimeException('activation de la nouvelle version impossible');
            }
            $stage = null;
            if ($hadOld) $this->rrmdir($backup);
            $this->lockdown($id, $dest);
            Security::signProgram($id, $dest);

            $r = $this->registry();
            $r[$id] = ['enabled' => false, 'installed' => time()];
            $this->save($r);
            Log::write('INFO', "programme installé: $id {$man['version']}");
            return ['id' => $id, 'name' => $man['name']];
        } finally {
            $zip->close();
            if ($stage !== null && is_dir($stage)) $this->rrmdir($stage);
        }
    }

    /**
     * v0.8.6 — isolation des répertoires (en root uniquement) :
     *  - apps/<id>      : root:root, dossiers 0755, fichiers 0644 (weedworker lit, ne modifie jamais)
     *  - appdata/<id>   : weedworker:weedworker 0700 (seul espace inscriptible, propre à ce Programme)
     */
    private function lockdown(string $id, string $dest): void
    {
        if (!Isolation::isRoot()) return;
        Isolation::accountInfo();
        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dest, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST
        );
        $all = [$dest => true];
        foreach ($it as $item) {
            if ($item->isLink()) throw new \RuntimeException('lien symbolique interdit dans un Programme');
            $all[$item->getPathname()] = $item->isDir();
        }
        foreach ($all as $path => $isDir) {
            if (!@chown($path, 0) || !@chgrp($path, 0) || !@chmod($path, $isDir ? 0755 : 0644)) {
                throw new \RuntimeException('verrouillage du Programme impossible');
            }
        }
        $data = WEED_DATA . '/appdata/' . $id;
        if (is_link($data)) throw new \RuntimeException('répertoire de données symbolique interdit');
        if (!is_dir($data) && !@mkdir($data, 0700, true)) throw new \RuntimeException('répertoire de données impossible');
        if (!@chown($data, Isolation::UID) || !@chgrp($data, Isolation::GID) || !@chmod($data, 0700)) {
            throw new \RuntimeException('attribution du répertoire de données impossible');
        }
    }

    public function setEnabled(string $id, bool $on): bool
    {
        $r = $this->registry();
        if (!isset($r[$id])) throw new \RuntimeException('programme inconnu');
        $r[$id]['enabled'] = $on;
        $this->save($r);
        return true;
    }

    public function remove(string $id): bool
    {
        $r = $this->registry();
        if (!isset($r[$id]) || !self::validId($id)) throw new \RuntimeException('programme inconnu');
        $this->rrmdir($this->dir . '/' . $id);
        $this->rrmdir(WEED_DATA . '/appdata/' . $id);
        Security::forgetProgram($id);
        unset($r[$id]);
        $this->save($r);
        return true;
    }

    /**
     * v0.8.6 — OBSOLÈTE : le Kernel (root) ne charge plus jamais de code de Programme.
     * Les actions app.<id>.<action> passent exclusivement par ProgramWorker (compte weedworker).
     */
    public function hooks(): array
    {
        Log::security('HOOKS_IN_KERNEL_REFUSED', []);
        return [];
    }

    public function appsDir(): string { return $this->dir; }

    private function rrmdir(string $d): void
    {
        // Ne jamais suivre un lien symbolique lors du nettoyage d’un paquet.
        if (is_link($d)) { @unlink($d); return; }
        if (!is_dir($d)) { if (file_exists($d)) @unlink($d); return; }
        foreach (scandir($d) as $n) {
            if ($n === '.' || $n === '..') continue;
            $p = $d . '/' . $n;
            (is_dir($p) && !is_link($p)) ? $this->rrmdir($p) : @unlink($p);
        }
        @rmdir($d);
    }
}
