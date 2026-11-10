<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-net-' . bin2hex(random_bytes(5));
mkdir($data, 0700, true);
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';
function expect(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    $net = new Weed\Connectivity();
    $status = $net->status();
    expect(isset($status['wifi']['supported'], $status['ethernet']['devices'], $status['bluetooth']['discovering'], $status['internet']['state']), 'schéma de statut incomplet');
    foreach ([
        fn() => $net->wifiConnect('', ''),
        fn() => $net->wifiConnect("Bad\nSSID", 'pass'),
        fn() => $net->wifiDisconnect('../wlan0'),
        fn() => $net->ethernetSet('../../eth0', true),
        fn() => $net->bluetoothPair('00:00:00:00:00:GG'),
        fn() => $net->bluetoothConnect('not-an-address'),
        fn() => $net->bluetoothDisconnect('00:00:00:00:00:0'),
        fn() => $net->bluetoothTrust('00:00:00:00:00:GG', true),
    ] as $invalid) {
        $rejected = false; try { $invalid(); } catch (Throwable $e) { $rejected = true; }
        expect($rejected, 'une entrée réseau invalide a été acceptée');
    }
    echo "connectivity-smoke: OK (validations et schéma ; aucun matériel sollicité)\n";
} finally { @rmdir($data); }
