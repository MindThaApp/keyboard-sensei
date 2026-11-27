import { CHORD_QUALITIES, chordSymbolOf, nearNeighbours, parseChordSymbol, sameChord } from "@keyboard-sensei/music-theory";
import { computeChroma, type Chroma } from "./chroma.js";

export interface ChordCandidate { symbol: string; score: number }
export interface ChordRecognition {
  /** Best match, or null when nothing was heard or nothing was convincing. */
  label: string | null;
  /** Cosine similarity of the best match (0-1). */
  confidence: number;
  runnerUp: ChordCandidate | null;
  ranking: ChordCandidate[];
}

interface Template { symbol: string; root: number; vector: Float64Array; prior: number }

/** Plain triads are what beginners play: extended and reduced chords must beat them clearly to be named. */
const PRIOR: Record<string, number> = { "": 1, m: 1, "7": 0.96, maj7: 0.95, m7: 0.95, sus2: 0.93, sus4: 0.93, "5": 0.9, dim: 0.93 };

/**
 * A chord template models what a guitar actually sounds like: each chord tone with its
 * first few harmonics (octave, fifth above that, ...), weaker the higher they go.
 */
function buildTemplates(): Template[] {
  const templates: Template[] = [];
  const partials: [number, number][] = [[0, 1], [0, 0.6], [7, 0.08], [0, 0.3]]; // semitones above the tone, weight
  for (let root = 0; root < 12; root++) {
    for (const quality of CHORD_QUALITIES) {
      const vector = new Float64Array(12);
      quality.intervals.forEach((interval, index) => {
        const toneWeight = index === 0 ? 1.15 : 1; // the root rings strongest on most voicings
        for (const [offset, weight] of partials) {
          const pc = (root + interval + offset) % 12;
          vector[pc] = vector[pc]! + weight * toneWeight;
        }
      });
      // Chord tones must dominate their own partial pile-up: re-weight so tones sit above partials.
      for (const interval of quality.intervals) vector[(root + interval) % 12] = vector[(root + interval) % 12]! + 0.5;
      let sum = 0;
      for (const x of vector) sum += x * x;
      const norm = Math.sqrt(sum);
      for (let i = 0; i < 12; i++) vector[i] = vector[i]! / norm;
      templates.push({ symbol: chordSymbolOf(root, quality.suffix), root, vector, prior: PRIOR[quality.suffix] ?? 0.9 });
    }
  }
  return templates;
}

const TEMPLATES = buildTemplates();
/** How much hearing the root in the bass region is worth (breaks C-vs-Am7 style ties). */
const BASS_BONUS = 0.08;

export function rankChords(frame: Chroma): ChordCandidate[] {
  return TEMPLATES.map((template) => {
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += frame.chroma[i]! * template.vector[i]!;
    return { symbol: template.symbol, score: (dot + BASS_BONUS * frame.bass[template.root]!) * template.prior };
  }).sort((a, b) => b.score - a.score);
}

/** Below this the sound is not chord-like enough to name (noise, a single string, silence). */
export const MIN_CHORD_CONFIDENCE = 0.55;

export function recognizeChord(frame: Chroma): ChordRecognition {
  let energy = 0;
  for (const x of frame.chroma) energy += x;
  if (energy === 0) return { label: null, confidence: 0, runnerUp: null, ranking: [] };
  const ranking = rankChords(frame);
  const best = ranking[0]!;
  return {
    label: best.score >= MIN_CHORD_CONFIDENCE ? best.symbol : null,
    confidence: Math.min(1, best.score),
    runnerUp: ranking[1] ?? null,
    ranking,
  };
}

export function recognizeChordFromSamples(samples: Float32Array | Float64Array, sampleRate: number): ChordRecognition {
  return recognizeChord(computeChroma(samples, sampleRate));
}

/** Margin within which a near-neighbour runner-up still counts as the target (e.g. C heard as Cmaj7). */
export const NEAR_NEIGHBOUR_MARGIN = 0.05;

export type ChordVerdict = { ok: true; heard: string | null } | { ok: false; heard: string | null };

/**
 * Verify a recognition against the chord the exercise asked for. Pass when the target is
 * the top match, or a near neighbour of the target is top and the target is within a small
 * margin of it.
 */
export function verifyChord(recognition: ChordRecognition, target: string): ChordVerdict {
  if (recognition.label === null) return { ok: false, heard: null };
  if (sameChord(recognition.label, target)) return { ok: true, heard: recognition.label };
  const parsed = parseChordSymbol(target);
  if (parsed && nearNeighbours(recognition.label, target)) {
    const targetScore = recognition.ranking.find((c) => sameChord(c.symbol, target))?.score ?? 0;
    if (recognition.confidence - targetScore <= NEAR_NEIGHBOUR_MARGIN) return { ok: true, heard: recognition.label };
  }
  return { ok: false, heard: recognition.label };
}
