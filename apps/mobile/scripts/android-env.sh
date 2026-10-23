#!/usr/bin/env bash
# Android build environment for Keyboard Sensei (macOS).
#
# Source it, don't run it:   source apps/mobile/scripts/android-env.sh
#
# Sets JAVA_HOME to a JDK 21 (Capacitor 8 and the Android Gradle Plugin need 21)
# and ANDROID_HOME to the SDK, and puts the SDK tools on PATH. Nothing is written
# to your shell rc files. Set either variable before sourcing to use your own.

_ks_is_jdk21() {
  [ -n "$1" ] && [ -x "$1/bin/java" ] && "$1/bin/java" -version 2>&1 | grep -q 'version "21'
}

if ! _ks_is_jdk21 "${JAVA_HOME:-}"; then
  JAVA_HOME=""
  for candidate in \
    "$(/usr/libexec/java_home -v 21 2>/dev/null)" \
    "$HOME"/Library/Java/JavaVirtualMachines/jdk-21*/Contents/Home \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    if _ks_is_jdk21 "$candidate"; then
      JAVA_HOME="$candidate"
      break
    fi
  done
  [ -z "$JAVA_HOME" ] && echo "android-env: no JDK 21 found; see docs/android.md (Toolchain)." >&2
fi
unset -f _ks_is_jdk21
export JAVA_HOME

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
