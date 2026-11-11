<?php
declare(strict_types=1);
namespace Weed;

/**
 * Lecteur / écrivain TAR (ustar + extensions GNU « L » et pax « x ») avec compression gzip optionnelle (zlib).
 * Remplace PharData : l'extraction TAR.GZ via PharData renvoyait des fichiers vides, et PharData ne permet ni
 * de supprimer ni d'ajouter des entrées. Ici tout est en flux (mémoire bornée) ; les chemins reçus sont déjà
 * validés par le Vfs. Aucune entrée n'est jamais écrite sur disque ici : l'appelant décide quoi faire des flux.
 */
final class TarArchive
{
    public const MAX_ENTRIES = 5000;
    private const BLOCK = 512;
    private const CHUNK = 65536;

    public static function available(): bool { return function_exists('gzopen'); }

    public static function isTarName(string $name): bool
    {
        return (bool)preg_match('/\.(tar|tgz|tar\.gz)$/i', $name);
    }
    public static function wantsGzip(string $name): bool
    {
        return (bool)preg_match('/\.(tgz|tar\.gz)$/i', $name);
    }

    /** @return resource */
    private static function openRead(string $file)
    {
        if (!function_exists('gzopen')) throw new \RuntimeException('Extension zlib indisponible pour lire les archives TAR.');
        $fp = @gzopen($file, 'rb');
        if (!$fp) throw new \RuntimeException('Archive TAR illisible.');
        return $fp;
    }

    private static function readFull($fp, int $n): string
    {
        $out = '';
        while (strlen($out) < $n) {
            $c = gzread($fp, $n - strlen($out));
            if ($c === false || $c === '') break;
            $out .= $c;
        }
        return $out;
    }

    private static function octal(string $field): int
    {
        if ($field !== '' && (ord($field[0]) & 0x80)) throw new \RuntimeException('Entrée TAR trop volumineuse (format binaire non pris en charge).');
        $v = trim($field, "\0 ");
        if ($v === '') return 0;
        if (!preg_match('/^[0-7]+$/', $v)) throw new \RuntimeException('En-tête TAR corrompu (champ numérique invalide).');
        return (int)octdec($v);
    }

    private static function parsePax(string $data): array
    {
        $out = []; $pos = 0; $len = strlen($data);
        while ($pos < $len) {
            $sp = strpos($data, ' ', $pos); if ($sp === false) break;
            $n = (int)substr($data, $pos, $sp - $pos); if ($n <= 0 || $pos + $n > $len) break;
            $rec = substr($data, $sp + 1, $n - ($sp - $pos) - 2);          // sans l'espace initial ni le \n final
            $eq = strpos($rec, '=');
            if ($eq !== false) $out[substr($rec, 0, $eq)] = substr($rec, $eq + 1);
            $pos += $n;
        }
        return $out;
    }

    /**
     * Parcourt l'archive. $cb(array $entry, callable $read) est appelé pour chaque entrée ; $read(callable $sink) transmet les
     * données par blocs à $sink(string). Si $cb ne lit pas les données, elles sont ignorées. $cb peut retourner false pour arrêter.
     * @param callable(array,callable):mixed $cb
     */
    public static function walk(string $file, callable $cb): void
    {
        $fp = self::openRead($file); $count = 0; $zeroBlocks = 0; $longName = null; $pax = [];
        try {
            while (true) {
                $h = self::readFull($fp, self::BLOCK);
                if ($h === '' ) break;
                if (strlen($h) < self::BLOCK) throw new \RuntimeException('Archive TAR tronquée.');
                if (trim($h, "\0") === '') { if (++$zeroBlocks >= 2) break; continue; }
                $zeroBlocks = 0;
                $sum = 0; for ($i = 0; $i < self::BLOCK; $i++) $sum += ($i >= 148 && $i < 156) ? 32 : ord($h[$i]);
                try { $stored = self::octal(substr($h, 148, 8)); } catch (\RuntimeException $e) { $stored = -1; }
                if ($sum !== $stored) throw new \RuntimeException('En-tête TAR corrompu (somme de contrôle invalide).');
                $type = $h[156] === "\0" ? '0' : $h[156];
                $size = self::octal(substr($h, 124, 12));
                $pad = (self::BLOCK - ($size % self::BLOCK)) % self::BLOCK;

                if ($type === 'L' || $type === 'x' || $type === 'g') {
                    if ($size > 1048576) throw new \RuntimeException('En-tête étendu TAR trop volumineux.');
                    $data = self::readFull($fp, $size); self::skip($fp, $pad);
                    if ($type === 'L') $longName = rtrim($data, "\0");
                    elseif ($type === 'x') $pax = self::parsePax($data);
                    continue;
                }
                $name = rtrim(substr($h, 0, 100), "\0");
                $prefix = rtrim(substr($h, 345, 155), "\0");
                if (substr($h, 257, 5) === 'ustar' && $prefix !== '') $name = $prefix . '/' . $name;
                if ($longName !== null) { $name = $longName; $longName = null; }
                if (isset($pax['path'])) $name = $pax['path'];
                if (isset($pax['size'])) { $size = (int)$pax['size']; $pad = (self::BLOCK - ($size % self::BLOCK)) % self::BLOCK; }
                $mtime = isset($pax['mtime']) ? (int)floor((float)$pax['mtime']) : self::octal(substr($h, 136, 12));
                $pax = [];
                while (str_starts_with($name, './')) $name = substr($name, 2);      // tar -C dir . produit des noms « ./x »
                if ($name === '' || $name === '.' || $name === '/') { self::skip($fp, $size); self::skip($fp, $pad); continue; }
                $isDir = $type === '5' || str_ends_with($name, '/');
                $entry = [
                    'name' => $isDir && !str_ends_with($name, '/') ? $name . '/' : $name,
                    'size' => $isDir ? 0 : $size, 'mtime' => $mtime, 'dir' => $isDir, 'type' => $type,
                    'mode' => self::octal(substr($h, 100, 8)),
                    'link' => in_array($type, ['1', '2'], true), 'special' => in_array($type, ['3', '4', '6'], true),
                ];
                if (++$count > self::MAX_ENTRIES) throw new \RuntimeException('Archive TAR limitée à ' . self::MAX_ENTRIES . ' entrées.');
                $consumed = false; $remaining = $size;
                $reader = function (callable $sink) use ($fp, &$consumed, &$remaining): void {
                    if ($consumed) return;
                    $consumed = true; $left = $remaining;
                    while ($left > 0) {
                        $c = gzread($fp, min(self::CHUNK, $left));
                        if ($c === false || $c === '') throw new \RuntimeException('Archive TAR tronquée.');
                        $left -= strlen($c); $sink($c);
                    }
                    $remaining = 0;
                };
                $stop = $cb($entry, $reader);
                if ($remaining > 0) self::skip($fp, $remaining);   // données non lues par le rappel
                self::skip($fp, $pad);
                if ($stop === false) break;
            }
        } finally { gzclose($fp); }
    }

    private static function skip($fp, int $n): void
    {
        if ($n <= 0) return;
        if (@gzseek($fp, $n, SEEK_CUR) === 0) return;
        while ($n > 0) { $c = gzread($fp, min(self::CHUNK, $n)); if ($c === false || $c === '') throw new \RuntimeException('Archive TAR tronquée.'); $n -= strlen($c); }
    }

    /** Liste simple des entrées. */
    public static function listing(string $file): array
    {
        $items = [];
        self::walk($file, function (array $e) use (&$items) {
            if ($e['special']) return;
            $items[] = ['name' => $e['name'], 'size' => $e['size'], 'compressed' => 0, 'dir' => $e['dir'], 'mtime' => $e['mtime']];
        });
        return $items;
    }

    // ------------------------------------------------------------------ écriture

    /** @return array{resource,bool} flux d'écriture (gz ou non) */
    public static function openWrite(string $file, bool $gzip)
    {
        if ($gzip && !function_exists('gzopen')) throw new \RuntimeException('Extension zlib indisponible pour créer une archive TAR.GZ.');
        $w = $gzip ? @gzopen($file, 'wb6') : @fopen($file, 'wb');
        if (!$w) throw new \RuntimeException('Création de l’archive impossible.');
        return ['h' => $w, 'gz' => $gzip];
    }
    private static function put(array $w, string $data): void
    {
        $ok = $w['gz'] ? gzwrite($w['h'], $data) : fwrite($w['h'], $data);
        if ($ok === false || $ok < strlen($data)) throw new \RuntimeException('Écriture de l’archive impossible (disque plein ?).');
    }
    public static function closeWrite(array $w): void
    {
        self::put($w, str_repeat("\0", self::BLOCK * 2));
        $w['gz'] ? gzclose($w['h']) : fclose($w['h']);
    }
    public static function abortWrite(array $w): void { $w['gz'] ? @gzclose($w['h']) : @fclose($w['h']); }

    private static function header(string $name, int $size, int $mtime, int $mode, string $type): string
    {
        $prefix = '';
        if (strlen($name) > 100) {
            $cut = strrpos(substr($name, 0, 156), '/');
            if ($cut !== false && strlen($name) - $cut - 1 <= 100 && $cut <= 155) { $prefix = substr($name, 0, $cut); $name = substr($name, $cut + 1); }
        }
        $h = str_pad($name, 100, "\0") . sprintf('%07o', $mode & 07777) . "\0" . sprintf('%07o', 0) . "\0" . sprintf('%07o', 0) . "\0"
            . sprintf('%011o', $size) . "\0" . sprintf('%011o', max(0, $mtime)) . "\0" . '        ' . $type . str_repeat("\0", 100)
            . "ustar\0" . '00' . str_pad('weed', 32, "\0") . str_pad('weed', 32, "\0") . str_repeat("\0", 16) . str_pad($prefix, 155, "\0");
        $h = str_pad($h, self::BLOCK, "\0");
        $sum = 0; for ($i = 0; $i < self::BLOCK; $i++) $sum += ord($h[$i]);
        return substr($h, 0, 148) . sprintf('%06o', $sum) . "\0 " . substr($h, 156);
    }

    /** Écrit l'en-tête (avec entrée GNU « L » si le nom est trop long pour ustar). */
    public static function writeHeader(array $w, string $name, int $size, int $mtime, bool $dir, int $mode = 0644): void
    {
        $name = ltrim(str_replace('\\', '/', $name), '/');
        if ($dir && !str_ends_with($name, '/')) $name .= '/';
        $needLong = strlen($name) > 100 && !(($c = strrpos(substr($name, 0, 156), '/')) !== false && strlen($name) - $c - 1 <= 100);
        if ($needLong) {
            $long = $name . "\0";
            self::put($w, self::header('././@LongLink', strlen($long), 0, 0, 'L'));
            self::put($w, $long . str_repeat("\0", (self::BLOCK - strlen($long) % self::BLOCK) % self::BLOCK));
            $name = substr($name, 0, 100);
        }
        self::put($w, self::header($name, $dir ? 0 : $size, $mtime, $dir ? 0755 : $mode, $dir ? '5' : '0'));
    }
    public static function writeData(array $w, string $chunk): void { self::put($w, $chunk); }
    public static function writePad(array $w, int $size): void { $p = (self::BLOCK - ($size % self::BLOCK)) % self::BLOCK; if ($p) self::put($w, str_repeat("\0", $p)); }

    /** Ajoute un fichier du disque. */
    public static function addFile(array $w, string $entryName, string $fullPath): void
    {
        $in = @fopen($fullPath, 'rb'); if (!$in) throw new \RuntimeException('Fichier illisible : ' . basename($fullPath));
        try {
            $st = fstat($in); $size = (int)$st['size'];
            self::writeHeader($w, $entryName, $size, (int)$st['mtime'], false);
            $left = $size;
            while ($left > 0) {
                $c = fread($in, min(self::CHUNK, $left));
                if ($c === false || $c === '') throw new \RuntimeException('Lecture interrompue : ' . basename($fullPath));
                $left -= strlen($c); self::put($w, $c);
            }
            self::writePad($w, $size);
        } finally { fclose($in); }
    }

    /**
     * Reconstruit une archive en conservant (ou non) les entrées d'origine. $keep(array $entry): bool décide si l'entrée est recopiée.
     * $extra(array $w): ajoute des entrées supplémentaires à la fin. Retourne [conservées, retirées].
     */
    public static function rewrite(string $src, string $dst, bool $gzip, callable $keep, ?callable $extra = null): array
    {
        $w = self::openWrite($dst, $gzip); $kept = 0; $dropped = 0;
        try {
            self::walk($src, function (array $e, callable $read) use ($w, $keep, &$kept, &$dropped) {
                if ($e['special'] || !$keep($e)) { $dropped++; return; }
                if ($e['link']) throw new \RuntimeException('Lien symbolique interdit dans le TAR.');
                self::writeHeader($w, $e['name'], $e['size'], $e['mtime'], $e['dir'], $e['mode'] ?: 0644);
                if (!$e['dir']) { $read(function (string $c) use ($w) { self::put($w, $c); }); self::writePad($w, $e['size']); }
                $kept++;
            });
            if ($extra) $extra($w);
            self::closeWrite($w);
        } catch (\Throwable $t) { self::abortWrite($w); @unlink($dst); throw $t; }
        return [$kept, $dropped];
    }
}
