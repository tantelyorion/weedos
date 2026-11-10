<?php
declare(strict_types=1);
namespace Weed;

/** Sauvegarde/restauration contrôlée des données persistantes de Weed OS. */
final class Backup
{
    private const INCLUDED = ['etc', 'home', 'apps', 'appdata', 'var/log'];

    public static function create(string $passphrase): string
    {
        if (!class_exists(\PharData::class) || !function_exists('openssl_encrypt')) throw new \RuntimeException('Extensions PHP Phar et OpenSSL requises pour les sauvegardes.');
        if (strlen($passphrase) < 8 || strlen($passphrase) > 128) throw new \RuntimeException('La phrase secrète de sauvegarde doit contenir entre 8 et 128 caractères.');
        if (is_link(WEED_DATA) || !is_dir(WEED_DATA)) throw new \RuntimeException('Dossier de données non sécurisé.');
        $tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . '/weed-backup-' . bin2hex(random_bytes(6));
        if (!mkdir($tmp, 0700)) throw new \RuntimeException('Dossier temporaire inaccessible.');
        $tar = $tmp . '/weed-system.tar';
        try {
            $phar = new \PharData($tar);
            $base = realpath(WEED_DATA);
            foreach (self::INCLUDED as $folder) {
                $source = $base . DIRECTORY_SEPARATOR . $folder;
                if (is_link($source)) throw new \RuntimeException('Dossier système symbolique interdit : ' . $folder);
                if (!is_dir($source) && !@mkdir($source, 0700, true) && !is_dir($source)) throw new \RuntimeException('Dossier système inaccessible : ' . $folder);
                $phar->addEmptyDir($folder);
                $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::SELF_FIRST);
                foreach ($it as $item) {
                    $path = $item->getPathname();
                    if ($item->isLink()) continue;
                    $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($path, strlen($base) + 1));
                    if ($folder === 'var/log' && str_contains($relative, '/.')) continue;
                    if ($item->isDir()) $phar->addEmptyDir($relative);
                    elseif ($item->isFile()) $phar->addFile($path, $relative);
                }
            }
            $phar->addFromString('WEED-BACKUP-MANIFEST.json', json_encode(['format' => 1, 'created' => gmdate(DATE_ATOM), 'version' => WEED_VERSION, 'includes' => self::INCLUDED], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            $phar->compress(\Phar::GZ);
            unset($phar);
            $plainArchive = $tar . '.gz';
            if (filesize($plainArchive) > 500 * 1024 * 1024) throw new \RuntimeException('Sauvegarde trop volumineuse : limite de 512 Mo.');
            $salt = random_bytes(16);
            $encrypted = $tmp . '/weed-system.weedbak';
            $input = fopen($plainArchive, 'rb');
            $output = @fopen($encrypted, 'xb');
            if (!$input || !$output) throw new \RuntimeException('Ouverture des flux de sauvegarde impossible.');
            fwrite($output, 'WEEDOSB2' . $salt);
            $index = 0;
            $key = hash_pbkdf2('sha256', $passphrase, $salt, 250000, 32, true);
            while (!feof($input)) {
                $chunk = fread($input, 1024 * 1024);
                if ($chunk === false) throw new \RuntimeException('Lecture de la sauvegarde interrompue.');
                if ($chunk === '') break;
                $iv = random_bytes(12); $tag = '';
                $aad = 'weed-os-backup-v2:' . $index;
                $cipher = openssl_encrypt($chunk, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, $aad);
                if ($cipher === false) throw new \RuntimeException('Chiffrement de la sauvegarde impossible.');
                fwrite($output, pack('N', strlen($cipher)) . $iv . $tag . $cipher);
                $index++;
            }
            fwrite($output, pack('N', 0));
            fflush($output); fclose($input); fclose($output);
            @unlink($tar); @unlink($plainArchive);
            @chmod($encrypted, 0600);
            return $encrypted;
        } catch (\Throwable $e) {
            self::removeTree($tmp);
            throw new \RuntimeException('Création de la sauvegarde impossible : ' . $e->getMessage());
        }
    }

    /** Vérifie tous les blocs AES-256-GCM sans modifier les données du système. */
    public static function verify(string $archive, string $passphrase): array
    {
        if (!function_exists('openssl_decrypt')) throw new \RuntimeException('Extension PHP OpenSSL requise.');
        if (strlen($passphrase) < 8 || strlen($passphrase) > 128) throw new \RuntimeException('Phrase secrète invalide.');
        if (!is_file($archive) || is_link($archive) || filesize($archive) > 512 * 1024 * 1024) throw new \RuntimeException('Archive invalide ou trop volumineuse.');
        $in = fopen($archive, 'rb');
        if (!$in) throw new \RuntimeException('Lecture de la sauvegarde impossible.');
        $readExact = static function($stream, int $length): string {
            $data = '';
            while (strlen($data) < $length && !feof($stream)) {
                $part = fread($stream, $length - strlen($data));
                if ($part === false || $part === '') break;
                $data .= $part;
            }
            if (strlen($data) !== $length) throw new \RuntimeException('Sauvegarde tronquée.');
            return $data;
        };
        try {
            $header = $readExact($in, 24);
            if (substr($header, 0, 8) !== 'WEEDOSB2') throw new \RuntimeException('Format de sauvegarde invalide.');
            $key = hash_pbkdf2('sha256', $passphrase, substr($header, 8, 16), 250000, 32, true);
            $index = 0; $bytes = 0; $hash = hash_init('sha256'); $ended = false;
            while (!feof($in)) {
                $raw = fread($in, 4);
                if ($raw === false || strlen($raw) !== 4) break;
                $length = unpack('Nsize', $raw)['size'];
                if ($length === 0) { $ended = true; break; }
                if ($length < 1 || $length > 1048576) throw new \RuntimeException('Bloc chiffré invalide.');
                $iv = $readExact($in, 12); $tag = $readExact($in, 16); $cipher = $readExact($in, $length);
                $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'weed-os-backup-v2:' . $index);
                if (!is_string($plain)) throw new \RuntimeException('Intégrité AES-GCM invalide : phrase secrète incorrecte ou archive altérée.');
                hash_update($hash, $plain); $bytes += strlen($plain); $index++;
            }
            if (!$ended || fread($in, 1) !== '') throw new \RuntimeException('Marqueur de fin invalide ou données supplémentaires.');
            return ['valid'=>true,'format'=>'WEEDOSB2','blocks'=>$index,'decrypted_bytes'=>$bytes,
                'sha256'=>hash_final($hash),'verified_at'=>gmdate(DATE_ATOM),'control'=>'cryptographic-integrity'];
        } finally { fclose($in); }
    }

    public static function restore(string $archive, string $passphrase): void
    {
        if (!class_exists(\PharData::class) || !function_exists('openssl_decrypt')) throw new \RuntimeException('Extensions PHP Phar et OpenSSL requises pour la restauration.');
        if (strlen($passphrase) < 8 || strlen($passphrase) > 128) throw new \RuntimeException('Phrase secrète de sauvegarde invalide.');
        if (!is_file($archive) || is_link($archive) || filesize($archive) > 512 * 1024 * 1024) throw new \RuntimeException('Archive de sauvegarde invalide ou trop volumineuse (500 Mo maximum).');
        if (is_link(WEED_DATA) || !is_dir(WEED_DATA)) throw new \RuntimeException('Dossier de données non sécurisé.');
        $tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . '/weed-restore-' . bin2hex(random_bytes(6));
        if (!mkdir($tmp, 0700)) throw new \RuntimeException('Dossier temporaire inaccessible.');
        try {
            $input = fopen($archive, 'rb');
            if (!$input) throw new \RuntimeException('Lecture de la sauvegarde impossible.');
            $header = fread($input, 24);
            if (!is_string($header) || strlen($header) !== 24 || substr($header, 0, 8) !== 'WEEDOSB2') throw new \RuntimeException('Format de sauvegarde chiffrée invalide.');
            $salt = substr($header, 8, 16);
            $key = hash_pbkdf2('sha256', $passphrase, $salt, 250000, 32, true);
            $tarArchive = $tmp . '/restore.tar.gz';
            $output = @fopen($tarArchive, 'xb');
            if (!$output) throw new \RuntimeException('Création de l’archive temporaire impossible.');
            $index = 0; $total = 0; $ended = false;
            $readExact = static function ($stream, int $length): string {
                $data = '';
                while (strlen($data) < $length && !feof($stream)) {
                    $part = fread($stream, $length - strlen($data));
                    if ($part === false || $part === '') break;
                    $data .= $part;
                }
                if (strlen($data) !== $length) throw new \RuntimeException('Sauvegarde chiffrée tronquée.');
                return $data;
            };
            while (!feof($input)) {
                $sizeRaw = fread($input, 4);
                if ($sizeRaw === false || strlen($sizeRaw) !== 4) break;
                $length = unpack('Nsize', $sizeRaw)['size'];
                if ($length === 0) { $ended = true; break; }
                if ($length > 1024 * 1024 || $length < 1) throw new \RuntimeException('Bloc de sauvegarde invalide.');
                $iv = $readExact($input, 12); $tag = $readExact($input, 16); $cipher = $readExact($input, $length);
                $plain = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, 'weed-os-backup-v2:' . $index);
                if (!is_string($plain)) throw new \RuntimeException('Phrase secrète incorrecte ou sauvegarde altérée.');
                $total += strlen($plain);
                if ($total > 500 * 1024 * 1024) throw new \RuntimeException('Archive déchiffrée trop volumineuse (500 Mo maximum).');
                if (fwrite($output, $plain) !== strlen($plain)) throw new \RuntimeException('Écriture de l’archive déchiffrée interrompue.');
                $index++;
            }
            if (!$ended || fread($input, 1) !== '') throw new \RuntimeException('Fin de sauvegarde chiffrée invalide.');
            fclose($input); fflush($output); fclose($output);
            $phar = new \PharData($tarArchive);
            $manifest = null; $count = 0; $unpacked = 0; $found = [];
            foreach (new \RecursiveIteratorIterator($phar, \RecursiveIteratorIterator::SELF_FIRST) as $entry) {
                $prefix = 'phar://' . $tarArchive . '/';
                $entryPath = $entry->getPathname();
                $relative = str_starts_with($entryPath, $prefix) ? substr($entryPath, strlen($prefix)) : basename($entryPath);
                $relative = str_replace('\\', '/', $relative);
                if ($relative === 'WEED-BACKUP-MANIFEST.json') {
                    $manifest = json_decode($entry->getContent(), true);
                    continue;
                }
                if ($relative === '' || str_starts_with($relative, '/') || preg_match('#(^|/)\.\.?(/|$)#', $relative) || $entry->isLink()) {
                    throw new \RuntimeException('L’archive contient un chemin ou un lien interdit.');
                }
                $top = explode('/', $relative)[0];
                $bucket = str_starts_with($relative, 'var/log') ? 'var/log' : $top;
                if (!in_array($bucket, self::INCLUDED, true) && $relative !== 'var') throw new \RuntimeException('L’archive contient un dossier non autorisé.');
                if ($bucket !== 'var') $found[$bucket] = true;
                $count++;
                $unpacked += $entry->isDir() ? 0 : $entry->getSize();
                if ($count > 100000 || $unpacked > 4 * 1024 * 1024 * 1024) throw new \RuntimeException('Archive trop volumineuse après décompression.');
            }
            if (!is_array($manifest) || ($manifest['format'] ?? null) !== 1 ||
                array_diff(self::INCLUDED, (array)($manifest['includes'] ?? [])) ||
                array_diff(self::INCLUDED, array_keys($found))) {
                throw new \RuntimeException('Manifeste de sauvegarde Weed OS invalide ou incomplet.');
            }
            $phar->extractTo($tmp, null, true);
            unset($phar);
            foreach (self::INCLUDED as $folder) {
                $candidate = $tmp . '/' . $folder;
                if (!is_dir($candidate) && !@mkdir($candidate, 0700, true) && !is_dir($candidate)) throw new \RuntimeException('Dossier restauré inaccessible : ' . $folder);
            }
            self::secureTree($tmp . '/etc', 0700, 0600);
            self::secureTree($tmp . '/home', 0700, 0600);
            self::secureTree($tmp . '/apps', 0755, 0644);
            self::secureAppData($tmp . '/appdata');
            self::secureTree($tmp . '/var/log', 0700, 0600);
            $moved = [];
            try {
                foreach (self::INCLUDED as $folder) {
                    $candidate = $tmp . '/' . $folder;
                    $target = WEED_DATA . '/' . $folder;
                    $old = WEED_DATA . '/.restore-old-' . str_replace('/', '-', $folder);
                    self::removeTree($old);
                    if (is_dir($target) && !rename($target, $old)) throw new \RuntimeException('Impossible de préserver les données actuelles : ' . $folder);
                    if (!rename($candidate, $target)) {
                        if (is_dir($old)) @rename($old, $target);
                        throw new \RuntimeException('Restauration interrompue pour ' . $folder . '.');
                    }
                    $moved[] = [$target, $old];
                }
            } catch (\Throwable $e) {
                foreach (array_reverse($moved) as [$target, $old]) {
                    self::removeTree($target);
                    if (is_dir($old)) @rename($old, $target);
                }
                throw $e;
            }
            foreach ($moved as [, $old]) self::removeTree($old);
        } catch (\Throwable $e) {
            throw new \RuntimeException('Restauration impossible : ' . $e->getMessage());
        } finally {
            self::removeTree($tmp);
        }
    }

    private static function secureAppData(string $path): void
    {
        if (!is_dir($path) || is_link($path)) return;
        @chmod($path, 0711);
        $items = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::SELF_FIRST);
        $entries = [];
        foreach ($items as $item) {
            if ($item->isLink()) throw new \RuntimeException('Lien symbolique interdit dans les données de Programmes.');
            $entries[] = [$item->getPathname(), $item->isDir()];
        }
        if ($entries !== [] && Isolation::isRoot()) {
            Isolation::accountInfo();
            foreach ($entries as [$file, $isDir]) {
                if (!@chown($file, Isolation::UID) || !@chgrp($file, Isolation::GID)) throw new \RuntimeException('Attribution des données de Programme impossible.');
                @chmod($file, $isDir ? 0700 : 0600);
            }
        } else {
            foreach ($entries as [$file, $isDir]) @chmod($file, $isDir ? 0700 : 0600);
        }
    }

    private static function secureTree(string $path, int $dirMode, int $fileMode): void
    {
        if (!is_dir($path) || is_link($path)) return;
        @chmod($path, $dirMode);
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::SELF_FIRST);
        foreach ($it as $item) {
            if ($item->isLink()) throw new \RuntimeException('Lien symbolique interdit dans les données restaurées.');
            @chmod($item->getPathname(), $item->isDir() ? $dirMode : $fileMode);
        }
    }

    private static function removeTree(string $path): void
    {
        if (is_link($path) || is_file($path)) { @unlink($path); return; }
        if (!is_dir($path)) return;
        foreach (new \FilesystemIterator($path) as $item) {
            $p = $item->getPathname();
            if ($item->isDir() && !$item->isLink()) self::removeTree($p);
            else @unlink($p);
        }
        @rmdir($path);
    }
}
