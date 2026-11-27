# Store listing texts

Listing copy for Google Play and the Microsoft Store, kept in the repo so every
release uses the same words. Names follow spec section 1.4 and the owner's
decisions. No prices, account ids or product ids belong in this file.

Rules:

- The first two releases under the new name say **"formerly Midivory"** in the
  short description, the full description and the release notes, so existing
  users recognise the update.
- Describe only what the release actually contains. Lines marked _(when shipped)_
  go in once that milestone is in the build; until then use the "piano release"
  variants.
- Renaming a listing keeps the package (`com.midivory.app` on Play), ratings and
  reviews.

## Google Play

| Field | Text | Limit |
|---|---|---|
| App name | `Music Portal: Piano & Guitar` | 28 / 30 |
| Installed app label | `Music Portal` (`strings.xml` `app_name`) | - |
| Short description (piano release) | `Piano lessons and play-along songs with your MIDI keyboard. Formerly Midivory.` | 78 / 80 |
| Short description (multi-instrument release) | `Piano, Guitar & Violin Lessons + Tuner. Formerly Midivory.` | 58 / 80 |
| Short description (after two releases) | `Piano, Guitar & Violin Lessons + Tuner. Learn with MIDI or your microphone.` | 75 / 80 |

### Full description

```
Music Portal (formerly Midivory) teaches you to play, one short lesson at a time.

PIANO
• Step-by-step lessons from your first notes to intermediate pieces
• Instant feedback from a MIDI keyboard (USB or Bluetooth), or play on the on-screen piano
• Play-along mode with falling notes, adjustable speed, wait mode and personal bests
• Sheet music, quizzes, narration and a daily practice goal with streaks

GUITAR (when shipped)
• Tab and standard notation, chord diagrams and an on-screen fretboard
• Lessons from open strings and first chords to barre chords and the blues
• Your playing is graded through the microphone: notes, chords and timing

VIOLIN (when shipped)
• Finger patterns, positions and bowing, with an on-screen fingerboard
• Intonation feedback in cents, note by note

TUNER (when shipped)
• Chromatic tuner with presets for guitar, violin and more, and a reference tone

PRIVACY
• No ads and no tracking. Microphone audio is analysed on your device and never uploaded or stored.

Formerly Midivory? Your account, progress and settings carry over automatically.
```

### Release notes (first release under the new name)

```
Music Portal (formerly Midivory). Same app, same account, same progress, with a new
name and icon, getting ready for guitar, violin and a tuner.
```

## Microsoft Store

| Field | Text |
|---|---|
| Product name (reserved) | `Music Portal` |
| Fall-back names | `Music Portal - Lessons & Tuner` |
| Short description | `Piano, guitar and violin lessons with a tuner. Learn with a MIDI keyboard or your microphone.` |
| Description | The Google Play full description above, with "USB or Bluetooth" kept and the Android-only wording removed |
| Privacy policy URL | `https://<web domain>/privacy` (the web domain stays as it is for now) |

## Web

| Place | Text |
|---|---|
| Page title (`apps/web/index.html`) | `Music Portal - Piano, Guitar & Violin Lessons` |
| PWA name / short name (`manifest.webmanifest`) | `Music Portal` |
