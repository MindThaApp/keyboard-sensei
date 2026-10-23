#!/usr/bin/env bash
# Regenerates the Android launcher icons and splash images from the PWA icon in
# apps/web/public. macOS only (uses sips). Run from anywhere; re-run after the
# PWA icon changes and commit the results.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/../web/public/icon-maskable-512.png"
res="$here/android/app/src/main/res"
brand="B4323E"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Launcher icons. The maskable icon is full-bleed, so it doubles as the legacy
# square/round icon. The adaptive foreground shrinks it to keep the piano inside
# the launcher's mask safe zone, over a solid brand-colour background.
for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  density="${pair%%:*}"
  size="${pair##*:}"
  fg=$((size * 108 / 48))
  inner=$((fg * 64 / 100))
  dir="$res/mipmap-$density"
  mkdir -p "$dir"
  sips -s format png -z "$size" "$size" "$src" --out "$dir/ic_launcher.png" >/dev/null 2>&1
  cp "$dir/ic_launcher.png" "$dir/ic_launcher_round.png"
  sips -s format png -z "$inner" "$inner" "$src" --out "$tmp/inner.png" >/dev/null 2>&1
  sips -p "$fg" "$fg" --padColor "$brand" "$tmp/inner.png" --out "$dir/ic_launcher_foreground.png" >/dev/null 2>&1
done

# Splash images for Android < 12 (12+ draws the launcher icon on the theme's
# windowSplashScreenBackground instead).
splash() { # <out> <width> <height>
  local icon=$(( ($2 < $3 ? $2 : $3) * 40 / 100 ))
  sips -s format png -z "$icon" "$icon" "$src" --out "$tmp/icon.png" >/dev/null 2>&1
  sips -p "$3" "$2" --padColor "$brand" "$tmp/icon.png" --out "$1" >/dev/null 2>&1
}
splash "$res/drawable/splash.png" 480 320
for spec in mdpi:320:480 hdpi:480:800 xhdpi:720:1280 xxhdpi:960:1600 xxxhdpi:1280:1920; do
  IFS=: read -r density w h <<<"$spec"
  mkdir -p "$res/drawable-port-$density" "$res/drawable-land-$density"
  splash "$res/drawable-port-$density/splash.png" "$w" "$h"
  splash "$res/drawable-land-$density/splash.png" "$h" "$w"
done

echo "Android icons and splash regenerated from $src"
