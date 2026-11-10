<?php
declare(strict_types=1);
namespace Weed;

/** Contrôles de configuration non intrusifs : aucun changement de permission n'est effectué. */
final class SecurityAudit
{
    public static function run(): array
    {
        $checks = [];
        $paths = [
            'Dossier de données' => WEED_DATA,
            'Comptes utilisateurs' => WEED_DATA . '/etc/users.json',
            'Dossier des sessions' => WEED_DATA . '/var/run/sessions',
            'Préférences' => WEED_DATA . '/etc/preferences',
            'Autorisations des applications' => WEED_DATA . '/etc/app-permissions.json',
        ];
        foreach ($paths as $label => $path) {
            if (!file_exists($path) && !is_link($path)) {
                $checks[] = ['name' => $label, 'status' => 'missing', 'detail' => 'Non créé (peut être normal avant configuration)'];
                continue;
            }
            if (is_link($path)) {
                $checks[] = ['name' => $label, 'status' => 'warning', 'detail' => 'Lien symbolique détecté'];
                continue;
            }
            $perms = @fileperms($path);
            $mode = $perms === false ? null : ($perms & 0777);
            $private = $mode !== null && (($mode & 0007) === 0) && (($mode & 0022) === 0);
            $checks[] = ['name' => $label, 'status' => $private ? 'ok' : 'warning', 'detail' => $mode === null ? 'Permissions inconnues' : sprintf('Mode %04o', $mode)];
        }
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['SERVER_PORT'] ?? '') === '443');
        $checks[] = ['name' => 'Transport HTTPS', 'status' => $https ? 'ok' : 'info', 'detail' => $https ? 'Connexion HTTPS détectée' : 'HTTP ou contexte CLI : vérifier le reverse proxy en production'];
        $checks[] = ['name' => 'Version PHP', 'status' => PHP_VERSION_ID >= 80100 ? 'ok' : 'warning', 'detail' => PHP_VERSION];
        $counts = ['ok' => 0, 'warning' => 0, 'info' => 0, 'missing' => 0];
        foreach ($checks as $check) $counts[$check['status']] = ($counts[$check['status']] ?? 0) + 1;
        return ['checks' => $checks, 'summary' => $counts, 'sampled_at' => time(), 'mutations' => false];
    }
}
