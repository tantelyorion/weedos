<?php
declare(strict_types=1);
namespace Weed;

/** Client IMAP/SMTP natif PHP. Les secrets sont chiffrés avec AES-256-GCM au repos. */
final class MailClient
{
    private string $file;
    private string $keyFile;
    private string $draftFile;
    private string $user;

    public function __construct(string $user)
    {
        if (!Auth::validName($user)) throw new \RuntimeException('utilisateur invalide');
        $base = WEED_DATA . '/home/' . $user . '/.mail';
        if (is_link(WEED_DATA . '/home/' . $user) || is_link($base)) throw new \RuntimeException('dossier e-mail symbolique interdit');
        if (!is_dir($base) && !@mkdir($base, 0700, true) && !is_dir($base)) throw new \RuntimeException('dossier e-mail inaccessible');
        @chmod($base, 0700);
        $this->file = $base . '/accounts.json';
        $this->draftFile = $base . '/drafts.json';
        $this->keyFile = WEED_DATA . '/etc/mail.key';
        $this->user = $user;
    }

    private function key(): string
    {
        if (!is_file($this->keyFile)) {
            $key = random_bytes(32);
            $fh = @fopen($this->keyFile, 'x');
            if ($fh) { @chmod($this->keyFile, 0600); fwrite($fh, $key); fflush($fh); fclose($fh); }
        }
        $key = @file_get_contents($this->keyFile);
        if (!is_string($key) || strlen($key) !== 32 || is_link($this->keyFile)) throw new \RuntimeException('clé de chiffrement e-mail indisponible');
        @chmod($this->keyFile, 0600);
        return $key;
    }

    private function load(): array
    {
        if (is_link($this->file)) throw new \RuntimeException('fichier de comptes e-mail symbolique interdit');
        if (!is_file($this->file)) return [];
        $j = json_decode((string)file_get_contents($this->file), true);
        if (!is_array($j)) throw new \RuntimeException('configuration e-mail illisible');
        return $j;
    }

    private function save(array $accounts): void
    {
        $tmp = $this->file . '.tmp.' . bin2hex(random_bytes(5));
        $raw = json_encode($accounts, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        if (file_put_contents($tmp, $raw, LOCK_EX) === false) throw new \RuntimeException('enregistrement e-mail impossible');
        @chmod($tmp, 0600);
        if (!rename($tmp, $this->file)) { @unlink($tmp); throw new \RuntimeException('enregistrement e-mail impossible'); }
        @chmod($this->file, 0600);
    }

    private function encrypt(string $plain): string
    {
        $iv = random_bytes(12); $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) throw new \RuntimeException('chiffrement e-mail impossible');
        return base64_encode($iv . $tag . $cipher);
    }

    private function decrypt(string $encoded): string
    {
        $raw = base64_decode($encoded, true);
        if ($raw === false || strlen($raw) < 29) throw new \RuntimeException('secret e-mail corrompu');
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        if ($plain === false) throw new \RuntimeException('impossible de déchiffrer le mot de passe e-mail');
        return $plain;
    }

    private function validate(array $a): array
    {
        $email = trim((string)($a['email'] ?? ''));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('adresse e-mail invalide');
        $host = static function ($v, $label): string {
            $v = trim((string)$v);
            if ($v === '' || strlen($v) > 253 || !preg_match('/^[a-z0-9.-]+$/i', $v)) throw new \RuntimeException($label . ' invalide');
            return $v;
        };
        $port = static function ($v, $label): int {
            $n = filter_var($v, FILTER_VALIDATE_INT);
            if ($n === false || $n < 1 || $n > 65535) throw new \RuntimeException('port ' . $label . ' invalide');
            return $n;
        };
        $security = static function ($v): string {
            if (!in_array($v, ['ssl', 'starttls', 'none'], true)) throw new \RuntimeException('sécurité réseau invalide');
            return $v;
        };
        $name = trim((string)($a['name'] ?? $email));
        if ($name === '' || strlen($name) > 80) $name = $email;
        $username = trim((string)($a['username'] ?? $email));
        $password = (string)($a['password'] ?? '');
        if ($username === '' || strlen($username) > 254 || strlen($password) > 1024 || preg_match('/[\\r\\n\\0]/', $username) || preg_match('/[\\r\\n\\0]/', $password)) throw new \RuntimeException('identifiants invalides');
        return ['id' => substr(hash('sha256', strtolower($email)), 0, 16), 'name' => $name, 'email' => $email,
            'username' => $username, 'password' => $password,
            'imap_host' => $host($a['imap_host'] ?? '', 'serveur IMAP'), 'imap_port' => $port($a['imap_port'] ?? 993, 'IMAP'),
            'imap_security' => $security($a['imap_security'] ?? 'ssl'),
            'smtp_host' => $host($a['smtp_host'] ?? '', 'serveur SMTP'), 'smtp_port' => $port($a['smtp_port'] ?? 465, 'SMTP'),
            'smtp_security' => $security($a['smtp_security'] ?? 'ssl')];
    }

    public function accounts(): array
    {
        return array_map(static fn($a) => ['id' => $a['id'], 'name' => $a['name'], 'email' => $a['email'],
            'imap_host' => $a['imap_host'], 'imap_port' => $a['imap_port'], 'imap_security' => $a['imap_security'],
            'smtp_host' => $a['smtp_host'], 'smtp_port' => $a['smtp_port'], 'smtp_security' => $a['smtp_security']],
            array_values($this->load()));
    }

    public function saveAccount(array $input): array
    {
        $a = $this->validate($input);
        $all = $this->load();
        $old = $all[$a['id']] ?? null;
        if ($a['password'] === '' && is_array($old)) $a['password'] = $this->decrypt((string)$old['password_enc']);
        if ($a['password'] === '') throw new \RuntimeException('mot de passe requis');
        $a['password_enc'] = $this->encrypt($a['password']);
        unset($a['password']);
        $all[$a['id']] = $a;
        $this->save($all);
        return ['id' => $a['id'], 'email' => $a['email']];
    }

    public function remove(string $id): bool
    {
        $all = $this->load(); if (!isset($all[$id])) return false;
        unset($all[$id]); $this->save($all); return true;
    }

    private function account(string $id): array
    {
        $a = $this->load()[$id] ?? null;
        if (!is_array($a)) throw new \RuntimeException('compte e-mail introuvable');
        $a['password'] = $this->decrypt((string)$a['password_enc']);
        return $a;
    }

    private function connect(string $host, int $port, string $security)
    {
        $transport = $security === 'ssl' ? 'ssl://' : 'tcp://';
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host, 'SNI_enabled' => true]]);
        $fp = @stream_socket_client($transport . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new \RuntimeException('connexion à ' . $host . ' impossible : ' . $errstr);
        stream_set_timeout($fp, 20);
        return $fp;
    }

    private function smtpCommand($fp, string $cmd, array $expected): string
    {
        fwrite($fp, $cmd . "\r\n");
        $response = '';
        do {
            $line = fgets($fp, 8192);
            if ($line === false) throw new \RuntimeException('réponse SMTP interrompue');
            $response .= $line;
        } while (strlen($line) >= 4 && $line[3] === '-');
        $code = (int)substr($response, 0, 3);
        if (!in_array($code, $expected, true)) throw new \RuntimeException('erreur SMTP : ' . trim($response));
        return $response;
    }

    public function send(string $id, array $message): bool
    {
        $a = $this->account($id);
        $to = trim((string)($message['to'] ?? ''));
        $subject = trim((string)($message['subject'] ?? ''));
        $body = (string)($message['body'] ?? '');
        $attachments = $this->validateAttachments($message['attachments'] ?? []);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('adresse du destinataire invalide');
        if ($subject === '' || strlen($subject) > 250 || strlen($body) > 500000) throw new \RuntimeException('objet ou message invalide');
        if (preg_match('/[\r\n]/', $to) || preg_match('/[\r\n]/', $subject)) throw new \RuntimeException('en-tête de message invalide');
        $fp = $this->connect($a['smtp_host'], (int)$a['smtp_port'], $a['smtp_security']);
        try {
            $greeting = fgets($fp, 8192);
            if ($greeting === false || (int)substr($greeting, 0, 3) !== 220) throw new \RuntimeException('serveur SMTP indisponible');
            $this->smtpCommand($fp, 'EHLO weed-os.local', [250]);
            if ($a['smtp_security'] === 'starttls') {
                $this->smtpCommand($fp, 'STARTTLS', [220]);
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS SMTP impossible');
                $this->smtpCommand($fp, 'EHLO weed-os.local', [250]);
            }
            $this->smtpCommand($fp, 'AUTH LOGIN', [334]);
            $this->smtpCommand($fp, base64_encode($a['username']), [334]);
            $this->smtpCommand($fp, base64_encode($a['password']), [235]);
            $this->smtpCommand($fp, 'MAIL FROM:<' . $a['email'] . '>', [250]);
            $this->smtpCommand($fp, 'RCPT TO:<' . $to . '>', [250, 251]);
            $this->smtpCommand($fp, 'DATA', [354]);
            $mime = $this->buildMimeMessage($a['email'], $to, $subject, $body, $attachments);
            $mime = preg_replace('/^\./m', '..', $mime);
            fwrite($fp, $mime . "\r\n.\r\n");
            $response = '';
            do {
                $line = fgets($fp, 8192);
                if ($line === false) throw new \RuntimeException('réponse SMTP interrompue');
                $response .= $line;
            } while (strlen($line) >= 4 && $line[3] === '-');
            if ((int)substr($response, 0, 3) !== 250) throw new \RuntimeException('erreur SMTP : ' . trim($response));
            $this->smtpCommand($fp, 'QUIT', [221]);
        } finally { fclose($fp); }
        return true;
    }


    /** Valide et décode les pièces jointes reçues via l'API JSON. */
    private function validateAttachments($input): array
    {
        if (!is_array($input) || count($input) > 5) throw new \RuntimeException('5 pièces jointes maximum');
        $out = []; $total = 0;
        foreach ($input as $item) {
            if (!is_array($item)) throw new \RuntimeException('pièce jointe invalide');
            $name = trim((string)($item['name'] ?? ''));
            $encoded = (string)($item['data'] ?? '');
            if (strlen($encoded) > 7 * 1024 * 1024) throw new \RuntimeException('pièce jointe trop volumineuse');
            if ($name === '' || strlen($name) > 240 || preg_match('/[\r\n\0]/', $name)) throw new \RuntimeException('nom de pièce jointe invalide');
            // Ne jamais conserver de chemin fourni par le client.
            $name = basename(str_replace('\\', '/', $name));
            if ($name === '' || $name === '.' || $name === '..') throw new \RuntimeException('nom de pièce jointe invalide');
            $raw = base64_decode($encoded, true);
            if ($raw === false || $raw === '') throw new \RuntimeException('contenu de pièce jointe invalide');
            $size = strlen($raw); $total += $size;
            if ($size > 5 * 1024 * 1024 || $total > 10 * 1024 * 1024) throw new \RuntimeException('taille maximale des pièces jointes : 10 Mo au total (5 Mo par fichier)');
            $mime = 'application/octet-stream';
            if (class_exists('\\finfo')) { $fi = new \finfo(FILEINFO_MIME_TYPE); $detected = $fi->buffer($raw); if (is_string($detected) && preg_match('#^[a-z0-9.+-]+/[a-z0-9.+-]+$#i', $detected)) $mime = $detected; }
            $out[] = ['name' => $name, 'mime' => $mime, 'data' => $raw];
        }
        return $out;
    }

    /** Construit un message MIME multipart/mixed avec encodage base64 RFC-compatible. */
    private function buildMimeMessage(string $from, string $to, string $subject, string $body, array $attachments): string
    {
        $headers = ['From: ' . $from, 'To: ' . $to, 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Date: ' . date(DATE_RFC2822), 'MIME-Version: 1.0'];
        if (!$attachments) {
            $safeBody = preg_replace("/(?<!\r)\n/", "\r\n", str_replace("\r", '', $body));
            return implode("\r\n", $headers) . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $safeBody;
        }
        $boundary = '=_WeedOS_' . bin2hex(random_bytes(18));
        $message = implode("\r\n", $headers) . "\r\nContent-Type: multipart/mixed; boundary=\"{$boundary}\"\r\n\r\n";
        $safeBody = preg_replace("/(?<!\r)\n/", "\r\n", str_replace("\r", '', $body));
        $message .= '--' . $boundary . "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" . $safeBody . "\r\n";
        foreach ($attachments as $file) {
            $ascii = preg_replace('/[^A-Za-z0-9._-]/', '_', $file['name']);
            if ($ascii === '') $ascii = 'attachment';
            $message .= '--' . $boundary . "\r\nContent-Type: {$file['mime']}; name=\"{$ascii}\"\r\n";
            $message .= "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$ascii}\"; filename*=UTF-8''" . rawurlencode($file['name']) . "\r\n\r\n";
            $message .= chunk_split(base64_encode($file['data']), 76, "\r\n");
        }
        return $message . '--' . $boundary . '--';
    }

    private function imapRead($fp, string $tag): array
    {
        $lines = []; $literals = [];
        while (($line = fgets($fp, 8192)) !== false) {
            if (preg_match('/\{(\d+)\}\r?\n$/', $line, $m)) {
                $length = (int)$m[1];
                if ($length < 0 || $length > 8 * 1024 * 1024) throw new \RuntimeException('message IMAP trop volumineux (limite 8 Mo)');
                $literal = '';
                while (strlen($literal) < $length && !feof($fp)) {
                    $chunk = fread($fp, min(65536, $length - strlen($literal)));
                    if ($chunk === false || $chunk === '') break;
                    $literal .= $chunk;
                }
                if (strlen($literal) !== $length) throw new \RuntimeException('réponse IMAP tronquée');
                $literals[] = $literal;
            }
            $lines[] = $line;
            if (preg_match('/^' . preg_quote($tag, '/') . '\s+(OK|NO|BAD)\b/i', $line, $m)) {
                if (strtoupper($m[1]) !== 'OK') throw new \RuntimeException('erreur IMAP : ' . trim($line));
                return ['lines' => $lines, 'literals' => $literals];
            }
        }
        throw new \RuntimeException('connexion IMAP interrompue');
    }

    private function imapCommand($fp, string $tag, string $command): array
    {
        fwrite($fp, $tag . ' ' . $command . "\r\n");
        return $this->imapRead($fp, $tag);
    }

    /** Décode les en-têtes RFC 2047 sans interpréter le HTML distant. */
    private function decodeHeader(string $value): string
    {
        if (function_exists('iconv_mime_decode')) {
            $decoded = @iconv_mime_decode($value, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if (is_string($decoded)) return $decoded;
        }
        return preg_replace_callback('/=\?([^?]+)\?([bq])\?([^?]+)\?=/i', static function ($m) {
            $v = strtolower($m[2]) === 'b' ? base64_decode($m[3]) : quoted_printable_decode(str_replace('_', ' ', $m[3]));
            if (!is_string($v)) return $m[0];
            return strtoupper($m[1]) === 'UTF-8' ? $v : (function_exists('iconv') ? (@iconv($m[1], 'UTF-8//IGNORE', $v) ?: $v) : $v);
        }, $value) ?? $value;
    }

    /** Parse récursivement une partie MIME et ne retourne que le texte et les fichiers joints. */
    private function parseMimePart(string $raw, int $depth = 0): array
    {
        if ($depth > 8) return ['body' => '', 'attachments' => []];
        $parts = preg_split("/\r?\n\r?\n/", $raw, 2);
        $headerText = $parts[0] ?? ''; $body = $parts[1] ?? '';
        $headers = [];
        foreach (preg_split('/\r?\n/', $headerText) ?: [] as $line) {
            if (preg_match('/^\s+/', $line) && $headers) { $last = array_key_last($headers); $headers[$last] .= ' ' . trim($line); continue; }
            if (strpos($line, ':') !== false) { [$k, $v] = explode(':', $line, 2); $headers[strtolower(trim($k))] = trim($v); }
        }
        $ct = $headers['content-type'] ?? 'text/plain';
        $disp = $headers['content-disposition'] ?? '';
        $encoding = strtolower($headers['content-transfer-encoding'] ?? '');
        $param = static function (string $header, string $key): string {
            if (preg_match('/(?:^|;)\s*' . preg_quote($key, '/') . "\\*?=(?:\"([^\"]*)\"|([^;\\s]*))/i", $header, $m)) return $m[1] !== '' ? $m[1] : ($m[2] ?? '');
            return '';
        };
        $filename = $param($disp, 'filename');
        if ($filename === '') $filename = $param($ct, 'name');
        if ($filename !== '') {
            if (preg_match("/^UTF-8''(.+)$/i", $filename, $m)) $filename = rawurldecode($m[1]);
            $filename = $this->decodeHeader($filename);
            $filename = basename(str_replace('\\', '/', $filename));
            $data = $encoding === 'base64' ? base64_decode(preg_replace('/\s+/', '', $body), true) : ($encoding === 'quoted-printable' ? quoted_printable_decode($body) : $body);
            if (!is_string($data)) $data = '';
            if (strlen($data) > 5 * 1024 * 1024) $data = '';
            $mime = strtolower(trim(explode(';', $ct, 2)[0]));
            if (!preg_match('#^[a-z0-9.+-]+/[a-z0-9.+-]+$#', $mime)) $mime = 'application/octet-stream';
            return ['body' => '', 'attachments' => $data === '' ? [] : [['name' => $filename ?: 'piece-jointe', 'mime' => $mime, 'size' => strlen($data), 'data' => base64_encode($data)]]];
        }
        if (preg_match('/^multipart\//i', $ct) && preg_match('/boundary="?([^";]+)"?/i', $ct, $m)) {
            $text = ''; $attachments = [];
            foreach (explode('--' . $m[1], $body) as $chunk) {
                $chunk = ltrim($chunk, "\r\n");
                if ($chunk === '' || str_starts_with($chunk, '--')) continue;
                $part = $this->parseMimePart($chunk, $depth + 1);
                if ($text === '' && $part['body'] !== '') $text = $part['body'];
                $attachments = array_merge($attachments, $part['attachments']);
            }
            return ['body' => $text, 'attachments' => $attachments];
        }
        if (stripos($ct, 'text/plain') === false) return ['body' => '', 'attachments' => []];
        if ($encoding === 'base64') $body = (string)base64_decode(preg_replace('/\s+/', '', $body));
        elseif ($encoding === 'quoted-printable') $body = quoted_printable_decode($body);
        return ['body' => trim(strip_tags($body)), 'attachments' => []];
    }

    private function decodeMime(string $raw): array
    {
        $parts = preg_split("/\r?\n\r?\n/", $raw, 2);
        $headers = $parts[0] ?? '';
        $get = static function (string $key) use ($headers): string {
            if (preg_match('/^' . preg_quote($key, '/') . ':\s*(.+(?:\r?\n[ \t].+)*)/im', $headers, $m)) return trim(preg_replace('/\r?\n[ \t]+/', ' ', $m[1]));
            return '';
        };
        $parsed = $this->parseMimePart($raw);
        $subject = $this->decodeHeader($get('Subject'));
        return ['from' => $this->decodeHeader($get('From')), 'to' => $this->decodeHeader($get('To')), 'message_id' => trim($get('Message-ID'), '<> '), 'subject' => $subject ?: '(Sans objet)', 'date' => $get('Date'),
            'body' => function_exists('mb_substr') ? mb_substr($parsed['body'], 0, 12000) : substr($parsed['body'], 0, 12000),
            'attachments' => $parsed['attachments']];
    }

    private function folderName(string $folder): string
    {
        $folder = trim($folder);
        if ($folder === '' || strlen($folder) > 255 || preg_match('/[\r\n\0]/', $folder)) throw new \RuntimeException('dossier e-mail invalide');
        return '"' . addcslashes($folder, "\\\"") . '"';
    }

    private function imapOpen(string $id, string $folder)
    {
        $a = $this->account($id); $fp = $this->connect($a['imap_host'], (int)$a['imap_port'], $a['imap_security']);
        $greeting = fgets($fp, 8192);
        if ($greeting === false || stripos($greeting, 'OK') === false) { fclose($fp); throw new \RuntimeException('serveur IMAP indisponible'); }
        try {
            if ($a['imap_security'] === 'starttls') {
                $this->imapCommand($fp, 'A000', 'STARTTLS');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS IMAP impossible');
            }
            $quote = static fn(string $v): string => '"' . addcslashes($v, "\\\"") . '"';
            $this->imapCommand($fp, 'A001', 'LOGIN ' . $quote($a['username']) . ' ' . $quote($a['password']));
            $this->imapCommand($fp, 'A002', 'SELECT ' . $this->folderName($folder));
            return $fp;
        } catch (\Throwable $e) { fclose($fp); throw $e; }
    }

    private function validUid(string $uid): string
    {
        if (!ctype_digit($uid) || strlen($uid) > 20 || (float)$uid < 1) throw new \RuntimeException('identifiant de message invalide');
        return $uid;
    }

    public function deleteMessage(string $id, string $folder, string $uid): bool
    {
        $uid = $this->validUid($uid); $fp = $this->imapOpen($id, $folder);
        try {
            $this->imapCommand($fp, 'A003', 'UID STORE ' . $uid . ' +FLAGS.SILENT (\\Deleted)');
            // UID EXPUNGE ne supprime que le message ciblé (RFC 4315), contrairement à EXPUNGE global.
            $this->imapCommand($fp, 'A004', 'UID EXPUNGE ' . $uid);
            $this->imapCommand($fp, 'A005', 'LOGOUT'); return true;
        } finally { fclose($fp); }
    }

    public function moveMessage(string $id, string $folder, string $uid, string $destination): bool
    {
        $uid = $this->validUid($uid); $dest = $this->folderName($destination); $fp = $this->imapOpen($id, $folder);
        try {
            try { $this->imapCommand($fp, 'A003', 'UID MOVE ' . $uid . ' ' . $dest); }
            catch (\Throwable $e) {
                // Compatibilité avec les serveurs sans UID MOVE : COPY + suppression ciblée.
                $this->imapCommand($fp, 'A004', 'UID COPY ' . $uid . ' ' . $dest);
                $this->imapCommand($fp, 'A005', 'UID STORE ' . $uid . ' +FLAGS.SILENT (\\Deleted)');
                $this->imapCommand($fp, 'A006', 'UID EXPUNGE ' . $uid);
            }
            $this->imapCommand($fp, 'A007', 'LOGOUT'); return true;
        } finally { fclose($fp); }
    }

    public function saveDraft(array $draft): array
    {
        $id = (string)($draft['id'] ?? '');
        if ($id !== '' && !preg_match('/^[a-f0-9]{16}$/', $id)) throw new \RuntimeException('identifiant de brouillon invalide');
        $to = trim((string)($draft['to'] ?? '')); $subject = (string)($draft['subject'] ?? ''); $body = (string)($draft['body'] ?? '');
        if (strlen($to) > 254 || ($to !== '' && !filter_var($to, FILTER_VALIDATE_EMAIL)) || strlen($subject) > 998 || strlen($body) > 500000) throw new \RuntimeException('brouillon invalide ou trop volumineux');
        $all = $this->loadDrafts(); $id = $id ?: bin2hex(random_bytes(8));
        $all[$id] = ['id' => $id, 'updated' => time(), 'payload' => $this->encrypt(json_encode(['to'=>$to,'subject'=>$subject,'body'=>$body], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))];
        uasort($all, static fn($a,$b) => ($b['updated'] ?? 0) <=> ($a['updated'] ?? 0));
        $all = array_slice($all, 0, 100, true); $this->saveDrafts($all);
        return ['id' => $id, 'updated' => $all[$id]['updated']];
    }

    private function loadDrafts(): array
    {
        if (is_link($this->draftFile)) throw new \RuntimeException('fichier de brouillons symbolique interdit');
        if (!is_file($this->draftFile)) return [];
        $data = json_decode((string)file_get_contents($this->draftFile), true);
        if (!is_array($data)) throw new \RuntimeException('brouillons illisibles'); return $data;
    }

    private function saveDrafts(array $drafts): void
    {
        $tmp = $this->draftFile . '.tmp.' . bin2hex(random_bytes(5));
        if (file_put_contents($tmp, json_encode($drafts, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), LOCK_EX) === false) throw new \RuntimeException('sauvegarde des brouillons impossible');
        @chmod($tmp, 0600); if (!rename($tmp, $this->draftFile)) { @unlink($tmp); throw new \RuntimeException('sauvegarde des brouillons impossible'); } @chmod($this->draftFile, 0600);
    }

    public function drafts(): array
    {
        $out = [];
        foreach ($this->loadDrafts() as $id => $draft) {
            if (!preg_match('/^[a-f0-9]{16}$/', (string)$id)) continue;
            $payload = json_decode($this->decrypt((string)($draft['payload'] ?? '')), true);
            if (is_array($payload)) $out[] = ['id'=>$id,'updated'=>(int)($draft['updated'] ?? 0)] + $payload;
        }
        return $out;
    }

    public function deleteDraft(string $id): bool
    {
        if (!preg_match('/^[a-f0-9]{16}$/', $id)) throw new \RuntimeException('identifiant de brouillon invalide');
        $all = $this->loadDrafts(); if (!isset($all[$id])) return false; unset($all[$id]); $this->saveDrafts($all); return true;
    }

    public function folders(string $id): array
    {
        $a = $this->account($id); $fp = $this->connect($a['imap_host'], (int)$a['imap_port'], $a['imap_security']);
        try {
            $greeting = fgets($fp, 8192);
            if ($greeting === false || stripos($greeting, 'OK') === false) throw new \RuntimeException('serveur IMAP indisponible');
            if ($a['imap_security'] === 'starttls') {
                $this->imapCommand($fp, 'A000', 'STARTTLS');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS IMAP impossible');
            }
            $quote = static fn(string $v): string => '"' . addcslashes($v, "\\\"") . '"';
            $this->imapCommand($fp, 'A001', 'LOGIN ' . $quote($a['username']) . ' ' . $quote($a['password']));
            $result = $this->imapCommand($fp, 'A002', 'LIST "" "*"');
            $folders = ['INBOX'];
            foreach ($result['lines'] as $line) {
                if (preg_match('/^\* LIST \([^)]*\) (?:"(?:[^"\\\\]|\\\\.)*"|[^ ]+) ("((?:[^"\\\\]|\\\\.)*)"|([^ ]+))/i', $line, $m)) {
                    $name = $m[2] !== '' ? stripcslashes($m[2]) : trim($m[3], '"');
                    if ($name !== '' && strlen($name) <= 255) $folders[] = $name;
                }
            }
            $this->imapCommand($fp, 'A003', 'LOGOUT');
            return array_values(array_unique($folders));
        } finally { fclose($fp); }
    }

    public function readMessage(string $id, string $folder, string $uid): array
    {
        if (!ctype_digit($uid) || strlen($uid) > 20) throw new \RuntimeException('identifiant de message invalide');
        $a = $this->account($id); $fp = $this->connect($a['imap_host'], (int)$a['imap_port'], $a['imap_security']);
        try {
            $greeting = fgets($fp, 8192);
            if ($greeting === false || stripos($greeting, 'OK') === false) throw new \RuntimeException('serveur IMAP indisponible');
            if ($a['imap_security'] === 'starttls') {
                $this->imapCommand($fp, 'A000', 'STARTTLS');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS IMAP impossible');
            }
            $quote = static fn(string $v): string => '"' . addcslashes($v, "\\\"") . '"';
            $this->imapCommand($fp, 'A001', 'LOGIN ' . $quote($a['username']) . ' ' . $quote($a['password']));
            $this->imapCommand($fp, 'A002', 'SELECT ' . $this->folderName($folder));
            $fetch = $this->imapCommand($fp, 'A003', 'UID FETCH ' . $uid . ' (BODY.PEEK[])');
            $raw = $fetch['literals'][0] ?? '';
            if ($raw === '') throw new \RuntimeException('message vide ou introuvable');
            $message = $this->decodeMime($raw);
            $this->imapCommand($fp, 'A004', 'LOGOUT');
            return $message;
        } finally { fclose($fp); }
    }

    public function inbox(string $id, string $folder = 'INBOX'): array
    {
        $a = $this->account($id);
        $fp = $this->connect($a['imap_host'], (int)$a['imap_port'], $a['imap_security']);
        try {
            $greeting = fgets($fp, 8192);
            if ($greeting === false || stripos($greeting, 'OK') === false) throw new \RuntimeException('serveur IMAP indisponible');
            if ($a['imap_security'] === 'starttls') {
                $this->imapCommand($fp, 'A000', 'STARTTLS');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new \RuntimeException('TLS IMAP impossible');
            }
            $tag = 'A001';
            $quote = static fn(string $v): string => '"' . addcslashes($v, "\\\\\"") . '"';
            $this->imapCommand($fp, $tag, 'LOGIN ' . $quote($a['username']) . ' ' . $quote($a['password']));
            $this->imapCommand($fp, 'A002', 'SELECT ' . $this->folderName($folder));
            $search = $this->imapCommand($fp, 'A003', 'UID SEARCH ALL');
            $uids = [];
            foreach ($search['lines'] as $line) if (preg_match('/^\* SEARCH\s*(.*)$/i', $line, $m)) $uids = array_values(array_filter(preg_split('/\s+/', trim($m[1])) ?: [], 'ctype_digit'));
            $uids = array_slice(array_reverse($uids), 0, 25);
            $messages = [];
            $fetchNo = 4;
            foreach ($uids as $uid) {
                $fetchTag = 'A' . str_pad((string)$fetchNo++, 3, '0', STR_PAD_LEFT);
                $fetched = $this->imapCommand($fp, $fetchTag, 'UID FETCH ' . $uid . ' (BODY.PEEK[]<0.120000>)');
                if (!empty($fetched['literals'][0])) { $preview = $this->decodeMime($fetched['literals'][0]); unset($preview['attachments']); $messages[] = ['uid' => $uid] + $preview; }
            }
            $this->imapCommand($fp, 'A' . str_pad((string)$fetchNo, 3, '0', STR_PAD_LEFT), 'LOGOUT');
            return $messages;
        } finally { fclose($fp); }
    }
}
