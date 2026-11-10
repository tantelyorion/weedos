<?php
declare(strict_types=1);
namespace Weed;

/** Interface PHP sécurisée vers l'installateur disque CLI. Les opérations d'effacement exigent admin + root + confirmation exacte. */
final class DiskInstaller
{
    public function __construct(private array $user) {}

    /** Détecte le mode firmware et les prérequis sans modifier les disques. */
    public function platform(): array
    {
        $uefi = is_dir('/sys/firmware/efi');
        $tools = [];
        foreach (['sgdisk','parted','mkfs.fat','mkfs.ext4','grub-install'] as $tool) {
            $found = false;
            foreach (explode(PATH_SEPARATOR, getenv('PATH') ?: '/usr/sbin:/usr/bin:/sbin:/bin') as $dir) {
                if (is_executable(rtrim($dir, '/') . '/' . $tool)) { $found = true; break; }
            }
            $tools[$tool] = $found;
        }
        return ['firmware'=>$uefi ? 'UEFI' : 'BIOS/Legacy','uefi_detected'=>$uefi,
            'gpt_ready'=>$uefi && !in_array(false, $tools, true),'tools'=>$tools,
            'installer_mode'=>'inventory-only','destructive_uefi_enabled'=>false,
            'note'=>'La détection et les prérequis sont informatifs. Aucun partitionnement UEFI/GPT n’est exécuté.'];
    }

    public function disks(): array
    {
        $out = [];
        foreach (glob('/sys/block/*') ?: [] as $sys) {
            $name = basename($sys);
            if (!preg_match('/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$/', $name)) continue;
            $dev = '/dev/' . $name;
            $sectors = (int)trim((string)@file_get_contents($sys . '/size'));
            if ($sectors <= 0 || !file_exists($dev)) continue;
            $mounts = [];
            foreach (preg_split('/\n/', trim((string)@file_get_contents('/proc/mounts'))) as $line) {
                $fields = preg_split('/\s+/', $line);
                if (isset($fields[0], $fields[1]) && ($fields[0] === $dev || str_starts_with($fields[0], $dev))) $mounts[] = $fields[1];
            }
            $model = trim((string)@file_get_contents($sys . '/device/model'));
            $vendor = trim((string)@file_get_contents($sys . '/device/vendor'));
            $removable = trim((string)@file_get_contents($sys . '/removable')) === '1';
            $partitions = [];
            foreach (glob($sys . '/*') ?: [] as $child) {
                if (!is_file($child . '/partition')) continue;
                $partName = basename($child); $partSectors = (int)trim((string)@file_get_contents($child . '/size'));
                $partDev = '/dev/' . $partName; $partMounts = [];
                foreach (preg_split('/\\n/', trim((string)@file_get_contents('/proc/mounts'))) as $line) {
                    $fields = preg_split('/\\s+/', $line);
                    if (isset($fields[0], $fields[1]) && $fields[0] === $partDev) $partMounts[] = $fields[1];
                }
                $partitions[] = ['device'=>$partDev,'number'=>(int)trim((string)@file_get_contents($child . '/partition')),
                    'size_bytes'=>$partSectors * 512,'size'=>self::humanSize($partSectors * 512),
                    'mounted'=>$partMounts !== [],'mountpoints'=>$partMounts];
            }
            usort($partitions, static fn($a,$b) => $a['number'] <=> $b['number']);
            $out[] = ['device' => $dev, 'name' => trim($vendor . ' ' . $model) ?: $name,
                'size_bytes' => $sectors * 512, 'size' => self::humanSize($sectors * 512),
                'removable' => $removable, 'mounted' => $mounts !== [], 'mountpoints' => $mounts,
                'partitions'=>$partitions];
        }
        usort($out, static fn($a, $b) => $a['device'] <=> $b['device']);
        return $out;
    }

    public function install(string $device, string $confirmation): array
    {
        if (($this->user['role'] ?? '') !== 'admin') throw new \RuntimeException('Installation réservée à l’administrateur.');
        if (!preg_match('#^/dev/(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$#', $device)) throw new \RuntimeException('Périphérique disque invalide.');
        if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) throw new \RuntimeException('Le service Weed OS doit être exécuté en root pour installer sur un disque.');
        if (!in_array($device, array_column($this->disks(), 'device'), true) || @filetype($device) !== 'block') throw new \RuntimeException('Disque non détecté ou non accessible.');
        if (!hash_equals('ERASE ' . $device, $confirmation)) throw new \RuntimeException('Confirmation incorrecte. Saisissez exactement : ERASE ' . $device);
        foreach ($this->disks() as $disk) if ($disk['device'] === $device && $disk['mounted']) throw new \RuntimeException('Ce disque ou une partition est monté. Démontez-le avant de continuer.');
        $script = WEED_ROOT . '/kernel/bin/weed-install.php';
        if (!is_file($script)) throw new \RuntimeException('Script d’installation introuvable.');
        $phpCli = rtrim(PHP_BINDIR, '/') . '/php';
        if (!is_executable($phpCli)) $phpCli = PHP_BINARY;
        $cmd = [$phpCli, $script, $device, '--yes-erase', '--disk-is-correct'];
        $pipes = [];
        $proc = proc_open($cmd, [0 => ['pipe','r'], 1 => ['pipe','w'], 2 => ['pipe','w']], $pipes, WEED_ROOT, ['PATH' => getenv('PATH') ?: '/usr/sbin:/usr/bin:/sbin:/bin']);
        if (!is_resource($proc)) throw new \RuntimeException('Impossible de démarrer l’installateur.');
        fclose($pipes[0]);
        stream_set_timeout($pipes[1], 900); stream_set_timeout($pipes[2], 900);
        $stdout = stream_get_contents($pipes[1]) ?: ''; $stderr = stream_get_contents($pipes[2]) ?: '';
        fclose($pipes[1]); fclose($pipes[2]); $code = proc_close($proc);
        $output = trim($stdout . ($stderr !== '' ? "\n" . $stderr : ''));
        if ($code !== 0) throw new \RuntimeException($output !== '' ? $output : 'Échec de l’installation (code ' . $code . ').');
        return ['installed' => true, 'device' => $device, 'output' => $output];
    }

    private static function humanSize(int $bytes): string
    {
        $units = ['o','Ko','Mo','Go','To']; $n = (float)$bytes; $i = 0;
        while ($n >= 1024 && $i < count($units) - 1) { $n /= 1024; $i++; }
        return number_format($n, $i === 0 ? 0 : 1, ',', ' ') . ' ' . $units[$i];
    }
}
