import { pianoSynth } from "./synth";

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
 * Same hazard as PlayAlongMetronome (see that file's comment): never
 * pre-schedule a batch of notes into Web Audio ahead of time, and never run a
 * free-running setTimeout/setInterval chain — both drift against the
 * exercise's `performance.now()`-based clock. Instead this re-reads elapsed
 * wall time every animation frame and fires only notes whose time has
 * arrived, exactly like PlayAlongMetronome.tick().
 */
export class AccompanimentPlayer {
  private cursor = 0;
  private sounding = new Map<number, number>(); // note index -> midi
  private rafId = 0;
  private notes: AccompanimentNote[] = [];

  /**
   * @param notes        accompaniment notes, seconds relative to excerpt start, at written tempo
   * @param startTimeMs  the SAME performance.now() basis MidiExercise started recording at
   * @param rate         practice tempo / written tempo (MidiExercise's tempoPct / 100) — scales
   *                     note times so the accompaniment slows/speeds up exactly like the exercise
   *                     itself does when the BPM slider moves
   * @param enabled      re-checked every frame, so the on/off toggle takes effect immediately
   */
  start(notes: readonly AccompanimentNote[], startTimeMs: number, rate: number, enabled: () => boolean): void {
    this.stop();
    const safeRate = rate > 0 ? rate : 1;
    this.notes = [...notes]
      .map((note) => ({ midi: note.midi, startS: note.startS / safeRate, durationS: note.durationS / safeRate }))
      .sort((a, b) => a.startS - b.startS);
    this.cursor = 0;

    const tick = () => {
      if (enabled()) {
        const elapsedS = (performance.now() - startTimeMs) / 1000;
        while (this.cursor < this.notes.length && this.notes[this.cursor]!.startS <= elapsedS) {
          const note = this.notes[this.cursor]!;
          pianoSynth.playNote(note.midi, 78);
          this.sounding.set(this.cursor, note.midi);
          this.cursor += 1;
        }
        for (const [index, midi] of this.sounding) {
          if (elapsedS >= this.notes[index]!.startS + this.notes[index]!.durationS) {
            pianoSynth.stopNote(midi);
            this.sounding.delete(index);
          }
        }
      } else if (this.sounding.size > 0) {
        // Toggled off mid-note: cut it rather than let it ring forever.
        for (const midi of this.sounding.values()) pianoSynth.stopNote(midi);
        this.sounding.clear();
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop the loop and silence any notes currently sounding. Safe to call repeatedly. */
  stop(): void {
    cancelAnimationFrame(this.rafId);
    for (const midi of this.sounding.values()) pianoSynth.stopNote(midi, true);
    this.sounding.clear();
    this.cursor = 0;
    this.notes = [];
  }
}
