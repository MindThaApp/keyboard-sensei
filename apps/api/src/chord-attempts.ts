import { z } from "zod";
import { scoreChordExercise } from "@keyboard-sensei/midi-engine";
import type { ChordDetection, MidiExercise, PerformedNote, ScoringResult } from "@keyboard-sensei/shared-types";
import { parseChordSymbol } from "@keyboard-sensei/music-theory";

/**
 * Strum attempts (mic-chord exercises) send what the device heard as chord labels, never audio:
 * one detection per strum with its onset time, the chord it sounded like and how sure it was.
 * The server re-scores them with the same scorer the client uses.
 */
const label = z.string().max(12).refine((value) => parseChordSymbol(value) !== null, "Unknown chord label");
export const chordDetectionSchema = z.object({
  onsetMs: z.number().nonnegative(),
  label: label.nullable(),
  confidence: z.number().min(0).max(1),
  runnerUp: z.object({ label, confidence: z.number().min(0).max(1) }).nullable().optional(),
});
export const chordDetectionsSchema = z.array(chordDetectionSchema).max(512);

export const isChordExercise = (exercise: MidiExercise): boolean => exercise.input === "mic-chord";

export function scoreChordAttempt(exercise: MidiExercise, detections: ChordDetection[], tempoPct?: number): ScoringResult {
  return scoreChordExercise({ exercise, detections, ...(tempoPct !== undefined ? { tempoPct } : {}) });
}

/**
 * Detections as note-shaped rows, so the stored attempt, the practice-time calculation and history
 * keep working unchanged. `note` is the chord root in the octave above middle C.
 */
export function detectionsAsPerformedNotes(detections: ChordDetection[]): PerformedNote[] {
  return detections.map((detection) => {
    const root = detection.label ? parseChordSymbol(detection.label)?.root ?? 0 : 0;
    return { note: 60 + root, velocity: Math.round(detection.confidence * 127), startTimestampMs: detection.onsetMs, endTimestampMs: detection.onsetMs + 250, durationMs: 250 };
  });
}
