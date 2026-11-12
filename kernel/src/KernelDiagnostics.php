<?php
declare(strict_types=1);
namespace Weed;

/** Centre de diagnostic en lecture seule : contrôles locaux, bornés et sans commande shell. */
final class KernelDiagnostics
{
    public static function run(): array
    {
        $checks = [];
        $add = static function(string $name, string $status, string $detail) use (&$checks): void {
            $checks[] = ['name'=>$name,'status'=>$status,'detail'=>$detail];
        };
        $add('Version Weed OS', 'ok', WEED_VERSION);
        $add('Runtime PHP', version_compare(PHP_VERSION, '8.1.0', '>=') ? 'ok' : 'error', PHP_VERSION);
        $add('OpenSSL', extension_loaded('openssl') ? 'ok' : 'warning', extension_loaded('openssl') ? 'Disponible' : 'Extension absente');
        $add('Archive ZIP', class_exists(\ZipArchive::class) ? 'ok' : 'warning', class_exists(\ZipArchive::class) ? 'Disponible' : 'Extension absente');
        $add('Dossier de données', is_dir(WEED_DATA) && !is_link(WEED_DATA) ? 'ok' : 'error', is_dir(WEED_DATA) ? (is_link(WEED_DATA) ? 'Lien symbolique interdit' : 'Accessible') : 'Absent');
        $add('Moteur média (FFmpeg)', Media::available() ? 'ok' : 'warning', Media::available() ? 'FFmpeg et FFprobe détectés' : 'FFmpeg/FFprobe absents : les Programmes média ne fonctionneront pas');
        $log = WEED_DATA . '/var/log/kernel.log';
        $add('Journal Kernel', is_file($log) && !is_link($log) && is_readable($log) ? 'ok' : 'warning', is_file($log) ? 'Lisible' : 'Non créé');
        $add('Mode de démarrage', is_dir('/sys/firmware/efi') ? 'ok' : 'info', is_dir('/sys/firmware/efi') ? 'UEFI détecté' : 'BIOS/Legacy ou environnement non Linux');
        $isolation = Isolation::report();
        $add('Isolation des applications', $isolation['missing'] === [] && isset($isolation['account']) ? 'ok' : 'warning',
            $isolation['missing'] !== [] ? implode(', ', $isolation['missing']) : (isset($isolation['account']) ? 'Compte weedworker détecté' : 'Compte weedworker absent ou runtime non-root'));
        $failed = count(array_filter($checks, static fn($c) => $c['status'] === 'error'));
        $warnings = count(array_filter($checks, static fn($c) => $c['status'] === 'warning'));
        return ['sampled_at'=>time(),'status'=>$failed ? 'error' : ($warnings ? 'warning' : 'ok'),
            'summary'=>['checks'=>count($checks),'errors'=>$failed,'warnings'=>$warnings],
            'checks'=>$checks,'control'=>'read-only'];
    }
}
