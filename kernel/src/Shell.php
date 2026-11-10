<?php
declare(strict_types=1);
namespace Weed;

/** Shell intégré "wsh" : commandes internes uniquement (aucune exécution de commandes de l'hôte). */
final class Shell
{
    public function __construct(private Vfs $vfs, private Programs $pkg, private Syscalls $sys) {}

    private function abs(string $cwd, string $p): string
    {
        return $this->vfs->norm($p !== '' && $p[0] === '/' ? $p : $cwd . '/' . $p);
    }

    public function exec(string $line, string $cwd): array
    {
        $cwd = $this->vfs->norm($cwd);
        $argv = str_getcsv(trim($line), ' ', '"', '\\');
        $argv = array_values(array_filter($argv, fn($x) => $x !== null && $x !== ''));
        if (!$argv) return ['out' => '', 'cwd' => $cwd];
        $cmd = array_shift($argv);
        $out = '';
        try {
            switch ($cmd) {
                case 'help':
                    $out = "Commandes: help pwd ls cd cat echo mkdir touch rm write ps uname uptime neofetch whoami apps clear\n"
                         . "  apps list | apps on <id> | apps off <id> | apps rm <id>  (on/off/rm : admin)\n  write <fichier> <texte...>";
                    break;
                case 'pwd': $out = $cwd; break;
                case 'echo': $out = implode(' ', $argv); break;
                case 'ls':
                    $r = $this->vfs->list($this->abs($cwd, $argv[0] ?? '.'));
                    $out = implode("\n", array_map(fn($i) => ($i['dir'] ? $i['name'] . '/' : $i['name']), $r['items']));
                    break;
                case 'cd':
                    $t = $this->abs($cwd, $argv[0] ?? '/');
                    $this->vfs->list($t);
                    $cwd = $t;
                    break;
                case 'cat': $out = $this->vfs->read($this->abs($cwd, $argv[0] ?? '')); break;
                case 'mkdir': $this->vfs->mkdir($this->abs($cwd, $argv[0] ?? '')); break;
                case 'touch': $this->vfs->write($this->abs($cwd, $argv[0] ?? ''), ''); break;
                case 'write':
                    $f = array_shift($argv);
                    $this->vfs->write($this->abs($cwd, (string)$f), implode(' ', $argv) . "\n");
                    break;
                case 'rm': $this->vfs->remove($this->abs($cwd, $argv[0] ?? '')); break;
                case 'uname': $out = $this->sys->call('sys.info', [])['uname']; break;
                case 'uptime': $out = $this->sys->call('sys.info', [])['uptime'] . ' s'; break;
                case 'ps':
                    $out = sprintf("%-8s %-8s %-9s %s", 'PID', 'NOM', 'ETAT', 'UPTIME');
                    foreach ($this->sys->procs()['procs'] as $p) {
                        $out .= "\n" . sprintf("%-8s %-8s %-9s %ss", $p['pid'], $p['name'], $p['state'], $p['uptime']);
                    }
                    break;
                case 'neofetch':
                    $i = $this->sys->call('sys.info', []);
                    $out = "  Weed OS {$i['version']}\n  Kernel : Weed Kernel (PHP {$i['php']})\n  Hôte   : {$i['host']}\n  Base   : {$i['uname']}\n  Progr. : {$i['programs']}\n  Auteur : {$i['author']} (MIT)";
                    break;
                case 'apps':
                    $sub = $argv[0] ?? 'list';
                    if ($sub === 'list') {
                        foreach ($this->pkg->list() as $e) $out .= ($e['enabled'] ? '[on ] ' : '[off] ') . "{$e['id']} {$e['version']} - {$e['name']}\n";
                        $out = rtrim($out) ?: '(aucun programme)';
                    } elseif ($sub === 'on' || $sub === 'off') {
                        $this->sys->call($sub === 'on' ? 'prog.enable' : 'prog.disable', ['id' => $argv[1] ?? '']);
                    } elseif ($sub === 'rm') {
                        $this->sys->call('prog.remove', ['id' => $argv[1] ?? '']);
                    } else { $out = 'usage: apps list|on|off|rm'; }
                    break;
                case 'whoami': $out = $this->sys->call('sys.info', [])['user']['name']; break;
                case 'clear': $out = "\f"; break;
                default: $out = "wsh: commande inconnue: $cmd (tapez help)";
            }
        } catch (\Throwable $e) {
            $out = "wsh: $cmd: " . $e->getMessage();
        }
        return ['out' => $out, 'cwd' => $cwd];
    }
}
