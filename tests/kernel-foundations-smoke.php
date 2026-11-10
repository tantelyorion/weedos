<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/weed-foundations-' . bin2hex(random_bytes(5));
mkdir($tmp, 0700, true);
putenv('WEED_ROOT='.$root); putenv('WEED_DATA='.$tmp);
define('WEED_ROOT', $root); define('WEED_DATA', $tmp); define('WEED_VERSION', '0.8.25');
require $root . '/kernel/autoload.php';
function fcheck(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
try {
    fcheck(Weed\RoleManager::allows('admin','power'), 'admin capability missing');
    fcheck(!Weed\RoleManager::allows('user','power'), 'user must not power off');
    fcheck(Weed\RoleManager::allows('user','fs.read'), 'user fs read capability missing');
    $denied = false; try { Weed\RoleManager::require('user','user.remove'); } catch (RuntimeException $e) { $denied = true; }
    fcheck($denied, 'RBAC did not deny user.remove');
    $auth = new Weed\Auth();
    $vfs = new Weed\Vfs('regularuser');
    $sys = new Weed\Syscalls($vfs, new Weed\Programs(), $auth, ['name'=>'regularuser','role'=>'user']);
    $powerDenied = false; try { $sys->call('power', ['action'=>'poweroff']); } catch (RuntimeException $e) { $powerDenied = true; }
    fcheck($powerDenied && !is_file($tmp.'/var/run/power'), 'syscall power must be denied before side effects');
    $grantDenied = false; try { $sys->call('app.permission.grant', ['id'=>'demo-app','permission'=>'app.demo-app.read']); } catch (RuntimeException $e) { $grantDenied = true; }
    fcheck($grantDenied, 'app permission management must be admin-only');
    foreach (['etc','var/log','var/run','apps','appdata','home'] as $d) if (!is_dir($tmp.'/'.$d)) mkdir($tmp.'/'.$d,0700,true);
    $diag = Weed\KernelDiagnostics::run();
    fcheck(isset($diag['summary']['checks'],$diag['checks']) && $diag['control']==='read-only', 'kernel diagnostics malformed');
    $platform = (new Weed\DiskInstaller(['name'=>'admin','role'=>'admin']))->platform();
    fcheck(isset($platform['firmware'],$platform['tools'],$platform['destructive_uefi_enabled']) && $platform['destructive_uefi_enabled']===false, 'UEFI platform report unsafe');
    echo "Kernel foundations smoke test OK\n";
} finally {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($it as $x) { $x->isDir() ? @rmdir($x->getPathname()) : @unlink($x->getPathname()); }
    @rmdir($tmp);
}
