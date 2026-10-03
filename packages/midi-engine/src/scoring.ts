import type { DynamicsResult, ExerciseDynamics, ExpectedNoteEvent, MidiExercise, PerformedNote, ScoringMistake, ScoringResult } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { resolveScoreWeights } from "./config.js";

export interface ScoreMidiExerciseParams { exercise: MidiExercise; performedNotes: PerformedNote[]; durationTolerancePercent?: number; tempoPct?: number }
const round = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function scoreMidiExercise({ exercise, performedNotes, durationTolerancePercent, tempoPct = 100 }: ScoreMidiExerciseParams): ScoringResult {
  const untimed = exercise.scoring === "untimed";
  const msPerBeat = (60_000 / exercise.tempoBpm) * (100 / tempoPct);
  const rate = tempoPct / 100;
  const toleranceScale = rate > 0 ? Math.pow(rate, -0.5) : Number.POSITIVE_INFINITY;
  const timingTolerance = clamp(exercise.timingToleranceMs * toleranceScale, 60, 400);
  const simultaneityWindow = clamp(exercise.simultaneityWindowMs * toleranceScale, 30, 300);
  const expected = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
  const performed = [...performedNotes].sort((a, b) => a.startTimestampMs - b.startTimestampMs);
  const origin = performed[0]?.startTimestampMs ?? 0;
  const firstBeat = expected[0]?.startBeat ?? 0;
  const targetTime = (note: ExpectedNoteEvent) => origin + (note.startBeat - firstBeat) * msPerBeat;
  const tolerancePercent = durationTolerancePercent ?? exercise.durationTolerancePercent;
  const mistakes: ScoringMistake[] = [];
  const feedback = new Set<string>();
  const used = new Set<number>();
  let pitchHits = 0, timingHits = 0, durationKnown = 0, durationHits = 0;
  // Velocities of correctly played notes, for opt-in dynamics scoring.
  const matchedVelocities: number[] = [];
  const chordVelocities: number[][] = [];

  const groups = new Map<string, ExpectedNoteEvent[]>();
  const singles: ExpectedNoteEvent[] = [];
  for (const note of expected) note.chordGroupId ? groups.set(note.chordGroupId, [...(groups.get(note.chordGroupId) ?? []), note]) : singles.push(note);
  let chordHits = 0;

  const add = (expectedNote: ExpectedNoteEvent | null, performedNote: PerformedNote | null, issue: ScoringMistake["issue"], chordGroupId = expectedNote?.chordGroupId ?? null) => mistakes.push({ noteId: expectedNote?.id ?? null, expectedNote: expectedNote?.note ?? null, performedNote: performedNote?.note ?? null, chordGroupId, issue });
  const scoreDuration = (exp: ExpectedNoteEvent, got: PerformedNote) => {
    if (got.durationMs === null) { add(exp, got, "duration-unknown"); feedback.add(`Duration was unavailable for ${midiNoteToName(exp.note)}.`); return }
    durationKnown++;
    const target = exp.durationBeats * msPerBeat;
    const error = ((got.durationMs - target) / target) * 100;
    if (Math.abs(error) <= tolerancePercent) durationHits++;
    else if (error < 0) { add(exp, got, "held-too-short"); feedback.add(`Try holding ${midiNoteToName(exp.note)} for its full value.`) }
    else { add(exp, got, "held-too-long"); feedback.add(`${midiNoteToName(exp.note)} was held too long.`) }
  };
  const scoreTiming = (exp: ExpectedNoteEvent, got: PerformedNote) => {
    const delta = got.startTimestampMs - targetTime(exp);
    if (Math.abs(delta) <= timingTolerance) timingHits++;
    else if (delta < 0) { add(exp, got, "early"); feedback.add(`${midiNoteToName(exp.note)} was early.`) }
    else { add(exp, got, "late"); feedback.add(`${midiNoteToName(exp.note)} was late.`) }
  };

  for (const exp of singles) {
    let index = performed.map((got, i) => ({ got, i })).filter(({got,i}) => !used.has(i) && got.note === exp.note).sort((a,b) => Math.abs(a.got.startTimestampMs-targetTime(exp))-Math.abs(b.got.startTimestampMs-targetTime(exp)))[0]?.i ?? -1;
    if (index < 0 && !untimed) index = performed.findIndex((_, i) => !used.has(i) && Math.abs(performed[i]!.startTimestampMs - targetTime(exp)) <= timingTolerance);
    if (index < 0) { add(exp, null, "missed"); feedback.add(`You missed ${midiNoteToName(exp.note)}.`); continue }
    used.add(index); const got = performed[index]!;
    if (got.note === exp.note) { pitchHits++; matchedVelocities.push(got.velocity) } else { add(exp, got, "wrong"); feedback.add(`Expected ${midiNoteToName(exp.note)}, but heard ${midiNoteToName(got.note)}.`) }
    if (!untimed) { scoreTiming(exp, got); scoreDuration(exp, got) }
  }

  for (const [groupId, chord] of groups) {
    const target = targetTime(chord[0]!);
    const candidates = performed.map((note, index) => ({ note, index })).filter(({ note, index }) => !used.has(index) && (untimed || Math.abs(note.startTimestampMs - target) <= timingTolerance * 2));
    const selected: { note: PerformedNote; index: number }[] = [];
    for (const exp of chord) {
      const match = candidates.find(({ note, index }) => !selected.some((item) => item.index === index) && note.note === exp.note);
      if (match) { selected.push(match); used.add(match.index); pitchHits++; if (!untimed) scoreDuration(exp, match.note) }
      else { add(exp, null, "missing-chord-tone", groupId); feedback.add(`The chord was missing ${midiNoteToName(exp.note)}.`) }
    }
    chordVelocities.push(selected.map(({ note }) => note.velocity));
    matchedVelocities.push(...selected.map(({ note }) => note.velocity));
    const extras = untimed ? [] : candidates.filter(({ index }) => !selected.some((item) => item.index === index));
    for (const extra of extras) { used.add(extra.index); add(null, extra.note, "extra-chord-tone", groupId); feedback.add(`The chord contained extra ${midiNoteToName(extra.note.note)}.`) }
    const attacks = selected.map(({ note }) => note.startTimestampMs);
    const spread = attacks.length ? Math.max(...attacks) - Math.min(...attacks) : 0;
    const delta = attacks.length ? attacks.reduce((sum, value) => sum + value, 0) / attacks.length - target : Infinity;
    if (!untimed) {
      if (Math.abs(delta) <= timingTolerance) timingHits += selected.length;
      else if (selected.length) { const issue = delta < 0 ? "early" : "late"; add(chord[0]!, selected[0]!.note, issue, groupId); feedback.add(`The chord was ${issue}.`) }
    }
    if (spread > simultaneityWindow) { add(chord[0]!, selected[0]?.note ?? null, "uneven-hand-timing", groupId); feedback.add("The chord was uneven; play its notes together.") }
    if (selected.length === chord.length && extras.length === 0 && spread <= simultaneityWindow && (untimed || Math.abs(delta) <= timingTolerance)) chordHits++;
  }

  performed.forEach((note, index) => { if (!used.has(index)) { add(null, note, "extra"); feedback.add(`Extra note: ${midiNoteToName(note.note)}.`) } });
  const expectedCount = expected.length || 1;
  const noteAccuracy = round((pitchHits / Math.max(expectedCount, expectedCount + performed.length - used.size)) * 100);
  const timingAccuracy = untimed ? 100 : round((timingHits / expectedCount) * 100);
  const rhythmAccuracy = untimed ? 100 : durationKnown === 0 ? (expected.length ? 0 : 100) : round((durationHits / durationKnown) * 100);
  const chordAccuracy = groups.size === 0 ? 100 : round((chordHits / groups.size) * 100);
  const weights = resolveScoreWeights();
  const hasChordGroups = groups.size > 0;
  const score = untimed
    ? round(noteAccuracy * (hasChordGroups ? 0.7 : 1) + chordAccuracy * (hasChordGroups ? 0.3 : 0))
    : round(noteAccuracy * weights.noteAccuracy + timingAccuracy * weights.timingAccuracy + rhythmAccuracy * weights.rhythmAccuracy + chordAccuracy * weights.chordAccuracy);
  const dynamics = exercise.dynamics ? scoreDynamics(exercise.dynamics, matchedVelocities, chordVelocities) : null;
  if (dynamics?.evenness != null && dynamics.evenness < 70) {
    feedback.add(`Your volume varied (velocities spread ±${Math.round(dynamics.velocitySpread)}): aim for the same weight on every key.`);
  }
  if (dynamics?.chordBalance != null && dynamics.chordBalance < 70) {
    feedback.add("Some chord tones were louder than others: balance them at one volume.");
  }
  const finalScore = dynamics ? round(score * (1 - DYNAMICS_WEIGHT) + dynamics.score * DYNAMICS_WEIGHT) : score;
  if (!feedback.size && expected.length) feedback.add(untimed ? "Every note found — well done." : "Excellent accuracy and timing.");
  return { score: finalScore, noteAccuracy, timingAccuracy, rhythmAccuracy, chordAccuracy, feedback: [...feedback], mistakes, ...(dynamics ? { dynamics } : {}) };
}

/** Share of an opted-in exercise's score that comes from dynamics. */
export const DYNAMICS_WEIGHT = 0.15;
/** Velocity standard deviation at or below which playing counts as perfectly even, and at or above which it scores 0. */
export const EVEN_SPREAD = { full: 4, zero: 20 } as const;
/** Loudest-minus-softest velocity within a chord, the same way. */
export const CHORD_RANGE = { full: 6, zero: 30 } as const;

const linearScore = (value: number, full: number, zero: number): number => round(100 * (1 - (value - full) / (zero - full)));

/**
 * Evenness of the correctly played notes' velocities, and the balance of each
 * chord's tones. Wrong and missed notes are already scored elsewhere and don't
 * count here. A virtual keyboard sends one fixed velocity, which is perfectly even.
 */
export function scoreDynamics(options: ExerciseDynamics, velocities: readonly number[], chords: readonly (readonly number[])[]): DynamicsResult {
  const mean = velocities.length ? velocities.reduce((sum, v) => sum + v, 0) / velocities.length : 0;
  const spread = velocities.length ? Math.sqrt(velocities.reduce((sum, v) => sum + (v - mean) ** 2, 0) / velocities.length) : 0;
  const evenness = options.evenVolume && velocities.length >= 2 ? linearScore(spread, EVEN_SPREAD.full, EVEN_SPREAD.zero) : null;
  const ranges = chords.filter((tones) => tones.length >= 2).map((tones) => Math.max(...tones) - Math.min(...tones));
  const chordRange = ranges.length ? ranges.reduce((sum, r) => sum + r, 0) / ranges.length : null;
  const chordBalance = options.balancedChords && chordRange !== null ? linearScore(chordRange, CHORD_RANGE.full, CHORD_RANGE.zero) : null;
  const parts = [evenness, chordBalance].filter((part): part is number => part !== null);
  return {
    velocitySpread: Math.round(spread * 10) / 10,
    meanVelocity: Math.round(mean),
    evenness,
    chordVelocityRange: chordRange === null ? null : Math.round(chordRange * 10) / 10,
    chordBalance,
    score: parts.length ? round(parts.reduce((sum, part) => sum + part, 0) / parts.length) : 100,
  };
}
