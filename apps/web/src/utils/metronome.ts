export type MetronomeSound = "click" | "wood" | "beep" | "cowbell";

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
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private click(time: number, accented: boolean): void {
    const ctx = this.ctx!;
    const volume = this.options.volume;
    switch (this.options.sound) {
      case "wood":
        this.clickWood(ctx, time, accented, volume);
        return;
      case "beep":
        this.clickBeep(ctx, time, accented, volume);
        return;
      case "cowbell":
        this.clickCowbell(ctx, time, accented, volume);
        return;
      default:
        this.clickDefault(ctx, time, accented, volume);
    }
  }

  private clickDefault(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accented ? 1568 : 1047; // G6 / C6 — woodblock-ish
    const peak = (accented ? 0.24 : 0.14) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  private clickWood(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const bufferSize = Math.floor(ctx.sampleRate * 0.03);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = accented ? 1400 : 900;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    const peak = (accented ? 0.9 : 0.6) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  private clickBeep(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = accented ? 1200 : 800;
    const peak = (accented ? 0.22 : 0.13) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  private clickCowbell(ctx: AudioContext, time: number, accented: boolean, volume: number): void {
    const gain = ctx.createGain();
    const peak = (accented ? 0.2 : 0.12) * volume;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    gain.connect(ctx.destination);
    for (const freq of [800, 540]) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.3);
    }
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
