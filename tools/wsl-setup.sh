#!/bin/sh
# Prépare Ubuntu sous WSL2 pour compiler Weed OS (à lancer UNE fois : sh tools/wsl-setup.sh).
set -eu
grep -qi microsoft /proc/version 2>/dev/null || echo "Note : ce n'est pas un WSL, le script installe quand même les dépendances Debian/Ubuntu."
echo ">> Paquets système (mot de passe sudo demandé)…"
sudo apt-get update
sudo apt-get install -y build-essential git curl wget cpio rsync bc file python3 perl unzip zip xz-utils bzip2 patch gawk flex bison \
  libncurses-dev libssl-dev libelf-dev php-cli php-zip php-mbstring php-xml ca-certificates pkg-config
if ! command -v rustup >/dev/null 2>&1; then
  echo ">> Installation de Rust (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
rustup target add x86_64-unknown-linux-musl
echo ">> Vérification…"
cd "$(dirname "$0")/.." && sh tools/check-build-host.sh
echo "Terminé. Si 'cargo' est introuvable plus tard : source ~/.cargo/env (ou rouvrez le terminal WSL)."
