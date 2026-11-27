# Music Portal: product and technical spec

Status: **proposal, for review**. Nothing here is built yet. This document plans
turning Midivory (piano, MIDI-first) into one multi-instrument app, **Music
Portal**, with piano, guitar and violin lessons, microphone grading, a tuner and
an acoustic-piano check. It is written against the code as it stands on
`master`; file paths are real and are the places the work lands.

Working listing title: **"Music Portal - Piano, Guitar & Violin Lessons + Tuner"**
(see 1.4 for the per-store length limits).

Contents

1. [Rename plan](#1-rename-plan)
2. [Instruments](#2-instruments)
3. [Violin and guitar lessons](#3-violin-and-guitar-lessons)
4. [Mic grading](#4-mic-grading)
5. [Tuner](#5-tuner)
6. [Acoustic piano tuning](#6-acoustic-piano-tuning)
7. [Free vs paid (proposal)](#7-free-vs-paid-proposal)
8. [Windows desktop app](#8-windows-desktop-app)
9. [Milestones, tests and risks](#9-milestones-tests-and-risks)

Appendix: [A. Decisions needed from the owner](#appendix-a-decisions-needed-from-the-owner)

---

## Where we start from

A short inventory of what the new work builds on, so the rest of the doc can
refer to it.

| Area | Today | Where |
|---|---|---|
| Lessons | `Lesson` with typed `sections` (markdown, theory card, notation, midi-exercise, quiz); unlock by `unlockCriteria.requiresLessonIds` (not by position); ids are permanent DB keys | `packages/shared-types/src/index.ts`, `apps/api/src/content/*`, `packages/lesson-engine` |
| Exercises | `MidiExercise` = list of `ExpectedNoteEvent` (MIDI note, beat, duration, hand, finger, chord group) + tolerances | `packages/shared-types`, `apps/api/src/content/helpers.ts` |
| Scoring | `scoreMidiExercise()` turns `PerformedNote[]` into a `ScoringResult` (note, timing, rhythm, chord accuracy, mistakes, feedback). The **server re-scores** every attempt from the submitted notes | `packages/midi-engine/src/scoring.ts`, `apps/api/src/app.ts` (`performanceSchema`) |
| Input | `MidiAdapter` interface; `WebMidiAdapter` (browser), `CapacitorMidiAdapter` (Android USB + BLE via `NativeMidiPlugin.kt`), `MockMidiAdapter` (on-screen piano / computer keys) | `packages/midi-engine/src/{web,capacitor,adapters}.ts`, `apps/web/src/native/hardwareMidi.ts` |
| Timing | Output-latency offset with tap-along calibration | `apps/web/src/audio/latency.ts`, `components/settings/AudioLatencySection.tsx` |
| Notation | VexFlow (exercises), Verovio and OSMD (sheets) | `components/notation`, `utils/engraving.ts` |
| Play-along | Falling-notes engine, arrangement levels incl. a **melody-only** reduction | `packages/playalong-core`, `packages/midi-engine/src/arrangement.ts` |
| Progression | XP ledger keyed by what earned it (idempotent), stars, streaks | `apps/api/src/progression/` |
| Shells | Web (Docker: nginx + API + Postgres behind Caddy), Android (Capacitor 8, page served from `https://localhost`) | `docker-compose*.yml`, `apps/mobile` |
| Microphone | **Not used anywhere yet** (no `getUserMedia`, no AudioWorklet) | - |

One naming trap to avoid from day one: the codebase already has an
**`Instrument`** concept, and it means a *sampled sound* (the `Instrument` Prisma
model, `utils/instrumentBank.ts`, `components/instruments/InstrumentPicker.tsx`,
the `keyboard-sensei-instrument-id` storage key). The instrument a learner
*plays* must use a different name in code. This spec uses
**`PlayedInstrument`** (`"piano" | "guitar" | "violin"`) everywhere; UI copy can
still say "instrument".

---

## 1. Rename plan

Principle: **change every name a person reads; keep every name a machine keys
on.** Identifiers that address stored data (app ids, storage keys, database and
volume names, lesson ids) stay exactly as they are. Nothing is deleted on
upgrade; where a format must change, data is copied forward and the old copy is
left in place.

### 1.1 What changes (user-visible)

| Place | Today | Becomes |
|---|---|---|
| Web title | `apps/web/index.html` `<title>Midivory: Piano MIDI Player</title>` | `Music Portal - Piano, Guitar & Violin Lessons` |
| PWA manifest | `apps/web/public/manifest.webmanifest` `name`/`short_name`/`description` | `name: "Music Portal"`, `short_name: "Music Portal"`, new description. Keep `start_url`/`scope`/`id` unchanged so installed PWAs update in place |
| Wordmark and icon | `components/brand/Wordmark.tsx`, `brand/midivory-icon.svg`, `apps/web/public/favicon.svg` | New mark; new source `brand/music-portal-icon.svg`; re-run `brand/generate-sources.mjs` and `brand/rasterize.mjs` for web, Android and (new) Windows assets. Old SVG kept until the new one has shipped everywhere |
| Android launcher label | `strings.xml` `app_name`, `title_activity_main`; `capacitor.config.ts` `appName` | `Music Portal` |
| Legal pages | `components/legal/{Privacy,Terms,DeleteAccount,ThirdPartyLicenses,PublicPageLayout}.tsx` | Rename, plus the new microphone section (4.8). Add "Music Portal (formerly Midivory)" for at least two releases |
| Emails | `apps/api/src/auth-routes.ts` subjects/bodies, `config.ts` `MAIL_FROM` default | "Music Portal" |
| API log line | `apps/api/src/server.ts` | "Music Portal API listening..." |
| Mock device | `packages/midi-engine/src/adapters.ts` manufacturer `"Midivory"` | `"Music Portal"` (update its test) |
| OMR service comment | `services/omr/server.py` | Comment only |
| Docs | `README.md`, `docs/HANDOVER.md`, `docs/android.md`, `docs/operations.md`, `docs/play-data-safety.md`, `scripts/restore-keyboard-sensei.md` | Product name; keep the technical identifiers that stay (below) and say so |
| Store listings | Play: "Midivory: Piano MIDI Player" | New name, screenshots, description; first two releases mention "formerly Midivory" so existing users recognise the update |

A `grep -ri midivory` gate in CI (allow-list for the identifiers below) keeps
the old name from creeping back into UI text.

### 1.2 What must stay (data and identity)

| Identifier | Value | Why it stays |
|---|---|---|
| Android `applicationId` / `namespace` / Kotlin package | `com.midivory.app` | The Play listing is bound to it. A new id is a new app: existing installs would never update and would lose on-device settings. Users never see it |
| Capacitor `appId` | `com.midivory.app` | Same as above |
| Android page origin | `https://localhost` | `localStorage` is per origin; keeping it means every local setting survives the update untouched |
| Web storage keys | `ks-*` and `keyboard-sensei-*` (e.g. `ks-audio-latency-ms`, `ks-playalong-settings`, `ks-experience`, `keyboard-sensei-access-token`, `keyboard-sensei-instrument-id`, `keyboard-sensei-note-reading-config`, `keyboard-sensei-crash-reporting`) | Renaming them gains nothing and risks resetting latency calibration, appearance, sign-in and crash consent. New keys may use an `mp-` prefix; existing keys are never renamed |
| Workspace packages | `@keyboard-sensei/*` | Internal import names; renaming touches every file for no user benefit. Optional later, as its own PR |
| Database | Postgres db/user `keyboard_sensei` | Renaming means a dump/restore with downtime for no gain |
| Docker volumes | `keyboard-sensei-postgres-data`, `-tts-cache`, `-midi-library`, `-instruments`, `-feedback-screenshots`, `-caddy-data`, `-caddy-config` | **A renamed volume is an empty volume**: the stack would start on a blank database. These names are fixed forever (or migrated with an explicit copy step, never by editing compose) |
| GHCR images | `ghcr.io/mindthaapp/keyboard-sensei-{web,api}` | Deploy scripts and the server pull these; can gain extra tags later |
| Seeded accounts | `admin@keyboardsensei.local`, `demo@keyboardsensei.local` | The seed upserts by email; changing them creates duplicates |
| Lesson and exercise ids | all ids in `apps/api/src/content/*` | Permanent keys for progress and attempts (README rule) |
| JWT / token format, Sentry release prefix `keyboard-sensei@` | - | Continuity of sessions and of release history |
| Repository name | `keyboard-sensei` | Can be renamed on GitHub later (redirects work), but GHCR names and docs should be checked in the same change; not required for the launch |

### 1.3 Settings migration rules

1. **Never delete a stored key on upgrade.** If a value's shape changes, write
   the new shape to a new key and leave the old one. `utils/appearance.ts`
   already does this with `LEGACY_THEME_KEY` / `LEGACY_ACCENT_KEY`; follow that
   pattern.
2. Add `apps/web/src/state/storageMigrations.ts`: an ordered list of idempotent
   steps, a `mp-storage-version` marker, run once at start-up before any store
   reads. Each step copies, never moves. Unit-tested with a fixture of every
   key a current install can hold.
3. Add a **storage-key inventory test** that lists every key the app reads; a PR
   that drops one fails until the inventory is updated on purpose.
4. New multi-instrument settings get defaults that reproduce today's behaviour:
   `PlayedInstrument` defaults to `"piano"`, input defaults to the current MIDI
   path, so an upgraded install looks and behaves exactly as before until the
   learner opens the instrument picker.
5. **If the web domain changes** (new public domain for the new name), local
   settings do not follow automatically, because storage is per origin. Plan:
   the old domain keeps serving the app for a transition period with a banner;
   its "Move to the new address" button serialises the known `ks-*` /
   `keyboard-sensei-*` keys (minus the access token) into the **URL fragment**
   of the new address, which never reaches a server, and the new origin's
   migration step imports them if its own keys are empty. Server-side settings
   (`experience_mode`, daily goal, timezone, progress) need nothing: they come
   back on sign-in.

### 1.4 Store listing names

- **Google Play** app names are limited to **30 characters**, so the full title
  does not fit. Proposal: name `Music Portal: Piano & Guitar` (28) or plain
  `Music Portal`, with "Piano, Guitar & Violin Lessons + Tuner" in the short
  description (80 characters).
- **Microsoft Store**: reserve "Music Portal" in Partner Center as early as
  possible; product names are unique per Store and may already be taken. Keep
  two fall-backs ready (e.g. "Music Portal - Lessons & Tuner").
- Play Data safety and the privacy page gain a microphone line (4.8). Changing
  the listing name does not change the package, ratings or reviews.

---

## 2. Instruments

### 2.1 The picker

- First run (and Settings → Instrument): "What do you play?" with **Piano**,
  **Guitar**, **Violin**; more than one may be chosen, one is *active*.
- The active instrument scopes **Learn**, **Today**, the **Practice gym** and
  the default **tuner preset**. Progress, XP, streaks and achievements stay
  shared across instruments (one learner, one streak).
- Stored server-side so a second device picks it up (same pattern as
  `User.experience_mode`): new nullable `User.played_instruments String[]` and
  `User.active_instrument String?`; `NULL` reads as piano. Local cache key
  `mp-active-instrument` for offline start.
- The existing sound picker (`InstrumentSection.tsx`) is renamed in UI to
  **"Sound"** to stop the two meanings colliding.

### 2.2 Input per instrument

| Instrument | Inputs | Notes |
|---|---|---|
| Piano | MIDI (existing: Web MIDI, Android USB/BLE, on-screen piano), **mic (new)** | Mic mode is for acoustic pianos without MIDI. It grades **single-line** exercises and melody-only play-along (`extractMelody` already exists); full two-hand polyphony stays MIDI-only (4.6) |
| Guitar | Mic | Single notes graded per note; chords graded as right/wrong chord (4.5). On-screen fretboard for practice without a guitar (ungraded) |
| Violin | Mic | Single notes with intonation in cents; double stops are out of scope for grading in v1 |

The exercise player picks an input source from the exercise's `input` field
(2.4) and what is available, and shows a status pill like today's
`MidiStatusBar.tsx` ("Keyboard connected" / "Listening - mic").

### 2.3 Shared engine vs per-instrument parts

```
                 ┌───────────────────────────── shared ─────────────────────────────┐
 MIDI adapters ──┤                                                                  │
 (existing)      │  PerformedNote[] ──► scoreMidiExercise() ──► ScoringResult ──► API│
 Mic note source ┤      ▲                 + scoreIntonation() (new, optional)       │
 (new)           │      │                 + scoreChordExercise() (new)              │
                 │  lesson player, sections, quizzes, XP, unlocks, history, TTS     │
                 └──────────────────────────────────────────────────────────────────┘
 per instrument: notation renderer (staff / tab / chord box / fingering), on-screen
                 instrument (piano / fretboard / fingerboard), curriculum content,
                 tuner presets, tolerance profiles, mic tuning parameters (range, window)
```

- **Shared (unchanged):** lesson model and player (`LessonPlayerPage.tsx`,
  `ExerciseSet.tsx`), quiz, markdown/theory sections, narration, progression,
  unlocks, attempts API, history, practice-day/streak logic.
- **Shared (new):** `packages/audio-analysis` (pure TypeScript, no DOM, like
  `midi-engine`'s main entry): YIN/pYIN, onset detection, note segmentation,
  chroma, harmonic analysis. Browser glue (AudioWorklet, `getUserMedia`) lives
  in `apps/web/src/audio/mic/`, mirroring the `midi-engine` / `midi-engine/web`
  split.
- **The bridge:** a `MicNoteSource` turns detected notes into the existing
  `PerformedNote` shape (`note` = nearest MIDI number, `velocity` from level,
  start/end in the same clock as MIDI events). Because of that, **the existing
  scorer and server re-scoring work unchanged for mic attempts**; mic-only data
  rides in optional fields.
- **Per instrument:** a small `InstrumentProfile` object in shared-types:
  pitch range, transposition (guitar sounds an octave below written), default
  tolerances, tuner presets, notation kinds, on-screen instrument component.

### 2.4 Data model changes (all additive)

`packages/shared-types/src/index.ts`:

```ts
export type PlayedInstrument = "piano" | "guitar" | "violin";
export type ExerciseInput = "midi" | "mic-mono" | "mic-chord" | "any";

interface Lesson { /* existing */ instrument?: PlayedInstrument }          // absent = "piano"
interface MidiExercise {                                                     // name kept: it is everywhere
  /* existing */
  instrument?: PlayedInstrument;                                             // absent = "piano"
  input?: ExerciseInput;                                                     // absent = "midi"
  intonationToleranceCents?: number;                                         // mic-mono only
  chordTargets?: ChordTarget[];                                              // mic-chord only
  techniqueHints?: Record<string, GuitarHint | ViolinHint>;                  // keyed by ExpectedNoteEvent.id
}
interface PerformedNote { /* existing */ centsOffset?: number; pitchConfidence?: number; source?: "midi" | "mic" }
interface ChordTarget { id: string; symbol: string; pitchClasses: number[]; bassPitchClass?: number; startBeat: number; durationBeats: number }
type ScoringIssue = /* existing */ | "sharp" | "flat" | "wrong-chord" | "no-strum";
interface ScoringResult { /* existing */ intonation?: { meanAbsCents: number; withinTolerancePct: number } }
```

- `GuitarHint = { string: 1..6; fret: number; finger?: 0..4 }`,
  `ViolinHint = { string: "G"|"D"|"A"|"E"; finger: 0..4; position: 1..7; bow?: "down"|"up" }`.
  Hints feed notation; they are not graded in v1 (the mic cannot tell which
  string played a note reliably).
- **Prisma:** `Lesson.instrument String @default("piano")` and
  `@@index([instrument])`; one migration, existing rows become piano. No change
  to `UserProgress`, `ExerciseAttempt` (results are JSON) or `XpEvent`.
- **API:** `performedSchema` in `apps/api/src/app.ts` must list the new optional
  fields (zod strips unknown keys, so without this the server silently loses
  them). Add `chordDetections` (label, confidence, onset ms; no audio) as a
  third payload variant for chord exercises. `GET /lessons?instrument=` filter.
- **Paths:** add `LearningPathId` values `guitar-foundations`,
  `guitar-chords-rhythm`, `violin-foundations`, `violin-technique`; the Learn
  page groups by the active instrument. Global `order` stays unique (the seed
  already reassigns it); unlock chains are per instrument because unlocking is
  by prerequisite ids, never by position.

---

## 3. Violin and guitar lessons

Both curricula use the existing tier ladder (`TierId` 0-7, names in
`TIER_NAMES`); v1 covers tiers 0-4 (first steps to intermediate). Each lesson
follows today's shape: objectives, a short explanation (markdown/theory card,
narrated), notation, 2-5 graded exercises, an optional quiz. Lesson ids use the
`guitar-` / `violin-` prefixes and follow the README rule (explicit literals,
never derived from position). New content files:
`apps/api/src/content/guitar.ts`, `violin.ts`, plus helpers in
`content/helpers.ts` for tab and fingering.

### 3.1 Guitar curriculum

| Tier | Unit | Content | Graded by |
|---|---|---|---|
| 0 | First steps | Holding the guitar, pick vs fingers, string names, tuning with the in-app tuner, reading tab | Tune all six strings (tuner check), open-string single notes |
| 0 | Open strings and rhythm | Quarter/eighth picking on open strings with the metronome | mic-mono, timed |
| 1 | First notes | Notes on strings 1-3 in first position (E-F-G, B-C-D, G-A); simple melodies in tab + staff | mic-mono |
| 1 | First chords | Em, Am, E, A, D; chord diagrams; one-chord strums, then two-chord changes | mic-chord |
| 2 | Chord changes | G, C, D7, A7; I-IV-V in G, C, D; one-minute-change drills; down/up strum patterns | mic-chord, timed |
| 2 | Bass notes | Notes on strings 4-6; alternating bass + strum (country pattern) | mic-mono + mic-chord |
| 3 | Melody in first position | All natural notes in first position, C and G major scales, sharps/flats, folk melodies | mic-mono |
| 3 | Fingerstyle | p-i-m-a, Travis pattern basics, arpeggiated open chords | mic-mono (notes in order) |
| 4 | Barre chords and power chords | F, Bm, E-shape and A-shape barres, power chords, palm muting (ungraded) | mic-chord |
| 4 | Pentatonic and blues | Minor pentatonic box 1, 12-bar blues in A and E, simple lead lines; hammer-ons and pull-offs | mic-mono |
| 4 | Reading in position | Second/fifth position reading, 3/4 and 6/8, dotted rhythms | mic-mono |

Repertoire: public-domain and traditional tunes only, arranged in-house (folk
songs, classical studies such as Carulli/Sor/Giuliani). No copyrighted songs or
third-party tabs.

### 3.2 Violin curriculum

| Tier | Unit | Content | Graded by |
|---|---|---|---|
| 0 | First steps | Holding violin and bow, rosin, open strings G-D-A-E, tuning (fine tuners first; pegs with care) | Tuner check per string |
| 0 | Open-string bowing | Whole/half/quarter notes on open strings, down/up bow, string crossings | mic-mono, timed; tone steadiness hint |
| 1 | First finger pattern | 0-1-2-3 on A and D (high 2: D major tetrachord), finger tapes, D major scale one octave | mic-mono + intonation (±30 cents) |
| 1 | Simple tunes | Folk tunes in D and A major in first position | mic-mono + intonation |
| 2 | Second finger pattern | Low 2 (C natural, F natural): G major and C major; G string and E string | intonation (±25 cents) |
| 2 | Rhythm and bowing | Slurs (2-4 notes per bow), staccato, détaché, dotted rhythms | mic-mono (slurred notes segmented by pitch change) |
| 3 | Two-octave scales | G, D, A major two octaves in first position; minor scales; 4th finger vs open string | intonation (±20 cents) |
| 3 | Dynamics and tone | Bow speed/weight/contact point; piano/forte; crescendo | level contour (feedback, lightly scored) |
| 4 | Third position | Shifting 1st↔3rd, guide notes, scales and studies in 3rd position | intonation (±15 cents) + shift check |
| 4 | Vibrato and double stops | Vibrato exercises (graded on centre pitch only), first double stops with open strings (ungraded in v1) | intonation |
| 4 | Repertoire | Public-domain studies and pieces (e.g. Wohlfahrt, early Suzuki-era public-domain tunes, Bach minuets) arranged in-house | mic-mono + intonation |

### 3.3 Notation

All rendering stays in the existing VexFlow pipeline (`components/notation`,
`utils/engraving.ts`), with `NotationSection.vexflowData` gaining optional
kinds:

- **Standard notation:** as today. Guitar uses treble clef with the
  octave-below marking (`treble-8vb`), and the `InstrumentProfile.transpose`
  of -12 between written and sounding pitch; `ExpectedNoteEvent.note` always
  stores **sounding** pitch so scoring compares like with like.
- **Guitar tab:** VexFlow's `TabStave` / `TabNote` render tab natively; the
  common view is staff + tab stacked (VexFlow `StaveConnector`), with a toggle
  for tab only. Tab positions come from `GuitarHint`; if absent, a lowest-fret
  default is computed.
- **Chord diagrams:** VexFlow has no chord boxes, so add a small SVG component
  `components/notation/ChordDiagram.tsx` (6 strings, 4-5 frets, dots with
  finger numbers, open/muted markers, barre bar, base-fret label) driven by a
  chord dictionary in `packages/music-theory` (`guitarChords.ts`: shape, fingers,
  pitch classes). The same dictionary feeds chord grading (4.5), so what is
  drawn and what is graded can never disagree. Chord symbols above the staff
  use VexFlow `Annotation`.
- **Violin fingering and positions:** finger numbers (0-4) as VexFlow
  `FretHandFinger`/`Annotation` above notes, string indications ("sul G" /
  roman numerals), position markers ("1st pos.", "3rd pos."), bowing marks
  (down-bow ⊓, up-bow V via `Articulation`), slurs. An optional
  fingerboard diagram (`ViolinFingerboard.tsx`) shows finger placement for new
  patterns, similar to how the on-screen piano shows keys.
- **On-screen instruments:** `Fretboard.tsx` and `ViolinFingerboard.tsx` that
  light target positions and the detected pitch, playing the role
  `VirtualPiano.tsx` plays for piano (display only; not an input device for
  grading).

### 3.4 Reuse of the lesson player and scoring

- `LessonPlayerPage` and `ExerciseSet` render the same section list; only the
  exercise component switches its input source and notation kind from the
  exercise's `instrument` and `input`.
- Count-in, metronome (`MetronomeControls.tsx`), ▶ Listen previews (sampled
  guitar/violin sounds added to the instrument bank), tempo slider and pass/fail
  thresholds all stay.
- `mic-mono` exercises go through `scoreMidiExercise` unchanged, then
  `scoreIntonation` adds an `intonation` block and `sharp`/`flat` mistakes for
  pitch-correct notes outside `intonationToleranceCents`. The overall score
  blends intonation in only for violin (weight proposal: note 0.35, timing 0.2,
  rhythm 0.15, intonation 0.3; via `resolveScoreWeights`).
- For guitar and violin, `duration` grading is relaxed: plucked notes decay and
  bowed notes are often slightly detached, so the default
  `durationTolerancePercent` for mic exercises is wide and "held-too-long" is
  not reported for guitar.
- `mic-chord` exercises use `scoreChordExercise` (per `ChordTarget`: right,
  wrong chord, no strum, early/late), returning the same `ScoringResult` shape
  (`chordAccuracy`, `mistakes`, `feedback`), so result sheets, stars, XP and
  history need no new UI beyond the chord labels.
- Feedback copy per instrument ("Your F# was 20 cents flat - bring 2nd finger
  a little higher") lives with the scorer so the server and client agree.

---

## 4. Mic grading

Everything in this section runs **on the device**. Audio is analysed in memory
and discarded; no recording is stored or uploaded. Only the derived note list
(pitch, cents, times) is sent with an attempt, exactly like MIDI attempts today.

### 4.1 Pipeline

```
getUserMedia (mono, 48 kHz, processing off)
  └► AudioWorkletNode "mic-analyser" (audio thread, 128-sample quanta)
        ring buffer → frame (window W, hop H)
        ├─ level (RMS dBFS), noise gate
        ├─ onset detector (spectral flux + level rise)
        ├─ pitch: YIN (causal) → candidate f0, aperiodicity
        └─ chroma (chord mode only)
     postMessage frames (~every hop) → main thread
  └► NoteSegmenter (pYIN-style smoothing, hysteresis) → PerformedNote[] / ChordDetection[]
  └► existing exercise player and scorer
```

- Constraints: `{ echoCancellation: false, noiseSuppression: false,
  autoGainControl: false, channelCount: 1 }`. Browser voice processing removes
  harmonics, chops sustained tones and pumps the level; with it on, pitch and
  chord detection degrade badly. If a platform ignores the constraints (some
  Android devices), the calibration step detects heavy gating and warns.
- DSP runs in an AudioWorklet (pure TS from `packages/audio-analysis`, bundled
  into the worklet module). If profiling on low-end Android shows it is too
  slow, the same code compiles to WASM later; the interface does not change.
- Timestamps: worklet frames carry `currentTime`-based times, converted to the
  `performance.now()` clock the MIDI path uses, so `PerformedNote` times are
  comparable with metronome beats. Mic input latency (4.4) is subtracted the
  same way `latency.ts` subtracts output latency today.

### 4.2 Pitch detection (monophonic: violin, guitar single notes, piano single line)

- **Algorithm:** YIN (difference function, cumulative mean normalised
  difference, absolute threshold, parabolic interpolation) per frame, with the
  **pYIN** idea for robustness: evaluate several thresholds, keep multiple f0
  candidates with probabilities, and pick the path with a short Viterbi /
  HMM over pitch states. Live mode uses a causal version (fixed look-back,
  ~2-3 frames of decision delay); a full offline pYIN pass re-segments the
  attempt at the end to correct the final note list before scoring.
- **Ranges and windows** (48 kHz; window must hold at least ~2 periods of the
  lowest note):

| Profile | Range | Window W | Hop H |
|---|---|---|---|
| Violin | G3 196 Hz - E7 2637 Hz | 1024 (21 ms) | 256 (5.3 ms) |
| Guitar | E2 82 Hz (D2 73 Hz for drop tunings) - E6 1319 Hz | 2048 (43 ms) | 256 |
| Piano single line | A1 55 Hz - C7 2093 Hz for lessons | 2048 | 256 |
| Tuner / Piano check | down to A0 27.5 Hz | 4096-8192 | 512 |

- **Intonation:** cents = `1200 * log2(f / f_ref)` against equal temperament at
  the user's A4 (5.3). Per note, use the **median of the steady part**: skip
  the first ~60-80 ms (pick attack, bow bite, finger slide) and the decay tail;
  violin vibrato is averaged by the median of a ≥150 ms window, so vibrato is
  not punished. Reported per note (`centsOffset`) and summarised as mean
  absolute cents and % of notes within tolerance.
- **Octave errors** (strong 2nd harmonic on guitar, low piano notes): YIN's
  first-dip rule plus a sub-harmonic check. Knowing the expected note may break
  a tie **only between octave candidates of the same pitch class** with similar
  probability; it never turns a wrong pitch into a right one.
- **Note segmentation:** onset when spectral flux and level rise together, or
  when a confident pitch moves by ≥ 70 cents for ≥ 40 ms (legato/slurs, where
  there is no new attack). Offset when level falls below the gate or
  confidence drops for ≥ 50 ms. Notes shorter than ~50 ms are dropped (noise,
  string squeaks). Repeated same-pitch notes are split by a level re-attack.

### 4.3 Chord recognition (guitar)

Graded as **right or wrong chord**, not per note: a strummed chord is six
strings ringing together, and per-string transcription from one mic is not
reliable enough to grade beginners fairly.

1. Strum onset from the onset detector (broadband flux spike).
2. Analysis window ~80-400 ms after the onset (skip the pick noise; stop before
   strings decay into the next change).
3. **Chroma:** FFT (4096-8192, Hann) → spectral peaks → map peak frequencies to
   12 pitch classes with harmonic weighting (down-weight partials 3, 5, 6 which
   alias onto other pitch classes), log compression, normalise. A
   constant-Q/pitch-filterbank variant is the fallback if the FFT chroma proves
   weak below 110 Hz.
4. **Template match:** cosine similarity against binary/weighted templates for
   the chord vocabulary in use (major, minor, 7, maj7, m7, sus2, sus4, 5/power,
   dim) in all 12 roots. Because the exercise knows the target chord, grading
   is a **verification**: pass if the target scores highest, or within a small
   margin of the best when the best is a near neighbour (e.g. C vs Cmaj7),
   and above a minimum confidence. A separate low-band f0 estimate checks the
   bass note when a `bassPitchClass` is set (slash chords, alternating bass).
5. Results: `right`, `wrong-chord` (with what it sounded like: "sounded like
   Em - check your 3rd finger"), `no-strum`, `early`/`late` against the beat.

Piano mic mode can reuse the same chroma matcher for simple "play a C major
chord" checks (block chords), graded the same way.

### 4.4 Latency targets

| Path | Target | How |
|---|---|---|
| Tuner needle update | ≥ 20 updates/s, ≤ 50 ms from sound to display | hop 512, render on rAF |
| Note onset detection (desktop browsers, Windows app) | ≤ 60 ms after attack (excluding device input latency) | 2-3 hops of decision delay |
| Note onset (Android) | ≤ 100 ms all-in | as above, plus measured input latency |
| Pitch decision for a note | ≤ 120 ms after onset (needs a stable window) | causal pYIN; final correction offline |
| Chord decision | ≤ 400 ms after strum | analysis window |

Device input latency varies widely (roughly 10-40 ms on desktop, often more on
Android). It is **measured, not guessed** (4.6) and subtracted, so timing is
judged against when the note was actually played. Timing tolerances for mic
exercises start at the `BEGINNER_CONFIG` values (`timingToleranceMs: 250`) and
tighten with tier, never below what the measured latency jitter allows.

### 4.5 Noise handling

- **Noise gate** from calibration: ambient floor (RMS over 2 s of silence) +
  ~12 dB; frames under the gate are not analysed for pitch.
- **Confidence threshold:** YIN aperiodicity below ~0.15-0.2 (tuned per
  profile on fixtures); unconfident frames never produce notes.
- **The app's own sound:** metronome clicks and ▶ Listen audio leak from
  speakers into the mic. During graded mic exercises: guide audio is muted, the
  metronome stays audible but onsets within ±30 ms of a scheduled click (after
  latency compensation) are ignored, and the UI recommends headphones. Chord
  and pitch analysis also ignore those windows.
- **Hum and rumble:** high-pass at ~60 Hz for guitar/violin profiles (not for
  piano check), notch detection for 50/60 Hz mains hum.
- **Sympathetic resonance** (other open strings ringing on guitar/violin): the
  note segmenter follows the strongest confident f0 and uses level re-attacks,
  so a ringing open string does not create extra notes.
- **Clear UI states:** "Too quiet", "Too noisy - move closer or find a quieter
  room", "Listening", shown in the status pill so a bad grade is never a mystery.

### 4.6 Calibration

A one-time "Set up your microphone" flow (re-runnable from Settings), stored
per device and per input device (like `storageKey(deviceName)` used for MIDI):

1. Choose input device (when the platform lists several).
2. Level check: play a few notes; live meter with a target zone; warn on
   clipping or very low level.
3. Noise floor: 2 seconds of silence.
4. **Mic latency:** the app plays a short click through the speakers and detects
   it in the mic (round trip), then subtracts the already-known output latency
   from `latency.ts`. If headphones block the loop, fall back to the existing
   tap-along method (the learner plays a note on each click).
5. Instrument check (optional): play the open strings / an A; confirms range
   and that processing is really off.

Stored as `mp-mic-calibration:<deviceId>` (gate, latency ms, gain hint).

### 4.7 Platforms

| Platform | Mic support | Notes |
|---|---|---|
| Chrome / Edge (Windows, macOS, Linux, ChromeOS) | Yes | Secure context required: HTTPS in public, and the LAN deploy's Caddy CA is already in place for Web MIDI |
| Firefox desktop | Yes | Check that processing constraints are honoured |
| Safari macOS / iOS | Yes (getUserMedia + AudioWorklet) | iOS has no Web MIDI, but mic lessons and the tuner work in the browser; there is no iOS app (signing parked) |
| Android app (Capacitor WebView) | Yes, with work | Add `RECORD_AUDIO` to `AndroidManifest.xml`, request it at runtime before `getUserMedia`, and confirm the Capacitor bridge grants the WebView `onPermissionRequest` for audio capture. Test with processing constraints on several devices |
| Windows app (WebView2) | Yes | MSIX `microphone` capability + WebView2 `PermissionRequested` handler + Windows privacy settings (8.4) |
| Android browser | Yes | Same as Chrome |

The mic is requested only when the learner opens a mic exercise, the tuner or
the piano check, with an explanation screen first ("Music Portal listens to
grade your playing. Sound is analysed on this device and never recorded or
uploaded."). Denial leaves every MIDI feature working and shows how to
re-enable the permission.

### 4.8 Privacy

- No audio leaves the device; no recordings are kept. The API receives the same
  kind of data as today (note numbers and times), plus cents and chord labels.
- Privacy page: new "Microphone" section with the sentence above.
- Play Data safety: audio is processed on device and not transmitted, so the
  "Audio" data type is **not collected**; the `RECORD_AUDIO` permission is
  declared and explained in the listing. Microsoft Store: the microphone
  capability is declared and the privacy policy URL covers it.
- Crash reports (Sentry) must never attach audio buffers; add audio objects to
  the redaction tests in `packages/shared-types/src/sentry.ts`.

---

## 5. Tuner

A standalone screen (`/tune`, also reachable from every mic exercise and the
instrument picker). Works **offline and without an account**; it is the
natural free entry point (7).

### 5.1 Chromatic mode

- Big note name with octave, frequency in Hz (0.1 Hz), needle ±50 cents with a
  green zone (±3 cents by default, configurable 1-10), and a strobe-style band
  for fine work. Low-latency path from 4.4 (hop 512, window 4096 so low E and
  low piano notes are stable).
- Smoothing: median over ~5 frames plus hysteresis on the displayed note so the
  name does not flicker between neighbours at ±50 cents.
- "Hold" freezes the last stable reading; a short history trace shows drift
  (useful for violin pegs that slip).
- Optional **reference tone**: plays the target pitch (sine or sampled) for
  tuning by ear, using the existing audio engine.

### 5.2 Presets

Each preset lists strings low to high with target pitches; the tuner
auto-detects the nearest string, or the learner taps a string to lock it.

| Instrument | Preset | Pitches |
|---|---|---|
| Guitar | Standard | E2 A2 D3 G3 B3 E4 |
| Guitar | Drop D | D2 A2 D3 G3 B3 E4 |
| Guitar | Half step down | Eb2 Ab2 Db3 Gb3 Bb3 Eb4 |
| Guitar | Full step down | D2 G2 C3 F3 A3 D4 |
| Guitar | Drop C | C2 G2 C3 F3 A3 D4 |
| Guitar | DADGAD | D2 A2 D3 G3 A3 D4 |
| Guitar | Open G | D2 G2 D3 G3 B3 D4 |
| Guitar | Open D | D2 A2 D3 F#3 A3 D4 |
| Guitar | Open E | E2 B2 E3 G#3 B3 E4 |
| Violin | Standard | G3 D4 A4 E5 |
| Piano | Chromatic + reference | All 88 keys; the target can be ET or the stretch curve from the Piano check (6) |

Custom tunings (name + pitches) are saved per user. Capo setting for guitar
(shifts targets and the displayed names). Presets are data in
`packages/music-theory/src/tunings.ts`, shared with lesson content and chord
grading.

### 5.3 Reference pitch

- **A4 = 440 Hz** default, adjustable **415-466 Hz** in 0.5 Hz steps (fine
  0.1 Hz with long-press), with quick picks 440 / 442 / 443 / 432 / 415.
- The same setting drives intonation grading (4.2), the reference tone and
  the Piano check, so everything agrees.
- Stored in `mp-tuner-settings` and synced to the account (it is a property of
  the learner's ensemble, not the device).

---

## 6. Acoustic piano tuning

### 6.1 Phase 1: "Piano check" (measurement only)

Goal: tell the owner of an acoustic piano which notes are out of tune and by
how much, so they can decide whether to call a technician. No tuning
instructions in this phase.

Flow:

1. Choose **Quick check** (every A and C plus a few notes per octave, ~20
   notes, ~3 minutes) or **Full check** (all 88 keys, or a smaller range for
   short keyboards).
2. The app shows the key to play on a keyboard graphic; the learner plays it
   *mezzo-forte* and lets it ring; the app captures ~1.5 s of the steady part
   and moves on automatically (with redo).
3. Measurement per note: large FFT (16384-65536 points with zero padding, Hann
   window), partial peaks with parabolic interpolation (sub-cent accuracy on a
   steady tone), fundamental estimated from the partial series rather than
   the first peak (in the bass the fundamental is weak or missing). From the
   partials `f_n ≈ n·f0·sqrt(1 + B·n²)` the **inharmonicity coefficient B**
   is fitted per note.
4. Results:
   - Keyboard heat map coloured by deviation: within ±5 cents green, 5-15
     amber, > 15 red.
   - Each note's deviation **vs equal temperament** at the chosen A4 and
     **vs a typical stretch curve** (a Railsback-style curve; once enough notes
     are measured, a curve derived from the piano's own B values). A well-tuned
     piano is stretched, so judging only against ET would flag good treble
     and bass notes as wrong; the stretch view is the default.
   - **Overall pitch level** ("your piano is on average 18 cents flat"):
     common on pianos not tuned for years and the most useful single number.
   - Worst notes list, and "unison may be out" hints where partials are split
     or the level beats (three strings of one note disagreeing).
   - Plain-language verdict: "in good shape", "a tuning would help", "a pitch
     raise is likely needed (more than ~25 cents flat)".
5. Reports are kept on the device (and optionally saved to the account) so the
   owner can compare before/after a technician visit.

### 6.2 Phase 2: guided tuning aid

Only after phase 1 is solid on real pianos. Adds a tuning workflow for owners
who choose to tune themselves:

- **Measure first:** B on a sample of notes across the keyboard → computed
  tuning curve for this piano (octave stretch chosen so the important partials
  match, e.g. 4:2 in the middle, wider 6:3 in the bass and 2:1 towards the top).
- **Order:** temperament octave (around F3-F4) first, then up the treble by
  octaves, then down the bass; the app shows which note is next.
- **Per note:** live fine display (strobe-like, ±1 cent) against that note's
  target; for trichords, guidance to mute side strings, tune the centre string,
  then bring each unison in by eliminating beats.
- **Pitch raise mode:** if the piano is far flat, a rough first pass with a
  small calculated overpull, then a fine pass, with a clear warning about the
  extra stress on strings.
- **Stop conditions:** if a note will not hold, a pin turns too easily, or the
  pitch jumps unpredictably, the app stops guiding that note and recommends a
  technician.

### 6.3 Safety note (shown in-app before phase 2, and in the phase 1 results)

> Turning tuning pins changes the tension on strings that together hold many
> tonnes of load. Use a proper **piano tuning lever (tuning hammer)** with a tip
> that fits the pins exactly; never use pliers, wrenches or socket sets, which
> damage pins and the pin block. Make very small movements, set the pin
> rather than bending it, and never raise a string far above its target pitch.
> Old or rusty strings can break and cause injury: wear eye protection, keep
> your face away from the strings, and stop if a string or pin feels wrong.
> Loose pins, cracked pin blocks, very old pianos and pianos far below pitch
> need a professional.
>
> **For most pianos the best choice is a qualified piano technician.** Music
> Portal's Piano check helps you know when to call one and what to tell them;
> the tuning aid is for people who accept the risks above.

Phase 2 does not ship without this note, an explicit "I understand" step, and
a link to finding a local professional piano technician (e.g. through a
national piano technicians' association).

---

## 7. Free vs paid (proposal)

A proposal for discussion; **no prices in this document**. Principles:

- One account, one entitlement, on every platform (web, Android, Windows).
- **Nothing an existing user can use today is taken away from them.** Existing
  accounts keep their current piano features free (grandfathered), whatever
  the new split is for new accounts.
- Free must be useful on its own: the tuner and a real start on every
  instrument.

| Feature | Free | Paid |
|---|---|---|
| Chromatic tuner, all presets, custom tunings, reference pitch | ✓ | |
| Piano check (phase 1): quick check and summary verdict | ✓ | |
| Piano check: full 88-key report, history, before/after compare | | ✓ |
| Guided piano tuning aid (phase 2) | | ✓ |
| Lessons, tiers 0-1 for each instrument (incl. mic grading) | ✓ | |
| Lessons, tiers 2+ for each instrument | | ✓ |
| Daily challenge, quizzes, streaks, XP | ✓ | |
| Play-along: a rotating/free subset of the library | ✓ | |
| Play-along: full library, own MIDI uploads, sheet scan | | ✓ (grandfathered for existing users) |
| Detailed intonation and practice analytics | | ✓ |
| MIDI and mic input, all platforms | ✓ | |
| Offline lessons (downloaded content) | | ✓ |

Implementation sketch: an `Entitlement` table (user, product, source:
`play` / `msstore` / `web` / `grant`, period, status) checked on the server
when lessons and songs are served; clients only hide/lock UI. Store rules
differ: Google Play requires Play Billing for digital content bought inside
the Android app; the Microsoft Store lets non-game apps use either Store
add-ons or their own payment system. Purchases from any source unlock the same
account. Store account ids and product ids stay out of this public repo.

---

## 8. Windows desktop app

Goal: **Music Portal for Windows 10/11** in the Microsoft Store, with USB MIDI
keyboards, Bluetooth LE MIDI where Windows supports it, and the microphone.

### 8.1 Options

**(a) Wrap the existing web app in a WebView2 host, packaged as MSIX.**
A thin native shell (C#/.NET 8, WinUI 3 window with a single WebView2) loads
the production build of `apps/web` from the package, like the Android
Capacitor shell does. Two ways to get MIDI in:

- **(a1) Web MIDI inside WebView2.** WebView2 is Chromium, so
  `navigator.requestMIDIAccess` works and the existing `WebMidiAdapter` runs
  unchanged. The host answers WebView2's `PermissionRequested` for MIDI and
  microphone. Limits: Chromium's Windows MIDI backend sees class-compliant
  USB devices but **not BLE MIDI**; on the classic Windows MIDI stack a port is
  **single-client** (if a DAW holds the keyboard open, the app cannot), and
  hot-plug relies on Chromium's device polling.
- **(a2) Native MIDI bridged into the web view.** The host enumerates and opens
  devices with **Windows MIDI Services** (the newer multi-client Windows MIDI
  stack and SDK) where present, falling back to the WinRT
  `Windows.Devices.Midi` API (`MidiInPort`, `DeviceWatcher`), which also
  exposes paired **BLE MIDI** devices on Windows 10/11. Messages go to the page
  with `CoreWebView2.PostWebMessageAsJson`; a `WindowsMidiAdapter` in
  `packages/midi-engine` implements the existing `MidiAdapter`, mirroring
  `CapacitorMidiAdapter` (same device/message/state events, reusing
  `NativeClockSync` to map native timestamps to `performance.now()`).

**(b) Native WinUI 3 / .NET app sharing lesson data.** Rebuild the UI in XAML
and C#, use the same API and lesson JSON.

| | (a) WebView2 + MSIX | (b) Native WinUI 3 |
|---|---|---|
| Code reuse | Whole app: lesson player, VexFlow/Verovio/OSMD notation, play-along renderer, scoring, mic DSP | Only data and API; scoring, notation and play-along rewritten or embedded in a web view anyway |
| Feature parity | Same release as web/Android | Permanent lag; every feature built twice |
| MIDI | Web MIDI (a1) day one; native bridge (a2) for BLE, multi-client, robust hot-plug | Native APIs directly |
| Latency | Web MIDI: Chromium event timestamps. Bridge: native callback + one `postMessage` hop (low single-digit ms), well inside the 60 ms judging tolerance floor | Lowest |
| Mic | `getUserMedia` + AudioWorklet in WebView2 (same DSP as web) | WASAPI + re-implemented DSP |
| Size | Small host (few MB) + web build; WebView2 runtime is part of Windows 11 and present on most Windows 10 | Medium |
| Effort | ~3-4 weeks incl. bridge and Store | Many months |

**Recommendation: (a).** Ship with **(a2) the native bridge as the primary
MIDI path**, keeping **(a1) Web MIDI as the fallback** (the adapter factory in
`apps/web/src/native/hardwareMidi.ts` chooses: Windows native bridge if the
host announces it, else Web MIDI, else the on-screen piano). Start with a
one-day spike that checks Web MIDI and mic permission behaviour in the current
WebView2 runtime; if the bridge slips, v1 can ship on (a1) with BLE listed as
"coming soon". (b) is rejected: it doubles every future feature for a latency
gain the scorer does not need. Electron was also considered and set aside: it
ships its own Chromium (large download, its own update cadence), and it adds
nothing WebView2 does not already give on Windows.

### 8.2 Layout

```
apps/windows/
  MusicPortal.sln
  MusicPortal/                       WinUI 3 app (Windows App SDK, .NET 8), single-project MSIX
    App.xaml(.cs), MainWindow.xaml(.cs)   one WebView2, window state, full screen
    WebHost.cs                       virtual host mapping, permissions, navigation lock-down
    Midi/MidiBridge.cs               device watcher, ports, message forwarding
    Midi/MidiMessageParser.cs        port of the Android parser (same unit tests)
    Package.appxmanifest             identity placeholders, capabilities
    web/                             copy of apps/web/dist (build output, not committed)
  MusicPortal.Tests/                 xUnit: parser, clock sync, bridge protocol
  scripts/build-web.ps1              builds apps/web with the Windows flags and copies dist
packages/midi-engine/src/windows.ts  WindowsMidiAdapter (JS side)
```

- **Page origin:** the web build is served from the package via
  `SetVirtualHostNameToFolderMapping` on a fixed `https://` host name (e.g.
  `https://app.musicportal.invalid`), which WebView2 treats as a secure
  context (needed for Web MIDI, mic and the existing secure-context checks).
  That origin is fixed forever, because local storage is keyed by it, and is
  added to the API's `CORS_ORIGIN` list (as `https://localhost` is for Android).
- **Navigation lock-down:** only the virtual host and the API origin load in the
  view; other links open in the default browser (`NewWindowRequested`).
- **Platform detection:** `apps/web/src/native/platform.ts` gains `windows`
  (host injects a marker via `AddScriptToExecuteOnDocumentCreatedAsync`) so the
  UI can show Windows-specific help text and choose the bridge adapter.

### 8.3 MIDI: discovery, hot-plug, latency

- **Discovery:** Windows MIDI Services SDK endpoint enumeration when the
  service is present; otherwise `DeviceWatcher` on `MidiInPort.GetDeviceSelector()`.
  Device list shape matches `NativeMidiDevice` (`id`, `name`, `transport`:
  `usb` / `bluetooth` / `other`).
- **BLE MIDI:** paired through Windows Settings → Bluetooth (the app shows a
  short how-to and a "re-scan" button); after pairing it appears as a MIDI
  device. In-app BLE scanning like Android's `BluetoothMidiPicker.tsx` is a
  later step and depends on what the Windows MIDI Services SDK offers at that
  point.
- **Hot-plug:** watcher `Added` / `Removed` / `Updated` events re-open ports
  and emit a devices event; the JS adapter rebinds exactly like
  `WebMidiAdapter`'s `onstatechange` handling (a replugged device is a new
  port). Test: unplug/replug during an exercise and during play-along must
  resume input without a reload.
- **Exclusive ports:** on the classic stack, show "Your keyboard is in use by
  another app" when opening fails, instead of a silent empty device list.
- **Latency:** native timestamps → `NativeClockSync` → `performance.now()`
  domain; measure end-to-end (key press to on-screen highlight) on the
  reference keyboard; target the same as Android (input judged within the
  existing tolerances, visual response under ~30 ms on a typical laptop).
- **Sound output** stays in the web audio engine; the existing output-latency
  calibration applies unchanged.

### 8.4 Microphone

- `Package.appxmanifest`: `<DeviceCapability Name="microphone"/>`. The first
  `getUserMedia` triggers Windows' consent prompt for the packaged app.
- The host handles `CoreWebView2.PermissionRequested` for `Microphone` (allow
  only for the app's own origin) and for MIDI.
- If Windows privacy settings block the mic (Settings → Privacy & security →
  Microphone), `getUserMedia` fails; the app shows a button that opens
  `ms-settings:privacy-microphone`.

### 8.5 Offline use

- The UI is in the package, so the app always starts offline.
- Tuner and Piano check need no network and no account.
- Lesson content: add an offline cache (IndexedDB) of lesson JSON and
  exercises, versioned by a content hash the seed computes and the API returns
  (ETag on `GET /lessons`). Downloaded on sign-in and when the hash changes.
- **Attempt outbox:** attempts made offline are stored with a client-generated
  id and replayed when back online. The API accepts an optional
  `clientAttemptId` and ignores duplicates; XP is already keyed by what earned
  it, so a replay can never pay twice.
- This work lives in `apps/web`, so the Android app gets the same offline
  behaviour.

### 8.6 MSIX packaging and Store requirements

- **Packaging:** Windows App SDK single-project MSIX; build **x64** and
  **arm64** (cross-compiled from x64 is fine) into one `.msixupload` for the
  Store. Minimum OS: Windows 10 version 1809 (build 17763), the Windows App SDK
  floor; target current Windows 11.
- **Identity:** `Identity Name`, `Publisher` and `PublisherDisplayName` are
  assigned by Partner Center. They are **not committed**: the manifest holds
  placeholders and the build reads real values from a git-ignored
  `apps/windows/Identity.props` locally or from CI secrets.
- **Capabilities:** `runFullTrust` (standard for packaged desktop apps; the
  Store asks for a short justification), `internetClient`, `microphone`. Add a
  Bluetooth capability only if the BLE MIDI path is shown to need it on test
  hardware.
- **Dependencies:** Windows App SDK runtime (framework package dependency
  handled by the Store); WebView2 Evergreen runtime (present on Windows 11; the
  host checks at start-up and links to the installer on the rare Windows 10
  machine without it).
- **Store listing:** age rating via the **IARC questionnaire** in Partner Center
  (no violence, no user-to-user chat; account sign-in and the feedback button
  are the relevant answers; expect an all-ages rating); **privacy policy URL**
  required (the existing `/privacy` page, updated per 4.8); screenshots at
  required sizes, generated from the same Playwright flows used for the Play
  listing; certification notes with a demo account for the reviewers.
- **Certification:** run the Windows App Certification Kit locally before
  every submission; Store policies require the app to work as described,
  handle no network gracefully and not crash at launch.
- **Updates:** the Store updates the package; the bundled web build means a
  Windows release lags web deploys, so the API stays backward compatible
  (8.8).

### 8.7 Building and testing the Windows build

The Windows app cannot be built in the Linux environment this repo is normally
worked on. Two routes:

**Local build (Windows 10/11 machine, x64; an arm64 device or VM for arm64
testing):**

1. Install Visual Studio 2022 with the *.NET desktop development* and *Windows
   application development* (Windows App SDK / WinUI) workloads, the .NET 8
   SDK, Git, Node.js 22 and pnpm 10.12.1 (`corepack enable && corepack prepare
   pnpm@10.12.1 --activate`).
2. Turn on **Developer Mode** (Settings → System → For developers) to allow
   sideloading.
3. `git clone`, then `pnpm install` at the repo root.
4. `pwsh apps/windows/scripts/build-web.ps1 -ApiUrl https://<api domain>`:
   builds `apps/web` with `VITE_API_URL` and copies `dist` into
   `apps/windows/MusicPortal/web`.
5. Copy `Identity.props.example` to `Identity.props` (test identity for local
   builds).
6. Debug run: open `apps/windows/MusicPortal.sln`, select x64, F5 (deploys the
   package locally). Or from a shell:
   `dotnet build apps/windows/MusicPortal -c Debug -p:Platform=x64`.
7. Package: `dotnet publish apps/windows/MusicPortal -c Release
   -p:Platform=x64 -p:GenerateAppxPackageOnBuild=true` (repeat for arm64), sign
   with a local self-signed test certificate (never committed), trust it, and
   install with `Add-AppxPackage`.
8. Run the Windows App Certification Kit on the package.
9. `dotnet test apps/windows/MusicPortal.Tests`.

**CI:** a `windows.yml` workflow on a `windows-latest` runner builds the web
bundle, runs the .NET tests and produces unsigned x64 + arm64 packages as
artifacts. The Store signs on submission; submission itself stays manual.

**Manual test matrix per release:** USB keyboard plugged in before launch /
after launch / unplugged mid-exercise; BLE MIDI keyboard paired and reconnected
after sleep; keyboard held by another app; mic allowed / denied / revoked in
Settings while running; offline launch, offline lesson, reconnect and outbox
replay; x64 and arm64; Windows 10 and Windows 11; 100% and 150% display scaling;
touch screen.

### 8.8 Keeping content and progress in sync with web and Android

- **One backend.** All three clients use the same API and account; lessons come
  from the API (seeded from `apps/api/src/content/*`), progress and XP are
  server-authoritative, so a lesson finished on Windows is finished on Android.
- **Same web bundle.** Windows and Android package a build of the same
  `apps/web` commit; feature parity is by construction. Release notes per store
  name the web commit they carry.
- **Version skew.** Installed apps lag the server. The client sends
  `X-Client-Version`; the API keeps old payload shapes working, and lesson
  content can carry `minClientVersion`. A client that meets an unknown section
  type or exercise input skips it with an "Update the app to see this" card
  instead of failing the lesson.
- **Synced settings.** Learner-level settings (active instrument, A4 reference,
  custom tunings, interface mode) sync through the account via a small
  `UserSetting` key/value table, generalising how `experience_mode` already
  syncs. Device-level settings (latency, mic calibration, MIDI device ranges,
  zoom) stay local per device by design.
- **Offline merges** are append-only (attempts and XP), so there is nothing to
  conflict: the outbox replays, the server dedupes by `clientAttemptId`.

---

## 9. Milestones, tests and risks

Effort is rough, in focused developer-weeks for one person, excluding content
authoring where noted. Order is build order; each milestone ships on its own.

| # | Milestone | Effort | Depends on |
|---|---|---|---|
| M0 | Rename (UI, docs, legal, brand, listings) + storage migration framework and key-inventory test | 1 wk | - |
| M1 | `PlayedInstrument` model, `Lesson.instrument` migration, instrument picker, Learn filtered, synced settings | 1-1.5 wk | M0 |
| M2 | `packages/audio-analysis` (YIN/pYIN, onsets, segmentation) + AudioWorklet mic pipeline + calibration flow | 2-3 wk | - |
| M3 | Tuner (chromatic, presets, A4, reference tone) | 1 wk | M2 |
| M4 | Mic grading in the exercise player: `MicNoteSource`, intonation scoring, API schema fields, piano mic mode (single line, melody play-along) | 2 wk | M1, M2 |
| M5 | Guitar v1: tab + staff, chord diagrams, fretboard, tiers 0-2 content | 2 wk eng + content | M4 |
| M6 | Chord recognition (chroma, templates) + strum exercises | 2 wk | M2, M5 |
| M7 | Violin v1: fingering/positions/bowing notation, fingerboard, tiers 0-2 content | 2 wk eng + content | M4 |
| M8 | Android mic: `RECORD_AUDIO`, permission flow, device testing | 0.5-1 wk | M4 |
| M9 | Piano check (phase 1) | 2 wk | M2 |
| M10 | Offline content cache + attempt outbox | 2 wk | - |
| M11 | Windows app: spike, host, bridge, MSIX, CI, Store submission | 3-4 wk | M10 (offline), M4 for mic |
| M12 | Guitar and violin tiers 3-4 content | content | M5-M7 |
| M13 | Entitlements and store billing (after the free/paid decision) | 2-3 wk | owner decision |
| M14 | Guided piano tuning aid (phase 2) | 3-4 wk | M9 on real pianos |

Content authoring (lesson text, exercises, arrangements, recordings for ▶
Listen) is the largest single cost: plan roughly 1-2 days per lesson including
review, and have a guitarist and a violinist review each tier before release.

### 9.1 Test plan per milestone

General rule as today: `pnpm typecheck`, `pnpm test`, web build, real-DB suite,
migration-prefix check, on every milestone.

- **M0:** storage migration unit tests with a fixture of every existing key
  (values survive, nothing deleted, re-run is a no-op); key-inventory test;
  CI grep gate for the old name outside the allow-list; screenshot check of
  web, Android and legal pages.
- **M1:** migration test (existing lessons default to piano); API filter tests;
  unlock tests across instruments (a guitar lesson never unlocks from a piano
  lesson); upgraded profile with no instrument set behaves exactly as today.
- **M2 (pitch detection):** unit tests in `packages/audio-analysis` against
  - **synthetic signals** generated in the test (deterministic, no binaries):
    sines, sawtooth, Karplus-Strong plucks, bowed-like signals with vibrato, and
    piano-like tones with known inharmonicity, at SNR 30/20/10 dB;
  - **recorded sample files**: short mono 48 kHz WAVs in
    `packages/audio-analysis/test/fixtures/` (own recordings, released with the
    repo's licence; each < 10 s) with JSON labels (onset ms, MIDI note, cents,
    chord symbol): guitar single notes per string, guitar open chords strummed,
    violin open strings, scales in tune and deliberately ±20 cents, vibrato,
    slurs, piano single notes across the range, a noisy-room take;
  - **targets:** gross pitch error < 2% of voiced frames; median cents error
    < 2 on sustained notes (synthetic < 0.5); onset F-measure ≥ 0.9 within
    50 ms on guitar and violin fixtures; no notes reported on the silence and
    noise-only fixtures; detection delay per onset measured and asserted
    against 4.4;
  - a performance test: frame processing well under the hop time on CI.
- **M3:** tuner reading stability (standard deviation < 0.5 cents on a steady
  synthetic tone), preset string auto-detect, A4 change shifts every target;
  UI tests for the needle and states (Testing Library, as in existing
  `*.test.tsx`).
- **M4:** scorer tests with mic-shaped `PerformedNote[]` (sharp/flat issues,
  intonation block, relaxed durations); server re-scores mic attempts
  identically (cents fields survive the zod schema); **end-to-end in
  Playwright** with Chromium's fake audio capture
  (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<fixture>.wav`)
  playing a fixture into a real lesson and asserting the grade.
- **M5 / M7:** notation snapshot tests (tab, chord diagrams, fingering, 8vb
  clef); chord dictionary tests (diagram pitch classes = grading pitch
  classes); content validation in `lesson-engine` (every exercise has the right
  `input`, hints within range, playable on the instrument).
- **M6:** chord top-1 accuracy ≥ 90% on the open-chord fixtures, wrong-chord
  fixtures (e.g. C played for Am) graded wrong, no-strum fixture graded
  no-strum; timing against beats.
- **M8:** manual device matrix (at least one low-end and one current Android
  device, plus the reference tablet): permission flow, processing constraints
  honoured, measured mic latency recorded in the test log.
- **M9:** synthetic piano tones with known detune and B: detune recovered within
  1 cent, B within 10%; real-piano sessions compared with a reference tuning
  device or a technician's measurement before release.
- **M10:** outbox replay and dedupe (API test with duplicate
  `clientAttemptId`); ETag/content-hash tests; offline Playwright run with
  network blocked.
- **MIDI device tests (M1, M4, M11):** `MockMidiAdapter` and
  `WindowsMidiAdapter` unit tests with recorded message streams; parser tests
  shared between Android and Windows; manual hot-plug and BLE tests on the
  reference USB keyboard and one BLE MIDI keyboard/adapter.
- **M11:** .NET unit tests (parser, clock sync, bridge protocol), the manual
  matrix in 8.7, App Certification Kit pass, Store pre-submission checklist.
- **M13:** entitlement checks server-side (locked content not served), store
  receipt validation tests with sandbox purchases, grandfathering migration.
- **M14:** curve computation tests; guided-flow UI tests; safety note shown and
  acknowledged before any guidance.

### 9.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Mic grading feels unfair (noisy rooms, laptop/phone mics, AGC that ignores constraints) | Learners blame the app | Calibration, visible "too noisy" states, lenient beginner tolerances, never fail on unconfident frames; "Report a wrong grade" in the feedback button with the derived note list (not audio) |
| Guitar octave errors and sympathetic strings | Wrong-note grades | Sub-harmonic checks, octave-only expectation tie-break, fixture coverage |
| Violin bow noise and vibrato | Unstable cents | Steady-part median, vibrato-tolerant windows |
| Polyphonic piano via mic | Not reliably gradeable | Scoped out: mic piano is single line and block-chord checks only; MIDI stays the full path |
| Android WebView audio input latency and device variance | Timing grades off | Measured latency per device; wider timing windows on mic |
| Web MIDI / BLE behaviour in WebView2 changes between runtime versions | MIDI breaks after a Windows update | Native bridge as primary path, Web MIDI as fallback; spike before committing |
| Store name "Music Portal" unavailable; Play 30-character title limit | Listing delays | Reserve early; fall-back names; short-description wording (1.4) |
| Rename breaks stored data | Lost settings/sign-ins | Ids, storage keys and volumes frozen (1.2); migration tests; key inventory |
| Free/paid split upsets existing users | Bad reviews | Grandfathering; free tier stays useful |
| Content volume and quality for two new instruments | Largest schedule risk | Ship tiers 0-2 first; expert review; reuse exercise generators where possible |
| Licensing of guitar/violin repertoire and tabs | Takedowns | Public-domain and traditional material arranged in-house only; existing content-rights metadata on every notation section |
| Piano tuning aid misuse | Damage or injury | Phase 1 first; safety note, explicit acknowledgement, stop conditions, technician recommendation |
| Version skew between server and packaged clients | Broken lessons in old apps | `X-Client-Version`, `minClientVersion`, unknown-section fallback |

---

## Appendix A. Decisions needed from the owner

1. Store names: Play name (30-character limit) and the Microsoft Store name to
   reserve.
2. Keep the current web domain or move to a new one (1.3 step 5).
3. Free/paid split (section 7) and grandfathering scope.
4. Whether the Windows app ships v1 on Web MIDI only if the native bridge is
   late.
5. Whether to rename the GitHub repository now or after launch.
6. Priority between guitar and violin if both cannot land in the same release
   (this plan builds guitar first: larger audience, and chord grading is the
   harder new technique).
