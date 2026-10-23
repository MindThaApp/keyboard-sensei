# Android app

The Android app wraps the `apps/web` production build in a Capacitor 8 shell
(`apps/mobile`). Everything the user sees is the same React app; the native
side adds hardware MIDI, keep-awake, the back button and the Play packaging.

- appId `com.keyboardsensei.app`, name "Keyboard Sensei"
- minSdk 24 (Android 7), targetSdk/compileSdk 36 (Android 16)
- The page is served from `https://localhost` inside the app

## Layout

```
apps/mobile/
  capacitor.config.ts          webDir ../web/dist, splash, system bars
  package.json                 Capacitor CLI + native plugin packages
  scripts/
    android-env.sh             JAVA_HOME (JDK 21) + ANDROID_HOME + PATH; source it
    with-android-env.sh        run one command inside that environment
    build-web.mjs              builds apps/web; requires an https VITE_API_URL
    generate-android-assets.sh launcher icons + splash from the PWA icon
  android/                     the Gradle project (committed)
    app/src/main/java/com/keyboardsensei/app/
      MainActivity.kt          registers the MIDI plugin
      midi/NativeMidiPlugin.kt android.media.midi: USB + Bluetooth LE input
      midi/MidiMessageParser.kt byte stream -> note on/off + CC messages
    app/src/test/...           JUnit tests for the parser
    app/src/main/res/xml/network_security_config.xml   HTTPS only
    app/src/debug/res/xml/network_security_config.xml  debug: + 10.0.2.2 cleartext

packages/midi-engine/src/capacitor.ts   CapacitorMidiAdapter (JS side)
apps/web/src/native/                    platform checks, adapter factory,
                                        back button, keep-awake
```

Why a separate `apps/mobile` rather than `apps/web/android`: the native
project, its Gradle build output and the Capacitor dependencies stay out of the
web package and out of the web Docker image's build context, and the web app
builds exactly as before. `apps/web` only gains the small JS packages it calls
(`@capacitor/core`, `@capacitor/app`, `@capacitor-community/keep-awake`).

## Toolchain (macOS)

You need a JDK 21 (Capacitor 8 and the Android Gradle Plugin require 21, not 17)
and the Android SDK with platform 36 and build-tools 36. On this Mac:

- JDK: Temurin 21 unpacked to `~/Library/Java/JavaVirtualMachines/jdk-21*`
  (no sudo needed). `brew install --cask temurin@21` or `brew install openjdk@21`
  also work; Android Studio's bundled JBR (21) is the last fallback.
- SDK: `~/Library/Android/sdk`, with `cmdline-tools/latest` from Google's
  command-line tools zip.

`apps/mobile/scripts/android-env.sh` finds a JDK 21 and the SDK and exports
`JAVA_HOME`, `ANDROID_HOME` and `PATH`. Source it in a shell, or prefix one
command with `with-android-env.sh`. It never edits your shell rc files.

```sh
source apps/mobile/scripts/android-env.sh
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
# Only for the emulator:
sdkmanager "emulator" "system-images;android-36;google_apis;arm64-v8a"
```

## Building locally

The API URL is baked into the web bundle at build time, so every build needs
`VITE_API_URL`. The public API domain does not exist yet;
`https://api.keyboardsensei.example` is the placeholder used throughout. Plain
`http://` is refused unless `KS_ANDROID_DEV_API=1` (below).

The API must allow the app's origin: add `https://localhost` to `CORS_ORIGIN`
(it is a comma-separated list), e.g. `CORS_ORIGIN=https://keyboardsensei.example,https://localhost`.

```sh
pnpm install
cd apps/mobile
VITE_API_URL=https://api.keyboardsensei.example pnpm build:web
pnpm exec cap sync android
cd android
../scripts/with-android-env.sh ./gradlew assembleDebug        # debug APK
../scripts/with-android-env.sh ./gradlew testDebugUnitTest    # Kotlin tests
```

The debug APK is `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`
(about 6 MB). Install it with `adb install -r <apk>`.

Rerun `pnpm build:web` and `cap sync android` after any web change. Open the
project in Android Studio with `pnpm exec cap open android` if you prefer.

### Against a local API in the emulator

The emulator reaches the host as `10.0.2.2`. Debug builds (only) allow
cleartext HTTP to that one address, and a dev sync lets the https page call it:

```sh
# API on 3112, with CORS_ORIGIN including https://localhost
cd apps/mobile
KS_ANDROID_DEV_API=1 VITE_API_URL=http://10.0.2.2:3112 pnpm build:web
KS_ANDROID_DEV_API=1 pnpm exec cap sync android
cd android && ../scripts/with-android-env.sh ./gradlew assembleDebug
```

A release build refuses to run while the synced config still has these dev
settings (`checkReleaseConfig` in `app/build.gradle`). Run a normal
`cap sync android` first.

Debug builds have WebView debugging on: `chrome://inspect` on the Mac shows
the app's page while it runs in the emulator or on a USB-connected phone.

## Native MIDI

The app does not use Web MIDI. It reads hardware through the `NativeMidi`
plugin (android.media.midi), and `MidiContext` picks the adapter automatically:
`CapacitorMidiAdapter` when `Capacitor.isNativePlatform()`, `WebMidiAdapter` in
a browser.

- **USB**: every USB MIDI device with an output port is opened when the app
  starts, and hot-plugged ones are opened as they arrive. No permission prompt.
  Most phones need a USB-C OTG adapter; the keyboard must be plugged into its
  USB-to-HOST port.
- **Bluetooth LE MIDI**: "Find a Bluetooth MIDI keyboard" in the MIDI status
  bar scans for the BLE-MIDI service and lists what it finds; tapping one opens
  it. Android 12+ asks for the "Nearby devices" permission
  (`BLUETOOTH_SCAN` declared `neverForLocation`, plus `BLUETOOTH_CONNECT`);
  Android 11 and older ask for location, which BLE scanning required there.
- **Messages**: the plugin frames the byte stream (running status, real-time
  bytes mid-message, sysex, split packets) and forwards note on, note off and
  control change, sustain (CC64) included. Everything else is dropped natively.
- **Timestamps**: Android stamps each packet with `System.nanoTime()` on
  arrival. The JS adapter maps that clock onto `performance.now()`, the clock
  judging and latency calibration use, by bracketing `getClock()` round trips
  with two page-clock readings and keeping the tightest one. On the emulator the
  round trip measured about 1 ms, so the mapping is accurate to about 0.5 ms;
  the bridge delay itself (event arrival in JS) is excluded because the event
  keeps its native arrival time.

## Release signing: the upload keystore

Google Play uses **Play App Signing**: Google holds the key that signs what
users install, and you sign uploads with your own **upload key**. Create it
once, keep it out of git, and back it up (a password manager plus an offline
copy). If it is lost, Play support can reset the upload key, but it takes days.

```sh
keytool -genkeypair -v \
  -keystore keyboard-sensei-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Keyboard Sensei, O=Keyboard Sensei"
```

`keytool` asks for the keystore password (and uses the same one for the key by
default in PKCS12). Never commit the `.jks`.

To build a signed release locally, point Gradle at it through the environment:

```sh
export ANDROID_KEYSTORE_PATH=$PWD/keyboard-sensei-upload.jks
export ANDROID_KEYSTORE_PASSWORD=...  ANDROID_KEY_ALIAS=upload  ANDROID_KEY_PASSWORD=...
cd apps/mobile/android && ../scripts/with-android-env.sh ./gradlew bundleRelease
# -> app/build/outputs/bundle/release/app-release.aab
```

`bundleRelease` fails without these variables rather than producing an
unsigned bundle.

## GitHub Actions

`.github/workflows/android.yml` runs on tags `android-v*` (for example
`android-v0.1.0`) and on manual dispatch. It builds the web app, syncs
Capacitor, runs the Kotlin tests, builds a signed release AAB, verifies the
signature and uploads the AAB as a workflow artifact.

Set these under **Settings → Secrets and variables → Actions**:

| Name | Kind | Value |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | `base64 -i keyboard-sensei-upload.jks \| pbcopy` (macOS) |
| `ANDROID_KEYSTORE_PASSWORD` | secret | keystore password |
| `ANDROID_KEY_ALIAS` | secret | `upload` |
| `ANDROID_KEY_PASSWORD` | secret | key password (same as the keystore's for PKCS12) |
| `VITE_API_URL` | variable (or secret) | the public `https://` API URL |

`versionCode` is the workflow run number (always increasing, as Play
requires); `versionName` is the tag without `android-v`, or the dispatch input.

## SHA-1 fingerprints (Google sign-in)

A Google OAuth **Android** client ID is tied to a package name and a SHA-1
certificate fingerprint. Create one client ID per certificate that will sign a
build users run:

```sh
# Debug key (local debug builds; created by the first debug build)
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey \
  -storepass android -keypass android | grep SHA1

# Upload key
keytool -list -v -keystore keyboard-sensei-upload.jks -alias upload | grep SHA1
```

Builds installed from Google Play are re-signed by Google, so they carry a
**third** fingerprint: Play Console → your app → Test and release → App
integrity → App signing → "App signing key certificate" SHA-1. That one is the
fingerprint production users present; register it too.

## Play Console: first upload

1. Create a Google Play developer account (one-time fee; identity
   verification can take a few days).
2. **Create app**: name "Keyboard Sensei", app (not game), free, accept the
   declarations.
3. Complete the **App content** forms: privacy policy URL (required; the app
   has accounts and stores practice history), data safety (account email,
   display name, practice history; data encrypted in transit; account
   deletion method), ads (none), content rating questionnaire, target
   audience. Bluetooth "Nearby devices" is used only to find MIDI keyboards
   and never for location.
4. Push a tag (`git tag android-v0.1.0 && git push origin android-v0.1.0`)
   or run the workflow manually, and download the AAB artifact.
5. **Test and release → Testing → Internal testing → Create new release**.
   Accept Play App Signing when asked, upload the AAB, add release notes, save,
   and roll out to internal testing. Add testers by email list and share the
   opt-in link.
6. Install from the opt-in link on a real phone with a MIDI keyboard and work
   through the checklist below. Promote to closed testing, then production,
   only after that. New personal developer accounts must run a closed test
   (Play's current minimum is 12 testers for 14 days) before production
   access is granted.

## Crash reports (Sentry)

The app uses `@sentry/capacitor` (with `@sentry/react`) and reports to the
**android** Sentry project, `environment: android`. Set `VITE_SENTRY_DSN_ANDROID`
(or `VITE_SENTRY_DSN`) when building the web bundle; without a DSN there is no
monitoring and no prompt. On first launch the app asks once whether to send
anonymous crash reports; the choice is in Settings → Account → Crash reports. The
native SDK is only started after the user agrees. Native (Java/NDK) crash reports
bypass the JavaScript redactor, so keep **Prevent Storing of IP Addresses** on in
the Sentry project (docs/operations.md, "Error monitoring"). `cap sync` registers
the plugin in `capacitor.settings.gradle`; no Sentry Gradle plugin is used, so
native frames are not symbolicated (JavaScript frames are, via the uploaded
source maps).

## Real-device checklist

The emulator cannot attach MIDI hardware or play through a speaker you can
hear. On a real phone or tablet:

- USB keyboard via OTG: status bar shows the keyboard's name, keys light the
  on-screen piano and sound, sustain pedal holds notes.
- Unplug and replug: status updates and input resumes without restarting.
- Bluetooth keyboard: search finds it, connect works, notes arrive.
- Timing: run latency calibration; then a lesson exercise in time. Scores
  should match what the same keyboard gets in desktop Chrome.
- Sound starts on the first tap anywhere (audio unlock), not only after Play.
- Screen stays on during a long Play-Along; dims normally on Today/Settings.
- Back button walks back through pages and leaves the app from Today.
- Rotate during a lesson: nothing hidden behind the status or gesture bars.

## Known limitations

- **Tokens in localStorage.** The access token is in the WebView's
  localStorage, as on the web. Acceptable for now: the WebView's storage is
  private to the app. Moving it to Android Keystore-backed storage is a
  follow-up, together with refresh tokens.
- **Decoded instruments are freed late.** The low-memory cap (2 decoded
  instruments when `navigator.deviceMemory <= 4`) works, but switching
  instruments drops buffers that V8 does not collect promptly: on the
  emulator the WebView renderer grew from 189 MB to 622 MB over five
  instrument switches and fell back to 298 MB only after a forced GC. A phone
  under memory pressure could kill the renderer before GC runs.
- **Web MIDI in the WebView.** The WebView (Chrome 133 on the emulator) does
  expose `navigator.requestMIDIAccess` and resolves it (with no inputs on the
  emulator). The app ignores it in favour of the native plugin, which also
  covers Bluetooth pairing and gives arrival timestamps; whether WebView Web
  MIDI sees a real USB keyboard has not been tested.
