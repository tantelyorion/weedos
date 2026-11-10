<?php
declare(strict_types=1);
$base = sys_get_temp_dir() . '/weed-feature-test-' . bin2hex(random_bytes(5));
mkdir($base, 0700);
putenv('WEED_ROOT=' . dirname(__DIR__));
putenv('WEED_DATA=' . $base . '/data');
define('WEED_ROOT', dirname(__DIR__));
define('WEED_DATA', $base . '/data');
define('WEED_VERSION', '0.8.13');
require dirname(__DIR__) . '/kernel/autoload.php';

function ok(bool $v, string $m): void { if (!$v) throw new RuntimeException($m); }
function rmTree(string $p): void {
    if (is_link($p) || is_file($p)) { @unlink($p); return; }
    if (!is_dir($p)) return;
    foreach (new FilesystemIterator($p) as $x) { $x->isDir() && !$x->isLink() ? rmTree($x->getPathname()) : @unlink($x->getPathname()); }
    @rmdir($p);
}
try {
    foreach (['etc','home/testuser/Documents','apps','appdata','var/log','var/run'] as $d) mkdir(WEED_DATA . '/' . $d, 0700, true);
    file_put_contents(WEED_DATA . '/home/testuser/Documents/keep.txt', 'original');
    file_put_contents(WEED_DATA . '/etc/users.json', '{"testuser":{"role":"admin"}}');
    $mail = new Weed\MailClient('testuser');
    $mail->saveAccount(['email'=>'test@example.com','name'=>'Test','username'=>'test@example.com','password'=>'secret-pass',
        'imap_host'=>'imap.example.com','imap_port'=>993,'imap_security'=>'ssl','smtp_host'=>'smtp.example.com','smtp_port'=>465,'smtp_security'=>'ssl']);
    $stored = file_get_contents(WEED_DATA . '/home/testuser/.mail/accounts.json');
    ok(!str_contains($stored, 'secret-pass'), 'mot de passe stocké en clair');
    ok(count($mail->accounts()) === 1, 'compte e-mail non enregistré');
    $draft = $mail->saveDraft(['to'=>'dest@example.com','subject'=>'Brouillon privé','body'=>'Contenu confidentiel du brouillon']);
    $drafts = $mail->drafts();
    ok(count($drafts) === 1 && $drafts[0]['id'] === $draft['id'] && $drafts[0]['body'] === 'Contenu confidentiel du brouillon', 'persistance des brouillons incorrecte');
    $draftRaw = file_get_contents(WEED_DATA . '/home/testuser/.mail/drafts.json');
    ok(!str_contains($draftRaw, 'Contenu confidentiel du brouillon') && (fileperms(WEED_DATA . '/home/testuser/.mail/drafts.json') & 0777) === 0600, 'brouillon non chiffré ou permissions trop ouvertes');
    ok($mail->deleteDraft($draft['id']) && $mail->drafts() === [], 'suppression du brouillon incorrecte');
    $badDraftRejected = false; try { $mail->saveDraft(['to'=>'not-an-email','subject'=>'x','body'=>'x']); } catch (Throwable $e) { $badDraftRejected = true; }
    ok($badDraftRejected, 'adresse invalide acceptée dans un brouillon');
    $mailClass = new ReflectionClass($mail);
    $validateAttachments = $mailClass->getMethod('validateAttachments'); $validateAttachments->setAccessible(true);
    $attachments = $validateAttachments->invoke($mail, [['name'=>'résumé.txt','data'=>base64_encode('Pièce jointe Weed OS')]]);
    ok(count($attachments) === 1 && $attachments[0]['data'] === 'Pièce jointe Weed OS', 'validation de pièce jointe incorrecte');
    $buildMime = $mailClass->getMethod('buildMimeMessage'); $buildMime->setAccessible(true);
    $mime = $buildMime->invoke($mail, 'test@example.com', 'dest@example.com', 'Test pièces jointes', 'Bonjour', $attachments);
    ok(str_contains($mime, 'multipart/mixed') && str_contains($mime, "filename*=UTF-8''r%C3%A9sum%C3%A9.txt") && str_contains($mime, base64_encode('Pièce jointe Weed OS')), 'construction MIME des pièces jointes incorrecte');
    $tooManyRejected = false;
    try { $validateAttachments->invoke($mail, array_fill(0, 6, ['name'=>'x.txt','data'=>base64_encode('x')])); } catch (Throwable $e) { $tooManyRejected = true; }
    ok($tooManyRejected, 'limite du nombre de pièces jointes non appliquée');
    Weed\Preferences::save('testuser', 'ui.lang', 'fr');
    ok((Weed\Preferences::load('testuser')['ui.lang'] ?? '') === 'fr', 'préférence utilisateur non enregistrée');
    $connectivity = (new Weed\Connectivity())->status();
    ok(isset($connectivity['wifi']['supported'], $connectivity['bluetooth']['supported'], $connectivity['ethernet']['devices'], $connectivity['internet']['state']), 'statut réseau incomplet');

    $archive = Weed\Backup::create('test-backup-passphrase');
    ok(is_file($archive) && filesize($archive) > 0, 'archive de sauvegarde non créée');
    ok(!str_contains((string)file_get_contents($archive), 'original'), 'sauvegarde non chiffrée');
    $verified = Weed\Backup::verify($archive, 'test-backup-passphrase');
    ok(($verified['valid'] ?? false) === true && ($verified['blocks'] ?? 0) > 0 && strlen($verified['sha256'] ?? '') === 64, 'vérification d’intégrité de sauvegarde incorrecte');
    $tampered = $archive . '.tampered'; copy($archive, $tampered);
    $tamperedBytes = file_get_contents($tampered); $tamperedBytes[strlen($tamperedBytes) - 20] = chr(ord($tamperedBytes[strlen($tamperedBytes) - 20]) ^ 1); file_put_contents($tampered, $tamperedBytes);
    $tamperRejected = false; try { Weed\Backup::verify($tampered, 'test-backup-passphrase'); } catch (RuntimeException $e) { $tamperRejected = true; }
    @unlink($tampered);
    ok($tamperRejected, 'archive altérée non détectée par le contrôle d’intégrité');
    file_put_contents(WEED_DATA . '/home/testuser/Documents/keep.txt', 'modified');
    $wrongRejected = false;
    try { Weed\Backup::restore($archive, 'wrong-passphrase'); } catch (RuntimeException $e) { $wrongRejected = true; }
    ok($wrongRejected && file_get_contents(WEED_DATA . '/home/testuser/Documents/keep.txt') === 'modified', 'phrase secrète incorrecte non rejetée sans modification');
    Weed\Backup::restore($archive, 'test-backup-passphrase');
    ok(file_get_contents(WEED_DATA . '/home/testuser/Documents/keep.txt') === 'original', 'restauration des fichiers incorrecte');
    ok(count((new Weed\MailClient('testuser'))->accounts()) === 1, 'restauration des comptes e-mail incorrecte');
    ok((Weed\Preferences::load('testuser')['ui.lang'] ?? '') === 'fr', 'restauration des préférences incorrecte');
    Weed\Preferences::reset('testuser');
    ok(Weed\Preferences::load('testuser') === [], 'réinitialisation des préférences incorrecte');
    @unlink($archive); @rmdir(dirname($archive));
    echo "system-features-smoke: OK\n";
} finally { rmTree($base); }
