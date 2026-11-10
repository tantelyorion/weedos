#!/bin/sh
set -eu
missing=0
for tool in make gcc g++ git curl wget cpio rsync bc file python3 perl tar xz unzip zip php cargo rustc patch gawk flex bison bzip2 sed; do
  if ! command -v "$tool" >/dev/null 2>&1; then echo "MANQUANT: $tool"; missing=1; fi
done
for pkg in libncurses-dev libssl-dev; do
  if command -v dpkg-query >/dev/null 2>&1 && ! dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null | grep -q 'install ok installed'; then echo "À INSTALLER: $pkg"; missing=1; fi
done
if [ "$missing" -ne 0 ]; then echo "Installez les dépendances manquantes (sous WSL : sh tools/wsl-setup.sh) puis relancez make check-build-host." >&2; exit 1; fi
if ! rustup target list --installed 2>/dev/null | grep -qx 'x86_64-unknown-linux-musl'; then echo "MANQUANT: cible Rust x86_64-unknown-linux-musl (rustup target add x86_64-unknown-linux-musl)"; exit 1; fi
echo "Hôte prêt pour la compilation Weed OS (Buildroot + Rust)."
