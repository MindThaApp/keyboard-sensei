#!/usr/bin/env bash
# Builds the sideload "home" APK: API at https://192.168.4.4:8181/api, home CA trusted
# for 192.168.4.4 only. Needs OCTAVIAPP_HOME_CA (path to the CA certificate, PEM).
#   OCTAVIAPP_HOME_CA=/path/to/keyboard-sensei-lan-ca.crt apps/mobile/scripts/build-home.sh
# Output: apps/mobile/android/app/build/outputs/apk/home/app-home.apk
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -z "${OCTAVIAPP_HOME_CA:-}" ] || [ ! -f "$OCTAVIAPP_HOME_CA" ]; then
  echo "build-home: set OCTAVIAPP_HOME_CA to the home CA certificate file (got: '${OCTAVIAPP_HOME_CA:-}')." >&2
  exit 1
fi
export VITE_API_URL="${VITE_API_URL:-https://192.168.4.4:8181/api}"
pnpm build:web
pnpm exec cap sync android
cd android
../scripts/with-android-env.sh ./gradlew assembleHome
