<?php
declare(strict_types=1);
namespace Weed;

/** Pont minimal et strict vers NetworkManager (nmcli) et BlueZ (bluetoothctl). */
final class Connectivity
{
    private function binary(string $name): ?string
    {
        $paths = ['/usr/bin/' . $name, '/usr/sbin/' . $name, '/bin/' . $name, '/sbin/' . $name];
        foreach ($paths as $p) if (is_executable($p)) return $p;
        $path = getenv('PATH') ?: '';
        foreach (explode(PATH_SEPARATOR, $path) as $dir) {
            $p = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $name;
            if ($dir !== '' && is_executable($p) && !is_dir($p)) return $p;
        }
        return null;
    }

    private function run(string $name, array $args, string $stdin = ''): string
    {
        $bin = $this->binary($name);
        if ($bin === null) throw new \RuntimeException($name . ' n’est pas installé sur ce système.');
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open(array_merge([$bin], $args), $spec, $pipes, null, null, ['bypass_shell' => true]);
        if (!is_resource($proc)) throw new \RuntimeException('Impossible de démarrer ' . $name . '.');
        fwrite($pipes[0], $stdin); fclose($pipes[0]);
        stream_set_timeout($pipes[1], 35); stream_set_timeout($pipes[2], 35);
        $out = stream_get_contents($pipes[1]); $err = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        $code = proc_close($proc);
        if ($code !== 0) throw new \RuntimeException(trim((string)$err) ?: trim((string)$out) ?: ($name . ' a échoué.'));
        return trim((string)$out);
    }

    private function validAddress(string $address): string
    {
        if (!preg_match('/^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/i', $address)) throw new \RuntimeException('Adresse Bluetooth invalide.');
        return strtoupper($address);
    }

    public function status(): array
    {
        $nm = $this->binary('nmcli') !== null;
        $bt = $this->binary('bluetoothctl') !== null;
        $result = [
            'manager' => ['networkmanager' => $nm, 'bluez' => $bt],
            'internet' => ['available' => false, 'state' => 'unknown', 'detail' => 'Indisponible'],
            'wifi' => ['supported' => $nm, 'enabled' => false, 'connected' => false, 'ssid' => null, 'devices' => [], 'networks' => []],
            'ethernet' => ['supported' => $nm, 'connected' => false, 'devices' => []],
            'bluetooth' => ['supported' => $bt, 'enabled' => false, 'discovering' => false, 'devices' => []],
        ];
        if ($nm) {
            try {
                $result['wifi']['enabled'] = strtolower($this->run('nmcli', ['-t', 'radio', 'wifi'])) === 'enabled';
                $raw = $this->run('nmcli', ['-t', '--escape', 'yes', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device', 'status']);
                foreach (preg_split('/\r?\n/', $raw) as $line) {
                    $v = str_getcsv($line, ':', '"', '\\');
                    if (count($v) < 3) continue;
                    [$device, $type, $state] = $v;
                    $connection = $v[3] ?? '';
                    $entry = ['name' => $device, 'state' => $state, 'connection' => $connection];
                    if ($type === 'wifi') {
                        $result['wifi']['devices'][] = $entry;
                        if (strtolower($state) === 'connected') { $result['wifi']['connected'] = true; $result['wifi']['ssid'] = $connection; }
                    } elseif ($type === 'ethernet') {
                        $result['ethernet']['devices'][] = $entry;
                        if (strtolower($state) === 'connected') $result['ethernet']['connected'] = true;
                    }
                }
                try {
                    $connectivity = strtolower($this->run('nmcli', ['-t', 'networking', 'connectivity', 'check']));
                    $result['internet'] = ['available' => in_array($connectivity, ['full', 'limited'], true) && $connectivity === 'full', 'state' => $connectivity, 'detail' => match ($connectivity) { 'full' => 'Accès Internet confirmé', 'limited' => 'Réseau connecté, accès Internet limité', 'portal' => 'Portail captif à authentifier', 'none' => 'Aucun accès Internet détecté', default => 'État réseau : ' . $connectivity }];
                } catch (\Throwable $e) { $result['internet']['detail'] = $e->getMessage(); }
            } catch (\Throwable $e) { $result['network_error'] = $e->getMessage(); }
        }
        if ($bt) {
            try {
                $raw = $this->run('bluetoothctl', ['show']);
                $result['bluetooth']['enabled'] = (bool)preg_match('/Powered:\s*yes/i', $raw);
                $result['bluetooth']['discovering'] = (bool)preg_match('/Discovering:\s*yes/i', $raw);
            } catch (\Throwable $e) { $result['bluetooth']['error'] = $e->getMessage(); }
            try {
                $raw = $this->run('bluetoothctl', ['devices']);
                foreach (preg_split('/\r?\n/', $raw) as $line) {
                    if (!preg_match('/^Device\s+([0-9A-F:]{17})\s+(.+)$/i', trim($line), $m)) continue;
                    $address = strtoupper($m[1]); $device = ['address' => $address, 'name' => $m[2], 'paired' => false, 'trusted' => false, 'connected' => false];
                    try {
                        $info = $this->run('bluetoothctl', ['info', $address]);
                        $device['paired'] = (bool)preg_match('/Paired:\s*yes/i', $info);
                        $device['trusted'] = (bool)preg_match('/Trusted:\s*yes/i', $info);
                        $device['connected'] = (bool)preg_match('/Connected:\s*yes/i', $info);
                    } catch (\Throwable $e) { $device['error'] = $e->getMessage(); }
                    $result['bluetooth']['devices'][] = $device;
                }
            } catch (\Throwable $e) { $result['bluetooth']['devices_error'] = $e->getMessage(); }
        }
        return $result;
    }

    public function wifiScan(): array
    {
        $raw = $this->run('nmcli', ['-t', '--escape', 'yes', '-f', 'IN-USE,SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list', '--rescan', 'yes']);
        $rows = [];
        foreach (preg_split('/\r?\n/', $raw) as $line) {
            $p = str_getcsv($line, ':', '"', '\\');
            if (count($p) < 4) continue;
            $rows[] = ['active' => ($p[0] ?? '') === '*', 'ssid' => $p[1] ?? '', 'signal' => max(0, min(100, (int)($p[2] ?? 0))), 'security' => implode(':', array_slice($p, 3))];
        }
        return $rows;
    }

    public function wifiConnect(string $ssid, string $password): bool
    {
        if ($ssid === '' || strlen($ssid) > 200 || str_contains($ssid, "\0") || preg_match('/[\r\n]/', $ssid) || strlen($password) > 256 || preg_match('/[\r\n\0]/', $password)) throw new \RuntimeException('SSID ou mot de passe invalide.');
        $args = ['--wait', '25', 'device', 'wifi', 'connect', $ssid];
        if ($password !== '') { $args[] = 'password'; $args[] = $password; }
        $this->run('nmcli', $args);
        return true;
    }

    public function wifiDisconnect(string $device): bool
    {
        if (!preg_match('/^[a-zA-Z0-9_.:-]{1,32}$/', $device)) throw new \RuntimeException('Interface Wi-Fi invalide.');
        $this->run('nmcli', ['device', 'disconnect', $device]); return true;
    }
    public function wifiEnable(bool $enabled): bool { $this->run('nmcli', ['radio', 'wifi', $enabled ? 'on' : 'off']); return true; }
    public function ethernetSet(string $device, bool $enabled): bool
    {
        if (!preg_match('/^[a-zA-Z0-9_.:-]{1,32}$/', $device)) throw new \RuntimeException('Interface Ethernet invalide.');
        $this->run('nmcli', ['device', $enabled ? 'connect' : 'disconnect', $device]); return true;
    }
    public function bluetoothPower(bool $enabled): bool { $this->run('bluetoothctl', ['power', $enabled ? 'on' : 'off']); return true; }
    public function bluetoothScan(bool $enabled): bool { $this->run('bluetoothctl', ['scan', $enabled ? 'on' : 'off']); return true; }
    public function bluetoothPair(string $address): bool
    {
        $address = $this->validAddress($address);
        $this->run('bluetoothctl', ['agent', 'on']);
        $this->run('bluetoothctl', ['default-agent']);
        $this->run('bluetoothctl', ['pair', $address]);
        return true;
    }
    public function bluetoothConnect(string $address): bool { $this->run('bluetoothctl', ['connect', $this->validAddress($address)]); return true; }
    public function bluetoothDisconnect(string $address): bool { $this->run('bluetoothctl', ['disconnect', $this->validAddress($address)]); return true; }
    public function bluetoothTrust(string $address, bool $trusted): bool { $this->run('bluetoothctl', [$trusted ? 'trust' : 'untrust', $this->validAddress($address)]); return true; }

}
