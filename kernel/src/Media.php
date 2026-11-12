<?php
declare(strict_types=1);
namespace Weed;

/**
 * Service média du Kernel (v1.0.2) : FFmpeg et FFprobe fournis par le système.
 *
 * Les Programmes n'appellent jamais FFmpeg eux-mêmes : ils demandent une opération au Kernel
 * (media.probe, media.convert, media.render…). Le Kernel :
 *  - ne manipule que des fichiers du dossier personnel (via le Vfs, jamais de chemin réel côté Programme) ;
 *  - construit lui-même la ligne de commande (tableau d'arguments, jamais de shell, jamais d'option libre) ;
 *  - limite les protocoles FFmpeg à « file,pipe » (pas de réseau, pas de playlist qui lit d'autres fichiers) ;
 *  - exécute les longs traitements en tâches d'arrière-plan suivies (progression, annulation).
 */
final class Media
{
    public const MAX_RUNNING = 2;               // tâches simultanées sur tout le système
    public const MAX_CLIPS = 64;
    public const MAX_JOB_SECONDS = 21600;       // 6 h par tâche
    public const MAX_OUTPUT_BYTES = 4294967296; // 4 Gio par fichier produit
    private const STALE_SECONDS = 90;           // une tâche « running » sans signe de vie depuis 90 s est considérée interrompue
    private const JOB_TTL = 604800;             // les fiches de tâches sont purgées après 7 jours
    private const GIF_MAX_SECONDS = 30.0;

    /** Formats de sortie proposés aux Programmes. {crf} est remplacé selon la qualité demandée. */
    private const FORMATS = [
        'mp4'      => ['ext' => 'mp4',  'mux' => 'mp4',      'kind' => 'video', 'label' => 'MP4 (H.264 + AAC)',
                       'enc' => ['libx264', 'aac'],
                       'v' => ['-c:v', 'libx264', '-preset', 'medium', '-crf', '{crf}', '-pix_fmt', 'yuv420p'],
                       'a' => ['-c:a', 'aac', '-b:a', '160k'], 'x' => ['-movflags', '+faststart'], 'crf' => [28, 23, 18]],
        'mp4-h265' => ['ext' => 'mp4',  'mux' => 'mp4',      'kind' => 'video', 'label' => 'MP4 (H.265/HEVC + AAC)',
                       'enc' => ['libx265', 'aac'],
                       'v' => ['-c:v', 'libx265', '-preset', 'medium', '-crf', '{crf}', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-x265-params', 'log-level=error'],
                       'a' => ['-c:a', 'aac', '-b:a', '160k'], 'x' => ['-movflags', '+faststart'], 'crf' => [32, 28, 23]],
        'webm'     => ['ext' => 'webm', 'mux' => 'webm',     'kind' => 'video', 'label' => 'WebM (VP9 + Opus)',
                       'enc' => ['libvpx-vp9', 'libopus'],
                       'v' => ['-c:v', 'libvpx-vp9', '-crf', '{crf}', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p'],
                       'a' => ['-c:a', 'libopus', '-b:a', '128k'], 'x' => [], 'crf' => [38, 32, 26]],
        'mkv'      => ['ext' => 'mkv',  'mux' => 'matroska', 'kind' => 'video', 'label' => 'Matroska (H.264 + AAC)',
                       'enc' => ['libx264', 'aac'],
                       'v' => ['-c:v', 'libx264', '-preset', 'medium', '-crf', '{crf}', '-pix_fmt', 'yuv420p'],
                       'a' => ['-c:a', 'aac', '-b:a', '160k'], 'x' => [], 'crf' => [28, 23, 18]],
        'gif'      => ['ext' => 'gif',  'mux' => 'gif',      'kind' => 'gif',   'label' => 'GIF animé', 'enc' => ['gif']],
        'mp3'      => ['ext' => 'mp3',  'mux' => 'mp3',      'kind' => 'audio', 'label' => 'MP3',
                       'enc' => ['libmp3lame'], 'a' => ['-c:a', 'libmp3lame', '-b:a', '192k']],
        'm4a'      => ['ext' => 'm4a',  'mux' => 'mp4',      'kind' => 'audio', 'label' => 'AAC (M4A)',
                       'enc' => ['aac'], 'a' => ['-c:a', 'aac', '-b:a', '192k']],
        'opus'     => ['ext' => 'opus', 'mux' => 'opus',     'kind' => 'audio', 'label' => 'Opus',
                       'enc' => ['libopus'], 'a' => ['-c:a', 'libopus', '-b:a', '128k']],
        'ogg'      => ['ext' => 'ogg',  'mux' => 'ogg',      'kind' => 'audio', 'label' => 'Ogg Vorbis',
                       'enc' => ['libvorbis'], 'a' => ['-c:a', 'libvorbis', '-q:a', '5'], 'noBitrate' => true],
        'flac'     => ['ext' => 'flac', 'mux' => 'flac',     'kind' => 'audio', 'label' => 'FLAC (sans perte)',
                       'enc' => ['flac'], 'a' => ['-c:a', 'flac'], 'noBitrate' => true],
        'wav'      => ['ext' => 'wav',  'mux' => 'wav',      'kind' => 'audio', 'label' => 'WAV (PCM 16 bits)',
                       'enc' => ['pcm_s16le'], 'a' => ['-c:a', 'pcm_s16le'], 'noBitrate' => true],
    ];

    /** Découpe sans ré-encodage : extension du fichier source => muxer FFmpeg. */
    private const COPY_MUX = ['mp4' => 'mp4', 'm4v' => 'mp4', 'm4a' => 'mp4', 'mov' => 'mov', 'mkv' => 'matroska', 'webm' => 'webm',
        'mp3' => 'mp3', 'ogg' => 'ogg', 'opus' => 'opus', 'flac' => 'flac', 'wav' => 'wav'];

    private const STREAM_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus',
        'mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv'];

    private static ?array $encoderCache = null;
    private static ?array $versionCache = null;

    /* ------------------------------------------------------------------ binaires et état */

    private static function find(string $name): ?string
    {
        $env = getenv('WEED_' . strtoupper($name));
        $dirs = ['/usr/bin', '/usr/local/bin', '/bin', '/opt/ffmpeg/bin'];
        $candidates = [];
        if (is_string($env) && $env !== '' && $env[0] === '/') $candidates[] = $env;
        foreach ($dirs as $d) $candidates[] = $d . '/' . $name;
        foreach ($candidates as $c) if (is_file($c) && is_executable($c)) return $c;
        return null;
    }

    private static function bin(string $name): string
    {
        $p = self::find($name);
        if ($p === null) throw new \RuntimeException('FFmpeg est absent du système (' . $name . ' introuvable)');
        return $p;
    }

    /** Détection sans exécuter de commande (utilisable par le diagnostic en lecture seule). */
    public static function available(): bool
    {
        return self::find('ffmpeg') !== null && self::find('ffprobe') !== null && is_executable('/bin/sh');
    }

    public static function status(): array
    {
        if (!self::available()) {
            return ['available' => false, 'reason' => is_executable('/bin/sh') ? 'FFmpeg/FFprobe absents du système' : 'plate-forme non prise en charge (Linux requis)',
                'formats' => [], 'limits' => self::limits()];
        }
        if (self::$versionCache === null) {
            $r = self::exec([self::bin('ffmpeg'), '-hide_banner', '-version'], 10, 65536);
            $first = strtok($r['out'], "\n") ?: '';
            $license = 'LGPL';
            if (str_contains($r['out'], '--enable-nonfree')) $license = 'nonfree';
            elseif (str_contains($r['out'], '--enable-gpl')) $license = 'GPL';
            self::$versionCache = ['version' => trim(substr($first, 0, 200)), 'license' => $license];
        }
        $enc = self::encoders();
        $formats = [];
        foreach (self::FORMATS as $key => $f) {
            $ok = true;
            foreach ($f['enc'] as $e) if (!isset($enc[$e])) $ok = false;
            $formats[] = ['id' => $key, 'ext' => $f['ext'], 'kind' => $f['kind'], 'label' => $f['label'], 'available' => $ok];
        }
        return ['available' => true, 'version' => self::$versionCache['version'], 'license' => self::$versionCache['license'],
            'formats' => $formats, 'limits' => self::limits()];
    }

    private static function limits(): array
    {
        return ['max_running' => self::MAX_RUNNING, 'max_clips' => self::MAX_CLIPS, 'max_job_seconds' => self::MAX_JOB_SECONDS,
            'max_output_bytes' => self::MAX_OUTPUT_BYTES, 'gif_max_seconds' => self::GIF_MAX_SECONDS];
    }

    private static function encoders(): array
    {
        if (self::$encoderCache !== null) return self::$encoderCache;
        $set = [];
        $r = self::exec([self::bin('ffmpeg'), '-hide_banner', '-encoders'], 15, 524288);
        foreach (explode("\n", $r['out']) as $line) {
            if (preg_match('/^\s[VAS][A-Z.]{5}\s+([A-Za-z0-9_.-]+)\s/', $line, $m)) $set[$m[1]] = true;
        }
        return self::$encoderCache = $set;
    }

    private static function needFormat(string $key, ?string $kind = null): array
    {
        $key = strtolower($key);
        if (!isset(self::FORMATS[$key])) throw new \RuntimeException('format de sortie inconnu : ' . substr(preg_replace('/[^A-Za-z0-9_-]/', '', $key) ?? '', 0, 20));
        $f = self::FORMATS[$key];
        if ($kind !== null && $f['kind'] !== $kind) throw new \RuntimeException('format « ' . $key . ' » non adapté à cette opération');
        $enc = self::encoders();
        foreach ($f['enc'] as $e) if (!isset($enc[$e])) throw new \RuntimeException('encodeur indisponible dans ce FFmpeg : ' . $e);
        $f['key'] = $key;
        return $f;
    }

    /* ------------------------------------------------------------------ exécution synchrone (probe, miniatures) */

    /** @return array{code:int,out:string,err:string} */
    private static function exec(array $cmd, int $timeout, int $maxOut): array
    {
        $env = ['PATH' => getenv('PATH') ?: '/usr/bin:/bin', 'LC_ALL' => 'C', 'HOME' => '/nonexistent'];
        $proc = @proc_open($cmd, [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env, ['bypass_shell' => true]);
        if (!is_resource($proc)) throw new \RuntimeException('impossible de démarrer FFmpeg');
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $out = ''; $err = ''; $deadline = microtime(true) + $timeout; $code = -1;
        try {
            while (true) {
                $st = proc_get_status($proc);
                $c1 = stream_get_contents($pipes[1]); if (is_string($c1) && $c1 !== '') $out .= $c1;
                $c2 = stream_get_contents($pipes[2]); if (is_string($c2) && $c2 !== '') $err .= $c2;
                if (strlen($out) > $maxOut) { proc_terminate($proc, 9); throw new \RuntimeException('sortie FFmpeg trop volumineuse'); }
                if (strlen($err) > 65536) $err = substr($err, -65536);
                if (!$st['running']) { $code = (int)$st['exitcode']; break; }
                if (microtime(true) >= $deadline) { proc_terminate($proc, 9); throw new \RuntimeException('délai FFmpeg dépassé'); }
                usleep(5000);
            }
            $c1 = stream_get_contents($pipes[1]); if (is_string($c1)) $out .= $c1;
            $c2 = stream_get_contents($pipes[2]); if (is_string($c2)) $err .= $c2;
        } finally {
            foreach ($pipes as $p) if (is_resource($p)) fclose($p);
            proc_close($proc);
        }
        return ['code' => $code, 'out' => $out, 'err' => $err];
    }

    private static function clean(string $text, ?string $user = null): string
    {
        $text = (string)preg_replace('/[^\P{C}\n]+/u', '', $text);
        $root = (realpath(WEED_DATA) ?: WEED_DATA) . '/home';
        $text = str_replace([$root . '/' . (string)$user . '/', $root . '/', WEED_DATA . '/'], ['/', '/', '/'], $text);
        $text = str_replace('file:', '', $text);
        return trim(substr($text, -600));
    }

    /* ------------------------------------------------------------------ validations */

    private static function num(mixed $v, float $min, float $max, string $label): ?float
    {
        if ($v === null || $v === '') return null;
        if (is_bool($v) || !is_numeric($v)) throw new \RuntimeException($label . ' invalide');
        $f = (float)$v;
        if (!is_finite($f) || $f < $min || $f > $max) throw new \RuntimeException($label . ' hors limites');
        return $f;
    }

    private static function sec(float $f): string
    {
        $s = rtrim(sprintf('%.3F', $f), '0');
        return rtrim($s, '.') === '' ? '0' : rtrim($s, '.');
    }

    private static function flag(mixed $v): bool
    {
        return $v === true || $v === 1 || $v === '1' || $v === 'true';
    }

    private static function quality(mixed $v): int
    {
        $q = strtolower((string)($v ?? 'medium'));
        return match ($q) { 'low' => 0, 'medium', '' => 1, 'high' => 2, default => throw new \RuntimeException('qualité invalide (low, medium, high)') };
    }

    /* ------------------------------------------------------------------ probe */

    public static function probe(Vfs $vfs, string $path): array
    {
        $full = $vfs->resolve($path);
        $info = self::probeFull($full);
        $info['path'] = $vfs->norm($path);
        return $info;
    }

    private static function probeFull(string $full): array
    {
        $r = self::exec([self::bin('ffprobe'), '-v', 'error', '-protocol_whitelist', 'file,pipe', '-print_format', 'json', '-show_format', '-show_streams',
            '-i', 'file:' . $full], 30, 1048576);
        $j = json_decode($r['out'], true);
        if ($r['code'] !== 0 || !is_array($j)) throw new \RuntimeException('fichier média illisible : ' . (self::clean($r['err']) ?: 'format non reconnu'));
        $streams = []; $maxDur = 0.0;
        foreach (is_array($j['streams'] ?? null) ? $j['streams'] : [] as $s) {
            if (!is_array($s)) continue;
            $type = (string)($s['codec_type'] ?? '');
            if (!in_array($type, ['video', 'audio', 'subtitle'], true)) continue;
            $it = ['index' => (int)($s['index'] ?? 0), 'type' => $type, 'codec' => substr((string)($s['codec_name'] ?? ''), 0, 40)];
            if (isset($s['bit_rate']) && is_numeric($s['bit_rate'])) $it['bit_rate'] = (int)$s['bit_rate'];
            if ($type === 'video') {
                $it['width'] = (int)($s['width'] ?? 0); $it['height'] = (int)($s['height'] ?? 0);
                $it['cover'] = !empty($s['disposition']['attached_pic']);
                $fps = 0.0;
                if (preg_match('#^(\d+)/(\d+)$#', (string)($s['avg_frame_rate'] ?? ''), $m) && (int)$m[2] > 0) $fps = (int)$m[1] / (int)$m[2];
                $it['fps'] = round($fps, 3);
            } elseif ($type === 'audio') {
                $it['channels'] = (int)($s['channels'] ?? 0);
                $it['sample_rate'] = (int)($s['sample_rate'] ?? 0);
            }
            if (isset($s['duration']) && is_numeric($s['duration'])) $maxDur = max($maxDur, (float)$s['duration']);
            $streams[] = $it;
        }
        $fmt = is_array($j['format'] ?? null) ? $j['format'] : [];
        $dur = isset($fmt['duration']) && is_numeric($fmt['duration']) ? (float)$fmt['duration'] : ($maxDur > 0 ? $maxDur : null);
        $hasVideo = false; $hasAudio = false;
        foreach ($streams as $s) {
            if ($s['type'] === 'video' && empty($s['cover'])) $hasVideo = true;
            if ($s['type'] === 'audio') $hasAudio = true;
        }
        return ['duration' => $dur !== null ? round($dur, 3) : null, 'size' => (int)($fmt['size'] ?? filesize($full)),
            'container' => substr((string)($fmt['format_name'] ?? ''), 0, 60), 'bit_rate' => isset($fmt['bit_rate']) ? (int)$fmt['bit_rate'] : null,
            'has_video' => $hasVideo, 'has_audio' => $hasAudio, 'streams' => $streams];
    }

    private static function streamIndex(array $info, string $type): ?int
    {
        foreach ($info['streams'] as $s) {
            if ($s['type'] === $type && ($type !== 'video' || empty($s['cover']))) return (int)$s['index'];
        }
        return null;
    }

    /* ------------------------------------------------------------------ chemins de sortie */

    /** @return array{0:string,1:string} [chemin virtuel, chemin réel] */
    private static function outputPath(Vfs $vfs, mixed $out, string $refVPath, string $ext, bool $overwrite, string $suffix = ''): array
    {
        if ($out === null || $out === '') {
            $dir = dirname($vfs->norm($refVPath)); if ($dir === '.' || $dir === '') $dir = '/';
            $base = pathinfo($refVPath, PATHINFO_FILENAME) . $suffix;
            for ($i = 0; $i < 100; $i++) {
                $name = $base . ($i === 0 ? '' : '-' . $i) . '.' . $ext;
                [$v, $full] = $vfs->resolveNew(($dir === '/' ? '' : $dir) . '/' . $name);
                if (!file_exists($full)) return [$v, $full];
            }
            throw new \RuntimeException('impossible de trouver un nom de sortie libre');
        }
        if (!is_string($out)) throw new \RuntimeException('chemin de sortie invalide');
        [$v, $full] = $vfs->resolveNew($out);
        if (!Vfs::validFileName(basename($v))) throw new \RuntimeException('nom de fichier de sortie invalide');
        if (strtolower(pathinfo($v, PATHINFO_EXTENSION)) !== $ext) throw new \RuntimeException('le fichier de sortie doit se terminer par .' . $ext);
        if (file_exists($full) && !$overwrite) throw new \RuntimeException('le fichier de sortie existe déjà (overwrite:true pour le remplacer)');
        return [$v, $full];
    }

    private static function distinct(string $in, string $out): void
    {
        if ($in === $out) throw new \RuntimeException('la sortie ne peut pas remplacer le fichier source');
    }

    /* ------------------------------------------------------------------ construction des commandes */

    private static function base(bool $progress = true): array
    {
        $c = [self::bin('ffmpeg'), '-hide_banner', '-nostdin', '-nostats', '-loglevel', 'error'];
        if ($progress) { $c[] = '-progress'; $c[] = 'pipe:1'; }
        $c[] = '-y';
        return $c;
    }

    private static function encodeArgs(array $f, int $q, array $a): array
    {
        $out = [];
        foreach ($f['v'] ?? [] as $t) $out[] = $t === '{crf}' ? (string)$f['crf'][$q] : $t;
        $audio = $f['a'] ?? [];
        $kbps = self::num($a['audio_kbps'] ?? null, 32, 512, 'audio_kbps');
        if ($kbps !== null && empty($f['noBitrate'])) {
            for ($i = 0; $i < count($audio); $i++) if ($audio[$i] === '-b:a') $audio[$i + 1] = (string)(int)$kbps . 'k';
        }
        foreach ($audio as $t) $out[] = $t;
        foreach ($f['x'] ?? [] as $t) $out[] = $t;
        return $out;
    }

    /* ------------------------------------------------------------------ opérations asynchrones */

    public static function convert(Vfs $vfs, string $user, ?string $app, array $a): array
    {
        $f = self::needFormat((string)($a['format'] ?? ''));
        if ($f['kind'] === 'gif') return self::gif($vfs, $user, $app, $a, $f);
        $inV = $vfs->norm((string)($a['path'] ?? ''));
        $inFull = $vfs->resolve($inV);
        $info = self::probeFull($inFull);
        $vi = self::streamIndex($info, 'video'); $ai = self::streamIndex($info, 'audio');
        if ($f['kind'] === 'video' && $vi === null) throw new \RuntimeException('cette source ne contient pas de vidéo : choisissez un format audio');
        if ($f['kind'] === 'audio' && $ai === null) throw new \RuntimeException('cette source ne contient pas de piste audio');

        $dur = $info['duration'];
        $start = self::num($a['start'] ?? null, 0, 360000, 'start');
        $end = self::num($a['end'] ?? null, 0, 360000, 'end');
        if ($start !== null && $dur !== null && $start >= $dur) throw new \RuntimeException('start dépasse la durée du média');
        if ($end !== null && $start !== null && $end <= $start) throw new \RuntimeException('end doit être supérieur à start');
        if ($end !== null && $end <= 0) throw new \RuntimeException('end invalide');
        $length = null;
        if ($end !== null) $length = $end - ($start ?? 0.0);
        elseif ($dur !== null) $length = $dur - ($start ?? 0.0);
        if ($length !== null && $dur !== null) $length = min($length, $dur - ($start ?? 0.0));

        $overwrite = self::flag($a['overwrite'] ?? false);
        [$outV, $outFull] = self::outputPath($vfs, $a['output'] ?? null, $inV, $f['ext'], $overwrite);
        self::distinct($inFull, $outFull);
        $q = self::quality($a['quality'] ?? null);

        $cmd = self::base();
        if ($start !== null && $start > 0) { $cmd[] = '-ss'; $cmd[] = self::sec($start); }
        array_push($cmd, '-protocol_whitelist', 'file,pipe', '-i', 'file:' . $inFull);
        if ($end !== null) { $cmd[] = '-t'; $cmd[] = self::sec($length ?? ($end - ($start ?? 0.0))); }
        if ($f['kind'] === 'video') {
            array_push($cmd, '-map', '0:' . $vi);
            if ($ai !== null && !self::flag($a['mute'] ?? false)) array_push($cmd, '-map', '0:' . $ai);
            $vf = [];
            $h = self::num($a['height'] ?? null, 16, 4320, 'height');
            if ($h !== null) $vf[] = "scale=-2:'min(" . (int)$h . ",ih)'";
            $fps = self::num($a['fps'] ?? null, 1, 120, 'fps');
            if ($fps !== null) $vf[] = 'fps=' . self::sec($fps);
            if ($vf) array_push($cmd, '-vf', implode(',', $vf));
        } else {
            array_push($cmd, '-map', '0:' . $ai, '-vn');
        }
        array_push($cmd, '-sn', '-dn');
        foreach (self::encodeArgs($f, $q, $a) as $t) $cmd[] = $t;
        if ($f['kind'] === 'video' && self::flag($a['mute'] ?? false)) $cmd[] = '-an';
        array_push($cmd, '-fs', (string)self::MAX_OUTPUT_BYTES, '-f', $f['mux'], 'file:' . $outFull . '.weedpart');

        return self::startJob($user, $app, $f['kind'] === 'audio' ? 'extract_audio' : 'convert', $cmd, [$inV], $outV, $outFull, $length, $overwrite);
    }

    public static function extractAudio(Vfs $vfs, string $user, ?string $app, array $a): array
    {
        $a['format'] = $a['format'] ?? 'mp3';
        self::needFormat((string)$a['format'], 'audio');
        return self::convert($vfs, $user, $app, $a);
    }

    private static function gif(Vfs $vfs, string $user, ?string $app, array $a, array $f): array
    {
        $inV = $vfs->norm((string)($a['path'] ?? ''));
        $inFull = $vfs->resolve($inV);
        $info = self::probeFull($inFull);
        $vi = self::streamIndex($info, 'video');
        if ($vi === null) throw new \RuntimeException('cette source ne contient pas de vidéo');
        $dur = $info['duration'];
        $start = self::num($a['start'] ?? null, 0, 360000, 'start') ?? 0.0;
        $end = self::num($a['end'] ?? null, 0, 360000, 'end');
        $length = ($end !== null ? $end : ($dur ?? 0.0)) - $start;
        if ($length <= 0) throw new \RuntimeException('intervalle invalide');
        if ($length > self::GIF_MAX_SECONDS) throw new \RuntimeException('GIF limité à ' . (int)self::GIF_MAX_SECONDS . ' s : indiquez start et end');
        $h = (int)(self::num($a['height'] ?? null, 16, 1080, 'height') ?? 360);
        $fps = self::num($a['fps'] ?? null, 1, 30, 'fps') ?? 12.0;
        $overwrite = self::flag($a['overwrite'] ?? false);
        [$outV, $outFull] = self::outputPath($vfs, $a['output'] ?? null, $inV, 'gif', $overwrite);
        self::distinct($inFull, $outFull);
        $cmd = self::base();
        if ($start > 0) { $cmd[] = '-ss'; $cmd[] = self::sec($start); }
        array_push($cmd, '-protocol_whitelist', 'file,pipe', '-i', 'file:' . $inFull, '-t', self::sec($length),
            '-filter_complex', '[0:' . $vi . ']fps=' . self::sec($fps) . ',scale=-2:' . $h . ':flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse[g]',
            '-map', '[g]', '-an', '-fs', (string)self::MAX_OUTPUT_BYTES, '-f', 'gif', 'file:' . $outFull . '.weedpart');
        return self::startJob($user, $app, 'convert', $cmd, [$inV], $outV, $outFull, $length, $overwrite);
    }

    /** Découpe rapide sans ré-encodage (coupe sur les images clés). Pour une coupe à l'image près : media.convert avec start/end. */
    public static function trim(Vfs $vfs, string $user, ?string $app, array $a): array
    {
        $inV = $vfs->norm((string)($a['path'] ?? ''));
        $inFull = $vfs->resolve($inV);
        $ext = strtolower(pathinfo($inV, PATHINFO_EXTENSION));
        if (!isset(self::COPY_MUX[$ext])) throw new \RuntimeException('découpe rapide non disponible pour .' . substr(preg_replace('/[^A-Za-z0-9]/', '', $ext) ?? '', 0, 8));
        $info = self::probeFull($inFull);
        $start = self::num($a['start'] ?? null, 0, 360000, 'start') ?? 0.0;
        $end = self::num($a['end'] ?? null, 0, 360000, 'end');
        $dur = $info['duration'];
        if ($end === null && $dur === null) throw new \RuntimeException('end est requis (durée inconnue)');
        $end = $end ?? $dur;
        if ($dur !== null) $end = min($end, $dur);
        if ($end <= $start) throw new \RuntimeException('intervalle invalide');
        $length = $end - $start;
        $overwrite = self::flag($a['overwrite'] ?? false);
        [$outV, $outFull] = self::outputPath($vfs, $a['output'] ?? null, $inV, $ext, $overwrite, '-cut');
        self::distinct($inFull, $outFull);
        $cmd = self::base();
        if ($start > 0) { $cmd[] = '-ss'; $cmd[] = self::sec($start); }
        array_push($cmd, '-protocol_whitelist', 'file,pipe', '-i', 'file:' . $inFull, '-t', self::sec($length),
            '-map', '0:v?', '-map', '0:a?', '-sn', '-dn', '-c', 'copy', '-avoid_negative_ts', 'make_zero',
            '-fs', (string)self::MAX_OUTPUT_BYTES, '-f', self::COPY_MUX[$ext], 'file:' . $outFull . '.weedpart');
        return self::startJob($user, $app, 'trim', $cmd, [$inV], $outV, $outFull, $length, $overwrite);
    }

    /** concat = render de fichiers entiers. */
    public static function concat(Vfs $vfs, string $user, ?string $app, array $a): array
    {
        $paths = $a['inputs'] ?? null;
        if (!is_array($paths) || count($paths) < 2) throw new \RuntimeException('inputs : au moins deux fichiers');
        $a['clips'] = array_map(static fn($p) => ['path' => $p], array_values($paths));
        unset($a['inputs']);
        return self::render($vfs, $user, $app, $a);
    }

    /**
     * Montage : assemble des extraits (clips) en une vidéo.
     * clips: [{path, start?, end?, volume?}], width?, height?, fps?, format? (mp4 par défaut), quality?, output?
     * Toutes les sources sont normalisées (taille, cadence, audio stéréo 48 kHz) ; une source sans audio reçoit du silence.
     */
    public static function render(Vfs $vfs, string $user, ?string $app, array $a): array
    {
        $f = self::needFormat((string)($a['format'] ?? 'mp4'), 'video');
        $clips = $a['clips'] ?? null;
        if (!is_array($clips) || count($clips) < 1 || count($clips) > self::MAX_CLIPS) throw new \RuntimeException('clips : entre 1 et ' . self::MAX_CLIPS . ' extraits');
        $items = []; $cache = []; $total = 0.0; $vpaths = [];
        foreach (array_values($clips) as $i => $c) {
            if (is_string($c)) $c = ['path' => $c];
            if (!is_array($c)) throw new \RuntimeException('clip ' . ($i + 1) . ' invalide');
            $v = $vfs->norm((string)($c['path'] ?? ''));
            $full = $vfs->resolve($v);
            $info = $cache[$full] ??= self::probeFull($full);
            $vi = self::streamIndex($info, 'video');
            if ($vi === null) throw new \RuntimeException('le clip ' . ($i + 1) . ' ne contient pas de vidéo');
            $ai = self::streamIndex($info, 'audio');
            $dur = $info['duration'];
            $start = self::num($c['start'] ?? null, 0, 360000, 'start') ?? 0.0;
            $end = self::num($c['end'] ?? null, 0, 360000, 'end');
            if ($end === null) {
                if ($dur === null) throw new \RuntimeException('le clip ' . ($i + 1) . ' : end requis (durée inconnue)');
                $end = $dur;
            }
            if ($dur !== null) { if ($start >= $dur) throw new \RuntimeException('le clip ' . ($i + 1) . ' : start dépasse la durée'); $end = min($end, $dur); }
            if ($end <= $start) throw new \RuntimeException('le clip ' . ($i + 1) . ' : intervalle invalide');
            $vol = self::num($c['volume'] ?? null, 0, 4, 'volume') ?? 1.0;
            $items[] = ['full' => $full, 'vi' => $vi, 'ai' => $ai, 'start' => $start, 'end' => $end, 'len' => $end - $start, 'vol' => $vol];
            $vpaths[] = $v; $total += $end - $start;
        }
        $first = $cache[$items[0]['full']];
        $fv = null;
        foreach ($first['streams'] as $s) if ($s['type'] === 'video' && empty($s['cover'])) { $fv = $s; break; }
        $w = (int)(self::num($a['width'] ?? null, 16, 7680, 'width') ?? ($fv['width'] ?? 1280));
        $h = (int)(self::num($a['height'] ?? null, 16, 4320, 'height') ?? ($fv['height'] ?? 720));
        $w -= $w % 2; $h -= $h % 2;
        if ($w < 16 || $h < 16) { $w = 1280; $h = 720; }
        $fpsDefault = ($fv['fps'] ?? 0) > 0 ? min(60.0, round((float)$fv['fps'])) : 30.0;
        $fps = self::num($a['fps'] ?? null, 1, 120, 'fps') ?? $fpsDefault;

        $overwrite = self::flag($a['overwrite'] ?? false);
        [$outV, $outFull] = self::outputPath($vfs, $a['output'] ?? null, $vpaths[0], $f['ext'], $overwrite, '-montage');
        foreach ($items as $it) self::distinct($it['full'], $outFull);
        $q = self::quality($a['quality'] ?? null);

        $cmd = self::base();
        foreach ($items as $it) array_push($cmd, '-protocol_whitelist', 'file,pipe', '-i', 'file:' . $it['full']);
        $n = count($items); $silent = $n; $graph = [];
        foreach ($items as $i => $it) {
            $trim = 'start=' . self::sec($it['start']) . ':end=' . self::sec($it['end']);
            $graph[] = '[' . $i . ':' . $it['vi'] . ']trim=' . $trim . ',setpts=PTS-STARTPTS,scale=' . $w . ':' . $h
                . ':force_original_aspect_ratio=decrease,pad=' . $w . ':' . $h . ':(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=' . self::sec($fps) . ',format=yuv420p[v' . $i . ']';
            $vol = $it['vol'] === 1.0 ? '' : 'volume=' . self::sec($it['vol']) . ',';
            $fmtA = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
            if ($it['ai'] !== null) {
                $graph[] = '[' . $i . ':' . $it['ai'] . ']atrim=' . $trim . ',asetpts=PTS-STARTPTS,' . $vol . $fmtA . '[a' . $i . ']';
            } else {
                array_push($cmd, '-f', 'lavfi', '-t', self::sec($it['len']), '-i', 'anullsrc=r=48000:cl=stereo');
                $graph[] = '[' . $silent . ':0]asetpts=PTS-STARTPTS,' . $fmtA . '[a' . $i . ']';
                $silent++;
            }
        }
        $pairs = '';
        for ($i = 0; $i < $n; $i++) $pairs .= '[v' . $i . '][a' . $i . ']';
        $graph[] = $pairs . 'concat=n=' . $n . ':v=1:a=1[outv][outa]';
        array_push($cmd, '-filter_complex', implode(';', $graph), '-map', '[outv]', '-map', '[outa]', '-sn', '-dn');
        foreach (self::encodeArgs($f, $q, $a) as $t) $cmd[] = $t;
        array_push($cmd, '-fs', (string)self::MAX_OUTPUT_BYTES, '-f', $f['mux'], 'file:' . $outFull . '.weedpart');

        return self::startJob($user, $app, 'render', $cmd, $vpaths, $outV, $outFull, $total, $overwrite);
    }

    /* ------------------------------------------------------------------ miniatures (synchrone, rapide) */

    public static function thumbnail(Vfs $vfs, array $a): array
    {
        $inV = $vfs->norm((string)($a['path'] ?? ''));
        $inFull = $vfs->resolve($inV);
        $info = self::probeFull($inFull);
        $vi = self::streamIndex($info, 'video');
        if ($vi === null) throw new \RuntimeException('cette source ne contient pas de vidéo');
        $t = self::num($a['time'] ?? 0, 0, 360000, 'time') ?? 0.0;
        $w = (int)(self::num($a['width'] ?? null, 16, 3840, 'width') ?? 320);
        $type = strtolower((string)($a['type'] ?? 'jpg'));
        $enc = match ($type) {
            'jpg', 'jpeg' => ['ext' => 'jpg', 'vf' => ',format=yuvj420p', 'args' => ['-c:v', 'mjpeg', '-q:v', '4', '-f', 'image2', '-update', '1'], 'mime' => 'image/jpeg'],
            'png'         => ['ext' => 'png', 'vf' => '', 'args' => ['-c:v', 'png', '-f', 'image2', '-update', '1'], 'mime' => 'image/png'],
            'webp'        => ['ext' => 'webp', 'vf' => '', 'args' => ['-c:v', 'libwebp', '-f', 'webp'], 'mime' => 'image/webp'],
            default       => throw new \RuntimeException('type invalide (jpg, png, webp)'),
        };
        if ($enc['ext'] === 'webp' && !isset(self::encoders()['libwebp'])) throw new \RuntimeException('encodeur indisponible dans ce FFmpeg : libwebp');
        $toFile = isset($a['output']) && $a['output'] !== '' && $a['output'] !== null;
        if ($toFile) {
            [$outV, $outFull] = self::outputPath($vfs, $a['output'], $inV, $enc['ext'], self::flag($a['overwrite'] ?? false));
            $tmp = $outFull . '.weedpart';
        } else {
            $dir = WEED_DATA . '/var/media/tmp';
            if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new \RuntimeException('dossier temporaire média inaccessible');
            $tmp = $dir . '/' . bin2hex(random_bytes(8)) . '.part';
        }
        $cmd = self::base(false);
        array_push($cmd, '-ss', self::sec($t), '-protocol_whitelist', 'file,pipe', '-i', 'file:' . $inFull, '-map', '0:' . $vi, '-frames:v', '1',
            '-vf', 'scale=' . $w . ':-2' . $enc['vf']);
        foreach ($enc['args'] as $x) $cmd[] = $x;
        $cmd[] = 'file:' . $tmp;
        try {
            $r = self::exec($cmd, 30, 4096);
            if ($r['code'] !== 0 || !is_file($tmp) || filesize($tmp) === 0) {
                throw new \RuntimeException('miniature impossible' . ($r['code'] !== 0 ? ' : ' . self::clean($r['err']) : ' (position hors de la vidéo ?)'));
            }
            if ($toFile) {
                if (!@rename($tmp, $outFull)) throw new \RuntimeException('enregistrement de la miniature impossible');
                @chmod($outFull, 0600);
                return ['path' => $outV, 'size' => (int)filesize($outFull), 'mime' => $enc['mime']];
            }
            $bytes = (string)file_get_contents($tmp);
            return ['data_url' => 'data:' . $enc['mime'] . ';base64,' . base64_encode($bytes), 'size' => strlen($bytes), 'mime' => $enc['mime']];
        } finally {
            if (is_file($tmp)) @unlink($tmp);
        }
    }

    /* ------------------------------------------------------------------ lecture en flux (prévisualisation dans un Programme) */

    /** URL signée à durée limitée : un Programme isolé (sans cookie) peut lire un média via <video src> / <audio src>. */
    public static function url(string $user, string $path): array
    {
        $vfs = new Vfs($user);
        $v = $vfs->norm($path);
        $vfs->resolve($v);
        if (!in_array(strtolower(pathinfo($v, PATHINFO_EXTENSION)), self::STREAM_EXT, true)) throw new \RuntimeException('type de fichier non lisible en flux');
        $exp = time() + 3600;
        $payload = rtrim(strtr(base64_encode(json_encode(['u' => $user, 'p' => $v, 'e' => $exp], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        return ['url' => '/media-stream?t=' . $payload . '.' . Security::mac('media-stream:' . $payload), 'expires' => $exp];
    }

    /** @return array{u:string,p:string} */
    public static function verifyToken(string $token): array
    {
        if (!preg_match('/^([A-Za-z0-9_-]{10,2000})\.([a-f0-9]{64})$/', $token, $m)) throw new \RuntimeException('jeton invalide');
        if (!hash_equals(Security::mac('media-stream:' . $m[1]), $m[2])) throw new \RuntimeException('jeton invalide');
        $j = json_decode((string)base64_decode(strtr($m[1], '-_', '+/'), true), true);
        if (!is_array($j) || !is_string($j['u'] ?? null) || !is_string($j['p'] ?? null) || (int)($j['e'] ?? 0) < time()) throw new \RuntimeException('jeton expiré');
        return ['u' => $j['u'], 'p' => $j['p']];
    }

    /* ------------------------------------------------------------------ tâches */

    private static function jobDir(): string
    {
        $dir = WEED_DATA . '/var/media/jobs';
        if (is_link(WEED_DATA . '/var/media') || is_link($dir)) throw new \RuntimeException('dossier des tâches média non sécurisé');
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) throw new \RuntimeException('dossier des tâches média inaccessible');
        return $dir;
    }

    private static function writeJson(string $path, array $data): void
    {
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
        if (@file_put_contents($tmp, $json, LOCK_EX) !== strlen($json)) { @unlink($tmp); throw new \RuntimeException('écriture de la tâche média impossible'); }
        @chmod($tmp, 0600);
        if (!@rename($tmp, $path)) { @unlink($tmp); throw new \RuntimeException('publication de la tâche média impossible'); }
    }

    private static function readJson(string $path): ?array
    {
        if (is_link($path) || !is_file($path) || filesize($path) > 2097152) return null;
        $j = json_decode((string)@file_get_contents($path), true);
        return is_array($j) ? $j : null;
    }

    private static function validId(string $id): bool { return (bool)preg_match('/^[0-9a-f]{16}$/', $id); }

    /** État effectif : une tâche « en cours » sans signe de vie est marquée interrompue. */
    private static function effective(array $job): array
    {
        if (in_array($job['state'] ?? '', ['queued', 'running'], true) && time() - (int)($job['updated'] ?? 0) > self::STALE_SECONDS) {
            $job['state'] = 'failed';
            $job['error'] = $job['error'] ?: 'tâche interrompue (arrêt du système ou du processus de traitement)';
        }
        return $job;
    }

    private static function view(array $job): array
    {
        $total = (float)($job['total'] ?? 0); $out = (float)($job['out_time'] ?? 0);
        $progress = $job['state'] === 'done' ? 1.0 : ($total > 0 ? max(0.0, min(0.99, $out / $total)) : 0.0);
        $eta = null;
        $speed = isset($job['speed']) && is_numeric($job['speed']) ? (float)$job['speed'] : null;
        if ($job['state'] === 'running' && $speed !== null && $speed > 0 && $total > 0) $eta = (int)max(0, ($total - $out) / $speed);
        return ['id' => $job['id'], 'op' => $job['op'], 'state' => $job['state'], 'progress' => round($progress, 4), 'eta_seconds' => $eta, 'speed' => $speed,
            'input' => $job['input'] ?? [], 'output' => $job['output'] ?? null, 'error' => $job['error'] ?? null,
            'created' => (int)($job['created'] ?? 0), 'finished' => $job['finished'] ?? null];
    }

    private static function purge(string $dir): void
    {
        $now = time();
        foreach (glob($dir . '/*') ?: [] as $f) {
            if (is_file($f) && !is_link($f) && $now - (int)filemtime($f) > self::JOB_TTL) @unlink($f);
        }
    }

    private static function runningCount(string $dir, ?string $user = null): int
    {
        $n = 0;
        foreach (glob($dir . '/*.json') ?: [] as $f) {
            if (!preg_match('#/[0-9a-f]{16}\.json$#', $f)) continue;
            $j = self::readJson($f);
            if (!$j) continue;
            $j = self::effective($j);
            if (in_array($j['state'] ?? '', ['queued', 'running'], true) && ($user === null || ($j['user'] ?? '') === $user)) $n++;
        }
        return $n;
    }

    private static function startJob(string $user, ?string $app, string $op, array $cmd, array $inputs, string $outV, string $outFull, ?float $total, bool $overwrite): array
    {
        if (!self::available()) throw new \RuntimeException('FFmpeg est absent du système');
        $dir = self::jobDir();
        self::purge($dir);
        if (self::runningCount($dir) >= self::MAX_RUNNING) throw new \RuntimeException('trop de traitements média en cours (' . self::MAX_RUNNING . ' maximum) : réessayez dans un instant');
        $id = bin2hex(random_bytes(8));
        $now = time();
        $job = ['id' => $id, 'user' => $user, 'app' => $app, 'op' => $op, 'state' => 'queued', 'total' => $total ?? 0.0, 'out_time' => 0.0, 'speed' => null,
            'input' => $inputs, 'output' => $outV, 'error' => null, 'created' => $now, 'updated' => $now, 'started' => null, 'finished' => null];
        $spec = ['cmd' => $cmd, 'final' => $outFull, 'part' => $outFull . '.weedpart', 'overwrite' => $overwrite];
        self::writeJson($dir . '/' . $id . '.spec.json', $spec);
        self::writeJson($dir . '/' . $id . '.json', $job);

        $runner = WEED_ROOT . '/kernel/bin/media-runner.php';
        if (!is_file($runner) || is_link($runner)) throw new \RuntimeException('exécuteur média absent');
        // Détaché : le shell lance PHP en arrière-plan puis se termine aussitôt (le travail survit à la requête).
        $launch = ['/bin/sh', '-c', '"$0" "$@" >/dev/null 2>&1 </dev/null &', PHP_BINARY, '-d', 'display_errors=0', '-d', 'memory_limit=64M', $runner, $id];
        $env = ['WEED_ROOT' => WEED_ROOT, 'WEED_DATA' => WEED_DATA, 'PATH' => getenv('PATH') ?: '/usr/bin:/bin'];
        $proc = @proc_open($launch, [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes, WEED_ROOT, $env, ['bypass_shell' => true]);
        if (!is_resource($proc)) { @unlink($dir . '/' . $id . '.json'); @unlink($dir . '/' . $id . '.spec.json'); throw new \RuntimeException('impossible de lancer le traitement média'); }
        proc_close($proc);
        Log::write('MEDIA', 'job ' . $id . ' ' . $op . ' (' . $user . ($app ? '/' . $app : '') . ')');
        return self::view($job);
    }

    private static function loadOwned(string $user, ?string $app, string $id): array
    {
        if (!self::validId($id)) throw new \RuntimeException('identifiant de tâche invalide');
        $job = self::readJson(self::jobDir() . '/' . $id . '.json');
        if (!$job || ($job['user'] ?? '') !== $user || ($app !== null && ($job['app'] ?? null) !== $app)) throw new \RuntimeException('tâche introuvable');
        return self::effective($job);
    }

    public static function jobStatus(string $user, ?string $app, string $id): array
    {
        return self::view(self::loadOwned($user, $app, $id));
    }

    public static function jobList(string $user, ?string $app): array
    {
        $items = [];
        foreach (glob(self::jobDir() . '/*.json') ?: [] as $f) {
            if (!preg_match('#/[0-9a-f]{16}\.json$#', $f)) continue;
            $j = self::readJson($f);
            if (!$j || ($j['user'] ?? '') !== $user || ($app !== null && ($j['app'] ?? null) !== $app)) continue;
            $items[] = self::view(self::effective($j));
        }
        usort($items, static fn(array $a, array $b): int => $b['created'] <=> $a['created']);
        return ['items' => array_slice($items, 0, 100), 'count' => count($items)];
    }

    public static function jobCancel(string $user, ?string $app, string $id): array
    {
        $job = self::loadOwned($user, $app, $id);
        if (in_array($job['state'], ['queued', 'running'], true)) {
            @file_put_contents(self::jobDir() . '/' . $id . '.cancel', '1');
            Log::write('MEDIA', 'annulation job ' . $id);
        }
        return self::view($job);
    }

    /* ------------------------------------------------------------------ exécuteur (kernel/bin/media-runner.php) */

    public static function runJob(string $id): int
    {
        if (!self::validId($id)) return 2;
        $dir = self::jobDir();
        $jf = $dir . '/' . $id . '.json'; $sf = $dir . '/' . $id . '.spec.json'; $cf = $dir . '/' . $id . '.cancel';
        $job = self::readJson($jf); $spec = self::readJson($sf);
        if (!$job || !$spec || !is_array($spec['cmd'] ?? null) || !is_string($spec['part'] ?? null) || !is_string($spec['final'] ?? null)) return 2;
        $user = (string)($job['user'] ?? '');
        $part = $spec['part']; $final = $spec['final'];
        if (function_exists('proc_nice')) @proc_nice(10);

        $save = static function (array $j) use ($jf): void { $j['updated'] = time(); self::writeJson($jf, $j); };
        $fail = static function (string $msg, string $state = 'failed') use (&$job, $save, $part, $sf, $cf): int {
            if (is_file($part)) @unlink($part);
            $job['state'] = $state; $job['error'] = $msg; $job['finished'] = time();
            $save($job);
            @unlink($sf); @unlink($cf);
            return 1;
        };

        $job['state'] = 'running'; $job['started'] = time(); $job['pid'] = getmypid();
        $save($job);

        $env = ['PATH' => getenv('PATH') ?: '/usr/bin:/bin', 'LC_ALL' => 'C', 'HOME' => '/nonexistent'];
        $proc = @proc_open($spec['cmd'], [0 => ['file', '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, $env, ['bypass_shell' => true]);
        if (!is_resource($proc)) return $fail('impossible de démarrer FFmpeg');
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $buf = ''; $err = ''; $lastSave = 0.0; $deadline = microtime(true) + self::MAX_JOB_SECONDS; $exit = -1; $cancelled = false; $timedOut = false;
        while (true) {
            $st = proc_get_status($proc);
            $c1 = stream_get_contents($pipes[1]);
            if (is_string($c1) && $c1 !== '') {
                $buf .= $c1;
                while (($nl = strpos($buf, "\n")) !== false) {
                    $line = substr($buf, 0, $nl); $buf = substr($buf, $nl + 1);
                    if (preg_match('/^out_time_us=(\d+)$/', $line, $m)) $job['out_time'] = (int)$m[1] / 1000000;
                    elseif (preg_match('/^speed=\s*([0-9.]+)x/', $line, $m)) $job['speed'] = (float)$m[1];
                }
                if (strlen($buf) > 65536) $buf = '';
            }
            $c2 = stream_get_contents($pipes[2]);
            if (is_string($c2) && $c2 !== '') { $err .= $c2; if (strlen($err) > 8192) $err = substr($err, -8192); }
            if (!$st['running']) { $exit = (int)$st['exitcode']; break; }
            if (is_file($cf)) { $cancelled = true; proc_terminate($proc, 15); break; }
            if (microtime(true) >= $deadline) { $timedOut = true; proc_terminate($proc, 15); break; }
            if (microtime(true) - $lastSave >= 0.7) { $save($job); $lastSave = microtime(true); }
            usleep(20000);
        }
        if ($cancelled || $timedOut) {
            $wait = microtime(true) + 3;
            while (microtime(true) < $wait && proc_get_status($proc)['running']) usleep(50000);
            if (proc_get_status($proc)['running']) proc_terminate($proc, 9);
        }
        $t = stream_get_contents($pipes[2]); if (is_string($t)) $err .= $t;
        foreach ($pipes as $p) if (is_resource($p)) fclose($p);
        proc_close($proc);

        if ($cancelled) return $fail('annulée par l’utilisateur', 'cancelled');
        if ($timedOut) return $fail('durée maximale dépassée');
        if ($exit !== 0) return $fail(self::clean($err, $user) ?: 'échec de FFmpeg (code ' . $exit . ')');
        if (!is_file($part) || filesize($part) === 0) return $fail('aucun fichier produit');
        if (empty($spec['overwrite']) && file_exists($final)) return $fail('le fichier de sortie existe déjà');
        if (!@rename($part, $final)) return $fail('enregistrement du fichier de sortie impossible');
        @chmod($final, 0600);
        $job['state'] = 'done'; $job['out_time'] = $job['total']; $job['finished'] = time(); $job['error'] = null;
        $save($job);
        @unlink($sf); @unlink($cf);
        return 0;
    }
}
