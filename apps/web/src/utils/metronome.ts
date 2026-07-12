import { playClick, type MetronomeSound } from "./clickTimbres";
import { registerAudioContext } from "./audioUnlock";

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
  /** Fired when the count-in finishes and recording should begin. */
  onGo?: () => void;
}

/**
 * Web Audio metronome with a lookahead scheduler (clicks are sample-accurate
 * even though JS timers aren't). Beat 1 of each bar is accented. Used for the
 * count-in before an exercise and the optional pulse while recording.
 */
export class Metronome {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextBeatTime = 0;
  private beatCount = 0;
  private options: Required<Pick<MetronomeStartOptions, "bpm" | "beatsPerBar" | "countInBeats" | "sound" | "volume">> &
    MetronomeStartOptions = {
    bpm: 80,
    beatsPerBar: 4,
    countInBeats: 0,
    sound: "click",
    volume: 0.7,
  };

  get running(): boolean {
    return this.timer !== null;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      registerAudioContext(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private click(time: number, accented: boolean): void {
    playClick(this.ctx!, time, accented, this.options.volume, this.options.sound);
  }

  start(options: MetronomeStartOptions): void {
    this.stop();
    const ctx = this.ensureContext();
    this.options = { beatsPerBar: 4, countInBeats: 0, sound: "click", volume: 0.7, ...options };
    this.beatCount = 0;
    this.nextBeatTime = ctx.currentTime + 0.1;

    const secondsPerBeat = 60 / this.options.bpm;
    const lookaheadSeconds = 0.12;

    const schedule = () => {
      while (this.nextBeatTime < ctx.currentTime + lookaheadSeconds) {
        const beat = this.beatCount;
        const { beatsPerBar, countInBeats, onBeat, onGo } = this.options;
        const isCountIn = beat < countInBeats;
        const beatInBar = isCountIn ? beat % beatsPerBar : (beat - countInBeats) % beatsPerBar;
        this.click(this.nextBeatTime, beatInBar === 0);

        const delayMs = Math.max(0, (this.nextBeatTime - ctx.currentTime) * 1000);
        window.setTimeout(() => {
          if (!this.running) return;
          if (beat === countInBeats) onGo?.(); // first beat after the count-in — recording starts on this downbeat
          onBeat?.(beatInBar, isCountIn);
        }, delayMs);

        this.nextBeatTime += secondsPerBeat;
        this.beatCount += 1;
      }
    };

    schedule();
    this.timer = window.setInterval(schedule, 25);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const metronome = new Metronome();
