<?php
declare(strict_types=1);
namespace Weed;

final class Log
{
    public static function security(string $event, array $context = []): void
    {
        $dir = WEED_DATA . '/var/log';
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        $record = ['time' => gmdate('c'), 'event' => $event, 'context' => $context];
        @file_put_contents($dir . '/security.jsonl', json_encode($record, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
        @chmod($dir . '/security.jsonl', 0600);
        self::write('SEC', $event . ' ' . json_encode($context, JSON_UNESCAPED_SLASHES));
    }

    public static function write(string $level, string $msg): void
    {
        $line = sprintf("[%s] %-5s %s\n", date('H:i:s'), $level, $msg);
        $dir = WEED_DATA . '/var/log';
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @file_put_contents($dir . '/kernel.log', $line, FILE_APPEND | LOCK_EX);
        @chmod($dir . '/kernel.log', 0600);
        if (PHP_SAPI === 'cli' && getenv('WEED_WORKER') !== '1') fwrite(STDOUT, $line);
    }
}
