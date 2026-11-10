#!/bin/sh
# Copie le code Weed (kernel PHP + bureau) et weedinit dans le rootfs. $1 = TARGET_DIR
set -e
SRC="${WEED_SRC:?WEED_SRC non défini (lancez via tools/build-iso.sh)}"
TARGET="$1"
INIT="$SRC/init/target/x86_64-unknown-linux-musl/release/weedinit"
[ -x "$INIT" ] || { echo "weedinit manquant : lancez 'make init'"; exit 1; }
[ -f "$SRC/system/desktop/assets/fontawesome/css/all.min.css" ] || { echo "FontAwesome manquant : lancez 'make assets'"; exit 1; }
mkdir -p "$TARGET/weed/data" "$TARGET/sbin"
rm -rf "$TARGET/weed/kernel" "$TARGET/weed/system"
cp -a "$SRC/kernel" "$SRC/system" "$TARGET/weed/"
install -m 0755 "$INIT" "$TARGET/sbin/weedinit"
chmod 0755 "$SRC/kernel/bin/weed-install.php"
ln -sf /weed/kernel/bin/weed-install.php "$TARGET/usr/bin/weed-install"
# v0.8.6 — compte Unix dédié weedworker (UID/GID 990), sans shell ni mot de passe
add_line() { # fichier, nom, ligne
  touch "$TARGET/etc/$1"
  grep -q "^$2:" "$TARGET/etc/$1" || printf '%s\n' "$3" >> "$TARGET/etc/$1"
}
if awk -F: '$1!="weedworker" && $3=="990"' "$TARGET/etc/passwd" "$TARGET/etc/group" | grep -q .; then
  echo "UID/GID 990 déjà utilisé par un autre compte" >&2; exit 1
fi
add_line group weedworker "weedworker:x:990:"
add_line passwd weedworker "weedworker:x:990:990:Weed Program Worker:/nonexistent:/sbin/nologin"
[ -f "$TARGET/etc/shadow" ] && add_line shadow weedworker "weedworker:!:19000:0:99999:7:::"
echo "Weed OS post-build OK"
