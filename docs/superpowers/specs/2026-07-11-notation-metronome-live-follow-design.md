# Multi-Row Notation, Adjustable Metronome, and Live-Follow Scoring — Design Spec

Date: 2026-07-11
Status: Approved by Ramin (design conversation, this date)

## Overview

Four connected upgrades to Keyboard Sensei's practice experience (pnpm monorepo: `apps/web`
React/Vite/TS/Tailwind/Zustand, `apps/api` Express 5/Prisma/PostgreSQL/JWT/Zod, `packages/*`):

1. **Notation upgrades** — bars/beats-per-bar shown on every stave, and automatic multi-row
   ("full page") layout as pieces get longer/more advanced, instead of one long horizontally
   scrolling line.
2. **Adjustable metronome** — selectable beat sounds, volume, and (for lesson/gym exercises) a
   practice tempo percentage independent of the exercise's authored tempo.
3. **Live-follow highlight + scoring overlay** — during a lesson/Practice Gym exercise, the next
   expected note(s) highlight on the keyboard and notation as they become due, with a supplementary
   real-time points/combo readout (small bonus for accuracy, small penalty for a missed note). This
   sits alongside, and does not replace, the existing authoritative multi-metric scoring.
4. **Play-Along notation strip** — a small rolling two-staff (treble+bass) notation preview above
   the falling-notes waterfall, showing the next stretch of the song with notes highlighting as
   they become due, quantized for readability only (scoring is untouched).

Implementation is phased (see `## Phasing` at the end); phases build on each other but each is
independently shippable and testable.

## 1. Data model additions

All additions are optional / defaulted, so existing content and API payloads keep working
unchanged.

- `MidiExercise` (`shared-types`) gains:
  - `beatsPerBar?: number` (default 4 wherever absent)
  - `beatUnit?: number` (default 4 wherever absent)
- `ExerciseAttemptPayload` (`shared-types`) gains:
  - `tempoPct?: 25 | 50 | 75 | 100` (default 100)
- `scoreMidiExercise` (`midi-engine`) accepts the resolved `tempoPct` and computes
  `msPerBeat = (60_000 / exercise.tempoBpm) * (100 / tempoPct)` instead of the current fixed
  `60_000 / exercise.tempoBpm`. This is the *only* change to the scoring function — the matching,
  weighting, and mistake-detection logic are untouched. Both `/exercises/:id/attempts` and
  `/practice/score` pass the payload's `tempoPct` through.
- `parsePlayAlongSong` (`apps/web/src/utils/playalongSong.ts`) additionally extracts and returns
  `bpm` (from `midi.header.tempos[0]?.bpm`, default 120) and `beatsPerBar` (from
  `midi.header.timeSignatures[0]?.timeSignature`, default 4) — used only by the notation preview
  strip (§5), never by scoring.

## 2. Notation renderer: bars, beats, multi-row layout

`NotationRenderer` (`apps/web/src/components/notation/NotationRenderer.tsx`) already supports a
`measures` shape with barlines, time signatures, and key signatures for hand-authored content; two
gaps get closed and one new capability gets added.

### Rest-filling for honest bar math
A new helper computes, per measure, the total `durationBeats` already placed and — if short of
`beatsPerBar` — appends VexFlow rest tickables (`"qr"`, `"hr"`, `"wr"`, etc., decomposing the
remainder into standard note values) so barlines land at the correct visual position even when a
measure isn't fully written out. This only needs to handle trailing gaps within a measure (the
shapes of content actually authored today are monophonic-ish melodic lines); no cross-measure tie
handling is in scope.

### `MidiExercise` → measured notation
`notationFor()` (`apps/web/src/components/midi/MidiExercise.tsx`) changes from building one flat
note list to grouping `exercise.expected` into measures using `beatsPerBar`, and passes
`timeSignature: "${beatsPerBar}/${beatUnit}"` into the stave data. The existing beat-grouping/dedup
logic is reused; only the measure-boundary grouping is new.

### Automatic multi-row (system) wrapping
`NotationRenderer` gains automatic wrapping: once a stave's cumulative measure width would exceed a
comfortable line budget, it breaks into a new staff system, stacked vertically with a consistent
left margin. Convention (matches real engraved music, no separate pagination UI needed):
- Time signature and key signature are drawn once, on the first system.
- Clef is repeated on every system.
- A grand staff's brace/connector is drawn per system-row (each row is its own treble+bass pair).

This turns long/advanced pieces into a tall, scrollable column of systems instead of one endless
horizontally-scrolling line — the "full pages of notes" behavior — while short exercises render
exactly as a single line, unchanged.

### Small time-signature readout
A small chip (e.g. "4/4") stays next to the exercise header text as a redundant, unambiguous
readout alongside the drawn time signature glyph.

## 3. Metronome: sounds, volume, practice tempo

### Sound bank + volume
`Metronome` (`apps/web/src/utils/metronome.ts`) gains:
- `sound: "click" | "wood" | "beep" | "cowbell"` — four distinct Web Audio synthesis recipes (no
  audio files): `click` is today's accented square wave; `wood` is a short filtered noise burst;
  `beep` is a plain sine tone; `cowbell` is the classic two-detuned-square-oscillators trick. Each
  keeps the existing accent-on-beat-1 behavior.
- `volume: number` (0–1) scaling the existing gain envelope peak.

### `MetronomeControls` component
A new small reusable control (sound picker + volume slider + "▶ preview" button that clicks 4
beats) — same interaction pattern as the existing voice-preview button in Settings.
- **Settings page**: persisted default (`localStorage`, new key `ks-metronome-settings`), sound +
  volume only (no tempo — tempo is always contextual to whatever's playing).
- **Lesson/Gym exercise**: inline control replacing today's plain on/off checkbox, defaulting to
  the Settings value but overridable per session (not persisted from here).

### Practice tempo percentage (lessons/gym only — Play-Along already has this)
`MidiExercise` gains a tempo % selector (25/50/75/100, same options and styling as Play-Along's).
Selecting a percentage:
- Scales the BPM passed to the count-in/metronome (`effectiveBpm = exercise.tempoBpm * pct/100`).
- Is included as `tempoPct` in the `submit()` payload (§1), so the server-side scorer judges timing
  and rhythm against the tempo actually practiced at, not the authored tempo.
- Defaults to 100 (today's behavior) when untouched.

## 4. Live-follow highlight + scoring overlay (Lessons + Practice Gym)

This composes existing, already-tested Play-Along machinery rather than introducing a new engine.

### Shared judge helper (refactor, not new logic)
The nearest-unjudged-same-pitch matching logic currently inlined in
`PlayAlongEngine.pressKey` (`apps/web/src/utils/playalongEngine.ts`) is extracted into a small pure
function in `midi-engine`, e.g.:
```ts
judgeNextPress(notes: PlayAlongNote[], judgments: (PlayAlongJudgment|undefined)[], midi: number, songTimeS: number): { index: number; judgment: PlayAlongJudgment } | null
```
`PlayAlongEngine.pressKey` is refactored to call it (behavior-preserving — covered by existing
`playalong.test.ts` cases). The new lesson overlay (below) calls the same function, so both
features share one tested definition of "was this press a hit."

### Live cursor + highlighting
While `phase === "recording"`, a small per-frame loop (reusing the `start.current` clock already in
`MidiExercise`) determines which expected note(s) are "due now" (converting `expected` events to
`PlayAlongNote`-shaped `{midi, startS, durationS}` via the effective tempo from §3) and:
- Passes their MIDI numbers into `VirtualPiano`'s existing `expectedNotes` prop (already supported;
  today it's only used pre-play).
- Passes their `ExpectedNoteEvent.id`s into a new `NotationRenderer` prop, `activeNoteIds?: Set<string>`,
  which tints the corresponding notehead(s). The notation only re-renders when the active set
  actually changes (i.e., once per note boundary), not every animation frame.

### Live scoring HUD (supplementary, non-authoritative)
Each MIDI note-on during recording is judged live via `judgeNextPress`. A small floating delta
(e.g. "+7" / "−3") plus a running "Live" score/combo readout appears near the piano during capture.
When a due note's window passes unplayed, it's marked missed live (small negative delta, brief red
flash echoing `VirtualPiano`'s existing feedback coloring, non-persistent). This HUD is clearly
labeled "Live" and disappears once the exercise is submitted — the authoritative result panel
(`result.score`, `SubmetricBar`s, `result.feedback`) is unchanged, still computed by
`scoreMidiExercise` exactly as today, including pass/fail against `PASS_SCORE`.

## 5. Play-Along notation strip

A new component, `NotationPreviewStrip`, rendered above the existing waterfall `<canvas>` in
`PlayAlongPage.tsx` (same horizontal-scroll container), fixed height (~180px).

- Shows a **rolling window** of upcoming notes (roughly the next 1–2 measures, computed from the
  song's `bpm`/`beatsPerBar` from §1) on a two-staff grand staff (treble = right hand, bass = left
  hand — matching the existing hand-assignment already used for waterfall coloring).
- Each note's real `startS`/`durationS` is **quantized to the nearest sixteenth note at the song's
  detected tempo purely for this display** (grouped into measures using §2's rest-filling helper).
  This quantization is display-only; it never touches `parsed.notes`, the waterfall, or the
  judging/scoring engine, which all keep using exact unquantized times.
- Notes tint as they become due using the same `activeNoteIds` mechanism from §4, driven by the
  same `songTime()` clock already driving the falling notes below it, so the two stay in sync.
- Explicitly scoped to a small sliding window, not full-piece transcription: transcribing an entire
  arbitrary, human-performed MIDI file into properly engraved notation (rests, ties, beaming,
  tuplets, across ~305 songs of varying quality) is a much larger and inherently imperfect problem
  that real notation software still struggles with. A rolling few-measure window sidesteps it while
  still delivering "notes highlighted as they should be played."

## 6. Testing

- `packages/midi-engine`: unit tests for tempo-aware `scoreMidiExercise` (same fixtures at 100%,
  and re-run at 50%/25% with proportionally scaled performed timestamps expecting the same
  accuracy), for the extracted `judgeNextPress` helper (parity with pre-refactor `pressKey`
  behavior), and for the rest-filling measure helper (gap-filling arithmetic, edge case of a measure
  that exactly fills).
- `apps/web`: unit tests for the MIDI-header tempo/time-signature extraction in
  `parsePlayAlongSong`, and for the display-quantization function feeding the notation preview
  strip (pure function, easy to test in isolation from React/VexFlow).
- Manual/in-browser verification (per this project's established pattern — Codex is not trusted for
  E2E, no Docker/Postgres in its sandbox): a lesson exercise with a real gap (to see rest-filling), a
  repertoire lesson long enough to force multi-row wrapping, metronome sound switching audibly, a
  practice-tempo run scored fairly at 50%, the live overlay highlighting/scoring during a lesson
  exercise, and the Play-Along notation strip staying in sync with the waterfall on an existing
  library song.

## Phasing

1. **Foundation** — §1 data model, §2 notation (bars/rests/multi-row), §3 metronome
   sounds/volume/Settings UI. No scoring-semantics change; safe to ship alone.
2. **Practice tempo** — §3's tempo % control end-to-end, including the tempo-aware scoring change.
3. **Live-follow overlay** — §4, for Lessons and Practice Gym.
4. **Play-Along notation strip** — §5, depending on §1's MIDI header extraction and §2/§4's
   rest-filling and highlighting mechanisms.
