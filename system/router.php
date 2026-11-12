<?php
declare(strict_types=1);
// Weed OS - routeur du serveur shell : authentification, API syscall, dépôt de Programmes, fichiers des Programmes.
define('WEED_ROOT', getenv('WEED_ROOT') ?: dirname(__DIR__));
require_once WEED_ROOT . '/kernel/autoload.php';

use Weed\{Auth, Vfs, Programs, Syscalls, Media};

$uri = rawurldecode((string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// En-têtes de sécurité communs. HSTS n'est envoyé que sur une connexion HTTPS.
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Permitted-Cross-Domain-Policies: none');
$isHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off');
if ($isHttps) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

function weed_json(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
}


// v0.8.7 — lecture d'un fichier du dossier personnel (images, audio, vidéo, PDF) avec support des plages (seek).
// v1.0.2 : /media-stream?t=<jeton signé> — même lecture en flux, pour les Programmes isolés (sans cookie) ; audio/vidéo/images seulement.
$isStream = ($uri === '/media-stream');
if (($uri === '/fs-file' || $isStream) && ($method === 'GET' || $method === 'HEAD')) {
    try {
        if ($isStream) {
            $tk = Media::verifyToken((string)($_GET['t'] ?? ''));
            $info = (new Vfs($tk['u']))->fileInfo($tk['p']);
        } else {
            $user = (new Auth())->current();
            if (!$user) { http_response_code(401); echo 'non connecté'; return true; }
            $info = (new Vfs($user['name']))->fileInfo((string)($_GET['path'] ?? ''));
        }
    } catch (Throwable $e) { http_response_code($isStream ? 403 : 404); echo $isStream ? 'refusé' : 'introuvable'; return true; }
    $ext = strtolower(pathinfo($info['name'], PATHINFO_EXTENSION));
    $media = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'bmp' => 'image/bmp', 'ico' => 'image/x-icon', 'avif' => 'image/avif',
        'mp3' => 'audio/mpeg', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'flac' => 'audio/flac', 'opus' => 'audio/ogg',
        'mp4' => 'video/mp4', 'm4v' => 'video/mp4', 'webm' => 'video/webm', 'ogv' => 'video/ogg', 'mov' => 'video/quicktime', 'mkv' => 'video/x-matroska',
        'pdf' => 'application/pdf'];
    $download = isset($_GET['dl']) && !$isStream;
    $type = $media[$ext] ?? null;
    if ($isStream && ($type === null || $type === 'application/pdf')) { http_response_code(403); echo 'refusé'; return true; }
    if ($ext === 'svg') { $type = 'image/svg+xml'; header("Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'"); }
    if ($type === null || $download) {
        // Tout le reste (HTML, JS, texte…) n'est jamais interprété par le navigateur : téléchargement ou texte brut.
        $type = 'application/octet-stream';
        header("Content-Security-Policy: sandbox; default-src 'none'");
        $download = true;
    }
    $size = $info['size']; $start = 0; $end = max(0, $size - 1);
    header('Content-Type: ' . $type);
    header('Accept-Ranges: bytes');
    header('Cache-Control: private, no-cache');
    header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . rawurlencode($info['name']) . '"; filename*=UTF-8\'\'' . rawurlencode($info['name']));
    $range = (string)($_SERVER['HTTP_RANGE'] ?? '');
    if ($range !== '' && $size > 0) {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/', $range, $m) || ($m[1] === '' && $m[2] === '')) {
            http_response_code(416); header("Content-Range: bytes */$size"); return true;
        }
        if ($m[1] === '') { $start = max(0, $size - (int)$m[2]); }
        else { $start = (int)$m[1]; if ($m[2] !== '') $end = min($end, (int)$m[2]); }
        if ($start > $end || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); return true; }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    $length = $size === 0 ? 0 : $end - $start + 1;
    header('Content-Length: ' . $length);
    if ($method === 'HEAD' || $length === 0) return true;
    $fh = fopen($info['full'], 'rb');
    if ($fh === false) { http_response_code(500); return true; }
    fseek($fh, $start);
    $left = $length;
    while ($left > 0 && !feof($fh) && !connection_aborted()) {
        $chunk = fread($fh, min(65536, $left));
        if ($chunk === false || $chunk === '') break;
        echo $chunk; $left -= strlen($chunk);
        if (ob_get_level() === 0) flush();
    }
    fclose($fh);
    return true;
}

if (strpos($uri, '/api/') === 0) {
    // En-tête personnalisé obligatoire : bloque les requêtes cross-site (CSRF).
    if ($method !== 'POST' || ($_SERVER['HTTP_X_WEED'] ?? '') !== '1') {
        weed_json(['ok' => false, 'error' => 'requête refusée'], 403);
        return true;
    }
    try {
        $auth = new Auth();
        $in = [];
        if (strpos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === 0) {
            $in = json_decode((string)file_get_contents('php://input'), true);
            if (!is_array($in)) throw new RuntimeException('JSON invalide');
        }
        $str = fn(string $k) => (string)($in[$k] ?? '');

        switch ($uri) {
            case '/api/auth/status':
                weed_json(['ok' => true, 'result' => ['setup' => !$auth->hasUsers(), 'user' => $auth->current(), 'startupSound' => \Weed\SystemSound::status()]]);
                return true;
            case '/api/auth/setup':
            case '/api/auth/login':
                if ($uri === '/api/auth/setup') { $auth->setup($str('name'), $str('pass')); }
                $token = $auth->login($str('name'), $str('pass'));
                setcookie(Auth::cookieName(), $token, ['expires' => time() + Auth::ttl(), 'path' => '/', 'httponly' => true, 'secure' => $isHttps, 'samesite' => 'Strict']);
                $_COOKIE[Auth::cookieName()] = $token;
                weed_json(['ok' => true, 'result' => $auth->current()]);
                return true;
            case '/api/auth/logout':
                $auth->logout();
                setcookie(Auth::cookieName(), '', ['expires' => 1, 'path' => '/', 'httponly' => true, 'secure' => $isHttps, 'samesite' => 'Strict']);
                weed_json(['ok' => true, 'result' => true]);
                return true;
        }

        $user = $auth->current();
        if (!$user) { weed_json(['ok' => false, 'error' => 'non connecté', 'auth' => true], 401); return true; }
        $pkg = new Programs();
        $sys = new Syscalls(new Vfs($user['name']), $pkg, $auth, $user);

        if ($uri === '/api/preferences/load') {
            weed_json(['ok' => true, 'result' => \Weed\Preferences::load($user['name'])]);
        } elseif ($uri === '/api/preferences/save') {
            weed_json(['ok' => true, 'result' => \Weed\Preferences::save($user['name'], $str('key'), $str('value'))]);
        } elseif ($uri === '/api/preferences/reset') {
            weed_json(['ok' => true, 'result' => \Weed\Preferences::reset($user['name'])]);
        } elseif ($uri === '/api/system/sound/load') {
            weed_json(['ok' => true, 'result' => \Weed\SystemSound::status() + ['admin' => $user['role'] === 'admin']]);
        } elseif ($uri === '/api/system/sound/save') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            weed_json(['ok' => true, 'result' => \Weed\SystemSound::save((bool)($in['startup'] ?? false), (int)($in['volume'] ?? 85), $user['name'])]);
        } elseif ($uri === '/api/system/sound/test') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            $st = \Weed\SystemSound::status();
            weed_json(['ok' => true, 'result' => ['native' => $st['capable'] && \Weed\SystemSound::requestTest(), 'volume' => $st['volume']]]);
        } elseif ($uri === '/api/system/backup') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            $archive = \Weed\Backup::create($str('passphrase'));
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="weed-os-backup-' . date('Y-m-d-His') . '.weedbak"');
            header('Content-Length: ' . filesize($archive));
            header('Cache-Control: no-store');
            readfile($archive);
            $dir = dirname($archive); @unlink($archive); @rmdir($dir);
            return true;
        } elseif ($uri === '/api/system/backup/verify') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            if (!isset($_FILES['backup']) || $_FILES['backup']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('archive de sauvegarde manquante ou envoi échoué');
            weed_json(['ok' => true, 'result' => \Weed\Backup::verify((string)$_FILES['backup']['tmp_name'], (string)($_POST['passphrase'] ?? ''))]);
        } elseif ($uri === '/api/system/restore') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            if (!isset($_FILES['backup']) || $_FILES['backup']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('archive de sauvegarde manquante ou envoi échoué');
            \Weed\Backup::restore((string)$_FILES['backup']['tmp_name'], (string)($_POST['passphrase'] ?? ''));
            weed_json(['ok' => true, 'result' => ['restored' => true]]);
        } elseif ($uri === '/api/connectivity/status') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->status()]);
        } elseif ($uri === '/api/connectivity/wifi/scan') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->wifiScan()]);
        } elseif ($uri === '/api/connectivity/wifi/connect') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->wifiConnect($str('ssid'), $str('password'))]);
        } elseif ($uri === '/api/connectivity/wifi/power') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->wifiEnable((bool)($in['enabled'] ?? false))]);
        } elseif ($uri === '/api/connectivity/wifi/disconnect') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->wifiDisconnect($str('device'))]);
        } elseif ($uri === '/api/connectivity/ethernet/set') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->ethernetSet($str('device'), (bool)($in['enabled'] ?? true))]);
        } elseif ($uri === '/api/connectivity/bluetooth/power') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothPower((bool)($in['enabled'] ?? false))]);
        } elseif ($uri === '/api/connectivity/bluetooth/scan') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothScan((bool)($in['enabled'] ?? false))]);
        } elseif ($uri === '/api/connectivity/bluetooth/pair') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothPair($str('address'))]);
        } elseif ($uri === '/api/connectivity/bluetooth/connect') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothConnect($str('address'))]);
        } elseif ($uri === '/api/connectivity/bluetooth/disconnect') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothDisconnect($str('address'))]);
        } elseif ($uri === '/api/connectivity/bluetooth/trust') {
            weed_json(['ok' => true, 'result' => (new \Weed\Connectivity())->bluetoothTrust($str('address'), (bool)($in['trusted'] ?? true))]);
        } elseif ($uri === '/api/mail/accounts') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->accounts()]);
        } elseif ($uri === '/api/mail/account/save') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->saveAccount((array)($in['account'] ?? []))]);
        } elseif ($uri === '/api/mail/account/remove') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->remove($str('id'))]);
        } elseif ($uri === '/api/mail/folders') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->folders($str('id'))]);
        } elseif ($uri === '/api/mail/inbox') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->inbox($str('id'), $str('folder') ?: 'INBOX')]);
        } elseif ($uri === '/api/mail/message') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->readMessage($str('id'), $str('folder') ?: 'INBOX', $str('uid'))]);
        } elseif ($uri === '/api/mail/send') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->send($str('id'), (array)($in['message'] ?? []))]);
        } elseif ($uri === '/api/mail/message/delete') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->deleteMessage($str('id'), $str('folder') ?: 'INBOX', $str('uid'))]);
        } elseif ($uri === '/api/mail/message/move') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->moveMessage($str('id'), $str('folder') ?: 'INBOX', $str('uid'), $str('destination'))]);
        } elseif ($uri === '/api/mail/drafts') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->drafts()]);
        } elseif ($uri === '/api/mail/draft/save') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->saveDraft((array)($in['draft'] ?? []))]);
        } elseif ($uri === '/api/mail/draft/delete') {
            weed_json(['ok' => true, 'result' => (new \Weed\MailClient($user['name']))->deleteDraft($str('id'))]);
        } elseif ($uri === '/api/upload-app') {
            if ($user['role'] !== 'admin') throw new RuntimeException('réservé aux administrateurs');
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('envoi échoué');
            weed_json(['ok' => true, 'result' => $pkg->install($_FILES['file']['tmp_name'])]);
        } elseif ($uri === '/api/fs-upload') {
            // v0.8.7 : import de fichiers (binaires inclus) depuis l'ordinateur vers le dossier personnel.
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('envoi échoué (fichier trop volumineux ?)');
            $name = (string)($_POST['name'] ?? $_FILES['file']['name']);
            $path = (new Vfs($user['name']))->importUpload((string)($_POST['dir'] ?? '/'), $name, $_FILES['file']['tmp_name']);
            weed_json(['ok' => true, 'result' => ['path' => $path]]);
        } elseif ($uri === '/api/syscall') {
            weed_json(['ok' => true, 'result' => $sys->call($str('call'), (array)($in['args'] ?? []))]);
        } else {
            weed_json(['ok' => false, 'error' => 'route inconnue'], 404);
        }
    } catch (Throwable $e) {
        weed_json(['ok' => false, 'error' => $e->getMessage()], 400);
    }
    return true;
}

// Fichiers statiques d'un Programme actif (page HTML/CSS/JS/images ; jamais de PHP).
if (preg_match('#^/app/([a-z0-9][a-z0-9-]{1,39})/(.+)$#', $uri, $m)) {
    $pkg = new Programs();
    $rel = $m[2];
    $ok = $pkg->isEnabled($m[1]) && !preg_match('#(^|/)\.\.(/|$)#', $rel) && !preg_match('#\.(php|phtml|phar)$#i', $rel);
    $file = $ok ? realpath($pkg->appsDir() . '/' . $m[1] . '/' . $rel) : false;
    $base = realpath($pkg->appsDir() . '/' . $m[1]);
    if ($file === false || $base === false || strpos($file, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($file)) {
        http_response_code(404);
        echo 'Not found';
        return true;
    }
    $types = ['html' => 'text/html', 'css' => 'text/css', 'js' => 'text/javascript', 'json' => 'application/json',
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'ico' => 'image/x-icon', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml', 'txt' => 'text/plain', 'woff2' => 'font/woff2'];
    header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    readfile($file);
    return true;
}

return false; // fichiers statiques du bureau (system/desktop)
