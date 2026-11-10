#!/bin/sh
# Font Awesome Free: archive is ZIP (never pass it to tar).
set -eu
VER="6.5.2"
DEST="$(dirname "$0")/../system/desktop/assets/fontawesome"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT INT TERM
URL="https://use.fontawesome.com/releases/v${VER}/fontawesome-free-${VER}-web.zip"
curl -fL "$URL" -o "$TMP/fa.zip"
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$TMP/fa.zip" -d "$TMP/extracted"
elif command -v powershell.exe >/dev/null 2>&1; then
  mkdir -p "$TMP/extracted"
  ZIP_PATH="$(cygpath -w "$TMP/fa.zip" 2>/dev/null || printf '%s' "$TMP/fa.zip")"
  OUT_PATH="$(cygpath -w "$TMP/extracted" 2>/dev/null || printf '%s' "$TMP/extracted")"
  powershell.exe -NoProfile -NonInteractive -Command "Expand-Archive -LiteralPath '$ZIP_PATH' -DestinationPath '$OUT_PATH' -Force"
else
  echo "ERREUR : installez unzip ou utilisez Git Bash avec PowerShell disponible." >&2
  exit 1
fi
SRC="$TMP/extracted/fontawesome-free-${VER}-web"
if [ ! -f "$SRC/css/all.min.css" ] || [ ! -d "$SRC/webfonts" ]; then
  echo "ERREUR : archive Font Awesome invalide ou structure inattendue." >&2
  exit 1
fi
mkdir -p "$DEST/css" "$DEST/webfonts"
cp "$SRC/css/all.min.css" "$DEST/css/"
cp "$SRC/webfonts/"* "$DEST/webfonts/"
echo "Font Awesome $VER installé dans $DEST"
