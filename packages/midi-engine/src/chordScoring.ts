import type { ChordDetection, ChordResult, ChordTarget, MidiExercise, ScoringMistake, ScoringResult } from "@keyboard-sensei/shared-types";
import { nearNeighbours, sameChord } from "@keyboard-sensei/music-theory";

/** How close the runner-up must be to the winner for a near-neighbour to still count (same rule as the client-side verifier). */
export const CHORD_NEAR_MARGIN = 0.05;
/** Weights of the strum score: which chord, then when. */
const CHORD_WEIGHT = 0.75;
const TIMING_WEIGHT = 0.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(clamp(v, 0, 100));

export function detectionMatchesChord(detection: ChordDetection, symbol: string): boolean {
  if (detection.label === null) return false;
  if (sameChord(detection.label, symbol)) return true;
  const runner = detection.runnerUp;
  return !!runner && sameChord(runner.label, symbol) && nearNeighbours(detection.label, symbol) && detection.confidence - runner.confidence <= CHORD_NEAR_MARGIN;
}

export interface ScoreChordExerciseParams { exercise: MidiExercise; detections: ChordDetection[]; tempoPct?: number }

/**
 * Grade a strum exercise: per chord target, right / wrong-chord / no-strum, plus early/late
 * against the beat. Like the note scorer, everything is timed from the first strum, so only
 * the rhythm between strums matters, not when the learner pressed start.
 * Returns the same ScoringResult shape as scoreMidiExercise, so results, stars, XP and history need no changes.
 */
export function scoreChordExercise({ exercise, detections, tempoPct = 100 }: ScoreChordExerciseParams): ScoringResult {
  const targets: ChordTarget[] = [...(exercise.chordTargets ?? [])].sort((a, b) => a.startBeat - b.startBeat);
  const msPerBeat = (60_000 / exercise.tempoBpm) * (100 / tempoPct);
  const tolerance = clamp(exercise.timingToleranceMs * Math.pow(tempoPct / 100, -0.5), 60, 400);
  const strums = [...detections].sort((a, b) => a.onsetMs - b.onsetMs);
  const used = new Set<number>();
  const firstBeat = targets[0]?.startBeat ?? 0;
  // The learner's first strum anchors the clock. If it is wildly away from the first beat we still use it:
  // pressing start late must not turn a good take into a miss.
  const origin = strums[0]?.onsetMs ?? 0;
  const results: ChordResult[] = [];
  const mistakes: ScoringMistake[] = [];
  const feedback = new Set<string>();
  let rightCount = 0;
  let timingHits = 0;
  let timingKnown = 0;

  for (const target of targets) {
    const due = origin + (target.startBeat - firstBeat) * msPerBeat;
    // Nearest unclaimed strum within half a beat of when this chord was due.
    let best = -1;
    let bestDistance = Infinity;
    strums.forEach((strum, index) => {
      if (used.has(index)) return;
      const distance = Math.abs(strum.onsetMs - due);
      if (distance <= msPerBeat * 0.5 && distance < bestDistance) { best = index; bestDistance = distance; }
    });
    const base = { targetId: target.id, symbol: target.symbol };
    const issue = (kind: ScoringMistake["issue"]) => mistakes.push({ noteId: null, expectedNote: null, performedNote: null, chordGroupId: target.id, issue: kind });
    if (best < 0) {
      results.push({ ...base, outcome: "no-strum", heard: null, timing: null });
      issue("no-strum");
      feedback.add(`No strum heard for ${target.symbol}. Strum all the strings together on the beat.`);
      continue;
    }
    used.add(best);
    const strum = strums[best]!;
    const delta = strum.onsetMs - due;
    const timing: ChordResult["timing"] = Math.abs(delta) <= tolerance ? "on-time" : delta < 0 ? "early" : "late";
    timingKnown++;
    if (timing === "on-time") timingHits++;
    else { issue(timing); feedback.add(timing === "early" ? "Some strums came before the beat. Wait for the click." : "Some strums came after the beat. Change chords sooner."); }
    if (detectionMatchesChord(strum, target.symbol)) {
      rightCount++;
      results.push({ ...base, outcome: "right", heard: strum.label, timing });
    } else {
      results.push({ ...base, outcome: "wrong-chord", heard: strum.label, timing });
      issue("wrong-chord");
      feedback.add(strum.label
        ? `${target.symbol} sounded like ${strum.label}. Check your fingers and that every string rings clearly.`
        : `${target.symbol} was not clear enough to recognise. Press each string firmly and let it ring.`);
    }
  }

  const total = targets.length;
  const chordAccuracy = total ? round((rightCount / total) * 100) : 0;
  const timingAccuracy = timingKnown ? round((timingHits / timingKnown) * 100) : 0;
  const score = total ? round(chordAccuracy * CHORD_WEIGHT + timingAccuracy * TIMING_WEIGHT) : 0;
  if (!feedback.size && total) feedback.add("Every chord rang true and landed on the beat.");
  return { score, noteAccuracy: chordAccuracy, timingAccuracy, rhythmAccuracy: timingAccuracy, chordAccuracy, feedback: [...feedback], mistakes, chordResults: results };
}
