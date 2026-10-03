/**
 * Difficulty arrangements: turn any piano piece into an easier version of itself.
 *
 *   simplifyArrangement(notes, meta, level)
 *
 * Pure, DOM-free and deterministic (same input → same output, no randomness,
 * total-order sorts everywhere). Linear-ish in the note count (one sort plus
 * single passes), so it is cheap enough to run client-side on a 3,000-note song.
 *
 * ## Units — read this before calling it
 *
 * Everything is in QUARTER-NOTE BEATS measured from the start of the file:
 * `startBeat = note.ticks / ppq`. MIDI ppq is ticks-per-quarter regardless of
 * the time signature's denominator, so this unit is denominator-independent
 * (a 6/8 bar is 3 beats long, a 2/2 bar is 4). Do NOT convert from seconds with
 * a single BPM: that is the tempo-map bug this repo already shipped once.
 * Convert results back with the SAME tempo map that placed the original notes,
 * e.g. `midi.header.ticksToSeconds(beat * ppq)` (@tonejs/midi).
 *
 * ## Levels and their guarantees
 *
 * - `"full"`: the input, unchanged (copied and sorted).
 * - `"intermediate"`:
 *   - Right hand: the melody only (top voice, see `extractMelody`), monophonic.
 *     Ornaments (grace notes, trills — anything with an inter-onset interval
 *     under 1/8 beat) are removed or collapsed into their main note, and runs
 *     faster than a 16th (or than an 8th when `quarterBpm` > 120) are thinned.
 *     Original key and original rhythm otherwise.
 *   - Left hand: one bass note per felt beat (quarter in simple meters,
 *     dotted quarter in compound), restated only when the bass changes or a bar
 *     starts, plus at most two chord tones voiced within an octave above it.
 *     Never more than `INTERMEDIATE_MAX_NOTES_PER_HAND` (3) at once per hand.
 * - `"easy"`: between intermediate and beginner.
 *   - Right hand: the intermediate melody, thinned further to at most one note
 *     per eighth (so no sixteenth-note runs). Original key, rhythm and range.
 *   - Left hand: the intermediate bass line WITHOUT its chord tones — a single
 *     bass note per felt beat, restated only when the bass changes or a bar
 *     starts. Never more than one note at a time per hand.
 * - `"beginner"`:
 *   - Right-hand melody only. Single notes (strictly monophonic: every note
 *     ends at or before the next one starts). Left hand dropped.
 *   - A tune that spends 30%+ of its time in sixteenths first has its note values
 *     doubled (see `result.timeScale`), so it keeps its notes instead of
 *     losing every other one.
 *   - Rhythm quantized to an eighth-note grid, and every duration is one of
 *     `BEGINNER_DURATIONS` (eighth, quarter, dotted quarter, half, dotted half,
 *     whole). Notes that would collide on the grid are thinned.
 *   - Transposed to C/G/F major or A/E/D minor when the original key is harder
 *     (smallest shift; an easy key is kept), then shifted by octaves and folded
 *     so every note lies in `BEGINNER_RANGE` (C4–C6: the two octaves from
 *     middle C up — not lower, because the play-along parser splits a
 *     single-track file into hands at middle C, so a beginner note below it
 *     would be shown as a left-hand note). `result.transpose` is the total
 *     shift applied, octaves included.
 *
 * ## Which notes are "the melody"
 *
 * By default the top voice of the right hand (see `extractMelody`). When the
 * caller knows better — a vocal line, a violin part, a tune in the left hand —
 * it marks those notes `melody: true` and only they are used. Notes before
 * `meta.melodyStartBeat` never count as melody (use it to skip an
 * accompaniment-only introduction).
 *
 * The overall duration is preserved at every level (notes keep their beat
 * positions; only the tail of the last note may be shortened).
 */

export type ArrangementLevel = "beginner" | "easy" | "intermediate" | "full";
export type ArrangementHand = "left" | "right";

export interface ArrangementNote {
  midi: number;
  /** Onset in quarter-note beats from the start of the file (ticks / ppq). */
  startBeat: number;
  /** Length in quarter-note beats. */
  durationBeats: number;
  hand: ArrangementHand;
  /** 0–1, passed through untouched when present. */
  velocity?: number;
  /** Marks the melody explicitly. If ANY note is marked, only marked notes are melody candidates. */
  melody?: boolean;
}

/** One time-signature span. `startBeat` is in quarter-note beats (ticks / ppq). */
export interface ArrangementMeterSegment {
  startBeat: number;
  numerator: number;
  denominator: number;
}

export interface ArrangementKey {
  /** Pitch class of the tonic, 0 = C … 11 = B. */
  tonic: number;
  mode: "major" | "minor";
}

export interface ArrangementMeta {
  /** Time signatures, chronological. Defaults to 4/4 from beat 0. */
  meters?: ArrangementMeterSegment[];
  /** The piece's key (e.g. from the MIDI key-signature event). Estimated from the notes when absent. */
  key?: ArrangementKey | null;
  /** Typical quarter-note tempo; only used to decide how hard to thin fast runs. */
  quarterBpm?: number;
  /** Reassign hands by pitch: notes below this MIDI number become left hand. Use when the source's hand split is unreliable. */
  splitPoint?: number;
  /** Melody notes starting before this beat are ignored (an introduction with no tune). */
  melodyStartBeat?: number;
  /** Force the beginner transposition (semitones, before octave placement) instead of choosing one automatically. */
  transpose?: number;
  /**
   * Force the beginner time scale instead of choosing it from how fast the
   * tune moves. 2 keeps a sparse tune's dotted-eighth–sixteenth figures
   * (Moonlight's) as dotted quarter–eighth rather than rounding them to even eighths.
   */
  beginnerTimeScale?: 1 | 2;
  /** The tune really leaps (often in octaves): don't swap isolated high notes for a closer one (see extractMelody). */
  keepLeaps?: boolean;
}

export interface ArrangementResult {
  level: ArrangementLevel;
  notes: ArrangementNote[];
  /** Semitones added to every pitch (beginner only; 0 otherwise). Includes octave placement. */
  transpose: number;
  /**
   * 1, or 2 when a beginner tune moves mostly in sixteenths: its note values
   * are then doubled (sixteenths become eighths) so it fits the beginner
   * rhythm set, and every beat in `notes` is an original beat × 2. To keep
   * the sound identical, convert with `originalBeat = beat / timeScale` (or
   * write the file with the tempo doubled and the meter's denominator halved).
   */
  timeScale: 1 | 2;
  /** The ORIGINAL key: as given in meta, or estimated. */
  key: ArrangementKey;
}

/** Inclusive MIDI range every beginner note is placed in: C4–C6. */
export const BEGINNER_RANGE = { min: 60, max: 84 } as const;
/** The only note lengths a beginner arrangement uses, in quarter-note beats. */
export const BEGINNER_DURATIONS: readonly number[] = [0.5, 1, 1.5, 2, 3, 4];
/** Beginner onsets sit on this grid (an eighth note). */
export const BEGINNER_GRID = 0.5;
export const INTERMEDIATE_MAX_NOTES_PER_HAND = 3;
/** Shortest gap between two easy-level melody notes, in quarter beats (an eighth). */
export const EASY_MIN_IOI = 0.5;
/** Inter-onset intervals shorter than this (a 32nd note) are treated as ornaments. */
export const ORNAMENT_BEATS = 0.125;

const EPS = 1 / 96;
/** A melody note still sounding this long after a lower onset hides that onset (it is an inner voice). */
const HOLD_TOLERANCE_BEATS = 0.2;
const LEFT_HAND_MIN = 33; // A1
const RIGHT_HAND_MIN = 48;
const RIGHT_HAND_MAX = 96;

const EASY_TONICS: Record<ArrangementKey["mode"], number[]> = {
  major: [0, 7, 5], // C, G, F
  minor: [9, 4, 2], // A, E, D
};

const byTime = (a: ArrangementNote, b: ArrangementNote): number =>
  a.startBeat - b.startBeat || a.midi - b.midi || a.durationBeats - b.durationBeats;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function simplifyArrangement(
  notes: readonly ArrangementNote[],
  meta: ArrangementMeta,
  level: ArrangementLevel,
): ArrangementResult {
  const handed = notes.map((note) => ({
    ...note,
    hand: meta.splitPoint === undefined ? note.hand : note.midi < meta.splitPoint ? "left" : "right",
  })) as ArrangementNote[];
  const key = meta.key ?? estimateKey(handed);

  if (level === "full") {
    return { level, notes: handed.sort(byTime), transpose: 0, key, timeScale: 1 };
  }

  const melody = melodyLine(handed, meta);

  if (level === "intermediate") {
    const minIoi = meta.quarterBpm !== undefined && meta.quarterBpm > 120 ? 0.5 : 0.25;
    const rh = foldIntoRange(thin(melody, minIoi), RIGHT_HAND_MIN, RIGHT_HAND_MAX).map((note) => ({ ...note, hand: "right" as const }));
    const lh = simplifyLeftHand(
      handed.filter((note) => note.hand === "left"),
      meta.meters ?? [],
    );
    return { level, notes: [...rh, ...lh].sort(byTime), transpose: 0, key, timeScale: 1 };
  }

  if (level === "easy") {
    const rh = foldIntoRange(thin(melody, EASY_MIN_IOI), RIGHT_HAND_MIN, RIGHT_HAND_MAX).map((note) => ({ ...note, hand: "right" as const }));
    const lh = simplifyLeftHand(
      handed.filter((note) => note.hand === "left"),
      meta.meters ?? [],
      0,
    );
    return { level, notes: [...rh, ...lh].sort(byTime), transpose: 0, key, timeScale: 1 };
  }

  const timeScale = meta.beginnerTimeScale ?? (shareFasterThan(melody, BEGINNER_GRID) >= 0.3 ? 2 : 1);
  const scaled = timeScale === 1 ? melody : melody.map((note) => ({ ...note, startBeat: note.startBeat * 2, durationBeats: note.durationBeats * 2 }));
  const quantized = quantizeBeginner(scaled);
  const keyShift = meta.transpose ?? beginnerKeyShift(key);
  const transpose = keyShift + octavePlacement(quantized, keyShift);
  const placed = foldIntoRange(
    quantized.map((note) => ({ ...note, midi: note.midi + transpose, hand: "right" as const })),
    BEGINNER_RANGE.min,
    BEGINNER_RANGE.max,
  );
  return { level, notes: placed, transpose, key, timeScale };
}

/**
 * The tune both simplified levels are built on, before any quantizing: the
 * marked melody notes (or the right hand, or everything if there is no right
 * hand) from `meta.melodyStartBeat` on, reduced to one voice by
 * `extractMelody`, with ornaments removed. Hands are taken as given — apply
 * `meta.splitPoint` first if you need it.
 */
export function melodyLine(
  notes: readonly ArrangementNote[],
  meta: Pick<ArrangementMeta, "melodyStartBeat" | "keepLeaps"> = {},
): ArrangementNote[] {
  const from = meta.melodyStartBeat ?? Number.NEGATIVE_INFINITY;
  const marked = notes.filter((note) => note.melody);
  const right = notes.filter((note) => note.hand === "right");
  const pool = marked.length > 0 ? marked : right.length > 0 ? right : notes;
  return collapseOrnaments(extractMelody(pool.filter((note) => note.startBeat >= from - EPS), { keepLeaps: meta.keepLeaps }));
}

/**
 * The melody of a set of notes: the top voice ("skyline"), with pitch-continuity
 * smoothing. At each onset the highest note wins, except that an onset lower
 * than a melody note that is still clearly sounding is an inner voice and is
 * skipped (this is what drops Moonlight-style accompaniment triplets under a held
 * tune). Then an isolated upward spike — a note 9+ semitones above both
 * neighbours while a note close to them sounded at the same onset — is swapped
 * for that closer note (unless `keepLeaps`: a tune in octaves that really
 * leaps, like Brindisi's rising sixths). Durations are clipped so the result
 * is monophonic.
 */
export function extractMelody(notes: readonly ArrangementNote[], options: { keepLeaps?: boolean } = {}): ArrangementNote[] {
  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat || b.midi - a.midi || a.durationBeats - b.durationBeats);
  const picked: { note: ArrangementNote; group: ArrangementNote[] }[] = [];
  let current: { midi: number; end: number } | null = null;

  for (let i = 0; i < sorted.length; ) {
    const start = sorted[i].startBeat;
    const group: ArrangementNote[] = [];
    while (i < sorted.length && sorted[i].startBeat - start < EPS) group.push(sorted[i++]);
    const top = group[0];
    if (current && top.midi < current.midi && current.end - start > HOLD_TOLERANCE_BEATS) continue;
    picked.push({ note: top, group });
    current = { midi: top.midi, end: top.startBeat + top.durationBeats };
  }

  for (let i = 1; !options.keepLeaps && i + 1 < picked.length; i++) {
    const prev = picked[i - 1].note.midi;
    const next = picked[i + 1].note.midi;
    const here = picked[i].note.midi;
    if (here - Math.max(prev, next) < 9) continue;
    const target = (prev + next) / 2;
    let best: ArrangementNote | null = null;
    for (const alt of picked[i].group) {
      if (Math.abs(alt.midi - prev) > 7 || Math.abs(alt.midi - next) > 7) continue;
      if (!best || Math.abs(alt.midi - target) < Math.abs(best.midi - target)) best = alt;
    }
    if (best) picked[i] = { note: best, group: picked[i].group };
  }

  return clipToMonophonic(picked.map(({ note }) => ({ ...note })));
}

/** Share of the tune's time spent in notes closer together than `beats`. */
function shareFasterThan(melody: ArrangementNote[], beats: number): number {
  // Measured in time, not note count: a few quick passing notes between long
  // ones don't make a tune "fast".
  let fast = 0;
  let total = 0;
  for (let i = 0; i + 1 < melody.length; i++) {
    // Cap at one beat so rests between phrases don't dilute the measure.
    const gap = Math.min(1, melody[i + 1].startBeat - melody[i].startBeat);
    total += gap;
    if (gap < beats - EPS) fast += gap;
  }
  return total === 0 ? 0 : fast / total;
}

/** Clip each note so it ends no later than the next one starts. Input must be sorted, one note per onset. */
function clipToMonophonic(notes: ArrangementNote[]): ArrangementNote[] {
  for (let i = 0; i + 1 < notes.length; i++) {
    const gap = notes[i + 1].startBeat - notes[i].startBeat;
    if (notes[i].durationBeats > gap) notes[i].durationBeats = gap;
  }
  return notes;
}

/**
 * Grace notes (one or two very short notes leading into a longer one) are
 * dropped; trills, turns and other runs of 3+ very short notes collapse into
 * their first note held for the run's length.
 */
function collapseOrnaments(melody: ArrangementNote[]): ArrangementNote[] {
  const ioi = (i: number): number =>
    i + 1 < melody.length ? melody[i + 1].startBeat - melody[i].startBeat : melody[i].durationBeats;
  const out: ArrangementNote[] = [];
  for (let i = 0; i < melody.length; ) {
    if (ioi(i) >= ORNAMENT_BEATS) {
      out.push(melody[i++]);
      continue;
    }
    let j = i;
    // A run also swallows its own last note when that note is itself very short
    // (the end of a trill), so the main note after it is what survives.
    while (j < melody.length && (ioi(j) < ORNAMENT_BEATS || (j > i && melody[j].durationBeats < ORNAMENT_BEATS))) j++;
    // j is now the first note after the run of ornamental onsets (or the end).
    if (j - i <= 2 && j < melody.length) {
      i = j;
      continue;
    }
    const last = melody[Math.min(j, melody.length - 1)];
    const end = j < melody.length ? last.startBeat : last.startBeat + last.durationBeats;
    out.push({ ...melody[i], durationBeats: Math.max(end - melody[i].startBeat, melody[i].durationBeats) });
    i = j;
  }
  return clipToMonophonic(out);
}

/**
 * Drop notes that start less than `minIoi` beats after the previously kept
 * note. When the kept note was legato into a dropped one, it is held through
 * the dropped note instead of leaving a hole.
 */
function thin(melody: ArrangementNote[], minIoi: number): ArrangementNote[] {
  const out: ArrangementNote[] = [];
  for (const note of melody) {
    const prev = out[out.length - 1];
    if (prev && note.startBeat - prev.startBeat < minIoi - EPS) {
      if (prev.startBeat + prev.durationBeats >= note.startBeat - EPS) {
        prev.durationBeats = note.startBeat + note.durationBeats - prev.startBeat;
      }
      continue;
    }
    out.push({ ...note });
  }
  return clipToMonophonic(out);
}

/** Move notes by whole octaves until they sit inside [min, max]. */
function foldIntoRange(notes: ArrangementNote[], min: number, max: number): ArrangementNote[] {
  return notes.map((note) => {
    let midi = note.midi;
    while (midi < min) midi += 12;
    while (midi > max) midi -= 12;
    return midi === note.midi ? note : { ...note, midi };
  });
}

/**
 * Snap a monophonic melody onto the eighth-note grid. Each note takes its
 * nearest free grid slot (or the slot on its other side when the nearest one
 * belongs, more exactly, to the next note); notes with no free slot are
 * dropped. Durations then fill up to the next onset or the note's own quantized
 * end, whichever is first, rounded DOWN to an allowed length.
 */
function quantizeBeginner(melody: ArrangementNote[]): ArrangementNote[] {
  const g = BEGINNER_GRID;
  const nearest = (beat: number): number => Math.round(beat / g) * g;
  const slotted: { note: ArrangementNote; slot: number }[] = [];
  let prevSlot = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < melody.length; i++) {
    const note = melody[i];
    const near = nearest(note.startBeat);
    const other = note.startBeat < near ? near - g : near + g;
    const next = melody[i + 1];
    let chosen: number | null = null;
    for (const slot of [near, other]) {
      if (slot <= prevSlot + EPS) continue;
      if (next && Math.abs(nearest(next.startBeat) - slot) < EPS && Math.abs(next.startBeat - slot) < Math.abs(note.startBeat - slot)) {
        continue;
      }
      chosen = slot;
      break;
    }
    if (chosen === null) continue;
    slotted.push({ note, slot: chosen });
    prevSlot = chosen;
  }

  return slotted.map(({ note, slot }, i) => {
    const nextSlot = i + 1 < slotted.length ? slotted[i + 1].slot : Number.POSITIVE_INFINITY;
    const ownEnd = Math.max(slot + g, nearest(note.startBeat + note.durationBeats));
    const available = Math.min(nextSlot, ownEnd) - slot;
    let duration = BEGINNER_DURATIONS[0];
    for (const allowed of BEGINNER_DURATIONS) if (allowed <= available + EPS) duration = allowed;
    return { ...note, startBeat: slot, durationBeats: duration };
  });
}

/** Semitone shift (in [-6, 5]) that moves the key to the nearest easy key of the same mode; 0 if already easy. */
function beginnerKeyShift(key: ArrangementKey): number {
  const easy = EASY_TONICS[key.mode];
  if (easy.includes(key.tonic)) return 0;
  let best = 0;
  let bestAbs = Number.POSITIVE_INFINITY;
  for (const tonic of easy) {
    let shift = mod12(tonic - key.tonic);
    if (shift > 5) shift -= 12;
    if (Math.abs(shift) < bestAbs) {
      best = shift;
      bestAbs = Math.abs(shift);
    }
  }
  return best;
}

/**
 * Whole-octave shift that keeps the most of the tune inside BEGINNER_RANGE,
 * centred near A4. Weighted by note length, so the held notes of the tune
 * count for more than passing figures between them.
 */
function octavePlacement(melody: ArrangementNote[], keyShift: number): number {
  if (melody.length === 0) return 0;
  const weighted = melody.map((note) => ({ pitch: note.midi + keyShift, weight: note.durationBeats })).sort((a, b) => a.pitch - b.pitch);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let median = weighted[weighted.length - 1].pitch;
  for (let acc = 0, i = 0; i < weighted.length; i++) {
    acc += weighted[i].weight;
    if (acc >= total / 2) {
      median = weighted[i].pitch;
      break;
    }
  }
  let best = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let octave = -3; octave <= 3; octave++) {
    const shift = octave * 12;
    const inside = weighted
      .filter((item) => item.pitch + shift >= BEGINNER_RANGE.min && item.pitch + shift <= BEGINNER_RANGE.max)
      .reduce((sum, item) => sum + item.weight, 0);
    // Most of the tune inside first; then move as few octaves as possible; then centre near A4.
    const score = (inside / total) * 1000 - Math.abs(octave) * 20 - Math.abs(median + shift - 69);
    if (score > bestScore) {
      best = shift;
      bestScore = score;
    }
  }
  return best;
}

/** Felt-beat length in quarter beats: dotted quarter (per 8th-denominator unit) in compound meters, else one notated beat. */
function feltBeat(seg: ArrangementMeterSegment): number {
  const notated = 4 / seg.denominator;
  return seg.denominator >= 8 && seg.numerator % 3 === 0 ? notated * 3 : notated;
}

interface Window {
  start: number;
  end: number;
  barStart: boolean;
}

function beatWindows(meters: ArrangementMeterSegment[], endBeat: number): Window[] {
  const segments = (meters.length > 0 ? [...meters] : [{ startBeat: 0, numerator: 4, denominator: 4 }]).sort(
    (a, b) => a.startBeat - b.startBeat,
  );
  if (segments[0].startBeat > EPS) segments.unshift({ ...segments[0], startBeat: 0 });
  const windows: Window[] = [];
  for (let s = 0; s < segments.length; s++) {
    const seg = segments[s];
    const segEnd = s + 1 < segments.length ? segments[s + 1].startBeat : endBeat;
    const beat = feltBeat(seg);
    const bar = seg.numerator * (4 / seg.denominator);
    for (let start = seg.startBeat; start < segEnd - EPS; start += beat) {
      const offset = start - seg.startBeat;
      windows.push({
        start,
        end: Math.min(start + beat, segEnd),
        barStart: Math.abs(offset / bar - Math.round(offset / bar)) < EPS,
      });
    }
  }
  return windows;
}

/** Interval preference for the (at most two) chord tones kept above the bass. */
const CHORD_TONE_ORDER = [4, 3, 7, 10, 11, 9, 8, 2, 5, 6, 1];

function simplifyLeftHand(
  left: ArrangementNote[],
  meters: ArrangementMeterSegment[],
  maxChordTones = INTERMEDIATE_MAX_NOTES_PER_HAND - 1,
): ArrangementNote[] {
  if (left.length === 0) return [];
  const sorted = [...left].sort(byTime);
  const endBeat = Math.max(...sorted.map((note) => note.startBeat + note.durationBeats));
  // `pcs` accumulates every pitch class (relative to the bass) heard while the chord is held.
  const chords: { start: number; end: number; bass: ArrangementNote; pcs: Set<number> }[] = [];
  let i = 0;

  for (const window of beatWindows(meters, endBeat + EPS)) {
    const inWindow: ArrangementNote[] = [];
    while (i < sorted.length && sorted[i].startBeat < window.end - EPS) {
      if (sorted[i].startBeat >= window.start - EPS) inWindow.push(sorted[i]);
      i++;
    }
    if (inWindow.length === 0) continue;
    let bass = inWindow[0];
    for (const note of inWindow) if (note.midi < bass.midi) bass = note;
    const windowEnd = Math.max(...inWindow.map((note) => note.startBeat + note.durationBeats));
    const held = chords[chords.length - 1];
    if (held && !window.barStart && held.end >= window.start - EPS && bass.midi >= held.bass.midi) {
      // Same harmony unless most of this beat's pitch classes are new (an
      // Alberti or broken-chord figure revisits the held chord's own notes).
      const windowPcs = new Set(inWindow.map((note) => mod12(note.midi - held.bass.midi)));
      const fresh = [...windowPcs].filter((pc) => !held.pcs.has(pc)).length;
      if (fresh * 2 <= windowPcs.size) {
        held.end = Math.max(held.end, windowEnd);
        for (const pc of windowPcs) held.pcs.add(pc);
        continue;
      }
    }
    const start = Math.min(...inWindow.map((note) => note.startBeat));
    chords.push({ start, end: windowEnd, bass, pcs: new Set(inWindow.map((note) => mod12(note.midi - bass.midi))) });
  }

  const out: ArrangementNote[] = [];
  chords.forEach((chord, index) => {
    const nextStart = index + 1 < chords.length ? chords[index + 1].start : Number.POSITIVE_INFINITY;
    const durationBeats = Math.min(chord.end, nextStart) - chord.start;
    if (durationBeats <= EPS) return;
    let root = chord.bass.midi;
    while (root < LEFT_HAND_MIN) root += 12;
    const tones = CHORD_TONE_ORDER.filter((interval) => chord.pcs.has(interval)).slice(0, maxChordTones);
    for (const midi of [root, ...tones.map((interval) => root + interval)]) {
      out.push({
        midi,
        startBeat: chord.start,
        durationBeats,
        hand: "left",
        ...(chord.bass.velocity === undefined ? {} : { velocity: chord.bass.velocity }),
      });
    }
  });
  return out;
}

// Krumhansl–Kessler key profiles.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** Krumhansl–Schmuckler key estimate from a duration-weighted pitch-class histogram. */
export function estimateKey(notes: readonly ArrangementNote[]): ArrangementKey {
  const histogram = new Array<number>(12).fill(0);
  for (const note of notes) histogram[mod12(note.midi)] += note.durationBeats;
  let best: ArrangementKey = { tonic: 0, mode: "major" };
  let bestR = Number.NEGATIVE_INFINITY;
  for (const mode of ["major", "minor"] as const) {
    const profile = mode === "major" ? MAJOR_PROFILE : MINOR_PROFILE;
    for (let tonic = 0; tonic < 12; tonic++) {
      const rotated = histogram.map((_, pc) => histogram[mod12(pc + tonic)]);
      const r = correlation(rotated, profile);
      if (r > bestR + 1e-12) {
        bestR = r;
        best = { tonic, mode };
      }
    }
  }
  return best;
}
