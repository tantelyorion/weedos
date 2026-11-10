<?php
declare(strict_types=1);
namespace Weed;

/** Préférences de bureau privées par compte, incluses dans les sauvegardes système. */
final class Preferences
{
    private const KEYS = ['h','blur','wp','wp.custom','wp.fit','ui.theme','ui.lang','sound.on','sound.vol','profile.avatar','weed.favorite.apps','weed.frequent.apps'];

    public static function load(string $user): array
    {
        self::validUser($user);
        $dir = WEED_DATA . '/etc/preferences';
        $file = $dir . '/' . $user . '.json';
        if (is_link($dir) || !is_file($file) || is_link($file)) return [];
        $data = json_decode((string)file_get_contents($file), true);
        if (!is_array($data)) return [];
        return array_intersect_key($data, array_flip(self::KEYS));
    }

    public static function save(string $user, string $key, string $value): bool
    {
        self::validUser($user);
        if (!in_array($key, self::KEYS, true)) throw new \RuntimeException('préférence non autorisée');
        if (strlen($value) > 12 * 1024 * 1024) throw new \RuntimeException('préférence trop volumineuse');
        switch ($key) {
            case 'h': if (!ctype_digit($value) || (int)$value < 90 || (int)$value > 190) throw new \RuntimeException('teinte invalide'); break;
            case 'blur': if (!ctype_digit($value) || (int)$value > 50) throw new \RuntimeException('flou invalide'); break;
            case 'wp': if (!preg_match('/^(w([1-9]|1[0-9]|20)|custom)$/', $value)) throw new \RuntimeException('fond invalide'); break;
            case 'wp.fit': if (!in_array($value, ['cover','contain','fill','center','tile'], true)) throw new \RuntimeException('mode de fond invalide'); break;
            case 'ui.theme': if (!in_array($value, ['dark','light','system'], true)) throw new \RuntimeException('thème invalide'); break;
            case 'ui.lang': if (!in_array($value, ['fr','en','es','zh','hi','ar','de','pt','mg'], true)) throw new \RuntimeException('langue invalide'); break;
            case 'sound.on': if (!in_array($value, ['0','1'], true)) throw new \RuntimeException('option sonore invalide'); break;
            case 'sound.vol': if (!ctype_digit($value) || (int)$value > 100) throw new \RuntimeException('volume invalide'); break;
            case 'wp.custom':
            case 'profile.avatar':
                if ($value !== '' && !preg_match('#^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$#', $value)) throw new \RuntimeException('image de préférence invalide');
                break;
            case 'weed.favorite.apps':
            case 'weed.frequent.apps':
                $items = json_decode($value, true);
                if (!is_array($items) || count($items) > 20) throw new \RuntimeException('liste d’applications invalide');
                foreach ($items as $id) if (!is_string($id) || !preg_match('/^[a-z0-9][a-z0-9.-]{0,50}$/', $id)) throw new \RuntimeException('identifiant d’application invalide');
                break;
        }
        $dir = WEED_DATA . '/etc/preferences';
        if (is_link($dir)) throw new \RuntimeException('dossier de préférences symbolique interdit');
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new \RuntimeException('dossier de préférences inaccessible');
        @chmod($dir, 0700);
        $file = $dir . '/' . $user . '.json';
        if (is_link($file)) throw new \RuntimeException('fichier de préférences symbolique interdit');
        $data = self::load($user); $data[$key] = $value;
        $tmp = $file . '.tmp.' . bin2hex(random_bytes(5));
        $raw = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $raw, LOCK_EX) === false) throw new \RuntimeException('écriture des préférences impossible');
        @chmod($tmp, 0600);
        if (!rename($tmp, $file)) { @unlink($tmp); throw new \RuntimeException('enregistrement des préférences impossible'); }
        @chmod($file, 0600);
        return true;
    }


    public static function reset(string $user): bool
    {
        self::validUser($user);
        $file = WEED_DATA . '/etc/preferences/' . $user . '.json';
        if (is_link($file)) throw new \RuntimeException('fichier de préférences symbolique interdit');
        if (is_file($file) && !@unlink($file)) throw new \RuntimeException('réinitialisation des préférences impossible');
        return true;
    }

    private static function validUser(string $user): void
    {
        if (!Auth::validName($user)) throw new \RuntimeException('utilisateur invalide');
    }
}
