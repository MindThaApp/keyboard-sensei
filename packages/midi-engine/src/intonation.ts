import { lessonInstrument, type ExpectedNoteEvent, type IntonationResult, type MidiExercise, type PerformedNote, type PlayedInstrument, type ScoringMistake, type ScoringResult } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { resolveScoreWeights, VIOLIN_SCORE_WEIGHTS } from "./config.js";
import { scoreMidiExercise, type ScoreMidiExerciseParams } from "./scoring.js";

/**
 * Mic grading on top of the MIDI scorer (docs/specs/MUSIC-PORTAL.md 3.4 and 4).
 *
 * A mic attempt is a PerformedNote[] like any other, so scoreMidiExercise grades
 * pitch, timing and rhythm unchanged. scoreExercise adds what only a mic note has:
 * relaxed durations (plucked notes decay, bowed notes are often detached), a wider
 * timing floor for input-latency jitter, and an intonation block for instruments
 * whose pitch the player controls. The API and the client both call scoreExercise,
 * so the server re-score and the on-device grade always agree.
 */

/** Duration tolerance used for mic attempts when the exercise asks for less. */
export const MIC_DURATION_TOLERANCE_PERCENT = 60;
/** Timing tolerance floor for mic attempts: below this, input latency jitter decides the grade. */
export const MIC_MIN_TIMING_TOLERANCE_MS = 120;
/** Default intonation tolerance per instrument when the exercise sets none. */
export const DEFAULT_INTONATION_TOLERANCE_CENTS: Readonly<Record<"guitar" | "violin", number>> = { guitar: 25, violin: 30 };
/** Beyond this a note is nearer the next semitone; the per-note intonation score reaches 0 here. */
const SEMITONE_EDGE_CENTS = 50;

export const isMicAttempt = (notes: readonly PerformedNote[]): boolean => notes.some((note) => note.source === "mic");

/** The instrument an exercise is for (absent = piano), by the same rule as lessons. */
export const exerciseInstrument = (exercise: MidiExercise): PlayedInstrument => lessonInstrument(exercise);

/** Whether this instrument's pitch is the player's to control (and so graded for intonation). Pianos are tuned, not played in tune. */
export const gradesIntonation = (instrument: PlayedInstrument): instrument is "guitar" | "violin" => instrument !== "piano";

export interface IntonationMatch { expected: ExpectedNoteEvent; performed: PerformedNote }

const round = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

/** 100 inside the tolerance, falling linearly to 0 at a quarter-tone (50 cents) off. */
export function noteIntonationScore(absCents: number, toleranceCents: number): number {
  if (absCents <= toleranceCents) return 100;
  const span = Math.max(1, SEMITONE_EDGE_CENTS - toleranceCents);
  return round(100 * (1 - (absCents - toleranceCents) / span));
}

function intonationFeedback(instrument: "guitar" | "violin", note: number, cents: number): string {
  const name = midiNoteToName(note);
  const amount = Math.round(Math.abs(cents));
  if (instrument === "violin") {
    return cents > 0
      ? `Your ${name} was ${amount} cents sharp - bring your finger a little lower (towards the scroll).`
      : `Your ${name} was ${amount} cents flat - bring your finger a little higher (towards the bridge).`;
  }
  return cents > 0
    ? `Your ${name} was ${amount} cents sharp - press just behind the fret without pushing the string sideways.`
    : `Your ${name} was ${amount} cents flat - check the string is in tune with the tuner.`;
}

/**
 * Intonation of the pitch-correct notes that carry a cents reading. Adds the
 * `intonation` block and a `sharp` / `flat` mistake for every note outside the
 * tolerance. Never changes which notes count as right: a sharp F# is still an F#.
 */
export function scoreIntonation(
  exercise: MidiExercise,
  matches: readonly IntonationMatch[],
  result: ScoringResult,
): ScoringResult {
  const instrument = exerciseInstrument(exercise);
  if (!gradesIntonation(instrument)) return result;
  const toleranceCents = exercise.intonationToleranceCents ?? DEFAULT_INTONATION_TOLERANCE_CENTS[instrument];
  const measured = matches.filter((match) => typeof match.performed.centsOffset === "number" && Number.isFinite(match.performed.centsOffset));
  if (measured.length === 0) return result;

  const mistakes: ScoringMistake[] = [...result.mistakes];
  const feedback = [...result.feedback];
  let within = 0;
  let absSum = 0;
  let scoreSum = 0;
  // Worst first, so the feedback leads with the note most worth fixing.
  const ordered = [...measured].sort((a, b) => Math.abs(b.performed.centsOffset!) - Math.abs(a.performed.centsOffset!));
  let feedbackLines = 0;
  for (const { expected, performed } of ordered) {
    const cents = performed.centsOffset!;
    const abs = Math.abs(cents);
    absSum += abs;
    scoreSum += noteIntonationScore(abs, toleranceCents);
    if (abs <= toleranceCents) { within++; continue }
    mistakes.push({ noteId: expected.id, expectedNote: expected.note, performedNote: performed.note, chordGroupId: expected.chordGroupId, issue: cents > 0 ? "sharp" : "flat" });
    // A few concrete lines help; one per note on a long scale would bury the rest.
    if (feedbackLines < 3) { feedback.push(intonationFeedback(instrument, expected.note, cents)); feedbackLines++ }
  }
  const intonation: IntonationResult = {
    meanAbsCents: Math.round((absSum / measured.length) * 10) / 10,
    withinTolerancePct: round((within / measured.length) * 100),
    toleranceCents,
    measuredNotes: measured.length,
    score: round(scoreSum / measured.length),
  };
  // The MIDI scorer's all-clear line is no longer true if notes were out of tune.
  const cleaned = within < measured.length ? feedback.filter((line) => line !== "Excellent accuracy and timing." && line !== "Every note found — well done.") : feedback;
  return { ...result, mistakes, feedback: cleaned, intonation };
}

/** Blends intonation into the overall score with the violin weights (3.4); other instruments keep their score. */
function blendIntonation(exercise: MidiExercise, result: ScoringResult): ScoringResult {
  if (!result.intonation || exerciseInstrument(exercise) !== "violin") return result;
  const intonationScore = result.intonation.score;
  if (exercise.scoring === "untimed") {
    return { ...result, score: round(result.noteAccuracy * 0.7 + intonationScore * 0.3) };
  }
  const weights = resolveScoreWeights(VIOLIN_SCORE_WEIGHTS);
  const score = round(
    result.noteAccuracy * weights.noteAccuracy +
      result.timingAccuracy * weights.timingAccuracy +
      result.rhythmAccuracy * weights.rhythmAccuracy +
      result.chordAccuracy * weights.chordAccuracy +
      intonationScore * (weights.intonation ?? 0),
  );
  return { ...result, score };
}

/**
 * The one scoring entry point for lesson and practice attempts (client and API).
 * MIDI attempts are scored exactly as scoreMidiExercise scores them; attempts whose
 * notes came from the mic get the mic adjustments described above.
 */
export function scoreExercise(params: Omit<ScoreMidiExerciseParams, "ignoreHeldTooLong" | "onPitchMatch">): ScoringResult {
  if (!isMicAttempt(params.performedNotes)) return scoreMidiExercise(params);
  const { exercise } = params;
  const instrument = exerciseInstrument(exercise);
  const micExercise: MidiExercise = {
    ...exercise,
    timingToleranceMs: Math.max(exercise.timingToleranceMs, MIC_MIN_TIMING_TOLERANCE_MS),
    // Mic velocity is a level estimate, not a key velocity: dynamics opt-ins stay MIDI-only.
    dynamics: undefined,
  };
  const matches: IntonationMatch[] = [];
  const base = scoreMidiExercise({
    ...params,
    exercise: micExercise,
    durationTolerancePercent: Math.max(params.durationTolerancePercent ?? exercise.durationTolerancePercent, MIC_DURATION_TOLERANCE_PERCENT),
    // Plucked and struck notes ring on (or are damped late); "held too long" is noise there.
    ignoreHeldTooLong: instrument === "guitar" || instrument === "piano",
    onPitchMatch: (expected, performed) => matches.push({ expected, performed }),
  });
  return blendIntonation(exercise, scoreIntonation(exercise, matches, base));
}
