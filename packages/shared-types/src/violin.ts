/** Violin strings, low to high. */
export type ViolinString = "G" | "D" | "A" | "E";
/** 0 = open string, 1-4 = fingers. */
export type ViolinFinger = 0 | 1 | 2 | 3 | 4;
export type ViolinBow = "down" | "up";
/**
 * Fingering for one expected note, keyed by `ExpectedNoteEvent.id` in
 * `MidiExercise.techniqueHints`. Feeds notation and the fingerboard view;
 * it is not graded in v1.
 */
export interface ViolinHint {
  string: ViolinString;
  finger: ViolinFinger;
  /** 1-7. */
  position: number;
  bow?: ViolinBow;
  /** Draws a slur from the "start" note to the "end" note (same bar). Slurred notes share one bow. */
  slur?: "start" | "end";
}
