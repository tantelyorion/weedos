<?php
declare(strict_types=1);
namespace Weed;

/**
 * Exécute une action de Programme dans un processus PHP distinct.
 * Limite l'impact d'une erreur mémoire/exception et impose un délai.
 * v0.8.6 : lorsque le Kernel tourne en root, le worker abandonne ses privilèges et passe
 * sous le compte Unix « weedworker » (UID/GID 990) avant de charger le code du Programme.
 * Le Kernel (superviseur) vérifie l'intégrité du Programme AVANT de lancer le worker :
 * la clé HMAC reste lisible uniquement par root. Hors root (mode dev), aucune isolation Unix.
 */
final class ProgramWorker
{
    private const MAX_INPUT = 1048576;
    private const MAX_OUTPUT = 2097152;

    public function __construct(
        private int $timeoutSeconds = 5,
        private int $memoryLimitMb = 64
    ) {
        if ($timeoutSeconds < 1 || $timeoutSeconds > 60) throw new \InvalidArgumentException('timeout worker invalide');
        if ($memoryLimitMb < 16 || $memoryLimitMb > 512) throw new \InvalidArgumentException('limite mémoire worker invalide');
    }

    public function call(string $id, string $action, array $args, array $user): mixed
    {
        if (!preg_match('/^[a-z0-9][a-z0-9-]{1,39}$/', $id) ||
            !preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/', $action)) {
            throw new \RuntimeException('identifiant ou action de worker invalide');
        }
        $payload = json_encode(['args' => $args, 'user' => $user], JSON_THROW_ON_ERROR);
        if (strlen($payload) > self::MAX_INPUT) throw new \RuntimeException('requête worker trop volumineuse');

        $base = WEED_DATA . '/apps/' . $id;
        if (is_link($base) || !is_dir($base) || !Security::verifyProgram($id, $base)) {
            Log::security('WORKER_PROGRAM_REJECTED', ['id' => $id]);
            throw new \RuntimeException('intégrité du Programme non vérifiée');
        }
        // Limites optionnelles déclarées par le Programme ("worker":{"timeout":s,"memory_mb":Mo}), plafonnées par le Kernel.
        $timeout = $this->timeoutSeconds; $memory = $this->memoryLimitMb;
        $mf = json_decode((string)@file_get_contents($base . '/manifest.json'), true);
        if (is_array($mf) && is_array($mf['worker'] ?? null)) {
            $timeout = max($timeout, min(30, (int)($mf['worker']['timeout'] ?? $timeout)));
            $memory = max($memory, min(128, (int)($mf['worker']['memory_mb'] ?? $memory)));
        }
        // En root, l'isolation est obligatoire : pas de repli silencieux vers un worker root.
        $isolate = Isolation::isRoot();
        if ($isolate) {
            try { Isolation::accountInfo(); }
            catch (\Throwable $e) {
                Log::security('WORKER_ISOLATION_UNAVAILABLE', ['id' => $id, 'error' => $e->getMessage()]);
                throw new \RuntimeException('isolation Unix indisponible : worker refusé');
            }
        }
        $script = WEED_ROOT . '/kernel/bin/program-worker.php';
        if (!is_file($script) || is_link($script)) throw new \RuntimeException('script worker absent ou non sécurisé');
        $cmd = [
            PHP_BINARY, '-d', 'display_errors=0', '-d', 'log_errors=0',
            '-d', 'memory_limit=' . $memory . 'M',
            '-d', 'max_execution_time=' . $timeout,
            $script, $id, $action,
        ];
        $env = [
            'WEED_ROOT' => WEED_ROOT,
            'WEED_DATA' => WEED_DATA,
            'PATH' => getenv('PATH') ?: '',
            'HOME' => WEED_DATA . '/appdata/' . $id,
            'WEED_PROGRAM_DATA' => WEED_DATA . '/appdata/' . $id,
            'WEED_WORKER' => '1',
            'WEED_ISOLATE' => $isolate ? '1' : '0',
        ];
        $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $proc = proc_open($cmd, $spec, $pipes, WEED_ROOT, $env, ['bypass_shell' => true]);
        if (!is_resource($proc)) throw new \RuntimeException('impossible de démarrer le worker');
        try {
            fwrite($pipes[0], $payload);
            fclose($pipes[0]);
            stream_set_blocking($pipes[1], false);
            stream_set_blocking($pipes[2], false);
            $stdout = ''; $stderr = ''; $deadline = microtime(true) + $timeout;
            while (true) {
                $status = proc_get_status($proc);
                foreach ([1 => &$stdout, 2 => &$stderr] as $index => &$buffer) {
                    $chunk = stream_get_contents($pipes[$index]);
                    if (is_string($chunk) && $chunk !== '') $buffer .= $chunk;
                }
                unset($buffer);
                if (strlen($stdout) > self::MAX_OUTPUT || strlen($stderr) > 65536) {
                    proc_terminate($proc, 9);
                    throw new \RuntimeException('sortie worker trop volumineuse');
                }
                if (!$status['running']) break;
                if (microtime(true) >= $deadline) {
                    proc_terminate($proc, 9);
                    throw new \RuntimeException('délai du worker dépassé');
                }
                usleep(10000);
            }
            foreach ([1, 2] as $i) {
                $tail = stream_get_contents($pipes[$i]);
                if (is_string($tail)) { if ($i === 1) $stdout .= $tail; else $stderr .= $tail; }
                fclose($pipes[$i]);
            }
            $exit = proc_close($proc); $proc = null;
            $response = json_decode($stdout, true);
            if (!is_array($response) || !array_key_exists('ok', $response)) {
                Log::security('WORKER_INVALID_RESPONSE', ['id' => $id, 'action' => $action, 'stderr' => substr($stderr, 0, 1000)]);
                throw new \RuntimeException('réponse worker invalide');
            }
            if ($exit !== 0 || $response['ok'] !== true) {
                $message = is_string($response['error'] ?? null) ? $response['error'] : 'échec du worker';
                Log::security('WORKER_CALL_FAILED', ['id' => $id, 'action' => $action, 'exit' => $exit]);
                throw new \RuntimeException($message);
            }
            return $response['result'] ?? null;
        } finally {
            foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            if (is_resource($proc)) { proc_terminate($proc); proc_close($proc); }
        }
    }
}
