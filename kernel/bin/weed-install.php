#!/usr/bin/php
<?php
declare(strict_types=1);
/** Weed OS installer — BIOS/MBR + ext4 root and persistent data partition.
 * Destructive: requires explicit --yes-erase and --disk-is-correct confirmation.
 */
if (PHP_SAPI !== 'cli') { fwrite(STDERR, "CLI uniquement.\n"); exit(1); }

function fail(string $message, int $code = 1): never { fwrite(STDERR, "Erreur: $message\n"); exit($code); }
function run(array $command, ?string $input = null): void {
    $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $p = proc_open($command, $spec, $pipes);
    if (!is_resource($p)) fail('Impossible de lancer: ' . implode(' ', $command));
    if ($input !== null) fwrite($pipes[0], $input);
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $err = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $code = proc_close($p);
    if ($code !== 0) fail(implode(' ', $command) . "\n" . trim($out . "\n" . $err), $code);
    if ($out !== '') echo $out;
}

$disk = $argv[1] ?? '';
$erase = in_array('--yes-erase', $argv, true);
$confirm = in_array('--disk-is-correct', $argv, true);
if (!preg_match('#^/dev/(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$#', $disk)) {
    fail('Usage: weed-install /dev/sdX --yes-erase --disk-is-correct');
}
if (!$erase || !$confirm) {
    echo "INSTALLATION SIMULÉE — aucune modification effectuée.\n";
    echo "Cible: $disk\nPour confirmer après avoir vérifié le disque: weed-install $disk --yes-erase --disk-is-correct\n";
    exit(0);
}
if (function_exists('posix_geteuid') && posix_geteuid() !== 0) fail('L’installation doit être exécutée en root.');
if (!is_dir('/sys/block/' . basename($disk))) fail('Disque introuvable dans /sys/block.');
if (!is_dir('/weed/kernel') || !is_executable('/sbin/weedinit')) {
    fail('Environnement live incomplet: /weed/kernel ou /sbin/weedinit manquant.');
}

// En mode initramfs, le noyau est sur le média ISO, pas dans l'initramfs.
$kernelSource = is_file('/boot/bzImage') ? '/boot/bzImage' : '';
if ($kernelSource === '') {
    $isoMount = '/mnt/weed-live-iso';
    @mkdir($isoMount, 0755, true);
    $devices = preg_split('/\s+/', trim((string)shell_exec('blkid -t TYPE=iso9660 -o device 2>/dev/null')));
    foreach ($devices as $device) {
        if ($device === '' || !str_starts_with($device, '/dev/')) continue;
        $mountCmd = 'mount -t iso9660 -o ro ' . escapeshellarg($device) . ' ' . escapeshellarg($isoMount) . ' 2>/dev/null';
        @shell_exec($mountCmd);
        foreach ([$isoMount . '/bzImage', $isoMount . '/boot/bzImage'] as $candidate) {
            if (is_file($candidate)) { $kernelSource = $candidate; break 2; }
        }
        @shell_exec('umount ' . escapeshellarg($isoMount) . ' 2>/dev/null');
    }
    if ($kernelSource === '') fail('Noyau introuvable. Démarrez depuis le média ISO Weed OS original (ou placez bzImage dans /boot).');
    if (!is_dir('/tmp')) @mkdir('/tmp', 0755, true);
    if (!copy($kernelSource, '/tmp/weed-install-bzImage')) fail('Impossible de copier le noyau depuis le média ISO.');
    @shell_exec('umount ' . escapeshellarg($isoMount) . ' 2>/dev/null');
    $kernelSource = '/tmp/weed-install-bzImage';
}

$part1 = $disk . ((str_contains($disk, 'nvme') || str_contains($disk, 'mmcblk')) ? 'p1' : '1');
$part2 = $disk . ((str_contains($disk, 'nvme') || str_contains($disk, 'mmcblk')) ? 'p2' : '2');
$mountRoot = '/mnt/weed-install';
$mounted = [];
register_shutdown_function(static function () use (&$mounted, $mountRoot): void {
    foreach (array_reverse($mounted) as $point) { @exec('umount ' . escapeshellarg($point)); }
    @rmdir($mountRoot . '/weed/data'); @rmdir($mountRoot . '/weed'); @rmdir($mountRoot);
});

echo "ATTENTION: toutes les données de $disk seront détruites.\n";
// Refuse de formater un disque actuellement utilisé comme racine ou monté.
$mounts = @file_get_contents('/proc/mounts') ?: '';
foreach (preg_split('/\n/', trim($mounts)) as $line) {
    $fields = preg_split('/\s+/', $line);
    if (isset($fields[0], $fields[1]) && ($fields[0] === $disk || str_starts_with($fields[0], $disk))) {
        fail("Le disque ou une de ses partitions est monté ($fields[1]). Arrêtez de l'utiliser avant l'installation.");
    }
}

$totalSectors = (int)trim((string)shell_exec('blockdev --getsz ' . escapeshellarg($disk)));
if ($totalSectors < 16_000_000) fail('Disque trop petit: minimum recommandé 8 Go.');
$rootStart = 2048;
$rootSize = (int)(($totalSectors - $rootStart) * 0.75);
$rootSize = intdiv($rootSize, 2048) * 2048; // alignement 1 MiB
$dataStart = $rootStart + $rootSize;
$partitionTable = "label: dos\nunit: sectors\n\nstart=$rootStart, size=$rootSize, type=83, bootable\nstart=$dataStart, size=+, type=83\n";
run(['sfdisk', $disk], $partitionTable);
run(['blockdev', '--rereadpt', $disk]);
sleep(2);
run(['mkfs.ext4', '-F', '-L', 'WEEDROOT', $part1]);
run(['mkfs.ext4', '-F', '-L', 'WEEDDATA', $part2]);
@mkdir($mountRoot, 0755, true);
run(['mount', $part1, $mountRoot]); $mounted[] = $mountRoot;
@mkdir($mountRoot . '/weed/data', 0755, true);
run(['mount', $part2, $mountRoot . '/weed/data']); $mounted[] = $mountRoot . '/weed/data';

// Copie le système live sans pseudo-systèmes de fichiers. Les données utilisateur
// restent sur la seconde partition, séparée du système réinstallable.
$dirs = 'bin etc lib lib64 opt root sbin usr var boot weed';
run(['sh', '-c', 'tar -C / -cpf - ' . $dirs . ' | tar -C ' . escapeshellarg($mountRoot) . ' -xpf -']);
// v0.8.6 — compte weedworker (990) obligatoire sur le système installé ; code root:root en lecture seule.
foreach (['group' => 'weedworker:x:990:', 'passwd' => 'weedworker:x:990:990:Weed Program Worker:/nonexistent:/sbin/nologin'] as $file => $line) {
    $target = $mountRoot . '/etc/' . $file;
    $content = is_file($target) ? (string)file_get_contents($target) : '';
    foreach (preg_split('/\n/', $content) as $l) {
        $f = explode(':', $l);
        if (count($f) > 2 && (($f[0] === 'weedworker') xor ($f[2] === '990'))) fail("conflit weedworker/990 dans /etc/$file");
    }
    if (!preg_match('/^weedworker:/m', $content)) file_put_contents($target, $content . ($content !== '' && !str_ends_with($content, "\n") ? "\n" : '') . $line . "\n");
}
run(['chown', '-R', '0:0', $mountRoot . '/weed/kernel', $mountRoot . '/weed/system']);
run(['sh', '-c', 'find ' . escapeshellarg($mountRoot . '/weed/kernel') . ' ' . escapeshellarg($mountRoot . '/weed/system') . ' -type d -exec chmod 0755 {} + -o -type f -exec chmod 0644 {} +']);
run(['chmod', '0755', $mountRoot . '/weed/kernel/bin/weed-install.php']);
run(['chmod', '0711', $mountRoot . '/weed/data']);
foreach (['dev','proc','sys','run','tmp','mnt','media'] as $dir) {
    @mkdir($mountRoot . '/' . $dir, 0755, true);
}
@mkdir($mountRoot . '/boot/grub', 0755, true);
if (!is_file($mountRoot . '/boot/bzImage')) run(['install', '-m', '0644', $kernelSource, $mountRoot . '/boot/bzImage']);
file_put_contents($mountRoot . '/etc/fstab', "LABEL=WEEDROOT / ext4 defaults 0 1\nLABEL=WEEDDATA /weed/data ext4 defaults,noatime 0 2\n");
file_put_contents($mountRoot . '/boot/grub/grub.cfg', "set default=0\nset timeout=3\nmenuentry 'Weed OS' {\n  search --no-floppy --label WEEDROOT --set=root\n  linux /boot/bzImage root=LABEL=WEEDROOT rw init=/sbin/weedinit quiet\n}\nmenuentry 'Weed OS (debug)' {\n  search --no-floppy --label WEEDROOT --set=root\n  linux /boot/bzImage root=LABEL=WEEDROOT rw init=/sbin/weedinit loglevel=7\n}\n");
run(['grub-install', '--target=i386-pc', '--boot-directory=' . $mountRoot . '/boot', $disk]);
run(['sync']);
run(['umount', $mountRoot . '/weed/data']); array_pop($mounted);
run(['umount', $mountRoot]); array_pop($mounted);
echo "Installation terminée sur $disk. Retirez le support live puis redémarrez.\n";
echo "Note: cette version de l'installateur cible BIOS/Legacy (MBR), pas encore UEFI/Secure Boot.\n";
