#!/usr/bin/env bash
# Runs one command inside the Android build environment, e.g.
#   apps/mobile/scripts/with-android-env.sh ./gradlew assembleDebug
set -euo pipefail
# shellcheck source=./android-env.sh
source "$(dirname "$0")/android-env.sh"
exec "$@"
