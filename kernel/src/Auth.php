<?php
declare(strict_types=1);
namespace Weed;

/** Comptes, sessions privées et protection contre les tentatives répétées. */
final class Auth
{
    private const COOKIE = 'weed_sid';
    private const TTL = 604800;
    private string $users;
    private string $sessions;
    private string $fails;
    private string $lock;

    public function __construct()
    {
        $this->users = WEED_DATA . '/etc/users.json';
        $this->sessions = WEED_DATA . '/var/run/sessions';
        $this->fails = WEED_DATA . '/var/run/fails.json';
        $this->lock = WEED_DATA . '/etc/users.lock';
        foreach ([dirname($this->users), dirname($this->sessions), $this->sessions] as $d) {
            if (!is_dir($d) && !@mkdir($d, 0700, true) && !is_dir($d)) {
                throw new \RuntimeException('répertoire de sécurité inaccessible');
            }
            @chmod($d, 0700);
        }
    }

    /** Écriture atomique dans le même répertoire, avec permissions privées. */
    private function atomicWrite(string $path, string $data, int $mode = 0600): void
    {
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(8));
        $fh = @fopen($tmp, 'xb');
        if ($fh === false) throw new \RuntimeException('création du fichier temporaire impossible');
        try {
            @chmod($tmp, $mode);
            $len = strlen($data);
            $written = 0;
            while ($written < $len) {
                $n = fwrite($fh, substr($data, $written));
                if ($n === false || $n === 0) throw new \RuntimeException('écriture incomplète');
                $written += $n;
            }
            if (!fflush($fh)) throw new \RuntimeException('synchronisation impossible');
        } catch (\Throwable $e) {
            fclose($fh); @unlink($tmp); throw $e;
        }
        fclose($fh);
        if (!@rename($tmp, $path)) { @unlink($tmp); throw new \RuntimeException('remplacement atomique impossible'); }
        @chmod($path, $mode);
    }

    private function locked(callable $callback)
    {
        $fh = @fopen($this->lock, 'c');
        if ($fh === false) throw new \RuntimeException('verrou des comptes inaccessible');
        @chmod($this->lock, 0600);
        try {
            if (!flock($fh, LOCK_EX)) throw new \RuntimeException('verrouillage des comptes impossible');
            return $callback();
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

    private function load(): array
    {
        if (!is_file($this->users)) return [];
        $raw = @file_get_contents($this->users);
        $j = $raw === false ? null : json_decode($raw, true);
        if (!is_array($j)) throw new \RuntimeException('fichier des comptes illisible ou corrompu');
        return $j;
    }

    private function save(array $u): void
    {
        $json = json_encode($u, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
        $this->atomicWrite($this->users, $json);
    }

    public function hasUsers(): bool { return count($this->load()) > 0; }
    public static function validName(string $n): bool { return (bool)preg_match('/^[a-z][a-z0-9_]{2,19}$/', $n); }

    public function create(string $name, string $pass, string $role = 'user'): void
    {
        $name = strtolower(trim($name));
        if (!self::validName($name)) throw new \RuntimeException('nom invalide (3-20 caractères : a-z, 0-9, _ ; commence par une lettre)');
        if (strlen($pass) < 6) throw new \RuntimeException('mot de passe trop court (6 caractères minimum)');
        if (!in_array($role, ['admin', 'user'], true)) throw new \RuntimeException('rôle invalide');
        $this->locked(function () use ($name, $pass, $role): void {
            $u = $this->load();
            if (isset($u[$name])) throw new \RuntimeException('ce compte existe déjà');
            $u[$name] = ['hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => $role, 'created' => time()];
            $this->save($u);
        });
        Log::security('USER_CREATED', ['user' => $name, 'role' => $role]);
    }

    public function setup(string $name, string $pass): void
    {
        $name = strtolower(trim($name));
        if (!self::validName($name) || strlen($pass) < 6) throw new \RuntimeException('nom ou mot de passe invalide');
        $this->locked(function () use ($name, $pass): void {
            $u = $this->load();
            if ($u) throw new \RuntimeException('système déjà configuré');
            $u[$name] = ['hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => 'admin', 'created' => time()];
            $this->save($u);
        });
    }

    /** Révoque les sessions associées à un compte après suppression ou changement de mot de passe. */
    private function revokeSessions(string $name): void
    {
        foreach (glob($this->sessions . '/*.json') ?: [] as $file) {
            if (is_link($file) || !is_file($file)) continue;
            $session = json_decode((string)@file_get_contents($file), true);
            if (is_array($session) && ($session['user'] ?? null) === $name) @unlink($file);
        }
    }

    public function remove(string $name): void
    {
        $this->locked(function () use ($name): void {
            $u = $this->load();
            if (!isset($u[$name])) throw new \RuntimeException('compte inconnu');
            if (($u[$name]['role'] ?? '') === 'admin' && count(array_filter($u, fn($x) => ($x['role'] ?? '') === 'admin')) < 2) {
                throw new \RuntimeException('impossible de supprimer le dernier administrateur');
            }
            unset($u[$name]);
            $this->save($u);
            $this->revokeSessions($name);
        });
        Log::security('USER_REMOVED', ['user' => $name]);
    }

    public function setPassword(string $name, string $pass): void
    {
        if (strlen($pass) < 6) throw new \RuntimeException('mot de passe trop court (6 caractères minimum)');
        $this->locked(function () use ($name, $pass): void {
            $u = $this->load();
            if (!isset($u[$name])) throw new \RuntimeException('compte inconnu');
            $u[$name]['hash'] = password_hash($pass, PASSWORD_DEFAULT);
            $this->save($u);
            $this->revokeSessions($name);
        });
        Log::security('PASSWORD_CHANGED', ['user' => $name]);
    }

    public function listUsers(): array
    {
        $o = [];
        foreach ($this->load() as $n => $i) $o[] = ['name' => $n, 'role' => $i['role'], 'created' => $i['created']];
        return $o;
    }

    private function readFails(): array
    {
        if (!is_file($this->fails)) return [];
        $j = json_decode((string)@file_get_contents($this->fails), true);
        return is_array($j) ? $j : [];
    }

    private function throttled(string $key): bool
    {
        $f = $this->readFails();
        $recent = array_filter($f[$key] ?? [], fn($t) => is_int($t) && $t > time() - 300);
        return count($recent) >= 5;
    }

    private function noteFail(string $key): void
    {
        $lock = @fopen($this->fails . '.lock', 'c');
        if (!$lock) return;
        @chmod($this->fails . '.lock', 0600);
        try {
            flock($lock, LOCK_EX);
            $f = $this->readFails();
            $f[$key] = array_values(array_filter($f[$key] ?? [], fn($t) => is_int($t) && $t > time() - 300));
            $f[$key][] = time();
            $this->atomicWrite($this->fails, json_encode($f, JSON_THROW_ON_ERROR), 0600);
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    public function login(string $name, string $pass): string
    {
        $name = strtolower(trim($name));
        if ($this->throttled($name)) throw new \RuntimeException('trop d\'essais, réessayez dans 5 minutes');
        $u = $this->load();
        $ok = isset($u[$name]['hash']) && password_verify($pass, $u[$name]['hash']);
        if (!$ok) { $this->noteFail($name); Log::security('LOGIN_FAILURE', ['user' => $name]); usleep(600000); throw new \RuntimeException('identifiants incorrects'); }
        $token = bin2hex(random_bytes(32));
        $session = $this->sessions . '/' . hash('sha256', $token) . '.json';
        $this->atomicWrite($session, json_encode(['user' => $name, 'exp' => time() + self::TTL], JSON_THROW_ON_ERROR), 0600);
        Log::security('LOGIN_SUCCESS', ['user' => $name]);
        return $token;
    }

    public static function cookieName(): string { return self::COOKIE; }
    public static function ttl(): int { return self::TTL; }

    public function current(): ?array
    {
        $t = $_COOKIE[self::COOKIE] ?? '';
        if (!is_string($t) || !preg_match('/^[a-f0-9]{64}$/', $t)) return null;
        $f = $this->sessions . '/' . hash('sha256', $t) . '.json';
        if (is_link($f)) return null;
        $s = is_file($f) ? json_decode((string)@file_get_contents($f), true) : null;
        if (!is_array($s) || !isset($s['user'], $s['exp']) ||
            !is_string($s['user']) || !self::validName($s['user']) ||
            !is_int($s['exp']) || $s['exp'] < time()) {
            if (is_file($f) && !is_link($f)) @unlink($f);
            return null;
        }
        $u = $this->load();
        if (!isset($u[$s['user']]['role']) || !in_array($u[$s['user']]['role'], ['admin', 'user'], true)) return null;
        return ['name' => $s['user'], 'role' => $u[$s['user']]['role']];
    }

    public function logout(): void
    {
        $t = $_COOKIE[self::COOKIE] ?? '';
        if (is_string($t) && preg_match('/^[a-f0-9]{64}$/', $t)) {
            $f = $this->sessions . '/' . hash('sha256', $t) . '.json';
            if (!is_link($f)) @unlink($f);
        }
    }
}
