export interface MidiEngineConfig { timingToleranceMs: number; simultaneityWindowMs: number; durationTolerancePercent: number }
export interface ScoreWeights { noteAccuracy: number; timingAccuracy: number; rhythmAccuracy: number; chordAccuracy: number; /** Mic exercises that blend intonation in (violin); absent = not part of the score. */ intonation?: number }

export const BEGINNER_CONFIG: Readonly<MidiEngineConfig> = { timingToleranceMs: 250, simultaneityWindowMs: 180, durationTolerancePercent: 35 };
export const ELEMENTARY_CONFIG: Readonly<MidiEngineConfig> = { timingToleranceMs: 200, simultaneityWindowMs: 140, durationTolerancePercent: 25 };
export const INTERMEDIATE_CONFIG: Readonly<MidiEngineConfig> = { timingToleranceMs: 150, simultaneityWindowMs: 100, durationTolerancePercent: 15 };
export const ADVANCED_CONFIG: Readonly<MidiEngineConfig> = { timingToleranceMs: 80, simultaneityWindowMs: 60, durationTolerancePercent: 10 };
export const DEFAULT_SCORE_WEIGHTS: Readonly<ScoreWeights> = { noteAccuracy: 0.4, timingAccuracy: 0.25, rhythmAccuracy: 0.2, chordAccuracy: 0.15 };

export function resolveConfig(overrides: Partial<MidiEngineConfig> = {}): MidiEngineConfig { return { ...BEGINNER_CONFIG, ...overrides } }
export function resolveScoreWeights(overrides: Partial<ScoreWeights> = {}): ScoreWeights {
  const weights = { ...DEFAULT_SCORE_WEIGHTS, ...overrides };
  const total = Object.values(weights).reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total <= 0) throw new RangeError("Score weights must have a positive sum");
  const resolved: ScoreWeights = { noteAccuracy: weights.noteAccuracy / total, timingAccuracy: weights.timingAccuracy / total, rhythmAccuracy: weights.rhythmAccuracy / total, chordAccuracy: weights.chordAccuracy / total };
  if (weights.intonation !== undefined) resolved.intonation = weights.intonation / total;
  return resolved;
}
/** Violin mic exercises (spec 3.4): intonation is part of the grade. Chord accuracy is not used for single-line violin. */
export const VIOLIN_SCORE_WEIGHTS: Readonly<ScoreWeights> = { noteAccuracy: 0.35, timingAccuracy: 0.2, rhythmAccuracy: 0.15, chordAccuracy: 0, intonation: 0.3 };
