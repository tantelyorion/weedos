<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-events-' . bin2hex(random_bytes(5));
mkdir($base . '/var/log', 0700, true);
putenv('WEED_DATA=' . $base);
require __DIR__ . '/../kernel/autoload.php';
$rows=[['time'=>gmdate('c'),'event'=>'LOGIN_SUCCESS','context'=>['user'=>'tester','token'=>'DO_NOT_LEAK']],['time'=>gmdate('c'),'event'=>'UNKNOWN_SECRET','context'=>['user'=>'tester']]];
file_put_contents($base . '/var/log/security.jsonl', implode("\n",array_map('json_encode',$rows))."\n");
$r=Weed\EventLog::list();
if ($r['count'] !== 1 || $r['events'][0]['user'] !== 'tester' || isset($r['events'][0]['token']) || isset($r['events'][0]['context'])) throw new RuntimeException('event log filtering failed');
unlink($base . '/var/log/security.jsonl'); rmdir($base . '/var/log'); rmdir($base . '/var'); rmdir($base);
echo "Event log smoke test OK\n";
