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
