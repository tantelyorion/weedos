#!/bin/sh
# Weed OS - son de démarrage natif (Linux/ALSA), lancé par le Kernel dès le boot.
# Usage : sh startup-sound.sh <startup.mp3> [fichier-marqueur] [volume 0-100]
# Le marqueur est supprimé si la lecture échoue : le bureau jouera alors le son
# lui-même (au mieux, selon la politique d'autoplay du navigateur).
FILE="$1"
MARK="$2"
VOL="${3:-85}"
case "$VOL" in
    ''|*[!0-9]*) VOL=85 ;;
esac
[ "$VOL" -gt 100 ] && VOL=100
[ "$VOL" -eq 0 ] && exit 0

fail() {
    echo "startup-sound: $1" >&2
    [ -n "$MARK" ] && rm -f "$MARK"
    exit 1
}

[ -r "$FILE" ] || fail "fichier illisible : $FILE"
command -v mpg123 >/dev/null 2>&1 || fail "mpg123 absent"

# 1. Attendre la carte son (max ~15 s). Les pilotes sont compilés dans le noyau ;
#    modprobe n'est qu'un filet de sécurité pour les noyaux personnalisés.
i=0
while [ "$i" -lt 75 ]; do
    ls /dev/snd/pcmC*D*p >/dev/null 2>&1 && break
    if [ "$i" -eq 5 ] && command -v modprobe >/dev/null 2>&1; then
        for m in snd_hda_intel snd_intel8x0 snd_usb_audio snd_virtio; do
            modprobe -q "$m" >/dev/null 2>&1
        done
    fi
    i=$((i + 1))
    sleep 0.2
done
ls /dev/snd/pcmC*D*p >/dev/null 2>&1 || fail "aucune carte son détectée"

# 2. ALSA démarre souvent muet : activer et régler les contrôles usuels sur le volume demandé.
if command -v amixer >/dev/null 2>&1; then
    for card in /proc/asound/card[0-9]*; do
        [ -e "$card" ] || continue
        n="${card##*card}"
        for ctl in Master Speaker Headphone Front PCM; do
            amixer -q -c "$n" sset "$ctl" "${VOL}%" unmute >/dev/null 2>&1
        done
    done
fi

# 3. Lecture (3 essais : le périphérique peut encore s'initialiser).
tries=0
while [ "$tries" -lt 3 ]; do
    mpg123 -q -o alsa "$FILE" && exit 0
    tries=$((tries + 1))
    sleep 1
done
fail "lecture impossible via ALSA"
