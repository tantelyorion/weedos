#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
command -v php >/dev/null 2>&1 || { echo "PHP CLI est requis pour vérifier le projet." >&2; exit 1; }
find "$ROOT/kernel" "$ROOT/system" -type f -name '*.php' -print | while IFS= read -r file; do
  php -l "$file" >/dev/null || exit 1
done
for i in $(seq -w 1 20); do
  file="$ROOT/system/desktop/assets/wallpapers/wallpaper-$i.jpg"
  [ -s "$file" ] || { echo "Fond manquant: $file" >&2; exit 1; }
done
if find "$ROOT/system/desktop/assets/wallpapers" -type f -name '*.svg' | grep -q .; then
  echo "Des SVG sont encore présents dans le dossier wallpapers." >&2
  exit 1
fi
if command -v node >/dev/null 2>&1; then
  node "$ROOT/tools/check-locales.js"
  for f in "$ROOT"/system/desktop/js/*.js; do node --check "$f" || exit 1; done
fi
for s in startup shutdown error; do
  [ -f "$ROOT/system/desktop/assets/sounds/$s.mp3" ] || echo "Note : son optionnel absent (system/desktop/assets/sounds/$s.mp3)" >&2
done
echo "Vérification PHP, JavaScript et fonds d’écran: OK"
