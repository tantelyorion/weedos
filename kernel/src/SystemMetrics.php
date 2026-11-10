<?php
declare(strict_types=1);
namespace Weed;

/** Read-only, low-cost system metrics. No shell commands or user-controlled paths. */
final class SystemMetrics
{
    public static function collect(): array
    {
        $memory = self::memory();
        $uptime = self::uptime();
        $load = function_exists('sys_getloadavg') ? sys_getloadavg() : false;
        $disks = [];
        foreach (['system' => WEED_ROOT, 'data' => WEED_DATA] as $name => $path) {
            $total = @disk_total_space($path);
            $free = @disk_free_space($path);
            if (is_float($total) || is_int($total)) {
                $total = max(0, (int)$total);
                $free = is_float($free) || is_int($free) ? max(0, min($total, (int)$free)) : 0;
                $disks[$name] = ['total' => $total, 'free' => $free, 'used' => max(0, $total - $free)];
            }
        }
        return [
            'sampled_at' => time(),
            'uptime_seconds' => $uptime,
            'memory' => $memory,
            'load_average' => is_array($load) ? array_map(static fn($v): float => round((float)$v, 2), array_slice($load, 0, 3)) : null,
            'disks' => $disks,
            'cpu_count' => self::cpuCount(),
            'process_model' => 'weed-services',
        ];
    }

    private static function memory(): array
    {
        $values = [];
        if (is_readable('/proc/meminfo')) {
            $raw = @file_get_contents('/proc/meminfo');
            if (is_string($raw)) {
                foreach (['MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'] as $key) {
                    if (preg_match('/^' . preg_quote($key, '/') . ':\\s+(\\d+)\\s+kB$/mi', $raw, $m)) {
                        $values[$key] = (int)$m[1] * 1024;
                    }
                }
            }
        }
        $total = $values['MemTotal'] ?? 0;
        $available = min($total, $values['MemAvailable'] ?? 0);
        return [
            'total' => $total,
            'available' => $available,
            'used' => max(0, $total - $available),
            'swap_total' => $values['SwapTotal'] ?? 0,
            'swap_free' => $values['SwapFree'] ?? 0,
        ];
    }

    private static function uptime(): int
    {
        if (is_readable('/proc/uptime')) {
            $raw = @file_get_contents('/proc/uptime');
            if (is_string($raw) && preg_match('/^(\\d+(?:\\.\\d+)?)/', trim($raw), $m)) return max(0, (int)floor((float)$m[1]));
        }
        return 0;
    }

    private static function cpuCount(): int
    {
        if (is_readable('/proc/cpuinfo')) {
            $raw = @file_get_contents('/proc/cpuinfo');
            if (is_string($raw)) {
                preg_match_all('/^processor\\s*:/mi', $raw, $matches);
                if (count($matches[0]) > 0) return count($matches[0]);
            }
        }
        return 1;
    }
}
