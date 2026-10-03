import { playClick, type MetronomeSound } from "./clickTimbres";
import { addScheduleSource, contextTimeAt, getAudioContext, traceScheduled } from "../audio/audioEngine";

// Timbres live in clickTimbres.ts so the Play-Along grid-driven scheduler can
// emit identical sounds without inheriting this class's fixed-BPM clock.
export { METRONOME_SOUNDS, type MetronomeSound } from "./clickTimbres";

export interface MetronomeStartOptions {
  bpm: number;
  beatsPerBar?: number;
  /** Number of count-in beats to click before onGo fires (0 = start immediately). */
  countInBeats?: number;
  /** Which synthesized click timbre to use. Default "click". */
  sound?: MetronomeSound;
  /** 0–1 output gain multiplier. Default 0.7. */
  volume?: number;
  /** Fired near each beat: index within the bar (0-based) and whether it's still count-in. */
  onBeat?: (beatInBar: number, isCountIn: boolean) => void;
  /**
   * Fired when the count-in finishes and recording should begin. `downbeatMs` is
   * the performance.now() time the first recorded downbeat is SCHEDULED to sound —
   * exact, unlike the moment this callback happens to run — so a recording
   * clock can start from it.
   */
  onGo?: (downbeatMs: number) => void;
}

const FIRST_BEAT_DELAY_MS = 100;

/**
 * Fixed-tempo metronome for the count-in before an exercise and the optional
 * pulse while recording. Clicks are scheduled through the shared lookahead
 * scheduler at exact times; beat callbacks are UI-only and fire when each beat
 * is reached.
 */
export class Metronome {
  private removeSource: (() => void) | null = null;
  private callbackTimers = new Set<ReturnType<typeof setTimeout>>();

  get running(): boolean {
    return this.removeSource !== null;
  }

  start(options: MetronomeStartOptions): void {
    this.stop();
    getAudioContext();
    const { beatsPerBar = 4, countInBeats = 0, sound = "click", volume = 0.7, onBeat, onGo } = options;
    const msPerBeat = 60_000 / options.bpm;
    const firstBeatMs = performance.now() + FIRST_BEAT_DELAY_MS;
    let beat = 0;

    this.removeSource = addScheduleSource((nowMs, horizonMs) => {
      while (firstBeatMs + beat * msPerBeat <= nowMs + horizonMs) {
        const beatIndex = beat;
        const atMs = firstBeatMs + beatIndex * msPerBeat;
        const isCountIn = beatIndex < countInBeats;
        const beatInBar = isCountIn ? beatIndex % beatsPerBar : (beatIndex - countInBeats) % beatsPerBar;
        const when = contextTimeAt(atMs);
        traceScheduled("metronome", atMs, when);
        playClick(getAudioContext(), when, beatInBar === 0, volume, sound);

        const timer = setTimeout(() => {
          this.callbackTimers.delete(timer);
          if (!this.running) return;
          if (beatIndex === countInBeats) onGo?.(atMs); // recording starts on this downbeat
          onBeat?.(beatInBar, isCountIn);
        }, Math.max(0, atMs - performance.now()));
        this.callbackTimers.add(timer);
        beat += 1;
      }
    });
  }

  stop(): void {
    this.removeSource?.();
    this.removeSource = null;
    for (const timer of this.callbackTimers) clearTimeout(timer);
    this.callbackTimers.clear();
  }
}

export const metronome = new Metronome();
