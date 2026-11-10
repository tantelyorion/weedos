<?php
declare(strict_types=1);
namespace Weed;

/** Table des appels système exposés au bureau (et, via le pont, aux Programmes autorisés). */
final class Syscalls
{
    private const ADMIN = ['power', 'system.install.run', 'system.install.disks', 'system.install.platform', 'prog.enable', 'prog.disable', 'prog.remove', 'user.list', 'user.add', 'user.remove', 'session.inventory', 'eventlog.list', 'app.permissions', 'app.permission.grant', 'app.permission.revoke', 'storage.inventory', 'roles.list', 'kernel.diagnostics'];

    /** @param array{name:string,role:string} $user */
    public function __construct(private Vfs $vfs, private Programs $pkg, private Auth $auth, private array $user) {}

    public function call(string $name, array $a): mixed
    {
        if (in_array($name, self::ADMIN, true) && $this->user['role'] !== 'admin') {
            throw new \RuntimeException('réservé aux administrateurs');
        }
        $s = fn(string $k, string $d = '') => (string)($a[$k] ?? $d);
        switch ($name) {
            case 'system.install.disks': return (new DiskInstaller($this->user))->disks();
            case 'system.install.platform': return (new DiskInstaller($this->user))->platform();
            case 'system.install.run': return (new DiskInstaller($this->user))->install($s('device'), $s('confirmation'));
            case 'sys.info':    return $this->info();
            case 'system.metrics': return SystemMetrics::collect();
            case 'proc.list':   return $this->procs();
            case 'proc.inventory': return ProcessManager::list(200);
            case 'service.inventory': return ServiceManager::list();
            case 'startup.inventory': return StartupManager::list((string)($_SERVER['HOME'] ?? getenv('HOME') ?: ''));
            case 'session.inventory': return SessionManager::list();
            case 'eventlog.list': return EventLog::list(100);
            case 'app.permissions': return AppPermissionManager::list();
            case 'app.permission.grant': return AppPermissionManager::grant($s('id'), $s('permission'));
            case 'app.permission.revoke': return AppPermissionManager::revoke($s('id'), $s('permission'));
            case 'roles.list': return RoleManager::roles();
            case 'kernel.diagnostics': return KernelDiagnostics::run();
            case 'storage.inventory': return StorageManager::inventory();
            case 'security.audit': return SecurityAudit::run();
            case 'fs.list':     return $this->vfs->list($s('path', '/'));
            case 'fs.read':     return $this->vfs->read($s('path'));
            case 'fs.write':    return $this->vfs->write($s('path'), $s('content'));
            case 'fs.mkdir':    return $this->vfs->mkdir($s('path'));
            case 'fs.rm':       return $this->vfs->remove($s('path'));
            case 'fs.copy':     return $this->vfs->copy($s('src'), $s('dst'));
            case 'fs.move':     return $this->vfs->move($s('src'), $s('dst'));
            case 'fs.zip.list': return $this->vfs->archiveList($s('path'));
            case 'fs.zip.create': return $this->vfs->archiveCreate($s('target'), (array)($a['sources'] ?? []));
            case 'fs.zip.extract': return $this->vfs->archiveExtract($s('archive'), $s('destination', '/'), (array)($a['entries'] ?? []));
            case 'fs.zip.delete': return $this->vfs->archiveDelete($s('archive'), (array)($a['entries'] ?? []));
            case 'prog.list':   return $this->pkg->list();
            case 'prog.enable': return $this->pkg->setEnabled($s('id'), true);
            case 'prog.disable':return $this->pkg->setEnabled($s('id'), false);
            case 'prog.remove': return $this->pkg->remove($s('id'));
            case 'user.list':   return $this->auth->listUsers();
            case 'user.add':    $this->auth->create($s('name'), $s('pass'), $s('role', 'user')); return true;
            case 'user.remove':
                if ($s('name') === $this->user['name']) throw new \RuntimeException('vous ne pouvez pas supprimer votre propre compte');
                $this->auth->remove($s('name'));
                return true;
            case 'user.passwd':
                $target = $s('name', $this->user['name']);
                if ($target !== $this->user['name'] && $this->user['role'] !== 'admin') throw new \RuntimeException('réservé aux administrateurs');
                $this->auth->setPassword($target, $s('pass'));
                return true;
            case 'shell.exec':  return (new Shell($this->vfs, $this->pkg, $this))->exec($s('line'), $s('cwd', '/'));
            case 'power':
                $act = $s('action');
                if (!in_array($act, ['poweroff', 'reboot'], true)) throw new \RuntimeException('action invalide');
                file_put_contents(WEED_DATA . '/var/run/power', $act);
                return true;
        }
        if (preg_match('/^app\.([a-z0-9][a-z0-9-]{1,39})\.([A-Za-z0-9_]+)$/', $name, $m)) {
            $manifest = $this->pkg->manifest($m[1]);
            $permission = 'app.' . $m[1] . '.' . $m[2];
            $declared = is_array($manifest['permissions'] ?? null) ? $manifest['permissions'] : [];
            if (!$this->pkg->isEnabled($m[1]) || !in_array($permission, $declared, true)) {
                Log::security('APP_ACCESS_DENIED', ['app' => $m[1], 'permission' => $permission, 'reason' => 'undeclared-or-disabled']);
                throw new \RuntimeException('permission du Programme refusée');
            }
            // Une déclaration dans manifest.json n'accorde jamais un privilège.
            if (!AppPermissionManager::isGranted($m[1], $permission)) {
                Log::security('APP_ACCESS_DENIED', ['app' => $m[1], 'permission' => $permission, 'reason' => 'not-granted']);
                throw new \RuntimeException('permission du Programme non accordée');
            }
            // Les hooks ne sont plus chargés dans le processus du Kernel.
            // Le worker revérifie l'intégrité puis exécute une seule action en sous-processus.
            return (new ProgramWorker())->call($m[1], $m[2], $a, $this->user);
        }
        throw new \RuntimeException("syscall inconnu: $name");
    }

    public function procs(): array
    {
        $f = WEED_DATA . '/var/run/procs.json';
        $j = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
        return is_array($j) ? $j : ['started' => 0, 'procs' => []];
    }

    private function info(): array
    {
        $mem = ['total' => 0, 'free' => 0];
        if (is_readable('/proc/meminfo')) {
            $t = (string)file_get_contents('/proc/meminfo');
            if (preg_match('/MemTotal:\s+(\d+)/', $t, $m)) $mem['total'] = (int)$m[1] * 1024;
            if (preg_match('/MemAvailable:\s+(\d+)/', $t, $m)) $mem['free'] = (int)$m[1] * 1024;
        }
        $p = $this->procs();
        return [
            'os' => 'Weed OS', 'version' => WEED_VERSION, 'host' => gethostname() ?: 'weed',
            'php' => PHP_VERSION, 'uname' => php_uname('s') . ' ' . php_uname('r') . ' ' . php_uname('m'),
            'uptime' => $p['started'] ? time() - (int)$p['started'] : 0, 'mem' => $mem,
            'programs' => count($this->pkg->list()), 'user' => $this->user,
            'author' => 'Tantely Orion', 'license' => 'MIT',
        ];
    }
}
