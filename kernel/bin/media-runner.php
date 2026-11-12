<?php
declare(strict_types=1);

/** Exécuteur d'une tâche média FFmpeg (lancé en arrière-plan par le Kernel : media-runner.php <id>).
 *  Lit data/var/media/jobs/<id>.spec.json, exécute FFmpeg, publie la progression dans <id>.json. */
define('WEED_ROOT', getenv('WEED_ROOT') ?: dirname(__DIR__, 2));
putenv('WEED_WORKER=1');
require_once WEED_ROOT . '/kernel/autoload.php';

try {
    exit(Weed\Media::runJob((string)($argv[1] ?? '')));
} catch (Throwable $e) {
    Weed\Log::write('MEDIA', 'exécuteur : ' . $e->getMessage());
    exit(1);
}
