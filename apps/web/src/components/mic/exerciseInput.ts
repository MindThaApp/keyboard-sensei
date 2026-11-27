import type { MidiExercise, PerformedNote } from "@keyboard-sensei/shared-types";
import type { MicProfileId } from "../../audio/mic/micCapture";

/**
 * Which inputs an exercise can be played with (docs/specs/MUSIC-PORTAL.md 2.2, 4.6).
 * Mic grading is monophonic: piano mic mode grades single-line exercises only;
 * chords and two-hand pieces stay MIDI-only. Chord exercises ("mic-chord") are
 * graded by the chord recogniser, not here.
 */

export type ExerciseInputMode = "midi" | "mic";

export interface MicEligibility {
  /** The mic can grade this exercise. */
  mic: boolean;
  /** A MIDI keyboard (or the on-screen piano) can play it. */
  midi: boolean;
  /** The input the player starts in. */
  preferred: ExerciseInputMode;
  profile: MicProfileId;
}

/** True when no two expected notes sound at once (a chord group or an overlap). */
export function isSingleLine(exercise: MidiExercise): boolean {
  if (exercise.expected.some((n) => n.chordGroupId !== null)) return false;
  const sorted = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1]!;
    // A tiny tolerance for legato authoring rounding.
    if (sorted[i]!.startBeat < previous.startBeat + previous.durationBeats - 1e-6) return false;
  }
  return true;
}

export function micEligibility(exercise: MidiExercise): MicEligibility {
  const instrument = exercise.instrument ?? "piano";
  const input = exercise.input ?? "midi";
  const profile: MicProfileId = instrument;
  const singleLine = isSingleLine(exercise);
  if (input === "mic-chord") return { mic: false, midi: false, preferred: "mic", profile };
  if (instrument !== "piano") return { mic: singleLine, midi: false, preferred: "mic", profile };
  // Piano: MIDI as today; the mic is an option for acoustic pianos on single lines.
  return { mic: singleLine, midi: true, preferred: input === "mic-mono" && singleLine ? "mic" : "midi", profile };
}

export interface PauseSpan { fromMs: number; toMs: number }

/**
 * Puts mic notes (performance.now() clock, input latency already removed) on the
 * attempt's performance timeline, exactly as MIDI events are: output latency
 * subtracted, time spent paused folded out, notes played while paused dropped.
 */
export function micNotesOnTimeline(notes: readonly PerformedNote[], startMs: number, pauses: readonly PauseSpan[], outputLatencyMs: number): PerformedNote[] {
  const toElapsed = (raw: number): number | null => {
    const t = raw - outputLatencyMs;
    let paused = 0;
    for (const span of pauses) {
      if (t >= span.toMs) paused += span.toMs - span.fromMs;
      else if (t > span.fromMs) return null;
    }
    return t - startMs - paused;
  };
  const out: PerformedNote[] = [];
  for (const note of notes) {
    const start = toElapsed(note.startTimestampMs);
    // Sounds well before the downbeat (tuning up, the count-in) are not part of the attempt.
    if (start === null || start < -300) continue;
    const endRaw = note.endTimestampMs === null ? null : toElapsed(note.endTimestampMs);
    const end = endRaw ?? (note.durationMs === null ? null : start + note.durationMs);
    out.push({ ...note, startTimestampMs: Math.max(0, start), endTimestampMs: end === null ? null : Math.max(0, end), durationMs: end === null ? null : Math.max(0, end - Math.max(0, start)) });
  }
  return out;
}
