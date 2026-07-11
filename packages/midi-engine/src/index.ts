export * from "./adapters.js";
export * from "./config.js";
export * from "./pairing.js";
export * from "./scoring.js";
import type { MidiExercise, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents } from "./pairing.js";
import { scoreMidiExercise } from "./scoring.js";

export function scoreRawMidiEvents(params: { exercise: MidiExercise; rawEvents: RawMidiEvent[]; durationTolerancePercent?: number }) {
  return scoreMidiExercise({ exercise: params.exercise, performedNotes: pairRawMidiEvents(params.rawEvents), ...(params.durationTolerancePercent === undefined ? {} : { durationTolerancePercent: params.durationTolerancePercent }) });
}
export * from "./playalong.js";
