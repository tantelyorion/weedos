#!/bin/sh
# Empaquete chaque Programme de apps-src/ en <id>-<version>.zip
set -e
cd "$(dirname "$0")/.."
mkdir -p build/apps
for d in apps-src/*/; do
  id=$(basename "$d")
  ver=$(php -r '$m=json_decode(file_get_contents($argv[1]."manifest.json"),true);echo $m["version"];' "$d")
  (cd "$d" && zip -qr "../../build/apps/$id-$ver.zip" .)
  echo "build/apps/$id-$ver.zip"
done
