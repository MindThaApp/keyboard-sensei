#!/usr/bin/env bash
# Regenerates the Android splash images from the PWA icon in
# apps/web/public. macOS only (uses sips). Run from anywhere; re-run after the
# PWA icon changes and commit the results.
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/../web/public/icon-maskable-512.png"
res="$here/android/app/src/main/res"
brand="17171A"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

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

echo "Android splash regenerated from $src"
