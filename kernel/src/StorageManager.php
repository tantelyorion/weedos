<?php
declare(strict_types=1);
namespace Weed;

/** Inventaire prudent des systèmes de fichiers montés. Aucune opération de montage/formatage. */
final class StorageManager
{
    private const PSEUDO = ['proc','sysfs','devtmpfs','devpts','tmpfs','cgroup','cgroup2','mqueue','securityfs','debugfs','tracefs','pstore','configfs','fusectl','hugetlbfs','autofs','rpc_pipefs'];

    public static function inventory(): array
    {
        $file = '/proc/self/mountinfo';
        $mounts = [];
        if (is_readable($file)) {
            $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            foreach (array_slice($lines, 0, 500) as $line) {
                $parts = explode(' - ', $line, 2);
                if (count($parts) !== 2) continue;
                $left = preg_split('/\s+/', trim($parts[0]));
                $right = preg_split('/\s+/', trim($parts[1]));
                if (count($left) < 6 || count($right) < 2) continue;
                $path = self::unescape((string)$left[4]);
                $fs = (string)$right[0];
                if ($path === '' || $path[0] !== '/' || str_contains($path, "\0") || strlen($path) > 4096) continue;
                if (isset($mounts[$path])) continue;
                $total = @disk_total_space($path);
                $free = @disk_free_space($path);
                $valid = (is_int($total) || is_float($total)) && (is_int($free) || is_float($free));
                $total = $valid ? max(0, (int)$total) : 0;
                $free = $valid ? max(0, min($total, (int)$free)) : 0;
                $options = array_merge(explode(',', (string)$left[5]), explode(',', (string)($right[2] ?? '')));
                $mounts[$path] = [
                    'mountpoint' => $path,
                    'filesystem' => preg_match('/^[a-zA-Z0-9._+-]{1,32}$/', $fs) ? $fs : 'unknown',
                    'total' => $total, 'free' => $free, 'used' => max(0, $total - $free),
                    'read_only' => in_array('ro', $options, true),
                    'pseudo' => in_array($fs, self::PSEUDO, true),
                    'space_available' => (bool)$valid,
                ];
            }
        }
        $items = array_values($mounts);
        usort($items, static fn(array $a, array $b): int => strcmp($a['mountpoint'], $b['mountpoint']));
        return ['mounts' => array_slice($items, 0, 100), 'count' => count($items), 'sampled_at' => time(), 'control' => 'read-only'];
    }

    private static function unescape(string $value): string
    {
        return preg_replace_callback('/\\\\([0-7]{3})/', static fn(array $m): string => chr(octdec($m[1])), $value) ?? '';
    }
}
