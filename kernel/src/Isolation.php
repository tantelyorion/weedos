<?php
declare(strict_types=1);
namespace Weed;

/**
 * Weed Unix Isolation Core (v0.8.6).
 * Les Workers PHP des Programmes s'exécutent sous le compte Unix dédié « weedworker »
 * (UID/GID 990) et non plus sous root. Le Kernel reste le superviseur (root).
 *
 * Principe : le worker démarre avec l'UID du Kernel, puis appelle Isolation::dropPrivileges()
 * AVANT de charger le moindre code de Programme. Si l'abandon n'est pas prouvé, il s'arrête (fail-closed).
 */
final class Isolation
{
    public const USER = 'weedworker';
    public const UID = 990;
    public const GID = 990;

    /** Extensions et fonctions nécessaires à l'isolation. */
    public static function missingRequirements(): array
    {
        $missing = [];
        if (!extension_loaded('posix')) $missing[] = 'extension PHP posix';
        foreach (['posix_geteuid', 'posix_getpwnam', 'posix_setgid', 'posix_setuid', 'posix_initgroups', 'posix_getuid', 'posix_getgid', 'posix_getegid'] as $fn) {
            if (!function_exists($fn)) $missing[] = 'fonction ' . $fn;
        }
        return $missing;
    }

    public static function isRoot(): bool
    {
        return function_exists('posix_geteuid') && posix_geteuid() === 0;
    }

    /**
     * Le compte weedworker existe-t-il avec le UID/GID attendus ?
     * Refuse un compte qui aurait été créé avec un autre identifiant (ou avec UID 0).
     */
    public static function accountInfo(): array
    {
        if (self::missingRequirements() !== []) throw new \RuntimeException('isolation indisponible : ' . implode(', ', self::missingRequirements()));
        $pw = posix_getpwnam(self::USER);
        if (!is_array($pw)) throw new \RuntimeException('compte Unix ' . self::USER . ' introuvable');
        if ((int)$pw['uid'] !== self::UID || (int)$pw['gid'] !== self::GID) {
            throw new \RuntimeException('compte ' . self::USER . ' invalide (attendu UID/GID ' . self::UID . '/' . self::GID . ')');
        }
        if (self::UID === 0 || self::GID === 0) throw new \RuntimeException('UID/GID root interdits pour un worker');
        return $pw;
    }

    /**
     * Abandonne définitivement les privilèges root. Ordre obligatoire : groupes, GID, puis UID.
     * Vérifie ensuite que root ne peut pas être repris. Lève une exception au moindre doute.
     */
    public static function dropPrivileges(): void
    {
        $pw = self::accountInfo();
        if (!self::isRoot()) {
            // Déjà non-root : n'est valide que si c'est exactement weedworker.
            self::assertIdentity();
            return;
        }
        if (!posix_initgroups(self::USER, self::GID)) throw new \RuntimeException('initgroups échoué');
        if (!posix_setgid(self::GID)) throw new \RuntimeException('setgid échoué');
        if (!posix_setuid(self::UID)) throw new \RuntimeException('setuid échoué');
        self::assertIdentity();
        // Preuve : la reprise de root doit échouer.
        if (@posix_setuid(0) || @posix_setgid(0) || posix_geteuid() === 0) {
            throw new \RuntimeException('abandon des privilèges non définitif');
        }
        // Environnement cohérent avec le nouveau compte.
        putenv('HOME=' . ($pw['dir'] ?? '/nonexistent'));
        umask(0077);
    }

    /** Vérifie UID/GID réels et effectifs = 990 et absence du groupe 0. */
    public static function assertIdentity(): void
    {
        $ids = [posix_getuid(), posix_geteuid(), posix_getgid(), posix_getegid()];
        if ($ids !== [self::UID, self::UID, self::GID, self::GID]) {
            throw new \RuntimeException('identité Unix inattendue : ' . implode('/', $ids));
        }
        if (function_exists('posix_getgroups') && in_array(0, posix_getgroups(), true)) {
            throw new \RuntimeException('le worker appartient encore au groupe root');
        }
    }

    /** Rapport pour tools/isolation-check et les journaux du Kernel. */
    public static function report(): array
    {
        $r = ['missing' => self::missingRequirements(), 'root' => self::isRoot()];
        if ($r['missing'] === []) {
            $pw = posix_getpwnam(self::USER);
            $r['account'] = is_array($pw) ? ['uid' => $pw['uid'], 'gid' => $pw['gid'], 'shell' => $pw['shell'] ?? '', 'dir' => $pw['dir'] ?? ''] : null;
        }
        return $r;
    }
}
