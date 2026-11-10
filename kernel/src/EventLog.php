<?php
declare(strict_types=1);
namespace Weed;

/** Historique de sécurité filtré : ne renvoie jamais les contextes arbitraires du journal. */
final class EventLog
{
    private const ALLOWED = ['USER_CREATED','USER_REMOVED','PASSWORD_CHANGED','LOGIN_FAILURE','LOGIN_SUCCESS'];
    public static function list(int $limit = 100): array
    {
        $file = WEED_DATA . '/var/log/security.jsonl';
        $events = [];
        if (is_file($file) && !is_link($file) && is_readable($file) && filesize($file) <= 2_097_152) {
            $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
            foreach (array_slice($lines, -max(1, min(200, $limit))) as $line) {
                $r = json_decode($line, true);
                if (!is_array($r) || !is_string($r['event'] ?? null) || !in_array($r['event'], self::ALLOWED, true)) continue;
                $time = is_string($r['time'] ?? null) ? $r['time'] : '';
                if ($time === '' || strtotime($time) === false) continue;
                $ctx = is_array($r['context'] ?? null) ? $r['context'] : [];
                $user = is_string($ctx['user'] ?? null) && Auth::validName($ctx['user']) ? $ctx['user'] : '';
                $events[] = ['time' => $time, 'event' => $r['event'], 'user' => $user];
            }
        }
        return ['events' => array_reverse($events), 'count' => count($events), 'sampled_at' => time(), 'control' => 'read-only'];
    }
}
