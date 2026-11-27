import { centsBetween, equalTemperamentHz, HIGHEST_PIANO_MIDI, LOWEST_PIANO_MIDI, partialHz } from "./dsp.js";
import { fitInharmonicity, inharmonicityAt, type InharmonicityModel, TYPICAL_INHARMONICITY } from "./inharmonicity.js";
import type { InharmonicitySample } from "./types.js";

/**
 * Stretch tuning curve for one piano (spec 6.2). The temperament octave A3-A4
 * is divided evenly with its 4:2 octave beatless, A4 at the reference pitch.
 * Every other note is tuned as a beatless octave to the already tuned note
 * twelve keys towards the middle, matching the partials that matter in that
 * register: 4:2 through the middle, widening to 6:3 in the bass, narrowing to
 * 2:1 towards the top. Inharmonicity makes those partials sharp, which is what
 * produces the stretch (bass flat, treble sharp of equal temperament).
 */

export const TEMPERAMENT_LOW = 57; // A3
export const TEMPERAMENT_HIGH = 69; // A4

/** Octave type: lower note's partial `low` matches upper note's partial `high`. */
export interface PartialMatch {
  low: number;
  high: number;
}

export interface TuningTarget {
  midi: number;
  /** Target pitch (partial 1) in Hz. */
  targetHz: number;
  /** Target relative to equal temperament at the same A4 (the stretch), in cents. */
  centsVsEt: number;
  /** B used for this note. */
  inharmonicityB: number;
  /** Already tuned note this one is tuned against (absent for A4 and the temperament notes inside A3-A4). */
  partnerMidi?: number;
  /** Partials that are made beatless against the partner, as [this note, partner]. */
  match?: PartialMatch;
  /** Partial the live display measures (the fundamental is weak in the bass). */
  listenPartial: number;
}

export interface TuningCurve {
  a4Hz: number;
  lowestMidi: number;
  highestMidi: number;
  model: InharmonicityModel;
  /** Indexed by MIDI note; entries outside the range are undefined. */
  targets: Record<number, TuningTarget>;
}

export interface CurveOptions {
  a4Hz?: number;
  lowestMidi?: number;
  highestMidi?: number;
}

/** Weight 0..1 of the wider octave type when blending between two partial matches. */
function blend(midi: number, from: number, to: number): number {
  if (midi >= from) return 0;
  if (midi <= to) return 1;
  return (from - midi) / (from - to);
}

/** Treble octave (upper note tuned to the note an octave below). */
export function trebleMatches(midi: number): { a: PartialMatch; b: PartialMatch; weightB: number } {
  // 4:2 up to about C6, then 2:1 by about G6; blended in between so the curve has no kink.
  const weight2to1 = midi <= 84 ? 0 : midi >= 91 ? 1 : (midi - 84) / 7;
  return { a: { low: 4, high: 2 }, b: { low: 2, high: 1 }, weightB: weight2to1 };
}

/** Bass octave (lower note tuned to the note an octave above). */
export function bassMatches(midi: number): { a: PartialMatch; b: PartialMatch; weightB: number } {
  // 4:2 near the temperament, widening to 6:3 below about F2.
  return { a: { low: 4, high: 2 }, b: { low: 6, high: 3 }, weightB: blend(midi, 48, 41) };
}

export function listenPartialFor(midi: number): number {
  if (midi < 33) return 3;
  if (midi < 45) return 2;
  return 1;
}

/** Pitch (partial 1) for a note with B `b` whose partial `n` must sound at `freqHz`. */
function pitchForPartial(freqHz: number, n: number, b: number): number {
  const f0 = freqHz / (n * Math.sqrt(1 + b * n * n));
  return f0 * Math.sqrt(1 + b);
}

function f0FromPitch(pitchHz: number, b: number): number {
  return pitchHz / Math.sqrt(1 + b);
}

export function computeTuningCurve(samples: InharmonicitySample[] | InharmonicityModel, options: CurveOptions = {}): TuningCurve {
  const a4Hz = options.a4Hz ?? 440;
  const lowestMidi = Math.max(LOWEST_PIANO_MIDI, options.lowestMidi ?? LOWEST_PIANO_MIDI);
  const highestMidi = Math.min(HIGHEST_PIANO_MIDI, options.highestMidi ?? HIGHEST_PIANO_MIDI);
  const model = Array.isArray(samples) ? (samples.length ? fitInharmonicity(samples) : TYPICAL_INHARMONICITY) : samples;
  const bOf = (m: number) => inharmonicityAt(model, m);
  const pitch: Record<number, number> = {};
  const targets: Record<number, TuningTarget> = {};
  const put = (midi: number, hz: number, partnerMidi?: number, match?: PartialMatch) => {
    pitch[midi] = hz;
    if (midi < lowestMidi || midi > highestMidi) return;
    targets[midi] = {
      midi,
      targetHz: hz,
      centsVsEt: centsBetween(hz, equalTemperamentHz(midi, a4Hz)),
      inharmonicityB: bOf(midi),
      partnerMidi,
      match,
      listenPartial: listenPartialFor(midi),
    };
  };

  // Temperament octave: A4 at the reference, A3 a beatless 4:2 octave below, and
  // the notes between divide that (slightly wide) octave evenly.
  put(TEMPERAMENT_HIGH, a4Hz);
  const bA3 = bOf(TEMPERAMENT_LOW);
  const a4Partial2 = partialHz(f0FromPitch(a4Hz, bOf(TEMPERAMENT_HIGH)), bOf(TEMPERAMENT_HIGH), 2);
  const a3 = pitchForPartial(a4Partial2, 4, bA3);
  put(TEMPERAMENT_LOW, a3, TEMPERAMENT_HIGH, { low: 4, high: 2 });
  const octaveRatio = a4Hz / a3;
  for (let m = TEMPERAMENT_LOW + 1; m < TEMPERAMENT_HIGH; m++) put(m, a3 * octaveRatio ** ((m - TEMPERAMENT_LOW) / 12));

  // Treble: each note against the note an octave below.
  for (let m = TEMPERAMENT_HIGH + 1; m <= HIGHEST_PIANO_MIDI; m++) {
    const lower = m - 12;
    const bl = bOf(lower);
    const bu = bOf(m);
    const lowerF0 = f0FromPitch(pitch[lower], bl);
    const { a, b, weightB } = trebleMatches(m);
    const pa = pitchForPartial(partialHz(lowerF0, bl, a.low), a.high, bu);
    const pb = pitchForPartial(partialHz(lowerF0, bl, b.low), b.high, bu);
    const hz = pa ** (1 - weightB) * pb ** weightB;
    put(m, hz, lower, weightB < 0.5 ? a : b);
  }

  // Bass: each note against the note an octave above.
  for (let m = TEMPERAMENT_LOW - 1; m >= LOWEST_PIANO_MIDI; m--) {
    const upper = m + 12;
    const bu = bOf(upper);
    const bl = bOf(m);
    const upperF0 = f0FromPitch(pitch[upper], bu);
    const { a, b, weightB } = bassMatches(m);
    const pa = pitchForPartial(partialHz(upperF0, bu, a.high), a.low, bl);
    const pb = pitchForPartial(partialHz(upperF0, bu, b.high), b.low, bl);
    const hz = pa ** (1 - weightB) * pb ** weightB;
    put(m, hz, upper, weightB < 0.5 ? a : b);
  }

  return { a4Hz, lowestMidi, highestMidi, model, targets };
}

/**
 * Order the guided flow tunes in: A4, A3, the rest of the temperament octave,
 * then up the treble (each note's lower octave is already done), then down the
 * bass. Limited to the piano's range.
 */
export function tuningOrder(lowestMidi = LOWEST_PIANO_MIDI, highestMidi = HIGHEST_PIANO_MIDI): number[] {
  const order = [TEMPERAMENT_HIGH, TEMPERAMENT_LOW];
  for (let m = TEMPERAMENT_LOW + 1; m < TEMPERAMENT_HIGH; m++) order.push(m);
  for (let m = TEMPERAMENT_HIGH + 1; m <= HIGHEST_PIANO_MIDI; m++) order.push(m);
  for (let m = TEMPERAMENT_LOW - 1; m >= LOWEST_PIANO_MIDI; m--) order.push(m);
  return order.filter((m) => m >= lowestMidi && m <= highestMidi);
}

/** Keys measured for B before tuning: two per octave across the range, always including A4. */
export function sampleNotesForCurve(lowestMidi = LOWEST_PIANO_MIDI, highestMidi = HIGHEST_PIANO_MIDI): number[] {
  const notes = new Set<number>([69]);
  for (let m = LOWEST_PIANO_MIDI; m <= HIGHEST_PIANO_MIDI; m += 6) notes.add(m);
  notes.add(HIGHEST_PIANO_MIDI);
  return [...notes].filter((m) => m >= lowestMidi && m <= highestMidi).sort((x, y) => x - y);
}

/** Typical strings per note on a modern piano (single strings low bass, pairs in the wound bass, then triples). */
export function typicalStringsPerNote(midi: number): 1 | 2 | 3 {
  if (midi <= 28) return 1;
  if (midi <= 46) return 2;
  return 3;
}
