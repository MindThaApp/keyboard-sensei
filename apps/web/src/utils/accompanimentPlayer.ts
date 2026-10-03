import { playSequence } from "../audio/noteSequence";

export interface AccompanimentNote {
  midi: number;
  /** Seconds relative to the excerpt start, AT WRITTEN (excerpt) TEMPO. */
  startS: number;
  durationS: number;
}

/**
 * Plays a song excerpt's "other hand" while the learner practises one hand
 * on MidiExercise, in sync with MidiExercise's own recording clock and its
 * BPM slider.
 *
 * Notes go through the shared lookahead scheduler, so each one starts at its
 * exact time (it used to fire from an animation frame, up to a frame late, and
 * fell silent in a background tab). The scheduler only looks ~100ms ahead and
 * re-reads the clock every tick, so it cannot drift from the exercise clock.
 */
export class AccompanimentPlayer {
  private stopSequence: (() => void) | null = null;

  /**
   * @param notes        accompaniment notes, seconds relative to excerpt start, at written tempo
   * @param startTimeMs  the performance.now() time the excerpt's 0s corresponds to
   * @param rate         practice tempo / written tempo — note times are scaled by it
   * @param enabled      re-checked every scheduler tick, so the on/off toggle takes effect immediately
   */
  start(notes: readonly AccompanimentNote[], startTimeMs: number, rate: number, enabled: () => boolean): void {
    this.stop();
    this.stopSequence = playSequence(notes, { startAtMs: startTimeMs, rate, velocity: 78, enabled });
  }

  /** Silence everything sounding or scheduled. Safe to call repeatedly. */
  stop(): void {
    this.stopSequence?.();
    this.stopSequence = null;
  }
}
