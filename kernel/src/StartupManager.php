<?php
declare(strict_types=1);
namespace Weed;

/** Inventaire sûr des entrées XDG Autostart ; aucune entrée n'est exécutée ou modifiée. */
final class StartupManager
{
    public static function list(string $home = ''): array
    {
        $dirs = ['/etc/xdg/autostart'];
        if ($home !== '' && $home[0] === '/' && !str_contains($home, "\0")) {
            $candidate = rtrim($home, '/') . '/.config/autostart';
            if (!is_link($candidate)) $dirs[] = $candidate;
        }
        $items = [];
        foreach ($dirs as $dir) {
            if (is_link($dir) || !is_dir($dir) || !is_readable($dir)) continue;
            foreach (new \DirectoryIterator($dir) as $entry) {
                if ($entry->isDot() || $entry->isLink() || !$entry->isFile()) continue;
                $file = $entry->getFilename();
                if (!preg_match('/^[A-Za-z0-9_.-]{1,120}\.desktop$/', $file)) continue;
                $path = $dir . '/' . $file;
                if (filesize($path) > 65536) continue;
                $raw = @file_get_contents($path);
                if (!is_string($raw)) continue;
                $data = [];
                foreach (preg_split('/\r?\n/', $raw) as $line) {
                    if (preg_match('/^(Name|Exec|Hidden|NoDisplay|X-GNOME-Autostart-enabled)=([^\r\n]*)$/', trim($line), $m)) $data[$m[1]] = trim($m[2]);
                }
                if (isset($data['Hidden']) && strtolower($data['Hidden']) === 'true') continue;
                $items[] = ['file'=>$file,'name'=>$data['Name'] ?? pathinfo($file, PATHINFO_FILENAME),'command_present'=>isset($data['Exec']),'enabled'=>strtolower($data['X-GNOME-Autostart-enabled'] ?? 'true') !== 'false','source'=>$dir === '/etc/xdg/autostart' ? 'system' : 'user','control'=>'read-only'];
            }
        }
        usort($items, static fn($a,$b) => strcasecmp($a['name'],$b['name']));
        return ['available'=>true,'control'=>'read-only','items'=>$items,'count'=>count($items),'sampled_at'=>time()];
    }
}
