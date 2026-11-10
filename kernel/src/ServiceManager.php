<?php
declare(strict_types=1);
namespace Weed;

/** Inventaire en lecture seule des services init.d disponibles sur l'hôte. */
final class ServiceManager
{
    public static function list(): array
    {
        $dirs = ['/etc/init.d', WEED_ROOT . '/etc/init.d'];
        $services = [];
        foreach ($dirs as $dir) {
            if (is_link($dir) || !is_dir($dir) || !is_readable($dir)) continue;
            foreach (new \DirectoryIterator($dir) as $entry) {
                if ($entry->isDot() || $entry->isLink() || !$entry->isFile()) continue;
                $name = $entry->getFilename();
                if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/', $name)) continue;
                $path = $dir . '/' . $name;
                $services[$name] = ['name' => $name, 'available' => true, 'executable' => is_executable($path), 'control' => 'read-only'];
            }
        }
        ksort($services, SORT_NATURAL | SORT_FLAG_CASE);
        return ['available' => true, 'control' => 'read-only', 'services' => array_values($services), 'count' => count($services), 'sampled_at' => time()];
    }
}
