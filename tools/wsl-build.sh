#!/bin/sh
# Compile l'ISO Weed OS depuis WSL2, même si le projet est dans un dossier Windows (/mnt/c/...).
# Usage : sh tools/wsl-build.sh        (resultat : build/weed-os.iso dans le dossier d'origine)
set -eu
SRC=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK="${WEED_WORK:-$HOME/weed-os}"
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"

grep -qi microsoft /proc/version 2>/dev/null || echo "Note : WSL non détecté, on continue."

# Espace disque (Buildroot + WebKit : ~25-30 Go) et mémoire
FREE_GB=$(df -Pk "$HOME" | awk 'NR==2 {printf "%d", $4/1048576}')
MEM_GB=$(awk '/MemTotal/ {printf "%d", $2/1048576}' /proc/meminfo)
echo "Disque libre : ${FREE_GB} Go — RAM visible par WSL : ${MEM_GB} Go"
[ "$FREE_GB" -ge 30 ] || { echo "ERREUR : il faut au moins 30 Go libres (disque virtuel WSL)." >&2; exit 1; }
[ "$MEM_GB" -ge 6 ] || echo "ATTENTION : moins de 6 Go de RAM pour WSL ; WebKit risque d'échouer (voir .wslconfig dans docs/WSL-BUILD.md)." >&2

echo ">> Copie du projet vers $WORK (système de fichiers Linux)…"
mkdir -p "$WORK"
rsync -a --delete --exclude '/build/' --exclude '/init/target/' --exclude '/data/' "$SRC/" "$WORK/"
# Fichiers modifiés sous Windows : fins de ligne CRLF -> LF (sinon "sh: \r: not found")
find "$WORK" -type f \( -name '*.sh' -o -name '*.php' -o -name 'weed_defconfig' -o -name 'kernel.fragment' -o -name 'grub.cfg' -o -name 'Makefile' \) -exec sed -i 's/\r$//' {} +
# Réutilise le cache de compilation d'une exécution précédente (Buildroot long : on ne repart pas de zéro)
mkdir -p "$WORK/build"

cd "$WORK"
make check-build-host
make iso

mkdir -p "$SRC/build"
cp "$WORK/build/weed-os.iso" "$WORK/build/weed-os.iso.sha256" "$SRC/build/"
echo
echo "ISO copiée dans : $SRC/build/weed-os.iso"
command -v wslpath >/dev/null 2>&1 && echo "Chemin Windows  : $(wslpath -w "$SRC/build/weed-os.iso")"
echo "Lancez-la avec tools/qemu-windows.ps1 (PowerShell) ou dans VirtualBox."
