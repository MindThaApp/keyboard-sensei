# Android microphone: manual device test checklist

Milestone M8 of `docs/specs/MUSIC-PORTAL.md` (4.7, 9.1). The code is in place;
this checklist is for testing on real devices, which cannot be done in CI.

## What changed on Android

- `AndroidManifest.xml` declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`, and
  `android.hardware.microphone` as **not required** (the app still installs on
  devices without a mic).
- `mic/MicPermissionPlugin.kt` ("MicPermission", registered in `MainActivity`):
  Capacitor's built-in `checkPermissions` / `requestPermissions` for the
  `microphone` alias, plus `openAppSettings()`.
- Flow in the web app (`apps/web/src/audio/mic/`): explanation card first (once
  per device, key `mp-mic-explained`), then `requestPermissions`, then
  `getUserMedia`. With `RECORD_AUDIO` held, Capacitor's `BridgeWebChromeClient`
  grants the WebView's audio-capture request by itself.
- The application id stays `com.midivory.app`; no storage key was renamed.

## Build

```
pnpm install
pnpm --filter @keyboard-sensei/mobile android:debug     # needs JDK 21 + Android SDK, see docs/android.md
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Also run `pnpm --filter @keyboard-sensei/mobile android:test` once: the new
plugin has no unit tests of its own, but this confirms the project still
compiles.

To test an **upgrade** (data safety), install the current Play build first,
sign in, set a latency calibration and a few settings, then install the new
build over it with `adb install -r` (same signing key).

## Device matrix

Test on at least:

| # | Device | Android version | Notes |
|---|---|---|---|
| 1 | Low-end phone (2-3 GB RAM, older SoC) | | Checks CPU headroom for analysis |
| 2 | Current phone | | |
| 3 | Reference tablet | | The device used for the MIDI tests |

## Checklist (per device)

Copy the table into the test log and fill it in.

### Permission flow

| Step | Expected | Result |
|---|---|---|
| Fresh install, open a lesson exercise, choose **Microphone** | Explanation card shows ("Music Portal listens to grade your playing..."); no system prompt yet | |
| Tap **Not now** | Card closes, input back on Keyboard, MIDI still works | |
| Choose Microphone again, tap **Turn on microphone** | Android's permission prompt appears | |
| Choose **Allow** (while using the app) | Pill shows "Listening - mic"; Start becomes enabled | |
| Leave and re-open the exercise | No explanation card, no prompt; listening directly | |
| Revoke in system settings, return to the app, pick Microphone | Explanation skipped, system prompt shown again | |
| **Deny** once | "The microphone is off" card; MIDI still works; Try again re-prompts | |
| Deny again ("Don't ask again" on older Android) | Card shows **Open settings**; it opens the app's settings page | |
| Allow in settings, back to the app, **Try again** | Listening without a restart | |
| Revoke while listening (pull down settings, or `adb shell pm revoke com.midivory.app android.permission.RECORD_AUDIO`) | App does not crash; next attempt asks again | |
| Device with a USB/BLE MIDI keyboard connected, mic denied | Every MIDI feature works as before | |
| Play-along: **Input → Acoustic piano (mic)** | Same flow; the song switches to the melody level; guide/accompaniment silent | |

### Processing constraints

The app asks for echo cancellation, noise suppression and auto gain **off**.

| Check | Expected | Result |
|---|---|---|
| Warning "This device keeps voice processing on..." under the exercise | Not shown | |
| In `chrome://inspect` (USB debugging), run `(await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})).getAudioTracks()[0].getSettings()` | `echoCancellation`, `noiseSuppression`, `autoGainControl` all `false` | |
| Hold a long note (piano or a sung "aah") for 4 s | One note, not chopped into several; level does not pump | |

### Grading sanity

| Check | Expected | Result |
|---|---|---|
| Lesson 1 warm-up (C4, C5, C4) on an acoustic or digital piano through its speaker, mic mode | Passes; the notes found turn green | |
| Same exercise, play a wrong note on purpose, Finish | Fails, the wrong note is named | |
| Metronome on, timed exercise, phone speaker (no headphones) | Clicks do not show up as extra notes | |
| Quiet room vs. noisy room (TV on) | Noisy room shows "Too noisy..." instead of a silent bad grade | |
| Play very softly | "Too quiet..." shown | |

### Latency (record it)

Until the calibration flow lands (M2), measure the round trip by hand:

1. Timed exercise in mic mode, metronome on, headphones off.
2. Play exactly with the clicks for 8 beats; note the result's Timing bar and any
   early/late lines.
3. Repeat with the tap-along calibration value from Settings → Audio latency.

Record: device, Android version, headphones yes/no, measured output latency (ms,
from Settings), observed mic offset (ms, consistently early/late), timing grade.
Once calibration exists, record the value it stores in
`mp-mic-calibration:<deviceId>` instead.

Targets (spec 4.4): note onset within about 100 ms all-in on Android.

### Data safety on upgrade

| Check | Expected | Result |
|---|---|---|
| After upgrading over the Play build | Still signed in; latency calibration, appearance and sound unchanged | |
| `adb shell run-as com.midivory.app ls files` (debug builds) | No audio files written | |
