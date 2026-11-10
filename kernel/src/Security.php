<?php
declare(strict_types=1);
namespace Weed;

/** HMAC local des Programmes installés : détecte les altérations après installation.
 * Ne constitue pas une preuve d'identité de l'éditeur du ZIP.
 */
final class Security
{
    private static function keyPath(): string { return WEED_DATA . '/etc/security.key'; }
    private static function registryPath(): string { return WEED_DATA . '/etc/program-signatures.json'; }

    private static function key(): string
    {
        $p = self::keyPath();
        if (is_link($p)) throw new \RuntimeException('clé de sécurité symbolique interdite');
        if (!is_file($p)) {
            $key = random_bytes(32);
            $fh = @fopen($p, 'xb');
            if (!$fh) throw new \RuntimeException('création de la clé de sécurité impossible');
            @chmod($p, 0600); fwrite($fh, $key); fflush($fh); fclose($fh);
            return $key;
        }
        $key = @file_get_contents($p);
        if (!is_string($key) || strlen($key) !== 32) throw new \RuntimeException('clé de sécurité invalide');
        @chmod($p, 0600);
        return $key;
    }

    private static function digest(string $dir): string
    {
        if (is_link($dir) || !is_dir($dir)) throw new \RuntimeException('dossier Programme non sécurisé');
        $files = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $item) {
            if ($item->isLink()) throw new \RuntimeException('lien symbolique interdit dans un Programme');
            if ($item->isFile()) {
                $rel = str_replace(DIRECTORY_SEPARATOR, '/', substr($item->getPathname(), strlen($dir) + 1));
                $files[$rel] = hash_file('sha256', $item->getPathname());
            }
        }
        ksort($files, SORT_STRING);
        return hash('sha256', json_encode($files, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    private static function registry(): array
    {
        $p = self::registryPath();
        if (is_link($p)) throw new \RuntimeException('registre de signatures symbolique interdit');
        if (!is_file($p)) return [];
        $v = json_decode((string)file_get_contents($p), true);
        if (!is_array($v)) throw new \RuntimeException('registre de signatures corrompu');
        return $v;
    }

    private static function save(array $v): void
    {
        $p = self::registryPath(); $tmp = $p . '.tmp.' . bin2hex(random_bytes(6));
        $fh = @fopen($tmp, 'xb');
        if (!$fh) throw new \RuntimeException('écriture du registre impossible');
        @chmod($tmp, 0600);
        fwrite($fh, json_encode($v, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
        fflush($fh); fclose($fh);
        if (!rename($tmp, $p)) { @unlink($tmp); throw new \RuntimeException('publication des signatures impossible'); }
        @chmod($p, 0600);
    }

    public static function signProgram(string $id, string $dir): void
    {
        $digest = self::digest($dir); $r = self::registry();
        $r[$id] = ['digest' => $digest, 'signature' => hash_hmac('sha256', $id . ':' . $digest, self::key()), 'signed_at' => time()];
        self::save($r);
        Log::security('PROGRAM_SIGNED', ['id' => $id, 'digest' => $digest]);
    }

    public static function verifyProgram(string $id, string $dir): bool
    {
        try {
            $r = self::registry(); $entry = $r[$id] ?? null;
            if (!is_array($entry) || !is_string($entry['digest'] ?? null) || !is_string($entry['signature'] ?? null)) return false;
            $digest = self::digest($dir);
            $expected = hash_hmac('sha256', $id . ':' . $entry['digest'], self::key());
            return hash_equals($entry['digest'], $digest) && hash_equals($expected, $entry['signature']);
        } catch (\Throwable $e) {
            Log::security('PROGRAM_VERIFY_ERROR', ['id' => $id, 'error' => $e->getMessage()]);
            return false;
        }
    }

    public static function forgetProgram(string $id): void
    {
        $r = self::registry(); unset($r[$id]); self::save($r);
    }
}
