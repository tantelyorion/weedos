<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$kernel = file_get_contents($root . '/kernel/src/Kernel.php');
$script = file_get_contents($root . '/kernel/bin/startup-sound.sh');
$desktop = file_get_contents($root . '/system/desktop/js/weed.js');
$router = file_get_contents($root . '/system/router.php');
$config = file_get_contents($root . '/buildroot/weed_defconfig');
$frag = file_get_contents($root . '/buildroot/board/kernel.fragment');
$make = file_get_contents($root . '/Makefile');
$shellPos = strpos($kernel, "\$this->define('shell'");
$soundPos = strpos($kernel, '$this->defineStartupSound();');
$checks = [
    'startup sound is defined before every other service' => $soundPos !== false && $shellPos !== false && $soundPos < $shellPos,
    'startup MP3 path is the desktop system asset' => str_contains($kernel, "'/system/desktop/assets/sounds/startup.mp3'"),
    'startup player is a one-shot service' => str_contains($kernel, "\$this->define('startup-sound', \$cmd, false);"),
    'real system uses the ALSA script' => str_contains($kernel, '/kernel/bin/startup-sound.sh') && str_contains($script, 'mpg123 -q -o alsa'),
    'script waits for the sound card and unmutes ALSA' => str_contains($script, '/dev/snd/pcmC') && str_contains($script, 'amixer'),
    'dev mode falls back to a host player' => str_contains($kernel, 'hostSoundCommand') && str_contains($kernel, "'afplay'"),
    'kernel publishes a native-sound marker' => str_contains($kernel, 'var/run/startup-sound'),
    'status API exposes startupSound' => str_contains($router, "'startupSound'") && str_contains($router, '/api/system/sound/save'),
    'sound settings are admin-only' => ($p = strpos($router, "/api/system/sound/save'")) !== false && str_contains(substr($router, $p, 160), "!== 'admin'"),
    'kernel reads the system sound settings at boot' => str_contains($kernel, 'SystemSound::load()') && str_contains($kernel, 'handleSoundTest'),
    'desktop starts at once and only falls back when not native' => str_contains($desktop, 'ss.enabled && !ss.native'),
    'legal window is hidden from app center and spotlight' => ($q = strpos($desktop, 'APPS.legal = {')) !== false && str_contains(substr($desktop, $q, 200), 'hidden: true') && str_contains($desktop, '!a.hidden && a.title.toLowerCase().includes(q)).slice(0, 7)'),
    'wallpaper credits cover the 20 wallpapers' => preg_match('/WALLPAPER_CREDITS = \\[(.*?)\\];/s', $desktop, $m) === 1 && preg_match_all("/'[^']+'/", $m[1]) === 20,
    'public version is 1.0.0' => str_contains((string)file_get_contents($root . '/kernel/autoload.php'), "'1.0.0'"),
    'wallpapers 1-20 are accepted by preferences' => str_contains((string)file_get_contents($root . '/kernel/src/Preferences.php'), '1[0-9]|20'),
    'Buildroot includes ALSA, mpg123 and alsa-utils' => str_contains($config, 'BR2_PACKAGE_ALSA_LIB=y') && str_contains($config, 'BR2_PACKAGE_MPG123=y') && str_contains($config, 'BR2_PACKAGE_ALSA_UTILS_AMIXER=y'),
    'sound drivers are built in, not modules' => str_contains($frag, 'CONFIG_SND_HDA_INTEL=y') && !preg_match('/^CONFIG_SND\w*=m/m', $frag),
    'QEMU target has an HDA sound card' => str_contains($make, 'intel-hda') && str_contains($make, 'hda-duplex'),
];
foreach ($checks as $label => $ok) {
    if (!$ok) { fwrite(STDERR, "FAIL $label\n"); exit(1); }
    echo "ok  $label\n";
}
echo "Native startup audio smoke test OK\n";
