<?php
declare(strict_types=1);
namespace Weed;

/** Inventaire non intrusif des sessions : aucun jeton ni nom de fichier n'est exposé. */
final class SessionManager
{
    public static function list(): array
    {
        $dir = WEED_DATA . '/var/run/sessions';
        $items = [];
        if (is_dir($dir) && !is_link($dir)) {
            foreach (array_slice(glob($dir . '/*.json') ?: [], 0, 500) as $file) {
                if (is_link($file) || !is_file($file) || filesize($file) > 4096) continue;
                $raw = @file_get_contents($file);
                $s = $raw === false ? null : json_decode($raw, true);
                if (!is_array($s) || !is_string($s['user'] ?? null) || !Auth::validName($s['user']) || !is_int($s['exp'] ?? null)) continue;
                $items[] = ['user' => $s['user'], 'expires_at' => $s['exp'], 'status' => $s['exp'] >= time() ? 'active' : 'expired'];
            }
        }
        usort($items, static fn($a, $b) => $b['expires_at'] <=> $a['expires_at']);
        return ['available' => is_dir($dir), 'count' => count($items), 'active' => count(array_filter($items, static fn($x) => $x['status'] === 'active')), 'sessions' => $items, 'sampled_at' => time(), 'control' => 'read-only'];
    }
}
