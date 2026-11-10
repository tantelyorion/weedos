<?php
declare(strict_types=1);
namespace Weed;

/**
 * Weed Kernel (PHP) : superviseur de services du système.
 * - prépare l'arborescence de données
 * - démarre / surveille / relance les services (serveur shell, affichage)
 * - publie la table des processus pour l'API syscall
 * - exécute les demandes d'extinction / redémarrage
 */
final class Kernel
{
    private array $svc = [];
    private bool $running = true;
    private int $startedAt;
    private bool $realSystem = false;

    public function boot(array $argv): void
    {
        $this->startedAt = time();
        $this->realSystem = getenv('WEED_DISPLAY') === '1';
        if (is_link(WEED_DATA)) throw new \RuntimeException('WEED_DATA ne doit pas être un lien symbolique');
        if (!is_dir(WEED_DATA) && !@mkdir(WEED_DATA, 0700, true) && !is_dir(WEED_DATA)) {
            throw new \RuntimeException('impossible de créer WEED_DATA');
        }
        @chmod(WEED_DATA, 0700);
        foreach (['home', 'etc', 'apps', 'appdata', 'var', 'var/log', 'var/run'] as $d) {
            $path = WEED_DATA . '/' . $d;
            if (is_link($path)) throw new \RuntimeException('répertoire système symbolique interdit : ' . $d);
            if (!is_dir($path) && !@mkdir($path, 0700, true) && !is_dir($path)) {
                throw new \RuntimeException('impossible de créer le répertoire système : ' . $d);
            }
            @chmod($path, 0700);
        }
        if (Isolation::isRoot()) {
            // Traversée seule : weedworker atteint apps/<id> (lecture) et appdata/<id> (écriture), rien d'autre.
            @chmod(WEED_DATA, 0711);
            @chmod(WEED_DATA . '/apps', 0755);
            @chmod(WEED_DATA . '/appdata', 0711);
            $iso = Isolation::report();
            Log::write($iso['missing'] === [] ? 'INFO' : 'WARN', 'isolation Unix : ' . json_encode($iso, JSON_UNESCAPED_SLASHES));
        }
        @unlink(WEED_DATA . '/var/run/power');
        Log::write('INFO', 'Weed OS ' . WEED_VERSION . ' - Weed Kernel (PHP ' . PHP_VERSION . ')');
        Log::write('INFO', 'root=' . WEED_ROOT . ' data=' . WEED_DATA . ($this->realSystem ? ' [system]' : ' [dev]'));

        if (function_exists('pcntl_async_signals')) {
            pcntl_async_signals(true);
            foreach ([SIGTERM, SIGINT] as $sig) {
                pcntl_signal($sig, function (): void { $this->running = false; });
            }
        }

        $port = (int)(getenv('WEED_PORT') ?: 8080);
        // Son de bienvenue : premier service défini, donc premier lancé (comme le carillon d'un vrai OS).
        $this->defineStartupSound();
        $this->define('shell', [
            PHP_BINARY, '-d', 'upload_max_filesize=512M', '-d', 'post_max_size=520M',
            '-S', "127.0.0.1:$port", '-t', WEED_ROOT . '/system/desktop', WEED_ROOT . '/system/router.php',
        ]);
        // Services matériels facultatifs : absents en mode dev ou sur un hôte non Linux.
        // eudev : sans udevd, libinput (cage) ne reconnaît ni clavier ni souris.
        $udevd = $this->realSystem ? $this->findBinary('udevd') : null;
        $udevadm = $this->realSystem ? $this->findBinary('udevadm') : null;
        if ($udevd !== null) $this->define('udev', [$udevd]);
        if (($dbus = $this->findBinary('dbus-daemon')) !== null) {
            @mkdir('/run/dbus', 0755, true);
            $this->define('dbus', [$dbus, '--system', '--nofork', '--nopidfile']);
        }
        if (($network = $this->findBinary('NetworkManager')) !== null) {
            $this->define('network', [$network, '--no-daemon']);
        }
        if (($bluetooth = $this->findBinary('bluetoothd')) !== null) {
            $this->define('bluetooth', [$bluetooth, '--nodetach']);
        }
        if ($this->realSystem) {
            $display = ['cage', '--', 'cog', '--platform=wl', "http://127.0.0.1:$port/"];
            if ($udevd !== null && $udevadm !== null && is_executable('/bin/sh')) {
                // Détection à chaud des périphériques d'entrée/écran avant de lancer le compositeur.
                $display = ['/bin/sh', '-c', 'sleep 1; ' . escapeshellarg($udevadm) . ' trigger --action=add; '
                    . escapeshellarg($udevadm) . ' settle --timeout=10; exec cage -- cog --platform=wl ' . escapeshellarg("http://127.0.0.1:$port/")];
            }
            $this->define('display', $display);
        } else {
            Log::write('INFO', "Ouvrez http://127.0.0.1:$port/ dans votre navigateur");
        }

        while ($this->running) {
            $this->supervise();
            $this->publish();
            $this->handleSoundTest();
            if ($this->handlePower()) break;
            usleep(500000);
        }
        $this->shutdown();
    }

    /**
     * Son de démarrage joué par le système lui-même, sans navigateur ni clic.
     * Système réel : kernel/bin/startup-sound.sh (attend la carte son, règle ALSA, mpg123).
     * Mode dev : lecteur de l'hôte (afplay, mpg123, ffplay, mpv, cvlc ou PowerShell).
     * Réglages (activé / volume) : SystemSound, modifiables dans Réglages par un administrateur.
     * Marqueurs dans var/run : sound-capable (un lecteur existe), startup-sound (lecture native en cours/réussie).
     */
    private function defineStartupSound(): void
    {
        $mark = WEED_DATA . '/var/run/startup-sound';
        @unlink($mark);
        @unlink(WEED_DATA . '/var/run/sound-capable');
        @unlink(WEED_DATA . '/var/run/sound-test');
        $file = $this->startupSoundFile();
        if ($file === null) {
            Log::write('WARN', 'son de bienvenue indisponible : startup.mp3 absent ou illisible');
            return;
        }
        if ($this->soundCommand($file, 100, '') === null) {
            Log::write('INFO', $this->realSystem ? 'son de bienvenue natif indisponible : mpg123 absent'
                : 'aucun lecteur audio hôte : le son sera tenté par le navigateur');
            return;
        }
        @file_put_contents(WEED_DATA . '/var/run/sound-capable', "1\n");
        $cfg = SystemSound::load();
        if (!$cfg['startup'] || $cfg['volume'] <= 0) {
            Log::write('INFO', 'son de bienvenue désactivé dans les réglages système');
            return;
        }
        $cmd = $this->soundCommand($file, $cfg['volume'], $mark);
        if ($cmd === null) return;
        @file_put_contents($mark, "1\n");
        // One-shot : pas de relance par le superviseur.
        $this->define('startup-sound', $cmd, false);
    }

    private function startupSoundFile(): ?string
    {
        $file = WEED_ROOT . '/system/desktop/assets/sounds/startup.mp3';
        return is_file($file) && !is_link($file) && is_readable($file) ? $file : null;
    }

    /** Test demandé depuis Réglages (fichier var/run/sound-test déposé par l'API, admin seulement). */
    private function handleSoundTest(): void
    {
        $f = WEED_DATA . '/var/run/sound-test';
        if (!is_file($f)) return;
        @unlink($f);
        $cur = $this->svc['startup-sound']['proc'] ?? null;
        if (is_resource($cur)) return; // déjà en cours de lecture
        $file = $this->startupSoundFile();
        if ($file === null) return;
        $cmd = $this->soundCommand($file, SystemSound::load()['volume'] ?: 85, '');
        if ($cmd === null) return;
        $this->define('startup-sound', $cmd, false);
    }

    /** Commande de lecture (volume 0-100). $mark : fichier supprimé si la lecture native échoue. */
    private function soundCommand(string $file, int $volume, string $mark): ?array
    {
        $volume = max(0, min(100, $volume));
        if ($this->realSystem) {
            return $this->findBinary('mpg123') === null ? null
                : ['/bin/sh', WEED_ROOT . '/kernel/bin/startup-sound.sh', $file, $mark, (string)$volume];
        }
        return $this->hostSoundCommand($file, $volume);
    }

    /** Lecteur audio de la machine hôte (mode développement uniquement). */
    private function hostSoundCommand(string $file, int $volume): ?array
    {
        if (PHP_OS_FAMILY === 'Windows') {
            // Non testé ici : MediaPlayer de Windows via PowerShell ; le chemin passe par WEED_SOUND.
            return ['powershell.exe', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
                'Add-Type -AssemblyName PresentationCore;$p=New-Object System.Windows.Media.MediaPlayer;'
                . '$p.Open([Uri]$env:WEED_SOUND);$p.Volume=' . sprintf('%.2f', $volume / 100) . ';$p.Play();$t=0;'
                . 'while(-not $p.NaturalDuration.HasTimeSpan -and $t -lt 50){Start-Sleep -Milliseconds 100;$t++};'
                . 'if($p.NaturalDuration.HasTimeSpan){Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds+500)}'];
        }
        $players = [
            'afplay' => ['-v', sprintf('%.2f', $volume / 100)],
            'mpg123' => ['-q', '-f', (string)(int)round(32768 * $volume / 100)],
            'ffplay' => ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', (string)$volume],
            'mpv' => ['--no-video', '--really-quiet', '--volume=' . $volume],
            'cvlc' => ['--play-and-exit', '--quiet'],
        ];
        foreach ($players as $name => $args) {
            if (($bin = $this->findBinary($name)) !== null) return array_merge([$bin], $args, [$file]);
        }
        return null;
    }

    private function findBinary(string $name): ?string
    {
        $dirs = array_merge(explode(PATH_SEPARATOR, getenv('PATH') ?: '/usr/sbin:/usr/bin:/sbin:/bin'),
            ['/usr/libexec', '/usr/libexec/bluetooth', '/usr/lib/bluetooth']);
        foreach ($dirs as $dir) {
            $path = rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $name;
            if (is_executable($path) && !is_dir($path)) return $path;
        }
        return null;
    }

    private function define(string $name, array $cmd, bool $restart = true): void
    {
        $this->svc[$name] = ['cmd' => $cmd, 'restart' => $restart, 'proc' => null, 'pid' => 0, 'restarts' => 0, 'failures' => 0, 'since' => 0, 'next' => 0];
    }

    private function start(string $name): void
    {
        $s = &$this->svc[$name];
        $log = WEED_DATA . '/var/log/' . $name . '.log';
        $env = array_merge(getenv(), ['WEED_ROOT' => WEED_ROOT, 'WEED_DATA' => WEED_DATA]);
        // Plusieurs workers HTTP : la lecture d'une vidéo en flux ne doit pas bloquer le reste du bureau.
        if ($name === 'shell') $env['PHP_CLI_SERVER_WORKERS'] = '4';
        if ($name === 'startup-sound') $env['WEED_SOUND'] = WEED_ROOT . '/system/desktop/assets/sounds/startup.mp3';
        // Windows ne possède pas /dev/null. Un pipe stdin fermé fonctionne sur Windows et Linux.
        $descriptors = [
            0 => ['pipe', 'r'],
            1 => ['file', $log, 'a'],
            2 => ['file', $log, 'a'],
        ];
        $error = '';
        set_error_handler(static function (int $severity, string $message) use (&$error): bool {
            $error = $message;
            return true;
        });
        try {
            $proc = proc_open($s['cmd'], $descriptors, $pipes, WEED_ROOT, $env);
        } catch (\Throwable $e) {
            $proc = false;
            $error = $e->getMessage();
        } finally {
            restore_error_handler();
        }
        if (isset($pipes[0]) && is_resource($pipes[0])) {
            fclose($pipes[0]);
        }
        if (!is_resource($proc)) {
            Log::write('ERROR', "service $name: démarrage impossible" . ($error !== '' ? " ($error)" : ''));
            $s['failures']++;
            $s['next'] = $s['failures'] >= 3 ? PHP_INT_MAX : time() + 15;
            if ($s['failures'] >= 3) Log::write('ERROR', "service $name: 3 échecs consécutifs, relances automatiques suspendues");
            return;
        }
        $st = proc_get_status($proc);
        $s['proc'] = $proc;
        $s['failures'] = 0;
        $s['pid'] = $st['pid'];
        $s['since'] = time();
        Log::write('INFO', "service $name démarré (pid {$st['pid']})");
    }

    private function supervise(): void
    {
        foreach ($this->svc as $name => &$s) {
            $alive = false;
            if (is_resource($s['proc'])) {
                $st = proc_get_status($s['proc']);
                $alive = $st['running'];
                if (!$alive) { proc_close($s['proc']); $s['proc'] = null; $s['pid'] = 0; }
            }
            if ($alive) {
                if ($s['restarts'] > 0 && time() - $s['since'] > 60) $s['restarts'] = 0;
                continue;
            }
            if (($s['restart'] ?? true) === false && $s['since'] > 0) continue;
            if (time() < $s['next']) continue;
            if ($s['since'] > 0) {
                $s['restarts']++;
                Log::write('WARN', "service $name arrêté, relance #{$s['restarts']}");
            }
            $s['next'] = time() + min(30, 2 ** $s['restarts']);
            $this->start($name);
        }
        unset($s);
    }

    private function publish(): void
    {
        $list = [['name' => 'kernel', 'pid' => getmypid(), 'state' => 'running', 'restarts' => 0, 'uptime' => time() - $this->startedAt]];
        foreach ($this->svc as $name => $s) {
            $list[] = [
                'name' => $name, 'pid' => $s['pid'], 'state' => $s['pid'] ? 'running' : 'stopped',
                'restarts' => $s['restarts'], 'uptime' => $s['pid'] ? time() - $s['since'] : 0,
            ];
        }
        $payload = json_encode(['started' => $this->startedAt, 'procs' => $list]);
        @file_put_contents(WEED_DATA . '/var/run/procs.json', $payload, LOCK_EX);
    }

    private function handlePower(): bool
    {
        $f = WEED_DATA . '/var/run/power';
        if (!is_file($f)) return false;
        $action = trim((string)file_get_contents($f));
        @unlink($f);
        if (!in_array($action, ['poweroff', 'reboot'], true)) return false;
        Log::write('INFO', "demande système: $action");
        $this->shutdown();
        if ($this->realSystem) {
            @exec($action === 'reboot' ? 'reboot -f' : 'poweroff -f');
        } else {
            Log::write('INFO', "(mode dev) $action ignoré, kernel arrêté");
        }
        return true;
    }

    private function shutdown(): void
    {
        foreach ($this->svc as $name => $s) {
            if (is_resource($s['proc'])) { proc_terminate($s['proc']); Log::write('INFO', "service $name arrêté"); }
        }
        Log::write('INFO', 'Weed Kernel arrêté');
    }
}
