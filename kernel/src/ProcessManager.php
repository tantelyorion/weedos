<?php
declare(strict_types=1);
namespace Weed;

/** Read-only process inventory from procfs. No shell commands or signals are exposed. */
final class ProcessManager
{
    public static function list(int $limit = 200): array
    {
        $root = '/proc';
        if (!is_dir($root) || !is_readable($root)) return ['available' => false, 'processes' => []];
        $rows = [];
        foreach (new \DirectoryIterator($root) as $entry) {
            if ($entry->isDot() || !$entry->isDir()) continue;
            $pidText = $entry->getFilename();
            if (!ctype_digit($pidText)) continue;
            $pid = (int)$pidText;
            $base = $root . '/' . $pidText;
            $comm = @file_get_contents($base . '/comm');
            $stat = @file_get_contents($base . '/stat');
            if (!is_string($comm) || !is_string($stat)) continue; // process exited during scan
            $name = trim($comm);
            if (!preg_match('//u', $name)) $name = preg_replace('/[^\x20-\x7E]/', '?', $name) ?? 'process';
            if ($name === '') $name = 'process';
            // comm is kernel-provided but still escaped by the UI; cap output size.
            if (preg_match('/^\d+\s+\((.*)\)\s+([A-Z])\s/', trim($stat), $m)) $state = $m[2];
            else $state = '?';
            $rows[] = ['pid' => $pid, 'name' => substr($name, 0, 160), 'state' => $state];
            if (count($rows) >= max(1, min(500, $limit))) break;
        }
        usort($rows, static fn(array $a, array $b): int => $a['pid'] <=> $b['pid']);
        return ['available' => true, 'processes' => $rows, 'count' => count($rows), 'sampled_at' => time()];
    }
}
