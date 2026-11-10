<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$data = sys_get_temp_dir() . '/weed-mail-' . bin2hex(random_bytes(5));
mkdir($data, 0700, true);
putenv('WEED_DATA=' . $data);
define('WEED_ROOT', $root);
require $root . '/kernel/autoload.php';
try {
    $client = new \Weed\MailClient('testuser');
    $decode = new ReflectionMethod($client, 'decodeMime');
    $raw = "From: =?UTF-8?B?Sm9zw6k=?= <jose@example.com>\r\n" .
        "Subject: =?UTF-8?B?UsOpc3Vtw6k=?=\r\nDate: Fri, 06 Nov 2026 10:00:00 +0000\r\n" .
        "MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"mix-123\"\r\n\r\n" .
        "--mix-123\r\nContent-Type: multipart/alternative; boundary=\"alt-456\"\r\n\r\n" .
        "--alt-456\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nBonjour =C3=A0 tous\r\n" .
        "--alt-456\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<b>Bonjour</b>\r\n--alt-456--\r\n" .
        "--mix-123\r\nContent-Type: text/plain; name=\"note.txt\"\r\nContent-Disposition: attachment; filename=\"note.txt\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . base64_encode("Pièce jointe Weed OS\n") . "\r\n--mix-123--\r\n";
    $message = $decode->invoke($client, $raw);
    if ($message['subject'] !== 'Résumé') throw new RuntimeException('décodage du sujet UTF-8 incorrect');
    if (!str_contains($message['body'], 'Bonjour à tous')) throw new RuntimeException('corps quoted-printable non décodé');
    if (count($message['attachments']) !== 1) throw new RuntimeException('pièce jointe non extraite');
    $attachment = $message['attachments'][0];
    if ($attachment['name'] !== 'note.txt' || base64_decode($attachment['data'], true) !== "Pièce jointe Weed OS\n") throw new RuntimeException('contenu de la pièce jointe incorrect');
    $uid = new ReflectionMethod($client, 'validUid');
    if ($uid->invoke($client, '12345') !== '12345') throw new RuntimeException('validation UID valide incorrecte');
    try { $uid->invoke($client, '1\r\nLOGOUT'); throw new RuntimeException('injection UID non bloquée'); } catch (Throwable $e) { if ($e->getMessage() === 'injection UID non bloquée') throw $e; }
    $folder = new ReflectionMethod($client, 'folderName');
    if ($folder->invoke($client, 'Envoyés') !== '"Envoyés"') throw new RuntimeException('quotage du dossier incorrect');
    try { $folder->invoke($client, "INBOX\r\nLOGOUT"); throw new RuntimeException('injection IMAP non bloquée'); }
    catch (ReflectionException $e) { throw $e; }
    catch (Throwable $e) { if ($e->getMessage() === 'injection IMAP non bloquée') throw $e; }
    echo "mail-mime-smoke: OK\n";
} finally {
    foreach (glob($data . '/home/testuser/.mail/*') ?: [] as $f) @unlink($f);
    @rmdir($data . '/home/testuser/.mail'); @rmdir($data . '/home/testuser'); @rmdir($data . '/home');
    @rmdir($data . '/etc'); @rmdir($data);
}
