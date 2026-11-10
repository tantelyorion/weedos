<?php
declare(strict_types=1);
namespace Weed;

/**
 * Réglages du son de démarrage, communs à tout le système (comme le carillon d'un Mac ou d'un PC) :
 * le Kernel les lit au boot, avant qu'aucun utilisateur ne soit connecté.
 * Fichier : data/etc/system-sound.json — modifiable uniquement par un administrateur.
 */
final class SystemSound
{
    public const DEFAULTS = ['startup' => true, 'volume' => 85];

    private static function file(): string
    {
        return WEED_DATA . '/etc/system-sound.json';
    }

    public static function load(): array
    {
        $file = self::file();
        $out = self::DEFAULTS;
        if (is_link($file) || !is_file($file)) return $out;
        $data = json_decode((string)file_get_contents($file), true);
        if (!is_array($data)) return $out;
        if (isset($data['startup']) && is_bool($data['startup'])) $out['startup'] = $data['startup'];
        if (isset($data['volume']) && is_int($data['volume']) && $data['volume'] >= 0 && $data['volume'] <= 100) $out['volume'] = $data['volume'];
        return $out;
    }

    /** État publié au bureau : réglages + indicateurs de lecture native. */
    public static function status(): array
    {
        $s = self::load();
        return [
            'startup' => $s['startup'],
            'enabled' => $s['startup'] && $s['volume'] > 0,
            'volume' => $s['volume'],
            'native' => is_file(WEED_DATA . '/var/run/startup-sound'),
            'capable' => is_file(WEED_DATA . '/var/run/sound-capable'),
        ];
    }

    public static function save(bool $startup, int $volume, string $by = ''): array
    {
        if ($volume < 0 || $volume > 100) throw new \RuntimeException('volume invalide');
        $dir = WEED_DATA . '/etc';
        if (is_link($dir)) throw new \RuntimeException('dossier système symbolique interdit');
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) throw new \RuntimeException('dossier système inaccessible');
        $file = self::file();
        if (is_link($file)) throw new \RuntimeException('fichier de réglage symbolique interdit');
        $data = ['startup' => $startup, 'volume' => $volume];
        $tmp = $file . '.tmp.' . bin2hex(random_bytes(5));
        if (file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX) === false) {
            throw new \RuntimeException('écriture du réglage impossible');
        }
        @chmod($tmp, 0644);
        if (!rename($tmp, $file)) { @unlink($tmp); throw new \RuntimeException('enregistrement du réglage impossible'); }
        Log::security('SYSTEM_SOUND_CHANGED', ['user' => $by, 'startup' => $startup, 'volume' => $volume]);
        return self::status();
    }

    /** Demande au Kernel de rejouer le son de démarrage (test depuis Réglages). */
    public static function requestTest(): bool
    {
        $f = WEED_DATA . '/var/run/sound-test';
        if (is_link($f)) return false;
        return @file_put_contents($f, (string)time(), LOCK_EX) !== false;
    }
}
