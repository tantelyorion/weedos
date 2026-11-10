<?php
declare(strict_types=1);
namespace Weed;

/** Inventaire des permissions déclarées par les Programmes, sans octroi implicite. */
final class AppPermissionManager
{
    private static function grantsPath(): string { return WEED_DATA . '/etc/app-permissions.json'; }

    private static function grants(): array
    {
        $path = self::grantsPath();
        if (is_link($path) || !is_file($path) || filesize($path) > 1048576) return [];
        $data = json_decode((string)@file_get_contents($path), true);
        if (!is_array($data)) return [];
        $clean = [];
        foreach ($data as $id => $permissions) {
            if (!is_string($id) || !preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id) || !is_array($permissions)) continue;
            foreach ($permissions as $permission) {
                if (is_string($permission) && preg_match('/^app\\.' . preg_quote($id, '/') . '\\.[A-Za-z0-9_]{1,48}$/', $permission)) $clean[$id][] = $permission;
            }
            if (isset($clean[$id])) $clean[$id] = array_values(array_unique($clean[$id]));
        }
        return $clean;
    }

    private static function save(array $data): void
    {
        $path = self::grantsPath();
        $dir = dirname($path);
        if (!is_dir($dir) || is_link($dir) || is_link($path)) throw new \RuntimeException('registre de permissions non sécurisé');
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $json, LOCK_EX) !== strlen($json)) { @unlink($tmp); throw new \RuntimeException('écriture du registre impossible'); }
        @chmod($tmp, 0600);
        if (!rename($tmp, $path)) { @unlink($tmp); throw new \RuntimeException('publication du registre impossible'); }
        @chmod($path, 0600);
    }

    public static function isGranted(string $id, string $permission): bool
    {
        return in_array($permission, self::grants()[$id] ?? [], true);
    }

    public static function grant(string $id, string $permission): array
    {
        self::validatePermission($id, $permission);
        $manifest = (new Programs())->manifest($id);
        $declared = is_array($manifest['permissions'] ?? null) ? $manifest['permissions'] : [];
        if (!in_array($permission, $declared, true)) throw new \RuntimeException('permission non déclarée dans le manifeste');
        $all = self::grants(); $list = is_array($all[$id] ?? null) ? $all[$id] : [];
        if (!in_array($permission, $list, true)) $list[] = $permission;
        $all[$id] = array_values(array_unique($list)); self::save($all);
        Log::security('APP_PERMISSION_GRANTED', ['app'=>$id,'permission'=>$permission]);
        return ['app'=>$id,'permission'=>$permission,'granted'=>true];
    }

    public static function revoke(string $id, string $permission): array
    {
        self::validatePermission($id, $permission);
        $all = self::grants(); $all[$id] = array_values(array_filter($all[$id] ?? [], static fn($v) => $v !== $permission));
        if ($all[$id] === []) unset($all[$id]);
        self::save($all);
        Log::security('APP_PERMISSION_REVOKED', ['app'=>$id,'permission'=>$permission]);
        return ['app'=>$id,'permission'=>$permission,'granted'=>false];
    }

    private static function validatePermission(string $id, string $permission): void
    {
        if (!preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id) ||
            !preg_match('/^app\\.' . preg_quote($id, '/') . '\\.[A-Za-z0-9_]{1,48}$/', $permission)) {
            throw new \RuntimeException('identifiant ou permission invalide');
        }
    }

    public static function list(): array
    {
        $file = WEED_DATA . '/etc/apps.json';
        $appsDir = WEED_DATA . '/apps';
        $registry = [];
        if (is_file($file) && !is_link($file) && filesize($file) <= 1_048_576) {
            $decoded = json_decode((string)@file_get_contents($file), true);
            if (is_array($decoded)) $registry = $decoded;
        }
        $items = [];
        $grants = self::grants();
        foreach ($registry as $id => $info) {
            if (!is_string($id) || !preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id) || !is_array($info)) continue;
            $dir = $appsDir . '/' . $id;
            $manifestFile = $dir . '/manifest.json';
            if (is_link($dir) || !is_dir($dir) || is_link($manifestFile) || !is_file($manifestFile) || filesize($manifestFile) > 65536) continue;
            $manifest = json_decode((string)@file_get_contents($manifestFile), true);
            if (!is_array($manifest)) continue;
            $permissions = [];
            foreach (is_array($manifest['permissions'] ?? null) ? $manifest['permissions'] : [] as $permission) {
                if (is_string($permission) && preg_match('/^app\.' . preg_quote($id, '/') . '\.[A-Za-z0-9_]{1,48}$/', $permission)) $permissions[] = $permission;
            }
            $items[] = ['id' => $id, 'name' => is_string($manifest['name'] ?? null) ? substr($manifest['name'], 0, 400) : $id,
                'enabled' => !empty($info['enabled']), 'permissions' => array_values(array_unique($permissions)),
                'granted' => array_values(array_intersect(array_unique($permissions), is_array($grants[$id] ?? null) ? $grants[$id] : [])),
                'permission_count' => count(array_unique($permissions)), 'control' => 'kernel-enforced-explicit-grants'];
        }
        usort($items, static fn(array $a, array $b): int => strcasecmp($a['name'], $b['name']));
        return ['items' => $items, 'count' => count($items), 'sampled_at' => time(), 'control' => 'read-only'];
    }
}
