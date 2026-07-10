export interface MetronomeStartOptions {
  bpm: number;
  beatsPerBar?: number;
  /** Number of count-in beats to click before onGo fires (0 = start immediately). */
  countInBeats?: number;
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
  private options: Required<Pick<MetronomeStartOptions, "bpm" | "beatsPerBar" | "countInBeats">> & MetronomeStartOptions = {
    bpm: 80,
    beatsPerBar: 4,
    countInBeats: 0,
  };

  get running(): boolean {
    return this.timer !== null;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private click(time: number, accented: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accented ? 1568 : 1047; // G6 / C6 — woodblock-ish
    const peak = accented ? 0.24 : 0.14;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  start(options: MetronomeStartOptions): void {
    this.stop();
    const ctx = this.ensureContext();
    this.options = { beatsPerBar: 4, countInBeats: 0, ...options };
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
