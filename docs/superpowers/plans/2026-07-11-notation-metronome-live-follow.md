# Multi-Row Notation, Adjustable Metronome, and Live-Follow Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give lessons/Practice Gym real barred, multi-row notation; an adjustable metronome (sounds, volume, practice tempo); a supplementary live-follow highlight+scoring overlay during exercises; and a synced notation preview strip above the Play-Along waterfall.

**Architecture:** Four phases, each independently shippable. Phase 1 is pure foundation (data model, notation rendering, metronome) with no scoring-semantics change. Phase 2 threads a practice-tempo percentage through the existing scorer. Phase 3 composes Play-Along's already-tested note-matching logic into a new supplementary overlay for lesson/gym exercises. Phase 4 reuses phases 1–3's building blocks (measure/rest grouping, highlight prop) to add a rolling notation strip above the falling-notes waterfall.

**Tech Stack:** pnpm monorepo — `apps/web` (React 18/Vite/TS/Tailwind/Zustand/VexFlow 4/@tonejs/midi), `apps/api` (Express 5/Prisma/PostgreSQL/Zod), `packages/{shared-types,midi-engine,music-theory,lesson-engine}`. Tests via `vitest` (`pnpm test` runs all workspaces). No React component-testing library is set up in this repo — UI-only changes are verified manually in-browser (dev server + real click-throughs), matching this project's established practice (see `CLAUDE.md`: Codex's sandbox has no Docker/Postgres, so Claude always verifies live). Pure-logic changes (scoring math, notation grouping, note-matching, quantization) get real `vitest` unit tests.

## Global Constraints

- Every new `MidiExercise`/`ExerciseAttemptPayload` field is optional with a default that reproduces today's exact behavior — no existing content or API payload should need to change.
- `zod` schemas in `apps/api/src/app.ts` and `packages/lesson-engine/src/index.ts` use plain (non-`.strict()`) `z.object()`, which silently strips unrecognized keys — any new field added to a shared type MUST also be added to the corresponding zod schema, or it will vanish in transit.
- Follow this repo's existing dense/compact code style within files that already use it (`packages/lesson-engine/src/index.ts`, `apps/api/src/content/helpers.ts`); use normal multi-line style in files that already use it (`apps/web/src/components/**`, `packages/midi-engine/src/*.ts`).
- Run `pnpm typecheck` and the relevant `pnpm test` after every task; never leave a task committed with a red build.
- Never commit unless explicitly instructed to in a step — every task below ends with an explicit `git commit` step, so no additional confirmation is required for those.

---

## Phase 1 — Foundation: data model, notation, metronome

### Task 1: Data model — `beatsPerBar`/`beatUnit`/`tempoPct`

**Files:**
- Modify: `packages/shared-types/src/index.ts:24` (`MidiExercise`), `:46` (`ExerciseAttemptPayload`)
- Modify: `packages/lesson-engine/src/index.ts:24` (`midiExerciseSchema`)

**Interfaces:**
- Produces: `MidiExercise.beatsPerBar?: number`, `MidiExercise.beatUnit?: number`, `ExerciseTempoPct = 25 | 50 | 75 | 100`, `ExerciseAttemptPayload.tempoPct?: ExerciseTempoPct`.

- [ ] **Step 1: Update `MidiExercise` and add `ExerciseTempoPct`**

In `packages/shared-types/src/index.ts`, replace line 24:

```ts
export interface MidiExercise { exerciseId: string; tempoBpm: number; difficulty: "beginner" | "intermediate" | "advanced"; simultaneityWindowMs: number; timingToleranceMs: number; durationTolerancePercent: number; scoring?: "timed" | "untimed"; expected: ExpectedNoteEvent[] }
```

with:

```ts
export interface MidiExercise { exerciseId: string; tempoBpm: number; difficulty: "beginner" | "intermediate" | "advanced"; simultaneityWindowMs: number; timingToleranceMs: number; durationTolerancePercent: number; scoring?: "timed" | "untimed"; beatsPerBar?: number; beatUnit?: number; expected: ExpectedNoteEvent[] }
export type ExerciseTempoPct = 25 | 50 | 75 | 100;
```

- [ ] **Step 2: Add `tempoPct` to `ExerciseAttemptPayload`**

Replace line 46:

```ts
export interface ExerciseAttemptPayload { rawEvents?: RawMidiEvent[]; performedNotes?: PerformedNote[] }
```

with:

```ts
export interface ExerciseAttemptPayload { rawEvents?: RawMidiEvent[]; performedNotes?: PerformedNote[]; tempoPct?: ExerciseTempoPct }
```

- [ ] **Step 3: Add the same fields to `midiExerciseSchema` so the API doesn't silently strip them**

In `packages/lesson-engine/src/index.ts`, replace line 24:

```ts
export const midiExerciseSchema = z.object({exerciseId:z.string().min(1),tempoBpm:z.number().positive(),difficulty:z.enum(["beginner","intermediate","advanced"]),simultaneityWindowMs:z.number().positive(),timingToleranceMs:z.number().positive(),durationTolerancePercent:z.number().positive(),scoring:z.enum(["timed","untimed"]).optional(),expected:z.array(expectedNote).min(1)});
```

with:

```ts
export const midiExerciseSchema = z.object({exerciseId:z.string().min(1),tempoBpm:z.number().positive(),difficulty:z.enum(["beginner","intermediate","advanced"]),simultaneityWindowMs:z.number().positive(),timingToleranceMs:z.number().positive(),durationTolerancePercent:z.number().positive(),scoring:z.enum(["timed","untimed"]).optional(),beatsPerBar:z.number().int().positive().optional(),beatUnit:z.number().int().positive().optional(),expected:z.array(expectedNote).min(1)});
```

- [ ] **Step 4: Typecheck and run existing tests to confirm nothing broke**

Run: `pnpm typecheck && pnpm test`
Expected: all green (these are additive optional fields; `apps/api/src/content.test.ts` and `packages/midi-engine`'s `index.test.ts` must still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/index.ts packages/lesson-engine/src/index.ts
git commit -m "feat(shared-types): add beatsPerBar/beatUnit and tempoPct fields"
```

---

### Task 2: `measureNotation` util — measures, rest-filling, shared helpers

**Files:**
- Create: `apps/web/src/utils/measureNotation.ts`
- Create: `apps/web/src/utils/measureNotation.test.ts`

**Interfaces:**
- Produces: `BeatEvent { ids: string[]; keys: string[]; startBeat: number; durationBeats: number }`, `NoteData { ids?: string[]; keys: string[]; duration: string }`, `midiToVexKey(note: number): string`, `beatsToVexDuration(beats: number): string`, `groupIntoMeasures(events: BeatEvent[], beatsPerBar: number): NoteData[][]`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/utils/measureNotation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { beatsToVexDuration, groupIntoMeasures, midiToVexKey, type BeatEvent } from "./measureNotation";

describe("beatsToVexDuration", () => {
  it("maps beat values to VexFlow duration codes", () => {
    expect(beatsToVexDuration(4)).toBe("w");
    expect(beatsToVexDuration(2)).toBe("h");
    expect(beatsToVexDuration(1)).toBe("q");
    expect(beatsToVexDuration(0.5)).toBe("8");
  });
});

describe("midiToVexKey", () => {
  it("converts MIDI note numbers to VexFlow key strings", () => {
    expect(midiToVexKey(60)).toBe("c/4");
    expect(midiToVexKey(61)).toBe("c#/4");
    expect(midiToVexKey(72)).toBe("c/5");
  });
});

const beatEvent = (keys: string[], startBeat: number, durationBeats: number, ids = ["e"]): BeatEvent => ({
  ids,
  keys,
  startBeat,
  durationBeats,
});

describe("groupIntoMeasures", () => {
  it("groups a full measure of quarter notes with no rests", () => {
    const events = [
      beatEvent(["c/4"], 0, 1),
      beatEvent(["d/4"], 1, 1),
      beatEvent(["e/4"], 2, 1),
      beatEvent(["f/4"], 3, 1),
    ];
    const measures = groupIntoMeasures(events, 4);
    expect(measures).toHaveLength(1);
    expect(measures[0]).toEqual([
      { ids: ["e"], keys: ["c/4"], duration: "q" },
      { ids: ["e"], keys: ["d/4"], duration: "q" },
      { ids: ["e"], keys: ["e/4"], duration: "q" },
      { ids: ["e"], keys: ["f/4"], duration: "q" },
    ]);
  });

  it("fills a trailing gap in an under-filled measure with rests", () => {
    const events = [beatEvent(["c/4"], 0, 2)]; // half note, 2 beats short of a 4/4 bar
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0]).toEqual([
      { ids: ["e"], keys: ["c/4"], duration: "h" },
      { keys: ["b/4"], duration: "hr" },
    ]);
  });

  it("fills a leading gap before a pickup-style note starting mid-measure", () => {
    const events = [beatEvent(["c/4"], 2, 2)]; // starts on beat 3 of a 4/4 bar
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0]).toEqual([
      { keys: ["b/4"], duration: "hr" },
      { ids: ["e"], keys: ["c/4"], duration: "h" },
    ]);
  });

  it("splits notes spanning a bar boundary into separate measures", () => {
    const events = [beatEvent(["c/4"], 0, 4), beatEvent(["d/4"], 4, 4)];
    const measures = groupIntoMeasures(events, 4);
    expect(measures).toHaveLength(2);
    expect(measures[0]).toEqual([{ ids: ["e"], keys: ["c/4"], duration: "w" }]);
    expect(measures[1]).toEqual([{ ids: ["e"], keys: ["d/4"], duration: "w" }]);
  });

  it("combines simultaneous notes (chords) into one grouped entry per caller convention", () => {
    const events = [beatEvent(["c/4", "e/4", "g/4"], 0, 1, ["a", "b", "c"])];
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0][0]).toEqual({ ids: ["a", "b", "c"], keys: ["c/4", "e/4", "g/4"], duration: "q" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/web test -- measureNotation`
Expected: FAIL — `Cannot find module './measureNotation'`.

- [ ] **Step 3: Implement `measureNotation.ts`**

Create `apps/web/src/utils/measureNotation.ts`:

```ts
export interface BeatEvent {
  ids: string[];
  keys: string[];
  startBeat: number;
  durationBeats: number;
}

export interface NoteData {
  ids?: string[];
  keys: string[];
  duration: string;
}

/** MIDI note number → VexFlow key string, e.g. 61 → "c#/4". */
export function midiToVexKey(note: number): string {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[note % 12]}/${Math.floor(note / 12) - 1}`;
}

/**
 * Maps beats → VexFlow duration codes, including dotted values —
 * NotationRenderer attaches Dot modifiers for "d"-suffix codes, so the dot
 * glyphs render correctly.
 */
export function beatsToVexDuration(beats: number): string {
  if (beats >= 4) return "w";
  if (beats >= 3) return "hd";
  if (beats >= 2) return "h";
  if (beats >= 1.5) return "qd";
  if (beats >= 1) return "q";
  if (beats >= 0.75) return "8d";
  return "8";
}

const REST_STEPS: { beats: number; code: string }[] = [
  { beats: 4, code: "w" },
  { beats: 2, code: "h" },
  { beats: 1, code: "q" },
  { beats: 0.5, code: "8" },
  { beats: 0.25, code: "16" },
];

/** Decomposes a gap (in beats) into rest tickables using standard note values, largest first. */
function restsForGap(beats: number): NoteData[] {
  const rests: NoteData[] = [];
  let remaining = Math.round(beats * 4) / 4; // snap to the nearest 16th to avoid float drift
  for (const step of REST_STEPS) {
    while (remaining + 1e-6 >= step.beats) {
      rests.push({ keys: ["b/4"], duration: `${step.code}r` });
      remaining -= step.beats;
    }
  }
  return rests;
}

/**
 * Groups already startBeat-deduplicated events (one per distinct startBeat —
 * callers combine simultaneous/chord notes into a single BeatEvent before
 * calling this) into measures of `beatsPerBar` beats each, filling any
 * leading or trailing gap in a measure with rests so barlines land at their
 * correct visual position even when a phrase doesn't fully fill every bar.
 */
export function groupIntoMeasures(events: BeatEvent[], beatsPerBar: number): NoteData[][] {
  const sorted = [...events].sort((a, b) => a.startBeat - b.startBeat);
  const measures: NoteData[][] = [];
  let currentMeasureIndex = -1;
  let currentMeasure: NoteData[] = [];
  let beatsUsedInMeasure = 0;

  const closeMeasure = () => {
    if (currentMeasureIndex === -1) return;
    const gap = beatsPerBar - beatsUsedInMeasure;
    if (gap > 1e-6) currentMeasure.push(...restsForGap(gap));
    measures.push(currentMeasure);
  };

  for (const event of sorted) {
    const measureIndex = Math.floor(event.startBeat / beatsPerBar);
    if (measureIndex !== currentMeasureIndex) {
      closeMeasure();
      currentMeasureIndex = measureIndex;
      currentMeasure = [];
      beatsUsedInMeasure = 0;
      const measureStartBeat = measureIndex * beatsPerBar;
      const leadGap = event.startBeat - measureStartBeat;
      if (leadGap > 1e-6) {
        currentMeasure.push(...restsForGap(leadGap));
        beatsUsedInMeasure += leadGap;
      }
    }
    currentMeasure.push({ ids: event.ids, keys: event.keys, duration: beatsToVexDuration(event.durationBeats) });
    beatsUsedInMeasure += event.durationBeats;
  }
  closeMeasure();
  return measures;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/web test -- measureNotation`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/measureNotation.ts apps/web/src/utils/measureNotation.test.ts
git commit -m "feat(web): add measureNotation util (measure grouping + rest-filling)"
```

---

### Task 3: `NotationRenderer` — multi-row system wrapping + highlight prop

**Files:**
- Modify: `apps/web/src/components/notation/NotationRenderer.tsx` (full-file rewrite — nearly every function changes)

**Interfaces:**
- Consumes: `NoteData` shape now includes optional `ids?: string[]` (from Task 2, though `NotationRenderer` doesn't import the type — it declares its own structurally-identical local `NoteData` interface, same as before).
- Produces: `NotationRenderer` gains a new optional prop `activeNoteIds?: Set<string>` that tints matching noteheads; automatically wraps long staves into multiple stacked systems instead of one long horizontally-scrolling line.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `apps/web/src/components/notation/NotationRenderer.tsx` with:

```tsx
import { useEffect, useRef } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Formatter,
  Voice,
  StaveConnector,
  Accidental,
  BarNote,
  Dot,
  type RenderContext,
} from "vexflow";

interface NoteData {
  ids?: string[];
  keys: string[];
  duration: string;
}

interface SimpleStaveData {
  clef: string;
  timeSignature?: string;
  /** Optional key signature spec, e.g. "G", "D", "F", "Bb", "Am" (VexFlow names). */
  keySignature?: string;
  /** Flat note list (original shape). Ignored when `measures` is present. */
  notes?: NoteData[];
  /** Measure-grouped notes; barlines are drawn between measures. */
  measures?: { notes: NoteData[] }[];
}

interface GrandStaffData {
  grandStaff: true;
  treble: SimpleStaveData;
  bass: SimpleStaveData;
}

type NotationData = SimpleStaveData | GrandStaffData;

function isGrandStaffData(data: Record<string, unknown>): boolean {
  return data.grandStaff === true && !!data.treble && !!data.bass;
}

/**
 * VexFlow key strings like "c#/4" or "bb/3" position the note at the right
 * pitch, but do NOT automatically draw the sharp/flat glyph — that requires
 * an explicit Accidental modifier. Extracts the accidental code (if any)
 * from a key string so the caller can attach it.
 */
function accidentalFromKey(key: string): string | null {
  const match = /^[a-gA-G](#{1,2}|b{1,2}|n)\//.exec(key);
  return match?.[1] ?? null;
}

/**
 * Position of each key signature on the circle of fifths: positive = number
 * of sharps, negative = number of flats. Mirrors VexFlow's own key-signature
 * table (vexflow/src/tables.ts) so any spec `addKeySignature` accepts is
 * also understood here.
 */
const KEY_SIG_FIFTHS: Record<string, number> = {
  C: 0, Am: 0,
  G: 1, Em: 1, D: 2, Bm: 2, A: 3, "F#m": 3, E: 4, "C#m": 4,
  B: 5, "G#m": 5, "F#": 6, "D#m": 6, "C#": 7, "A#m": 7,
  F: -1, Dm: -1, Bb: -2, Gm: -2, Eb: -3, Cm: -3, Ab: -4, Fm: -4,
  Db: -5, Bbm: -5, Gb: -6, Ebm: -6, Cb: -7, Abm: -7,
};

const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];

/**
 * Derives which pitch letters a key signature sharpens/flattens (e.g.
 * "D" → { f: "#", c: "#" }). Notes whose explicit accidental is already in
 * the signature must NOT get a redundant accidental glyph — the signature
 * covers them. Accidentals outside the signature still get glyphs.
 */
function keySignatureAccidentals(keySignature?: string): Record<string, string> {
  const fifths = keySignature ? KEY_SIG_FIFTHS[keySignature] : undefined;
  const map: Record<string, string> = {};
  if (!fifths) return map;
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  const acc = fifths > 0 ? "#" : "b";
  for (let i = 0; i < Math.abs(fifths); i++) map[order[i]] = acc;
  return map;
}

/**
 * Counts dots in a duration code ("qd" → 1, "8d" → 1, "q" → 0). Same parse
 * as VexFlow's Note.parseDuration (vexflow/src/note.ts), which handles the
 * tick math for "d" suffixes but does NOT draw the dot glyph — that requires
 * an explicit Dot modifier (Dot.buildAndAttach), same story as accidentals.
 * Also matches rest codes ("hr", "qr") via the trailing [nrhms] group, so
 * rests fall through this unaffected (0 dots).
 */
function dotsFromDuration(duration: string): number {
  const match = /^(\d*\/?\d+|[a-z])(d*)([nrhms]|$)/.exec(duration);
  return match ? match[2].length : 0;
}

/**
 * Normalizes a stave's content to measure groups: `measures` wins when
 * present; a flat `notes` array is treated as a single measure (no barlines),
 * preserving the original rendering for existing content.
 */
function measuresOf(data: SimpleStaveData): NoteData[][] {
  if (data.measures && data.measures.length > 0) return data.measures.map((m) => m.notes ?? []);
  return data.notes && data.notes.length > 0 ? [data.notes] : [];
}

/** Felt-crimson (matches the app's accent color) used to tint note(s) currently due to be played. */
const ACTIVE_NOTE_COLOR = "#b4323e";

function buildStaveNote(
  n: NoteData,
  clef: string,
  sigAccidentals: Record<string, string>,
  activeNoteIds?: Set<string>,
): StaveNote {
  const staveNote = new StaveNote({ keys: n.keys, duration: n.duration, clef });
  if (activeNoteIds && n.ids?.some((id) => activeNoteIds.has(id))) {
    staveNote.setStyle({ fillStyle: ACTIVE_NOTE_COLOR, strokeStyle: ACTIVE_NOTE_COLOR });
  }
  n.keys.forEach((key, keyIndex) => {
    const accidental = accidentalFromKey(key);
    if (!accidental) return;
    // Skip the glyph when the key signature already applies this accidental
    // to this pitch letter (e.g. f#/5 under a G-major signature).
    if (sigAccidentals[key[0].toLowerCase()] === accidental) return;
    staveNote.addModifier(new Accidental(accidental), keyIndex);
  });
  const dots = dotsFromDuration(n.duration);
  for (let i = 0; i < dots; i++) Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

/**
 * A fixed canvas width was clipping accidentals on longer note runs — a note
 * late in a 16-note passage could get formatted past the SVG's own right
 * edge, silently cutting off its sharp/flat glyph (found via a real lesson:
 * the flat on B in a D-natural-minor scale rendered at all, just off-canvas).
 * Scale width with note count instead, with overflow-x-auto on the
 * container as a fallback for anything still too wide to fit comfortably.
 */
const NOTE_WIDTH_PX = 34;
const BARLINE_WIDTH_PX = 14;
const KEY_SIG_ACCIDENTAL_PX = 12;
const STAVE_MARGIN_PX = 90;
function computeStaveWidth(noteCount: number): number {
  return Math.max(420, noteCount * NOTE_WIDTH_PX + STAVE_MARGIN_PX);
}

/** Width for one system's content: its own notes/rests, plus a little per barline and per key-signature accidental. */
function systemWidth(measures: NoteData[][], keySignature?: string): number {
  const noteCount = measures.reduce((sum, m) => sum + m.length, 0);
  const barlineCount = Math.max(measures.length - 1, 0);
  const keySigCount = Math.abs(KEY_SIG_FIFTHS[keySignature ?? ""] ?? 0);
  return computeStaveWidth(noteCount) + barlineCount * BARLINE_WIDTH_PX + keySigCount * KEY_SIG_ACCIDENTAL_PX;
}

/** Rough per-measure width used only to decide where a line should wrap — not the final rendered width. */
function measureWidthPx(measure: NoteData[]): number {
  return measure.length * NOTE_WIDTH_PX + BARLINE_WIDTH_PX;
}

/** Longest a single staff system (line) is allowed to get before wrapping to a new row — mirrors printed sheet music instead of one long horizontally-scrolling line. */
const MAX_SYSTEM_WIDTH_PX = 900;
const SINGLE_STAVE_HEIGHT_PX = 150;
const SYSTEM_GAP_PX = 30;
const GRAND_STAVE_HEIGHT_PX = 230;
const GRAND_SYSTEM_GAP_PX = 40;

/** Chunks measures into systems (lines), never splitting a single measure across two lines. */
function chunkMeasuresIntoSystems(measures: NoteData[][], maxWidthPx: number): NoteData[][][] {
  const systems: NoteData[][][] = [];
  let current: NoteData[][] = [];
  let currentWidth = STAVE_MARGIN_PX;
  for (const measure of measures) {
    const width = measureWidthPx(measure);
    if (current.length > 0 && currentWidth + width > maxWidthPx) {
      systems.push(current);
      current = [];
      currentWidth = STAVE_MARGIN_PX;
    }
    current.push(measure);
    currentWidth += width;
  }
  if (current.length > 0) systems.push(current);
  return systems;
}

/** Same wrapping decision as chunkMeasuresIntoSystems, but for a treble/bass pair that must break at the same measure boundaries. */
function chunkGrandStaffIntoSystems(
  trebleMeasures: NoteData[][],
  bassMeasures: NoteData[][],
  maxWidthPx: number,
): { treble: NoteData[][]; bass: NoteData[][] }[] {
  const measureCount = Math.max(trebleMeasures.length, bassMeasures.length);
  const systems: { treble: NoteData[][]; bass: NoteData[][] }[] = [];
  let currentTreble: NoteData[][] = [];
  let currentBass: NoteData[][] = [];
  let currentWidth = STAVE_MARGIN_PX;
  for (let i = 0; i < measureCount; i++) {
    const treble = trebleMeasures[i] ?? [];
    const bass = bassMeasures[i] ?? [];
    const width = Math.max(measureWidthPx(treble), measureWidthPx(bass));
    if (currentTreble.length > 0 && currentWidth + width > maxWidthPx) {
      systems.push({ treble: currentTreble, bass: currentBass });
      currentTreble = [];
      currentBass = [];
      currentWidth = STAVE_MARGIN_PX;
    }
    currentTreble.push(treble);
    currentBass.push(bass);
    currentWidth += width;
  }
  if (currentTreble.length > 0) systems.push({ treble: currentTreble, bass: currentBass });
  return systems;
}

/**
 * Draws one staff system (line): a Stave plus its notes/rests. Clef is
 * always drawn; key signature is drawn whenever the caller passes one (real
 * engraving repeats the key signature on every system); time signature is
 * only passed by the caller for the first system of a piece.
 */
function drawStaveSystem(
  context: RenderContext,
  measures: NoteData[][],
  clef: string,
  x: number,
  y: number,
  width: number,
  keySignature: string | undefined,
  timeSignature: string | undefined,
  activeNoteIds: Set<string> | undefined,
): Stave {
  const stave = new Stave(x, y, width);
  stave.addClef(clef);
  if (timeSignature) stave.addTimeSignature(timeSignature);
  if (keySignature) stave.addKeySignature(keySignature);
  stave.setContext(context).draw();

  const sigAccidentals = keySignatureAccidentals(keySignature);
  const tickables: (StaveNote | BarNote)[] = [];
  let noteCount = 0;
  measures.forEach((measure, measureIndex) => {
    // One voice for the whole system; BarNote tickables (tick-free by
    // design) render the barlines between measure groups.
    if (measureIndex > 0) tickables.push(new BarNote());
    measure.forEach((n) => {
      tickables.push(buildStaveNote(n, clef, sigAccidentals, activeNoteIds));
      noteCount += 1;
    });
  });

  if (noteCount > 0) {
    const voice = new Voice({ num_beats: noteCount, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(tickables);
    // Format into the space that remains after clef/time/key signatures —
    // getNoteStartX accounts for however wide those modifiers actually are.
    const formatWidth = Math.max(stave.getNoteEndX() - stave.getNoteStartX() - 20, 50);
    new Formatter().joinVoices([voice]).format([voice], formatWidth);
    voice.draw(context, stave);
  }

  return stave;
}

/**
 * Renders lesson vexflowData with VexFlow. Handles the simple single-staff
 * shape and the grand-staff (treble+bass+brace) shape used in lessons. Long
 * pieces automatically wrap into multiple staff systems (like printed sheet
 * music) instead of one long horizontally-scrolling line.
 */
export default function NotationRenderer({
  data,
  title,
  activeNoteIds,
}: {
  data: Record<string, unknown>;
  title?: string;
  /** ExpectedNoteEvent ids (or play-along note ids) currently due to be played — tinted on the stave. */
  activeNoteIds?: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
        const trebleMeasures = measuresOf(grandStaffData.treble);
        const bassMeasures = measuresOf(grandStaffData.bass);
        const systems = chunkGrandStaffIntoSystems(trebleMeasures, bassMeasures, MAX_SYSTEM_WIDTH_PX);
        const widths = systems.map(({ treble, bass }) =>
          Math.max(
            systemWidth(treble, grandStaffData.treble.keySignature),
            systemWidth(bass, grandStaffData.bass.keySignature),
          ),
        );
        const width = Math.max(...widths, 420);
        const totalHeight =
          systems.length * GRAND_STAVE_HEIGHT_PX + Math.max(systems.length - 1, 0) * GRAND_SYSTEM_GAP_PX;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width + 40, totalHeight + 40);
        const context = renderer.getContext();

        systems.forEach((system, i) => {
          const y = 20 + i * (GRAND_STAVE_HEIGHT_PX + GRAND_SYSTEM_GAP_PX);
          const trebleStave = drawStaveSystem(
            context, system.treble, grandStaffData.treble.clef, 20, y, widths[i] - 40,
            grandStaffData.treble.keySignature, i === 0 ? grandStaffData.treble.timeSignature : undefined,
            activeNoteIds,
          );
          const bassStave = drawStaveSystem(
            context, system.bass, grandStaffData.bass.clef, 20, y + 90, widths[i] - 40,
            grandStaffData.bass.keySignature, i === 0 ? grandStaffData.bass.timeSignature : undefined,
            activeNoteIds,
          );
          const brace = new StaveConnector(trebleStave, bassStave);
          brace.setType("brace");
          brace.setContext(context).draw();
          const leftLine = new StaveConnector(trebleStave, bassStave);
          leftLine.setType("singleLeft");
          leftLine.setContext(context).draw();
        });
      } else {
        const staveData = data as unknown as SimpleStaveData;
        const measures = measuresOf(staveData);
        const chunks = chunkMeasuresIntoSystems(measures, MAX_SYSTEM_WIDTH_PX);
        const widths = chunks.map((chunk) => systemWidth(chunk, staveData.keySignature));
        const width = Math.max(...widths, 420);
        const totalHeight = chunks.length * SINGLE_STAVE_HEIGHT_PX + Math.max(chunks.length - 1, 0) * SYSTEM_GAP_PX;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width + 20, totalHeight + 20);
        const context = renderer.getContext();

        chunks.forEach((chunk, i) => {
          const y = 20 + i * (SINGLE_STAVE_HEIGHT_PX + SYSTEM_GAP_PX);
          drawStaveSystem(
            context, chunk, staveData.clef, 10, y, widths[i] - 20,
            staveData.keySignature, i === 0 ? staveData.timeSignature : undefined,
            activeNoteIds,
          );
        });
      }
    } catch (err) {
      console.error("Failed to render notation", err);
      container.innerHTML =
        '<p class="text-sm text-rose-600">Notation could not be rendered.</p>';
    }
  }, [data, activeNoteIds]);

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block max-w-full rounded-md border border-ivory-200 bg-ivory-50 p-3 text-slate-900 shadow-sm">
        {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>}
        <div ref={containerRef} className="overflow-x-auto" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS (this file has no existing unit tests; it's exercised transitively through `MidiExercise`, updated in Task 4).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/notation/NotationRenderer.tsx
git commit -m "feat(web): NotationRenderer multi-row system wrapping + active-note highlighting"
```

---

### Task 4: `MidiExercise.tsx` — barred notation via `notationFor`

**Files:**
- Modify: `apps/web/src/components/midi/MidiExercise.tsx:1-74` (imports, removed local `vexKey`/`vexDuration`, rewritten `notationFor`), and the header chip JSX (currently `apps/web/src/components/midi/MidiExercise.tsx:260-267`)

**Interfaces:**
- Consumes: `groupIntoMeasures`, `midiToVexKey`, `BeatEvent` from Task 2's `measureNotation.ts`.
- Produces: `notationFor(exercise)` now returns `measures`-shaped stave data (barred, with rests) instead of one flat `notes` line.

- [ ] **Step 1: Replace the imports and `notationFor` function**

At the top of `apps/web/src/components/midi/MidiExercise.tsx`, replace this block (current lines 1–74):

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, RawMidiEvent, ScoringResult } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents } from "@keyboard-sensei/midi-engine";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "./MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import NotationRenderer from "../notation/NotationRenderer";
import { useProgressStore } from "../../state/progressStore";
import { metronome } from "../../utils/metronome";

/** Score a lesson exercise must reach for the lesson to count as passed (mirrors the API's threshold). */
export const PASS_SCORE = 70;
const COUNT_IN_BEATS = 4;

interface Props {
  exerciseId: string;
  title: string;
  instructions: string;
  lessonId?: string | null;
  exercise?: MidiExerciseDef;
  onCompleted?: (result: ScoringResult) => void;
}

type Phase = "idle" | "listening" | "counting-in" | "recording" | "submitting" | "scored";

const vexKey = (note: number) => {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[note % 12]}/${Math.floor(note / 12) - 1}`;
};

/**
 * Maps beats → VexFlow duration codes, including dotted values —
 * NotationRenderer attaches Dot modifiers for "d"-suffix codes, so the dot
 * glyphs render correctly.
 */
const vexDuration = (beats: number) => {
  if (beats >= 4) return "w";
  if (beats >= 3) return "hd";
  if (beats >= 2) return "h";
  if (beats >= 1.5) return "qd";
  if (beats >= 1) return "q";
  if (beats >= 0.75) return "8d";
  return "8";
};

/**
 * Builds notation for an exercise. Notes at or above middle C go on the
 * treble staff, notes below on the bass staff — as a grand staff when the
 * exercise spans both registers (single-clef rendering used to strand C5 on
 * ledger lines above a bass staff).
 */
function notationFor(exercise: MidiExerciseDef) {
  const beatsFor = (events: typeof exercise.expected) => {
    const groups = new Map<number, typeof exercise.expected>();
    for (const event of events) groups.set(event.startBeat, [...(groups.get(event.startBeat) ?? []), event]);
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, group]) => ({
        keys: group.map((event) => vexKey(event.note)),
        duration: vexDuration(Math.max(...group.map((event) => event.durationBeats))),
      }));
  };
  const treble = exercise.expected.filter((event) => event.note >= 60);
  const bass = exercise.expected.filter((event) => event.note < 60);
  if (treble.length > 0 && bass.length > 0) {
    return {
      grandStaff: true,
      treble: { clef: "treble", notes: beatsFor(treble) },
      bass: { clef: "bass", notes: beatsFor(bass) },
    };
  }
  const events = treble.length > 0 ? treble : bass;
  return { clef: treble.length > 0 ? "treble" : "bass", notes: beatsFor(events) };
}
```

with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, RawMidiEvent, ScoringResult } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents } from "@keyboard-sensei/midi-engine";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "./MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import NotationRenderer from "../notation/NotationRenderer";
import { useProgressStore } from "../../state/progressStore";
import { metronome } from "../../utils/metronome";
import { groupIntoMeasures, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";

/** Score a lesson exercise must reach for the lesson to count as passed (mirrors the API's threshold). */
export const PASS_SCORE = 70;
const COUNT_IN_BEATS = 4;

interface Props {
  exerciseId: string;
  title: string;
  instructions: string;
  lessonId?: string | null;
  exercise?: MidiExerciseDef;
  onCompleted?: (result: ScoringResult) => void;
}

type Phase = "idle" | "listening" | "counting-in" | "recording" | "submitting" | "scored";

/**
 * Builds barred notation for an exercise. Notes at or above middle C go on
 * the treble staff, notes below on the bass staff — as a grand staff when
 * the exercise spans both registers (single-clef rendering used to strand
 * C5 on ledger lines above a bass staff). Notes are grouped into measures
 * (with rest-filling for under-filled bars) using the exercise's
 * beatsPerBar/beatUnit, defaulting to 4/4 for older content predating those
 * fields.
 */
function notationFor(exercise: MidiExerciseDef) {
  const beatsPerBar = exercise.beatsPerBar ?? 4;
  const beatUnit = exercise.beatUnit ?? 4;
  const timeSignature = `${beatsPerBar}/${beatUnit}`;

  const beatEventsFor = (events: typeof exercise.expected): BeatEvent[] => {
    const groups = new Map<number, typeof exercise.expected>();
    for (const event of events) groups.set(event.startBeat, [...(groups.get(event.startBeat) ?? []), event]);
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([startBeat, group]) => ({
        ids: group.map((event) => event.id),
        keys: group.map((event) => midiToVexKey(event.note)),
        startBeat,
        durationBeats: Math.max(...group.map((event) => event.durationBeats)),
      }));
  };

  const treble = exercise.expected.filter((event) => event.note >= 60);
  const bass = exercise.expected.filter((event) => event.note < 60);
  if (treble.length > 0 && bass.length > 0) {
    return {
      grandStaff: true,
      treble: {
        clef: "treble",
        timeSignature,
        measures: groupIntoMeasures(beatEventsFor(treble), beatsPerBar).map((notes) => ({ notes })),
      },
      bass: {
        clef: "bass",
        timeSignature,
        measures: groupIntoMeasures(beatEventsFor(bass), beatsPerBar).map((notes) => ({ notes })),
      },
    };
  }
  const events = treble.length > 0 ? treble : bass;
  return {
    clef: treble.length > 0 ? "treble" : "bass",
    timeSignature,
    measures: groupIntoMeasures(beatEventsFor(events), beatsPerBar).map((notes) => ({ notes })),
  };
}
```

- [ ] **Step 2: Add a redundant time-signature chip to the header**

Find this block (the exercise header's chip row):

```tsx
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          {untimed ? (
            <span className="rounded-full border border-slate-300 px-2 py-1 dark:border-slate-600">Untimed — find the right keys</span>
          ) : (
            <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">♩ = {exercise.tempoBpm}</span>
          )}
          {lessonId && <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">{PASS_SCORE} to pass</span>}
        </div>
```

Replace with:

```tsx
        <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          {!untimed && (
            <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">
              {exercise.beatsPerBar ?? 4}/{exercise.beatUnit ?? 4}
            </span>
          )}
          {untimed ? (
            <span className="rounded-full border border-slate-300 px-2 py-1 dark:border-slate-600">Untimed — find the right keys</span>
          ) : (
            <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">♩ = {exercise.tempoBpm}</span>
          )}
          {lessonId && <span className="rounded-full border border-slate-300 px-2 py-1 tabular-nums dark:border-slate-600">{PASS_SCORE} to pass</span>}
        </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `pnpm db:start && pnpm dev` (from repo root), open `http://localhost:5173`, log in with the demo account, open any lesson with a MIDI exercise.
Expected: notation shows a time signature at the start and visible barlines dividing the phrase into measures; the "4/4" chip appears next to the tempo chip. Open a longer repertoire lesson (e.g. Ode to Joy or Minuet in G) and confirm it's still legible (single system is fine here — multi-row wrapping only kicks in past ~900px of content, verified further in Task 5's manual check if a long-enough exercise exists, otherwise this is confirmed structurally by the unit tests in Task 2/3).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/midi/MidiExercise.tsx
git commit -m "feat(web): MidiExercise notation now bars/rests aware via measureNotation"
```

---

### Task 5: Metronome — selectable sounds + volume

**Files:**
- Modify: `apps/web/src/utils/metronome.ts` (full-file rewrite)

**Interfaces:**
- Produces: `MetronomeSound = "click" | "wood" | "beep" | "cowbell"`, `MetronomeStartOptions.sound?`, `MetronomeStartOptions.volume?`.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `apps/web/src/utils/metronome.ts` with:

```ts
export type MetronomeSound = "click" | "wood" | "beep" | "cowbell";

export interface MetronomeStartOptions {
  bpm: number;
  beatsPerBar?: number;
  /** Number of count-in beats to click before onGo fires (0 = start immediately). */
  countInBeats?: number;
  /** Which synthesized click timbre to use. Default "click". */
  sound?: MetronomeSound;
  /** 0–1 output gain multiplier. Default 0.7. */
  volume?: number;
  /** Fired near each beat: index within the bar (0-based) and whether it's still count-in. */
  onBeat?: (beatInBar: number, isCountIn: boolean) => void;
  /** Fired when the count-in finishes and recording should begin. */
  onGo?: () => void;
}

/**
 * Web Audio metronome with a lookahead scheduler (clicks are sample-accurate
 * even though JS timers aren't). Beat 1 of each bar is accented. Used for the
 * count-in before an exercise and the optional pulse while recording.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextBeatTime = 0;
  private beatCount = 0;
  private options: Required<Pick<MetronomeStartOptions, "bpm" | "beatsPerBar" | "countInBeats" | "sound" | "volume">> &
    MetronomeStartOptions = {
    bpm: 80,
    beatsPerBar: 4,
    countInBeats: 0,
    sound: "click",
    volume: 0.7,
  };

  get running(): boolean {
    return this.timer !== null;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private click(time: number, accented: boolean): void {
    const ctx = this.ctx!;
    const volume = this.options.volume;
    switch (this.options.sound) {
      case "wood":
        this.clickWood(ctx, time, accented, volume);
        return;
      case "beep":
        this.clickBeep(ctx, time, accented, volume);
        return;
      case "cowbell":
        this.clickCowbell(ctx, time, accented, volume);
        return;
      default:
        this.clickDefault(ctx, time, accented, volume);
    }
  }

  private clickDefault(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accented ? 1568 : 1047; // G6 / C6 — woodblock-ish
    const peak = (accented ? 0.24 : 0.14) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private clickWood(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const bufferSize = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = accented ? 1400 : 900;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    const peak = (accented ? 0.9 : 0.6) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  private clickBeep(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accented ? 1200 : 800;
    const peak = (accented ? 0.22 : 0.13) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  private clickCowbell(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const gain = ctx.createGain();
    const peak = (accented ? 0.2 : 0.12) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    gain.connect(ctx.destination);
    for (const freq of [800, 540]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.3);
    }
  }

  start(options: MetronomeStartOptions): void {
    this.stop();
    const ctx = this.ensureContext();
    this.options = { beatsPerBar: 4, countInBeats: 0, sound: "click", volume: 0.7, ...options };
    this.beatCount = 0;
    this.nextBeatTime = ctx.currentTime + 0.1;

    const secondsPerBeat = 60 / this.options.bpm;
    const lookaheadSeconds = 0.12;

    const schedule = () => {
      while (this.nextBeatTime < ctx.currentTime + lookaheadSeconds) {
        const beat = this.beatCount;
        const { beatsPerBar, countInBeats, onBeat, onGo } = this.options;
        const isCountIn = beat < countInBeats;
        const beatInBar = isCountIn ? beat % beatsPerBar : (beat - countInBeats) % beatsPerBar;
        this.click(this.nextBeatTime, beatInBar === 0);

        const delayMs = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
        window.setTimeout(() => {
          if (!this.running) return;
          if (beat === countInBeats) onGo?.(); // first beat after the count-in — recording starts on this downbeat
          onBeat?.(beatInBar, isCountIn);
        }, delayMs);

        this.nextBeatTime += secondsPerBeat;
        this.beatCount += 1;
      }
    };

    schedule();
    this.timer = window.setInterval(schedule, 25);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const metronome = new Metronome();
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS. (No unit test here — Web Audio scheduling isn't practically unit-testable without a real `AudioContext`; verified manually in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/utils/metronome.ts
git commit -m "feat(web): metronome selectable sounds (click/wood/beep/cowbell) + volume"
```

---

### Task 6: `MetronomeControls` component + Settings integration

**Files:**
- Create: `apps/web/src/components/midi/MetronomeControls.tsx`
- Modify: `apps/web/src/components/settings/SettingsPage.tsx` (add `MetronomeSection`, render it)

**Interfaces:**
- Consumes: `metronome`, `MetronomeSound` from Task 5's `metronome.ts`.
- Produces: `MetronomeSettings { sound: MetronomeSound; volume: number }`, `DEFAULT_METRONOME_SETTINGS`, `loadMetronomeSettings()`, `saveMetronomeSettings(settings)`, default export `MetronomeControls({ settings, onChange })` — all consumed by Task 7 (`MidiExercise`) and Task 4/Phase 2 tasks.

- [ ] **Step 1: Create `MetronomeControls.tsx`**

Create `apps/web/src/components/midi/MetronomeControls.tsx`:

```tsx
import { metronome, type MetronomeSound } from "../../utils/metronome";

export interface MetronomeSettings {
  sound: MetronomeSound;
  volume: number;
}

export const DEFAULT_METRONOME_SETTINGS: MetronomeSettings = { sound: "click", volume: 0.7 };
const METRONOME_SETTINGS_KEY = "ks-metronome-settings";
const SOUNDS: MetronomeSound[] = ["click", "wood", "beep", "cowbell"];
const SOUND_LABELS: Record<MetronomeSound, string> = {
  click: "Click",
  wood: "Wood block",
  beep: "Beep",
  cowbell: "Cowbell",
};

export function loadMetronomeSettings(): MetronomeSettings {
  try {
    const raw = localStorage.getItem(METRONOME_SETTINGS_KEY);
    if (!raw) return DEFAULT_METRONOME_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<MetronomeSettings>;
    return {
      sound: SOUNDS.includes(parsed.sound as MetronomeSound) ? (parsed.sound as MetronomeSound) : "click",
      volume: typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 0.7,
    };
  } catch {
    return DEFAULT_METRONOME_SETTINGS;
  }
}

export function saveMetronomeSettings(settings: MetronomeSettings): void {
  localStorage.setItem(METRONOME_SETTINGS_KEY, JSON.stringify(settings));
}

interface Props {
  settings: MetronomeSettings;
  onChange: (settings: MetronomeSettings) => void;
}

/** Sound picker + volume slider + a 4-click preview, reused in Settings (persisted default) and inline during exercises (session override). */
export default function MetronomeControls({ settings, onChange }: Props) {
  function preview() {
    metronome.start({
      bpm: 100,
      countInBeats: 4,
      sound: settings.sound,
      volume: settings.volume,
      onGo: () => metronome.stop(),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        Sound
        <select
          value={settings.sound}
          onChange={(e) => onChange({ ...settings, sound: e.target.value as MetronomeSound })}
          className="input py-1 text-xs"
        >
          {SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {SOUND_LABELS[sound]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        Volume
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) })}
        />
      </label>
      <button type="button" className="secondary-button px-2 py-1 text-xs" onClick={preview}>
        ▶ Preview
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add a `MetronomeSection` to Settings**

In `apps/web/src/components/settings/SettingsPage.tsx`, add the import alongside the existing ones (near the top):

```tsx
import MetronomeControls, {
  loadMetronomeSettings,
  saveMetronomeSettings,
  type MetronomeSettings,
} from "../midi/MetronomeControls";
```

Add a new `MetronomeSection` component, placed just above `function MidiSection()`:

```tsx
function MetronomeSection() {
  const [settings, setSettings] = useState<MetronomeSettings>(loadMetronomeSettings);

  function update(next: MetronomeSettings) {
    setSettings(next);
    saveMetronomeSettings(next);
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Metronome</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Default click sound and volume for lesson and Practice Gym exercises. Can still be changed per
          session from the exercise itself.
        </p>
      </div>
      <MetronomeControls settings={settings} onChange={update} />
    </section>
  );
}
```

Finally, render it in the default export:

```tsx
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>
      <AccountSection />
      <NarrationSection />
      <MetronomeSection />
      <MidiSection />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, log in, go to Settings.
Expected: a "Metronome" section appears between Narration and MIDI device, with a sound dropdown, a volume slider, and a "▶ Preview" button that audibly clicks 4 beats (accented first beat) in the selected sound; changing sound/volume and reloading the page keeps the choice (persisted to `localStorage`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/midi/MetronomeControls.tsx apps/web/src/components/settings/SettingsPage.tsx
git commit -m "feat(web): MetronomeControls component + Settings metronome defaults"
```

---

### Task 7: Wire `MetronomeControls` into `MidiExercise`

**Files:**
- Modify: `apps/web/src/components/midi/MidiExercise.tsx`

**Interfaces:**
- Consumes: `MetronomeControls`, `loadMetronomeSettings`, `saveMetronomeSettings`, `MetronomeSettings` from Task 6.

- [ ] **Step 1: Import and add state**

Add to the imports at the top of `MidiExercise.tsx`:

```tsx
import MetronomeControls, { loadMetronomeSettings, saveMetronomeSettings, type MetronomeSettings } from "./MetronomeControls";
```

In the component body, alongside the existing `useState`/`useRef` declarations, add:

```tsx
const [metronomeSettings, setMetronomeSettings] = useState<MetronomeSettings>(loadMetronomeSettings);
const metronomeSettingsRef = useRef(metronomeSettings);
metronomeSettingsRef.current = metronomeSettings;
```

- [ ] **Step 2: Pass sound/volume into the metronome scheduling calls**

In `begin()`, find:

```tsx
    setPhase("counting-in");
    metronome.start({
      bpm: exercise.tempoBpm,
      countInBeats: COUNT_IN_BEATS,
      onBeat: (index, isCountIn) => setBeat({ index, isCountIn }),
      onGo: () => {
        start.current = performance.now();
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
      },
    });
```

Replace with:

```tsx
    setPhase("counting-in");
    metronome.start({
      bpm: exercise.tempoBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
      onBeat: (index, isCountIn) => setBeat({ index, isCountIn }),
      onGo: () => {
        start.current = performance.now();
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
      },
    });
```

- [ ] **Step 3: Replace the plain checkbox with `MetronomeControls`**

Find:

```tsx
        {!untimed && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
            Metronome while playing
          </label>
        )}
```

Replace with:

```tsx
        {!untimed && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <MetronomeControls
              settings={metronomeSettings}
              onChange={(next) => {
                setMetronomeSettings(next);
                saveMetronomeSettings(next);
              }}
            />
          </div>
        )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, open a timed lesson exercise.
Expected: a sound/volume/preview control appears next to the "Metronome while playing" checkbox, defaulting to whatever was set in Settings (Task 6); switching to "Wood block" and starting the exercise plays wood-block count-in clicks instead of the default click.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/midi/MidiExercise.tsx
git commit -m "feat(web): wire MetronomeControls into MidiExercise count-in/recording"
```

---

## Phase 2 — Practice tempo percentage

### Task 8: Tempo-aware scoring in `midi-engine`

**Files:**
- Modify: `packages/midi-engine/src/scoring.ts:1,8,10`
- Modify: `packages/midi-engine/src/index.test.ts` (add tests)

**Interfaces:**
- Produces: `ScoreMidiExerciseParams.tempoPct?: 25 | 50 | 75 | 100` (default 100); `scoreMidiExercise` scales `msPerBeat` by `100/tempoPct`.

- [ ] **Step 1: Write the failing tests**

In `packages/midi-engine/src/index.test.ts`, add (near the end of the `describe("scoreMidiExercise", ...)` block or as a new top-level `describe`):

```ts
describe("scoreMidiExercise (tempoPct)", () => {
  it("scores perfectly when performed at half the authored tempo with tempoPct 50", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 1000), played(62, 1000, 1000)],
      tempoPct: 50,
    });
    expect(result.score).toBe(100);
  });

  it("penalizes the same performance as mistimed when scored at full tempo", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 1000), played(62, 1000, 1000)],
      tempoPct: 100,
    });
    expect(result.mistakes.some((m) => m.issue === "late")).toBe(true);
  });
});
```

(This file already imports `scoreMidiExercise` and defines the `event`/`exercise`/`played` factories used above — no new imports needed. `exercise()` sets `tempoBpm: 120`, i.e. 500ms/beat at full tempo; at 50% practice tempo that becomes 1000ms/beat, matching the performed timestamps exactly.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/midi-engine test`
Expected: FAIL — `Object literal may only specify known properties, and 'tempoPct' does not exist in type 'ScoreMidiExerciseParams'` (or, if TS doesn't block it, the first test fails because the 50%-tempo run is still scored as late).

- [ ] **Step 3: Implement the tempo-aware scaling**

In `packages/midi-engine/src/scoring.ts`, replace line 5:

```ts
export interface ScoreMidiExerciseParams { exercise: MidiExercise; performedNotes: PerformedNote[]; durationTolerancePercent?: number }
```

with:

```ts
export interface ScoreMidiExerciseParams { exercise: MidiExercise; performedNotes: PerformedNote[]; durationTolerancePercent?: number; tempoPct?: 25 | 50 | 75 | 100 }
```

Replace line 8:

```ts
export function scoreMidiExercise({ exercise, performedNotes, durationTolerancePercent }: ScoreMidiExerciseParams): ScoringResult {
```

with:

```ts
export function scoreMidiExercise({ exercise, performedNotes, durationTolerancePercent, tempoPct = 100 }: ScoreMidiExerciseParams): ScoringResult {
```

Replace line 10:

```ts
  const msPerBeat = 60_000 / exercise.tempoBpm;
```

with:

```ts
  const msPerBeat = (60_000 / exercise.tempoBpm) * (100 / tempoPct);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/midi-engine test`
Expected: PASS, including every pre-existing `scoreMidiExercise` test (they call it without `tempoPct`, which defaults to 100 — identical to today's formula).

- [ ] **Step 5: Commit**

```bash
git add packages/midi-engine/src/scoring.ts packages/midi-engine/src/index.test.ts
git commit -m "feat(midi-engine): tempoPct-aware scoring for practice-tempo runs"
```

---

### Task 9: Thread `tempoPct` through the API

**Files:**
- Modify: `apps/api/src/app.ts:61-77` (schemas), `:384` and `:642` (`scoreMidiExercise` calls), `:631-637` (`/practice/score` inline schema)

**Interfaces:**
- Consumes: `ScoreMidiExerciseParams.tempoPct` from Task 8.

- [ ] **Step 1: Add a shared `tempoPctSchema` and thread it through `performanceSchema`**

Find:

```ts
const performanceSchema = z
  .object({
    rawEvents: z.array(rawEventSchema).optional(),
    performedNotes: z.array(performedSchema).optional(),
  })
  .refine(
    (value) => (value.rawEvents === undefined) !== (value.performedNotes === undefined),
    "Supply exactly one of rawEvents or performedNotes",
  );
```

Replace with:

```ts
const tempoPctSchema = z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]);

const performanceSchema = z
  .object({
    rawEvents: z.array(rawEventSchema).optional(),
    performedNotes: z.array(performedSchema).optional(),
    tempoPct: tempoPctSchema.optional(),
  })
  .refine(
    (value) => (value.rawEvents === undefined) !== (value.performedNotes === undefined),
    "Supply exactly one of rawEvents or performedNotes",
  );
```

- [ ] **Step 2: Pass `tempoPct` into the `/exercises/:id/attempts` scoring call**

Find (inside the `app.post("/exercises/:id/attempts", ...)` handler):

```ts
    const result = scoreMidiExercise({ exercise, performedNotes });
```

Replace with:

```ts
    const result = scoreMidiExercise({ exercise, performedNotes, tempoPct: input.tempoPct });
```

- [ ] **Step 3: Add `tempoPct` to the `/practice/score` inline schema (zod strips unrecognized keys, so this is required in addition to Step 1)**

Find:

```ts
    const body = z
      .object({
        exercise: z.unknown(),
        rawEvents: z.array(rawEventSchema).optional(),
        performedNotes: z.array(performedSchema).optional(),
      })
      .parse(req.body);
```

Replace with:

```ts
    const body = z
      .object({
        exercise: z.unknown(),
        rawEvents: z.array(rawEventSchema).optional(),
        performedNotes: z.array(performedSchema).optional(),
        tempoPct: tempoPctSchema.optional(),
      })
      .parse(req.body);
```

- [ ] **Step 4: Pass `tempoPct` into the `/practice/score` scoring call**

Find:

```ts
    res.json(scoreMidiExercise({ exercise, performedNotes }));
```

Replace with:

```ts
    res.json(scoreMidiExercise({ exercise, performedNotes, tempoPct: performance.tempoPct }));
```

- [ ] **Step 5: Typecheck and run API tests**

Run: `pnpm --filter @keyboard-sensei/api typecheck && pnpm --filter @keyboard-sensei/api test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts
git commit -m "feat(api): thread tempoPct through exercise and practice scoring endpoints"
```

---

### Task 10: Practice tempo % selector in `MidiExercise`

**Files:**
- Modify: `apps/web/src/components/midi/MidiExercise.tsx`

**Interfaces:**
- Produces: `tempoPct` state (25/50/75/100, default 100) used by Task 12 (`effectiveBpm`), included in the submit payload.

- [ ] **Step 1: Add tempo state and `effectiveBpm`**

Alongside the other `useState` declarations in the component, add:

```tsx
const [tempoPct, setTempoPct] = useState<25 | 50 | 75 | 100>(100);
const effectiveBpm = exercise.tempoBpm * (tempoPct / 100);
```

(`exercise` is guaranteed non-null at this point in the function body — this line sits after the `if (!exercise) { return ...; }` early return, same as the existing `untimed`/`msPerBeat` lines just above it.)

- [ ] **Step 2: Use `effectiveBpm` for the count-in/recording metronome, not `listen()`**

In `begin()`, find (already modified once in Task 7 — apply this on top of that):

```tsx
    metronome.start({
      bpm: exercise.tempoBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
```

Replace the `bpm` line with:

```tsx
    metronome.start({
      bpm: effectiveBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
```

`listen()` (the "▶ Listen" preview) keeps using the exercise's `msPerBeat` (i.e. `exercise.tempoBpm`) unchanged — it demonstrates the target performance at full tempo regardless of the practice tempo chosen for the learner's own attempt.

- [ ] **Step 3: Include `tempoPct` in the submit payload**

Find:

```tsx
      const performedNotes = pairRawMidiEvents(raw.current);
      const scored = lessonId
        ? await submitExercise(exerciseId, { performedNotes })
        : await submitPractice(exercise, { performedNotes });
```

Replace with:

```tsx
      const performedNotes = pairRawMidiEvents(raw.current);
      const scored = lessonId
        ? await submitExercise(exerciseId, { performedNotes, tempoPct })
        : await submitPractice(exercise, { performedNotes, tempoPct });
```

- [ ] **Step 4: Add the tempo % selector UI**

In the controls row (same row as the metronome controls added in Task 7), find:

```tsx
        {!untimed && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <MetronomeControls
              settings={metronomeSettings}
              onChange={(next) => {
                setMetronomeSettings(next);
                saveMetronomeSettings(next);
              }}
            />
          </div>
        )}
```

Replace with:

```tsx
        {!untimed && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Practice tempo">
              <span className="mr-1 text-xs text-slate-500">Tempo</span>
              {([25, 50, 75, 100] as const).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  role="radio"
                  aria-checked={tempoPct === pct}
                  disabled={capturing || phase === "counting-in"}
                  onClick={() => setTempoPct(pct)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors ${
                    tempoPct === pct
                      ? "bg-felt-600 font-medium text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  } disabled:opacity-50`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <MetronomeControls
              settings={metronomeSettings}
              onChange={(next) => {
                setMetronomeSettings(next);
                saveMetronomeSettings(next);
              }}
            />
          </div>
        )}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, open a timed lesson exercise, select "50%" tempo, start the exercise.
Expected: the count-in clicks noticeably slower; playing the correct notes at that slower pace (matched to the visibly slower count-in) still scores well (timing/rhythm not penalized) after submitting — confirms Task 8/9's server-side scaling is actually being used.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/midi/MidiExercise.tsx
git commit -m "feat(web): practice tempo % selector for lesson/gym exercises"
```

---

## Phase 3 — Live-follow highlight + scoring overlay

### Task 11: Extract shared `judgeNextPress` helper

**Files:**
- Modify: `packages/midi-engine/src/playalong.ts` (add `judgeNextPress`, near the existing `judgmentFor`/`JUDGE_WINDOWS_S`)
- Modify: `packages/midi-engine/src/playalong.test.ts` (add tests)
- Modify: `apps/web/src/utils/playalongEngine.ts` (`pressKey` calls the new helper instead of inlining the match)

**Interfaces:**
- Produces: `NextPressMatch { index: number; judgment: PlayAlongJudgment }`, `judgeNextPress(notes: PlayAlongNote[], judgments: readonly (PlayAlongJudgment | undefined)[], midi: number, songTimeS: number): NextPressMatch | null` — consumed by Task 12 (`MidiExercise`'s live overlay) and by the refactored `PlayAlongEngine.pressKey`.

- [ ] **Step 1: Write the failing tests**

In `packages/midi-engine/src/playalong.test.ts`, add the import (extend the existing `import { ... } from "./playalong.js";` line) with `judgeNextPress`, then add:

```ts
describe("judgeNextPress", () => {
  it("matches the nearest unjudged same-pitch note within the ok window", () => {
    const notes = [note(60, 1), note(60, 1.3)];
    const match = judgeNextPress(notes, [undefined, undefined], 60, 1.22);
    expect(match).toEqual({ index: 1, judgment: "good" });
  });

  it("returns null when no unjudged note of that pitch is within the ok window", () => {
    const notes = [note(60, 1)];
    const match = judgeNextPress(notes, [undefined], 60, 2);
    expect(match).toBeNull();
  });

  it("skips notes that are already judged", () => {
    const notes = [note(60, 1), note(60, 2)];
    const match = judgeNextPress(notes, ["perfect", undefined], 60, 2.01);
    expect(match).toEqual({ index: 1, judgment: "perfect" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/midi-engine test`
Expected: FAIL — `judgeNextPress is not a function` / `does not exist`.

- [ ] **Step 3: Implement `judgeNextPress`**

In `packages/midi-engine/src/playalong.ts`, immediately after the existing `judgmentFor` function (right before `/** Match notes ... */` / `export function judgePlayAlong`), add:

```ts
export interface NextPressMatch {
  index: number;
  judgment: PlayAlongJudgment;
}

/**
 * Finds the nearest unjudged same-pitch note for an incoming press, inside
 * the ok window. Shared by PlayAlongEngine's live judging (falling notes)
 * and the lesson/gym live-follow overlay, so both features use one tested
 * definition of "was this press a hit."
 */
export function judgeNextPress(
  notes: PlayAlongNote[],
  judgments: readonly (PlayAlongJudgment | undefined)[],
  midi: number,
  songTimeS: number,
): NextPressMatch | null {
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < notes.length; i++) {
    if (judgments[i] !== undefined || notes[i].midi !== midi) continue;
    const delta = Math.abs(songTimeS - notes[i].startS);
    if (delta <= JUDGE_WINDOWS_S.ok && delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  if (best === -1) return null;
  const judgment: PlayAlongJudgment =
    bestDelta <= JUDGE_WINDOWS_S.perfect ? "perfect" : bestDelta <= JUDGE_WINDOWS_S.good ? "good" : "ok";
  return { index: best, judgment };
}
```

- [ ] **Step 4: Refactor `PlayAlongEngine.pressKey` to call it (behavior-preserving)**

In `apps/web/src/utils/playalongEngine.ts`, add `judgeNextPress` to the existing `@keyboard-sensei/midi-engine` import:

```ts
import {
  JUDGE_WINDOWS_S,
  judgeNextPress,
  judgePlayAlong,
  type PlayAlongJudgment,
  type PlayAlongNote,
  type PlayAlongPress,
  type PlayAlongResult,
  type PlayAlongTempoPct,
} from "@keyboard-sensei/midi-engine";
```

Find, inside `pressKey`:

```ts
    this.presses.push({ midi, songTimeS: songTimeAtPress });

    // Live judgment: nearest unjudged same-pitch note within the ok window.
    let best = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < notes.length; i++) {
      if (this.judgments[i] !== undefined || notes[i].midi !== midi) continue;
      const delta = Math.abs(songTimeAtPress - notes[i].startS);
      if (delta <= JUDGE_WINDOWS_S.ok && delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    }
    if (best === -1) {
      this.stats = { ...this.stats, wrongPressCount: this.stats.wrongPressCount + 1 };
      this.combo = 0;
      this.stats.combo = 0;
      return;
    }
    const judgment: PlayAlongJudgment =
      bestDelta <= JUDGE_WINDOWS_S.perfect ? "perfect" : bestDelta <= JUDGE_WINDOWS_S.good ? "good" : "ok";
    this.recordJudgment(best, judgment);
```

Replace with:

```ts
    this.presses.push({ midi, songTimeS: songTimeAtPress });

    const match = judgeNextPress(notes, this.judgments, midi, songTimeAtPress);
    if (!match) {
      this.stats = { ...this.stats, wrongPressCount: this.stats.wrongPressCount + 1 };
      this.combo = 0;
      this.stats.combo = 0;
      return;
    }
    this.recordJudgment(match.index, match.judgment);
```

(`JUDGE_WINDOWS_S` may now be unused in this file if nothing else references it — check with a search; if so, remove it from the import list to keep the build clean.)

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @keyboard-sensei/midi-engine test && pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS — the 3 new `judgeNextPress` tests pass, and all existing `playalong.test.ts`/`playalongSong.test.ts` tests still pass unchanged (this refactor is behavior-preserving).

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, open `/play`, start any song in normal (non-wait) mode, play a few correct and a few wrong notes.
Expected: live HUD (score/accuracy/combo) behaves exactly as before the refactor — hits register as perfect/good/ok, wrong presses increment the wrong-press count. This confirms the extraction didn't change Play-Along's behavior.

- [ ] **Step 7: Commit**

```bash
git add packages/midi-engine/src/playalong.ts packages/midi-engine/src/playalong.test.ts apps/web/src/utils/playalongEngine.ts
git commit -m "refactor(midi-engine): extract judgeNextPress, shared by PlayAlongEngine and the new lesson live-follow overlay"
```

---

### Task 12: Live-follow highlight + scoring overlay in `MidiExercise`

**Files:**
- Modify: `apps/web/src/components/midi/MidiExercise.tsx`

**Interfaces:**
- Consumes: `judgeNextPress`, `JUDGE_WINDOWS_S`, `type PlayAlongJudgment`, `type PlayAlongNote` from `@keyboard-sensei/midi-engine`; `activeNoteIds` prop on `NotationRenderer` (Task 3); `effectiveBpm` (Task 10).
- Produces: this is the final consumer in this plan — no other task depends on it.

- [ ] **Step 1: Import the new midi-engine exports**

Find:

```tsx
import { pairRawMidiEvents } from "@keyboard-sensei/midi-engine";
```

Replace with:

```tsx
import { JUDGE_WINDOWS_S, judgeNextPress, pairRawMidiEvents, type PlayAlongJudgment, type PlayAlongNote } from "@keyboard-sensei/midi-engine";
```

- [ ] **Step 2: Add live-follow constants and the `LiveNote`/`liveNotesFor` helper**

Near the top of the file, just above the `notationFor` function, add:

```tsx
const LIVE_POINTS: Record<PlayAlongJudgment, number> = { perfect: 10, good: 7, ok: 4, miss: -3 };
const WRONG_PRESS_PENALTY = 2;

interface LiveNote extends PlayAlongNote {
  id: string;
}

/** Converts an exercise's beat-based expected notes into song-second-based notes for the live-follow overlay, using whatever tempo is actually being practiced at. */
function liveNotesFor(exercise: MidiExerciseDef, effectiveBpm: number): LiveNote[] {
  const msPerBeat = 60_000 / effectiveBpm;
  const firstBeat = Math.min(...exercise.expected.map((n) => n.startBeat));
  return exercise.expected.map((event) => ({
    id: event.id,
    midi: event.note,
    startS: ((event.startBeat - firstBeat) * msPerBeat) / 1000,
    durationS: (event.durationBeats * msPerBeat) / 1000,
    hand: "right",
  }));
}
```

- [ ] **Step 3: Add live-follow state and refs**

Alongside the other `useState`/`useRef` declarations in the component body, add:

```tsx
const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(new Set());
const [liveScore, setLiveScore] = useState(0);
const [liveCombo, setLiveCombo] = useState(0);
const [lastDelta, setLastDelta] = useState<{ value: number; key: number } | null>(null);

const liveNotesRef = useRef<LiveNote[]>([]);
const liveJudgmentsRef = useRef<(PlayAlongJudgment | undefined)[]>([]);
const liveMissCursorRef = useRef(0);
const liveRafRef = useRef(0);
const activeNoteIdsRef = useRef<string>("");
const lastDeltaTimeoutRef = useRef<number | null>(null);
```

- [ ] **Step 4: Add `flashLiveDelta`, `startLiveFollow`, `stopLiveFollow`**

Just above `const begin = () => {`, add:

```tsx
  function flashLiveDelta(value: number) {
    setLastDelta({ value, key: Date.now() });
    if (lastDeltaTimeoutRef.current !== null) window.clearTimeout(lastDeltaTimeoutRef.current);
    lastDeltaTimeoutRef.current = window.setTimeout(() => setLastDelta(null), 700);
  }

  function stopLiveFollow() {
    cancelAnimationFrame(liveRafRef.current);
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());
  }

  function startLiveFollow() {
    liveNotesRef.current = liveNotesFor(exercise, effectiveBpm);
    liveJudgmentsRef.current = new Array<PlayAlongJudgment | undefined>(liveNotesRef.current.length).fill(undefined);
    liveMissCursorRef.current = 0;
    setLiveScore(0);
    setLiveCombo(0);
    setLastDelta(null);
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());

    const tick = () => {
      if (!active.current) return;
      const songTimeS = (performance.now() - start.current) / 1000;
      const notes = liveNotesRef.current;
      const judgments = liveJudgmentsRef.current;

      while (liveMissCursorRef.current < notes.length) {
        const note = notes[liveMissCursorRef.current];
        if (note.startS + JUDGE_WINDOWS_S.ok > songTimeS) break;
        if (judgments[liveMissCursorRef.current] === undefined) {
          judgments[liveMissCursorRef.current] = "miss";
          setLiveCombo(0);
          setLiveScore((s) => s + LIVE_POINTS.miss);
          flashLiveDelta(LIVE_POINTS.miss);
        }
        liveMissCursorRef.current += 1;
      }

      const due = notes
        .map((note, index) => ({ note, index }))
        .filter(
          ({ note, index }) =>
            judgments[index] === undefined && note.startS <= songTimeS && songTimeS < note.startS + note.durationS,
        )
        .map(({ note }) => note.id)
        .join(",");
      if (due !== activeNoteIdsRef.current) {
        activeNoteIdsRef.current = due;
        setActiveNoteIds(new Set(due ? due.split(",") : []));
      }

      liveRafRef.current = requestAnimationFrame(tick);
    };
    liveRafRef.current = requestAnimationFrame(tick);
  }

```

- [ ] **Step 5: Start/stop the overlay alongside recording**

In `begin()`, find (already modified in Tasks 7/10):

```tsx
      onGo: () => {
        start.current = performance.now();
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
      },
```

Replace with:

```tsx
      onGo: () => {
        start.current = performance.now();
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
        startLiveFollow();
      },
```

In `cancel()`, find:

```tsx
  const cancel = () => {
    metronome.stop();
    active.current = false;
    setBeat(null);
    setPhase("idle");
  };
```

Replace with:

```tsx
  const cancel = () => {
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    setPhase("idle");
  };
```

In `submit()`, find:

```tsx
  const submit = async () => {
    metronome.stop();
    active.current = false;
    setBeat(null);
    setPhase("submitting");
```

Replace with:

```tsx
  const submit = async () => {
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    setPhase("submitting");
```

- [ ] **Step 6: Judge each incoming press live during recording**

Find the raw-event subscription effect:

```tsx
  useEffect(
    () =>
      subscribe((event) => {
        if (!active.current) return;
        raw.current.push({ ...event, timestampMs: event.timestampMs - start.current });
        if (event.type === "noteon") setPlayed(true);
      }),
    [subscribe],
  );
```

Replace with:

```tsx
  useEffect(
    () =>
      subscribe((event) => {
        if (!active.current) return;
        raw.current.push({ ...event, timestampMs: event.timestampMs - start.current });
        if (event.type !== "noteon") return;
        setPlayed(true);
        if (exercise?.scoring === "untimed") return;
        const songTimeS = (event.timestampMs - start.current) / 1000;
        const match = judgeNextPress(liveNotesRef.current, liveJudgmentsRef.current, event.note, songTimeS);
        if (match) {
          liveJudgmentsRef.current[match.index] = match.judgment;
          setLiveCombo((c) => (match.judgment === "perfect" || match.judgment === "good" ? c + 1 : 0));
          setLiveScore((s) => s + LIVE_POINTS[match.judgment]);
          flashLiveDelta(LIVE_POINTS[match.judgment]);
        } else {
          setLiveCombo(0);
          setLiveScore((s) => s - WRONG_PRESS_PENALTY);
          flashLiveDelta(-WRONG_PRESS_PENALTY);
        }
      }),
    [subscribe, exercise],
  );
```

- [ ] **Step 7: Highlight the due note(s) on the piano and notation, and add the live HUD**

Add a derived list of currently-due MIDI numbers, just above the component's `return (`:

```tsx
  const liveDueMidis = useMemo(
    () => liveNotesRef.current.filter((n) => activeNoteIds.has(n.id)).map((n) => n.midi),
    [activeNoteIds],
  );
```

Find:

```tsx
      {notation && <NotationRenderer data={notation} title="Read and play" />}
```

Replace with:

```tsx
      {notation && <NotationRenderer data={notation} title="Read and play" activeNoteIds={capturing ? activeNoteIds : undefined} />}
```

Find:

```tsx
      <VirtualPiano
        lowestNote={lowestNote}
        highestNote={highestNote}
        expectedNotes={phase !== "scored" ? notes : []}
        feedbackByNote={feedback}
      />
```

Replace with:

```tsx
      <VirtualPiano
        lowestNote={lowestNote}
        highestNote={highestNote}
        expectedNotes={capturing && !untimed ? liveDueMidis : phase !== "scored" ? notes : []}
        feedbackByNote={feedback}
      />
```

Find:

```tsx
            <span className="text-sm text-slate-600 dark:text-slate-300" role="status">
              {phase === "counting-in" ? `Count-in… ${beat ? beat.index + 1 : ""}` : "Recording — play, then submit."}
            </span>
```

Replace with:

```tsx
            <span className="text-sm text-slate-600 dark:text-slate-300" role="status">
              {phase === "counting-in" ? `Count-in… ${beat ? beat.index + 1 : ""}` : "Recording — play, then submit."}
            </span>
            {capturing && !untimed && (
              <div className="flex items-center gap-3 text-xs">
                <span className="tabular-nums">
                  <span className="text-slate-500">Live </span>
                  <strong className={liveScore >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}>
                    {liveScore}
                  </strong>
                </span>
                {liveCombo >= 3 && (
                  <span className="tabular-nums text-felt-600 dark:text-felt-400">combo ×{liveCombo}</span>
                )}
                {lastDelta && (
                  <span
                    key={lastDelta.key}
                    className={lastDelta.value >= 0 ? "text-brass-600 dark:text-brass-400" : "text-rose-600 dark:text-rose-400"}
                  >
                    {lastDelta.value >= 0 ? `+${lastDelta.value}` : lastDelta.value}
                  </span>
                )}
              </div>
            )}
```

- [ ] **Step 8: Clean up the live loop on unmount**

Find the existing unmount-cleanup effect:

```tsx
  // Cancel any sound/clicks when the exercise unmounts.
  useEffect(
    () => () => {
      stopPreview();
      metronome.stop();
    },
    [],
  );
```

Replace with:

```tsx
  // Cancel any sound/clicks/live-follow loop when the exercise unmounts.
  useEffect(
    () => () => {
      stopPreview();
      metronome.stop();
      cancelAnimationFrame(liveRafRef.current);
    },
    [],
  );
```

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 10: Manual verification**

Run: `pnpm dev`, open a timed lesson exercise, start it, and play along.
Expected: as each expected note becomes due, its notehead tints on the notation and the corresponding key highlights on the virtual piano; playing it promptly shows a "+10"/"+7"/"+4" flash and increments the "Live" counter; deliberately missing a note (letting its window pass) shows a "−3" flash; the "Live" HUD disappears once you submit, and the final result panel (score/pass-fail) is unchanged from before this task — confirming the overlay is purely supplementary.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/midi/MidiExercise.tsx
git commit -m "feat(web): live-follow highlight + supplementary scoring overlay for lesson/gym exercises"
```

---

## Phase 4 — Play-Along notation preview strip

### Task 13: Extract tempo/time-signature from the MIDI header

**Files:**
- Modify: `apps/web/src/utils/playalongSong.ts`
- Modify: `apps/web/src/utils/playalongSong.test.ts` (add a test)

**Interfaces:**
- Produces: `ParsedPlayAlongSong.bpm: number`, `ParsedPlayAlongSong.beatsPerBar: number` — consumed by Task 14/15.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/utils/playalongSong.test.ts`, add:

```ts
  it("extracts tempo and time signature from the MIDI header, defaulting when absent", () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBe(90);
    expect(song.beatsPerBar).toBe(3);
  });

  it("defaults bpm and beatsPerBar when the header has none", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBeGreaterThan(0);
    expect(song.beatsPerBar).toBe(4);
  });
```

(Add these inside the existing `describe("parsePlayAlongSong", ...)` block.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/web test -- playalongSong`
Expected: FAIL — `song.bpm`/`song.beatsPerBar` are `undefined`.

- [ ] **Step 3: Implement the extraction**

In `apps/web/src/utils/playalongSong.ts`, replace:

```ts
export interface ParsedPlayAlongSong {
  notes: PlayAlongNote[];
  durationS: number;
  pitchMin: number;
  pitchMax: number;
}
```

with:

```ts
export interface ParsedPlayAlongSong {
  notes: PlayAlongNote[];
  durationS: number;
  pitchMin: number;
  pitchMax: number;
  /** Detected tempo (first tempo event), for the notation preview strip's display-only quantization. Never used for scoring. */
  bpm: number;
  /** Detected time signature numerator (first time-signature event), default 4. Display-only, same as bpm. */
  beatsPerBar: number;
}
```

Replace the function's final section:

```ts
  if (notes.length === 0) throw new Error("No playable piano notes in this MIDI file");

  let pitchMin = PIANO_MAX;
  let pitchMax = PIANO_MIN;
  for (const note of notes) {
    pitchMin = Math.min(pitchMin, note.midi);
    pitchMax = Math.max(pitchMax, note.midi);
  }

  return { notes, durationS: midi.duration, pitchMin, pitchMax };
}
```

with:

```ts
  if (notes.length === 0) throw new Error("No playable piano notes in this MIDI file");

  let pitchMin = PIANO_MAX;
  let pitchMax = PIANO_MIN;
  for (const note of notes) {
    pitchMin = Math.min(pitchMin, note.midi);
    pitchMax = Math.max(pitchMax, note.midi);
  }

  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const beatsPerBar = midi.header.timeSignatures[0]?.timeSignature[0] ?? 4;

  return { notes, durationS: midi.duration, pitchMin, pitchMax, bpm, beatsPerBar };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/web test -- playalongSong`
Expected: PASS, all tests (existing 3 + new 2).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/playalongSong.ts apps/web/src/utils/playalongSong.test.ts
git commit -m "feat(web): extract bpm/beatsPerBar from the MIDI header for the notation preview strip"
```

---

### Task 14: `NotationPreviewStrip` component + quantization

**Files:**
- Create: `apps/web/src/components/play/NotationPreviewStrip.tsx`
- Create: `apps/web/src/components/play/NotationPreviewStrip.test.ts`

**Interfaces:**
- Consumes: `groupIntoMeasures`, `midiToVexKey`, `BeatEvent` (Task 2); `NotationRenderer`'s `activeNoteIds` prop (Task 3); `ParsedPlayAlongSong.bpm`/`beatsPerBar` (Task 13).
- Produces: `QuantizedSongNote { id: string; midi: number; hand: "left" | "right"; startBeat: number; durationBeats: number }`, `quantizeToBeats(notes: PlayAlongNote[], bpm: number): QuantizedSongNote[]`, default export `NotationPreviewStrip({ notes, beatsPerBar, songTimeS, bpm })` — consumed by Task 15 (`PlayAlongPage`).

- [ ] **Step 1: Write the failing test for `quantizeToBeats`**

Create `apps/web/src/components/play/NotationPreviewStrip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { quantizeToBeats } from "./NotationPreviewStrip";

const note = (midi: number, startS: number, durationS: number, hand: "left" | "right" = "right"): PlayAlongNote => ({
  midi,
  startS,
  durationS,
  hand,
});

describe("quantizeToBeats", () => {
  it("snaps note starts/durations to the nearest sixteenth note at the given tempo", () => {
    // 120bpm → 0.5s/beat → 0.125s/sixteenth.
    const notes = [note(60, 0.51, 0.49), note(62, 1.0, 0.24)];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized[0]).toEqual({ id: "0", midi: 60, hand: "right", startBeat: 1, durationBeats: 1 });
    expect(quantized[1]).toEqual({ id: "1", midi: 62, hand: "right", startBeat: 2, durationBeats: 0.5 });
  });

  it("floors very short durations to a sixteenth note so nothing disappears", () => {
    const notes = [note(60, 0, 0.02)];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized[0].durationBeats).toBe(0.25);
  });

  it("preserves hand assignment and assigns stable index-based ids", () => {
    const notes = [note(48, 0, 0.5, "left"), note(72, 0, 0.5, "right")];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized.map((n) => n.id)).toEqual(["0", "1"]);
    expect(quantized.map((n) => n.hand)).toEqual(["left", "right"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/web test -- NotationPreviewStrip`
Expected: FAIL — `Cannot find module './NotationPreviewStrip'`.

- [ ] **Step 3: Implement the component and `quantizeToBeats`**

Create `apps/web/src/components/play/NotationPreviewStrip.tsx`:

```tsx
import { useMemo } from "react";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import NotationRenderer from "../notation/NotationRenderer";
import { groupIntoMeasures, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";

export interface QuantizedSongNote {
  id: string;
  midi: number;
  hand: "left" | "right";
  startBeat: number;
  durationBeats: number;
}

const SIXTEENTHS_PER_BEAT = 4;

/**
 * Quantizes real (unquantized, human-performed) note times to the nearest
 * sixteenth note at the given tempo, for DISPLAY ONLY — the falling-notes
 * waterfall and its scoring keep using the exact original startS/durationS;
 * this is purely a readability aid for the notation preview strip above it.
 */
export function quantizeToBeats(notes: PlayAlongNote[], bpm: number): QuantizedSongNote[] {
  const secondsPerSixteenth = 60 / bpm / SIXTEENTHS_PER_BEAT;
  return notes.map((note, i) => ({
    id: `${i}`,
    midi: note.midi,
    hand: note.hand,
    startBeat: Math.round(note.startS / secondsPerSixteenth) / SIXTEENTHS_PER_BEAT,
    durationBeats: Math.max(0.25, Math.round(note.durationS / secondsPerSixteenth) / SIXTEENTHS_PER_BEAT),
  }));
}

interface Props {
  notes: QuantizedSongNote[];
  beatsPerBar: number;
  songTimeS: number;
  bpm: number;
}

const WINDOW_MEASURES = 2;

/** Rolling 1-2 measure grand-staff preview above the Play-Along waterfall — deliberately a small sliding window rather than full-piece transcription (see design spec §5). */
export default function NotationPreviewStrip({ notes, beatsPerBar, songTimeS, bpm }: Props) {
  const secondsPerBeat = 60 / bpm;
  const currentBeat = Math.max(0, songTimeS / secondsPerBeat);
  const windowStart = Math.floor(currentBeat / beatsPerBar) * beatsPerBar;
  const windowBeats = beatsPerBar * WINDOW_MEASURES;

  const { data, activeNoteIds } = useMemo(() => {
    const windowed = notes.filter((n) => n.startBeat >= windowStart && n.startBeat < windowStart + windowBeats);
    const toBeatEvents = (hand: "left" | "right"): BeatEvent[] =>
      windowed
        .filter((n) => n.hand === hand)
        .map((n) => ({
          ids: [n.id],
          keys: [midiToVexKey(n.midi)],
          startBeat: n.startBeat - windowStart,
          durationBeats: n.durationBeats,
        }));

    const active = new Set(
      notes.filter((n) => n.startBeat <= currentBeat && currentBeat < n.startBeat + n.durationBeats).map((n) => n.id),
    );

    return {
      data: {
        grandStaff: true,
        treble: { clef: "treble", measures: groupIntoMeasures(toBeatEvents("right"), beatsPerBar).map((noteList) => ({ notes: noteList })) },
        bass: { clef: "bass", measures: groupIntoMeasures(toBeatEvents("left"), beatsPerBar).map((noteList) => ({ notes: noteList })) },
      },
      activeNoteIds: active,
    };
    // Recompute only when the current sixteenth-note slot changes, not every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, windowStart, windowBeats, beatsPerBar, Math.floor(currentBeat * 4)]);

  return (
    <div className="mb-2 max-h-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/40">
      <NotationRenderer data={data} activeNoteIds={activeNoteIds} />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/web test -- NotationPreviewStrip`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/play/NotationPreviewStrip.tsx apps/web/src/components/play/NotationPreviewStrip.test.ts
git commit -m "feat(web): NotationPreviewStrip — rolling quantized grand-staff preview for Play-Along"
```

---

### Task 15: Integrate the strip into `PlayAlongPage`

**Files:**
- Modify: `apps/web/src/components/play/PlayAlongPage.tsx`

**Interfaces:**
- Consumes: `quantizeToBeats`, `NotationPreviewStrip` (Task 14); `parsed.bpm`/`parsed.beatsPerBar` (Task 13).

- [ ] **Step 1: Import the strip and its quantization function**

Find:

```tsx
import {
  drawWaterfall,
  keyboardGeometry,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
```

Replace with:

```tsx
import {
  drawWaterfall,
  keyboardGeometry,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
import NotationPreviewStrip, { quantizeToBeats } from "./NotationPreviewStrip";
```

- [ ] **Step 2: Compute quantized notes and track `songTimeS`**

Alongside the other `useState` declarations, add:

```tsx
const [songTimeS, setSongTimeS] = useState(0);
```

Alongside the other `useMemo` declarations (near `const range = useMemo(...)`), add:

```tsx
const quantizedNotes = useMemo(() => (parsed ? quantizeToBeats(parsed.notes, parsed.bpm) : []), [parsed]);
```

- [ ] **Step 3: Feed `songTimeS` from the existing throttled HUD update**

Find, inside the `loop` function within `start()`:

```tsx
      if (frameMs - lastHudUpdate > 120) {
        lastHudUpdate = frameMs;
        setStats(active.liveStats);
        setCountdown(songTime < 0 ? Math.ceil(-songTime) : null);
        setWaiting(active.isWaiting);
        setWaitingNotes(active.isWaiting ? active.waitingMidis : []);
      }
```

Replace with:

```tsx
      if (frameMs - lastHudUpdate > 120) {
        lastHudUpdate = frameMs;
        setStats(active.liveStats);
        setCountdown(songTime < 0 ? Math.ceil(-songTime) : null);
        setWaiting(active.isWaiting);
        setWaitingNotes(active.isWaiting ? active.waitingMidis : []);
        setSongTimeS(songTime);
      }
```

- [ ] **Step 4: Render the strip above the waterfall canvas**

Find:

```tsx
      {/* Waterfall + piano, sharing one horizontal scroll context */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          <div className="relative">
```

Replace with:

```tsx
      <NotationPreviewStrip notes={quantizedNotes} beatsPerBar={parsed.beatsPerBar} songTimeS={Math.max(0, songTimeS)} bpm={parsed.bpm} />

      {/* Waterfall + piano, sharing one horizontal scroll context */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          <div className="relative">
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, open `/play`, pick any library song, and press Start.
Expected: a two-staff notation preview appears above the falling-notes canvas, showing roughly the next 1-2 measures; as the song plays, notes tint on the preview strip right as they become due, staying in sync with the corresponding falling note reaching the hit line below. Confirm it doesn't affect scoring (final result screen and saved attempt are unchanged from before this task).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/play/PlayAlongPage.tsx
git commit -m "feat(web): integrate NotationPreviewStrip above the Play-Along waterfall"
```

---

## Self-Review

**Spec coverage:**
- §1 data model → Task 1.
- §2 notation (bars/rests, multi-row, time-sig chip) → Tasks 2, 3, 4.
- §3 metronome (sounds/volume/Settings, practice tempo) → Tasks 5, 6, 7, 10 (with 8/9 for the scoring side of tempo).
- §4 live-follow overlay → Tasks 11, 12.
- §5 Play-Along notation strip → Tasks 13, 14, 15.
- §6 testing → unit tests included in Tasks 2, 8, 11, 13, 14; manual verification steps included in every UI-facing task.

**Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code or an exact command with expected output.

**Type consistency:** `BeatEvent`/`NoteData` (Task 2) are used identically by `MidiExercise.notationFor` (Task 4) and `NotationPreviewStrip` (Task 14); `activeNoteIds: Set<string>` (Task 3) is produced by both the live-follow overlay (Task 12, ids = `ExpectedNoteEvent.id`) and the preview strip (Task 14, ids = quantized note index strings) — both are plain strings, so no cross-type mismatch. `judgeNextPress`'s `NextPressMatch` (Task 11) is consumed with the same shape by both `PlayAlongEngine.pressKey` (Task 11) and `MidiExercise`'s live overlay (Task 12).

---

Plan complete and saved to `docs/superpowers/plans/2026-07-11-notation-metronome-live-follow.md`.
