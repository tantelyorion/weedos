#!/bin/sh
# Exécuté sous fakeroot par Buildroot : code Weed en root:root, lecture seule pour weedworker.
set -e
TARGET="$1"
chown -R 0:0 "$TARGET/weed/kernel" "$TARGET/weed/system"
find "$TARGET/weed/kernel" "$TARGET/weed/system" -type d -exec chmod 0755 {} +
find "$TARGET/weed/kernel" "$TARGET/weed/system" -type f -exec chmod 0644 {} +
chmod 0755 "$TARGET/weed/kernel/bin/weed-install.php"
chown 0:0 "$TARGET/weed" "$TARGET/weed/data"
chmod 0755 "$TARGET/weed"
chmod 0711 "$TARGET/weed/data"
grep -q '^weedworker:x:990:990:' "$TARGET/etc/passwd" || { echo "weedworker absent de /etc/passwd" >&2; exit 1; }
echo "Weed OS fakeroot OK (code root:root, worker 990)"
