<?php
declare(strict_types=1);
namespace Weed;

/** Contrôle d'accès basé sur les rôles (RBAC). Les capacités sont vérifiées dans le Kernel. */
final class RoleManager
{
    private const ROLES = [
        'admin' => ['*'],
        'user' => ['sys.info','system.metrics','proc.list','fs.list','fs.read','fs.write','fs.mkdir','fs.rm','fs.copy','fs.move','fs.zip.list','fs.zip.create','fs.zip.extract','fs.zip.delete','fs.zip.add','fs.zip.test','fs.zip.read','prog.list','user.passwd.self','shell.exec','media.status','media.probe','media.thumbnail','media.url','media.convert','media.extract_audio','media.trim','media.render','media.concat','media.job.status','media.job.list','media.job.cancel'],
    ];

    public static function roles(): array
    {
        $out = [];
        foreach (self::ROLES as $role => $caps) $out[] = ['role'=>$role,'capabilities'=>$caps,'control'=>'kernel-enforced'];
        return $out;
    }

    public static function allows(string $role, string $syscall): bool
    {
        $caps = self::ROLES[$role] ?? [];
        if (in_array('*', $caps, true) || in_array($syscall, $caps, true)) return true;
        if ($syscall === 'user.passwd') return in_array('user.passwd.self', $caps, true);
        return false;
    }

    public static function require(string $role, string $syscall): void
    {
        if (!self::allows($role, $syscall)) {
            Log::security('RBAC_DENIED', ['role'=>$role, 'syscall'=>$syscall]);
            throw new \RuntimeException('autorisation refusée par le Kernel pour : ' . $syscall);
        }
    }
}
