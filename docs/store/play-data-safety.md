# Play Console: Data safety answers for Music Portal

Replaces the microphone-related answers in `docs/play-data-safety.md` for the
Music Portal release. Everything else in that sheet stays as it is (account,
progress, uploads, feedback, crash reports, deletion, encryption, 13 and over).
Apply the changes below, then keep both sheets in step with the privacy text in
`docs/store/privacy-policy.md`.

## What changes

| Item | Midivory answer | Music Portal answer |
|---|---|---|
| Microphone used | Never | **Yes**, by lessons that listen, the tuner and Piano check |
| Android permission | None | `RECORD_AUDIO` declared in the manifest |
| Audio → **Voice or sound recordings** | Not collected | **Not collected** (see below) |
| Audio → **Music files** | Collected (uploaded MIDI files and saved MIDI practice recordings) | Unchanged |
| App activity → **App interactions** | Notes played: pitch, velocity, timing | Also cents sharp or flat and chord labels recognised. Still notes and scores, not audio |

## Why "Voice or sound recordings" stays "Not collected"

Play defines collection as data that leaves the device. Music Portal:

- reads microphone input in memory on the device;
- analyses it into note numbers, cents, timings and chord labels;
- discards the sound straight away, never writing it to storage;
- never sends audio to our servers, to Sentry or to any other service.

Because no audio is transmitted off the device, nothing in the Audio category
about the microphone is declared as collected. The derived notes and scores that
are sent are already covered under App activity → App interactions.

Do not treat this as "processed ephemerally" for the audio itself: that Play
option applies to data that is sent off the device and held only briefly, and
no audio is sent. Piano check reports (note names and cent deviations) can be
saved to the account at the user's choice and fall under App interactions,
optional.

## Overview questions

Unchanged from `docs/play-data-safety.md`.

## Permission declaration and listing wording

- Permissions form: `RECORD_AUDIO` is used for the core features of grading
  playing, the tuner and Piano check. Requested only when the user opens one of
  those features, after an in-app explanation.
- The permission is runtime-only. Declining it leaves MIDI input and the
  on-screen instruments working.
- Listing text says that microphone sound is analysed on the device and never
  recorded or uploaded (`docs/store/play-listing.md`).

## Checks before submitting

1. The app really never writes audio buffers to disk, logs or crash reports
   (the spec adds audio objects to the Sentry redaction tests).
2. No network request carries audio. Review the final build's network log
   during a microphone lesson, the tuner and Piano check.
3. The privacy policy URL shows the Music Portal text with the Microphone
   section.
4. Contact email on the listing and the policy: mindthaapp@gmail.com.
