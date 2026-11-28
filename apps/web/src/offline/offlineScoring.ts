import type { ExerciseAttemptPayload, PerformedNote, ScoringResult } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents, scoreExercise } from "@keyboard-sensei/midi-engine";
import { cachedExercise } from "./offlineContent";

/**
 * Scores an attempt on the device with the same scorer the server uses, from
 * cached content (mic notes get the server's intonation scoring too). The server re-scores the replay, and its result is the one
 * stored; this one is only shown while offline. Null when the exercise was never
 * cached.
 */
export async function scoreAttemptOffline(scope: string, exerciseId: string, payload: ExerciseAttemptPayload): Promise<ScoringResult | null> {
  const exercise = await cachedExercise(scope, exerciseId);
  if (!exercise) return null;
  const performedNotes: PerformedNote[] = payload.performedNotes ?? pairRawMidiEvents(payload.rawEvents ?? []);
  return scoreExercise({ exercise, performedNotes, tempoPct: payload.tempoPct });
}
