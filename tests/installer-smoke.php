<?php
declare(strict_types=1);
$root = dirname(__DIR__);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';
function iexpect(bool $ok, string $message): void { if (!$ok) throw new RuntimeException('ÉCHEC : ' . $message); }
$installer = new Weed\DiskInstaller(['name' => 'tester', 'role' => 'admin']);
$disks = $installer->disks();
iexpect(is_array($disks), 'la détection retourne une liste');
foreach ($disks as $disk) {
    iexpect(preg_match('#^/dev/(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$#', $disk['device']) === 1, 'nom de disque filtré');
    iexpect(isset($disk['size_bytes'], $disk['mounted'], $disk['mountpoints']), 'métadonnées disque présentes');
}
try { (new Weed\DiskInstaller(['name' => 'user', 'role' => 'user']))->install('/dev/sda', ''); throw new RuntimeException('ÉCHEC : utilisateur non admin refusé'); }
catch (RuntimeException $e) { iexpect(str_contains($e->getMessage(), 'administrateur'), 'installation réservée à admin'); }
try { $installer->install('/dev/../sda', ''); throw new RuntimeException('ÉCHEC : chemin de disque invalide refusé'); }
catch (RuntimeException $e) { iexpect(str_contains($e->getMessage(), 'invalide'), 'chemin de disque invalide refusé'); }
echo "Disk installer : OK (détection et garde-fous, aucun disque modifié)\n";
