#!/bin/sh
# Construit l'ISO Weed OS avec Buildroot (hôte Linux ou WSL2, Internet requis).
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
BR_VER=2024.02.9

# Buildroot refuse un PATH contenant des espaces (cas typique de WSL : "C:\Program Files\...").
PATH=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '[[:space:]]' | paste -sd: -)
export PATH
case "$ROOT" in
  /mnt/[a-z]/*) echo "ERREUR : le projet est sur un disque Windows ($ROOT). Buildroot exige le système de fichiers Linux." >&2
                echo "Utilisez : sh tools/wsl-build.sh (copie automatiquement le projet vers ~/weed-os)." >&2; exit 1 ;;
esac
case "$ROOT" in *[[:space:]]*) echo "ERREUR : le chemin du projet contient des espaces : $ROOT" >&2; exit 1 ;; esac

# Nombre de tâches : limité par la RAM (WebKit consomme ~2 Go par tâche à l'édition de liens). JOBS=2 make iso pour forcer.
if [ -z "${JOBS:-}" ]; then
  CPUS=$(nproc 2>/dev/null || echo 2)
  MEM_GB=$(awk '/MemTotal/ {printf "%d", $2/1048576}' /proc/meminfo 2>/dev/null || echo 4)
  BYRAM=$((MEM_GB / 2)); [ "$BYRAM" -lt 1 ] && BYRAM=1
  JOBS=$CPUS; [ "$BYRAM" -lt "$JOBS" ] && JOBS=$BYRAM
fi
echo "Compilation avec $JOBS tâche(s) parallèle(s)."

mkdir -p build
if [ ! -d build/buildroot ]; then
  curl -fL "https://buildroot.org/downloads/buildroot-$BR_VER.tar.xz" | tar -xJ -C build
  mv "build/buildroot-$BR_VER" build/buildroot
fi
cp buildroot/weed_defconfig build/buildroot/configs/weed_defconfig
# Le defconfig référence board/weed/post-build.sh depuis la racine Buildroot.
mkdir -p build/buildroot/board/weed
grep -q '^BR2_ROOTFS_POST_BUILD_SCRIPT="board/weed/post-build.sh"$' buildroot/weed_defconfig || {
  echo "Chemin post-build incohérent dans buildroot/weed_defconfig" >&2; exit 1;
}
grep -q '^BR2_ROOTFS_POST_FAKEROOT_SCRIPT="board/weed/post-fakeroot.sh"$' buildroot/weed_defconfig || {
  echo "Option BR2_ROOTFS_POST_FAKEROOT_SCRIPT (au singulier) absente ou incorrecte dans buildroot/weed_defconfig" >&2; exit 1;
}
cp buildroot/board/* build/buildroot/board/weed/
chmod 0755 build/buildroot/board/weed/post-build.sh build/buildroot/board/weed/post-fakeroot.sh
export WEED_SRC="$ROOT"
cd build/buildroot
make weed_defconfig
# Buildroot ignore SILENCIEUSEMENT une option inconnue ou aux dépendances non satisfaites : on s'arrête avant 1-2 h de compilation.
bad=0
while IFS= read -r line; do
  grep -qxF "$line" .config || { echo "OPTION IGNORÉE par Buildroot : $line" >&2; bad=1; }
done <<DEFCONF
$(grep -E '^BR2_[A-Z0-9_]+=' configs/weed_defconfig)
DEFCONF
[ "$bad" -eq 0 ] || { echo "Corrigez buildroot/weed_defconfig (nom d'option ou dépendance manquante) puis relancez." >&2; exit 1; }
make -j"$JOBS"
cp output/images/rootfs.iso9660 "$ROOT/build/weed-os.iso"
( cd "$ROOT/build" && sha256sum weed-os.iso > weed-os.iso.sha256 )
echo "ISO prête : build/weed-os.iso ($(du -h "$ROOT/build/weed-os.iso" | cut -f1))"
