import { DEFAULT_A4_HZ, frequencyToMidi, median, midiToFrequency, noteName } from "./pitch.js";

/**
 * Tuner display logic (spec section 5.1): median over ~5 frames, hysteresis on
 * the displayed note so the name does not flicker between neighbours near
 * ±50 cents, a short silence hold, and string matching for presets.
 */

export interface TunerInputFrame {
  /** Seconds. */
  time: number;
  frequency: number | null;
  levelDb: number;
  gated: boolean;
  /** Plain YIN aperiodicity (0 = perfectly periodic). */
  aperiodicity?: number;
}

export interface TunerReading {
  time: number;
  /** Smoothed frequency, Hz. */
  frequency: number;
  /** Displayed note (with hysteresis). */
  midi: number;
  name: string;
  /** Offset from the displayed note's target, cents. */
  cents: number;
  /** The recent frames agree closely (the needle has settled). */
  stable: boolean;
  levelDb: number;
}

export interface TunerSmootherOptions {
  a4?: number;
  /** Frames in the median (default 5). */
  medianFrames?: number;
  /** Extra cents beyond ±50 before the displayed note changes (default 15). */
  hysteresisCents?: number;
  /** Readings stop after this long without pitch (default 0.25 s). */
  silenceHoldS?: number;
  /** Frames with a higher YIN aperiodicity are ignored (default 0.35). */
  maxAperiodicity?: number;
  preferFlats?: boolean;
  /** Target offset per note, cents (e.g. a piano stretch curve); 0 = equal temperament. */
  targetOffsetCents?: (midi: number) => number;
}

/** Spread (max - min, cents) under which the reading counts as settled. */
const STABLE_SPREAD_CENTS = 3;

export class TunerSmoother {
  private readonly options: Required<Omit<TunerSmootherOptions, "targetOffsetCents">> & Pick<TunerSmootherOptions, "targetOffsetCents">;
  /** Recent pitches as fractional MIDI numbers. */
  private recent: number[] = [];
  private displayed: number | null = null;
  private lastVoiced = Number.NEGATIVE_INFINITY;
  private last: TunerReading | null = null;

  constructor(options: TunerSmootherOptions = {}) {
    this.options = {
      a4: DEFAULT_A4_HZ,
      medianFrames: 5,
      hysteresisCents: 15,
      silenceHoldS: 0.25,
      maxAperiodicity: 0.35,
      preferFlats: false,
      ...(Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as TunerSmootherOptions),
    };
  }

  setA4(a4: number): void {
    this.options.a4 = a4;
    this.recent = [];
    this.displayed = null;
  }

  get a4(): number {
    return this.options.a4;
  }

  /** The last reading (kept through short gaps; used by Hold). */
  get latest(): TunerReading | null {
    return this.last;
  }

  /** Feeds a frame; returns the current reading, or null when there is no pitch. */
  push(frame: TunerInputFrame): TunerReading | null {
    const o = this.options;
    const usable =
      !frame.gated && frame.frequency !== null && frame.frequency > 0 && (frame.aperiodicity ?? 0) <= o.maxAperiodicity;
    if (!usable) {
      if (frame.time - this.lastVoiced > o.silenceHoldS) {
        this.recent = [];
        this.displayed = null;
        this.last = null;
      }
      return this.last;
    }
    this.lastVoiced = frame.time;
    const exact = frequencyToMidi(frame.frequency!, o.a4);
    // A jump of more than a semitone from the running median starts over (a new note).
    if (this.recent.length > 0 && Math.abs(exact - median(this.recent)) > 1) this.recent = [];
    this.recent.push(exact);
    if (this.recent.length > o.medianFrames) this.recent.shift();
    const smoothed = median(this.recent);

    const offset = (midi: number) => (o.targetOffsetCents ? o.targetOffsetCents(midi) : 0) / 100;
    const nearest = Math.round(smoothed - offset(Math.round(smoothed)));
    if (this.displayed === null || Math.abs(smoothed - offset(this.displayed) - this.displayed) > 0.5 + o.hysteresisCents / 100) {
      this.displayed = nearest;
    }
    const midi = this.displayed;
    const cents = (smoothed - midi - offset(midi)) * 100;
    const spread = this.recent.length >= 3 ? (Math.max(...this.recent) - Math.min(...this.recent)) * 100 : Infinity;
    this.last = {
      time: frame.time,
      frequency: midiToFrequency(smoothed, o.a4),
      midi,
      name: noteName(midi, o.preferFlats),
      cents,
      stable: spread <= STABLE_SPREAD_CENTS,
      levelDb: frame.levelDb,
    };
    return this.last;
  }

  reset(): void {
    this.recent = [];
    this.displayed = null;
    this.last = null;
    this.lastVoiced = Number.NEGATIVE_INFINITY;
  }
}

export interface TunerString {
  label: string;
  midi: number;
}

export interface StringMatch {
  index: number;
  string: TunerString;
  /** Sounding target with capo applied. */
  targetMidi: number;
  targetFrequency: number;
  /** Offset from the target, cents. */
  cents: number;
}

/**
 * Nearest string of a tuning to a frequency (auto-detect), or the locked
 * string when `lockedIndex` is given. A capo raises every target by `capo` semitones.
 */
export function matchString(
  frequency: number,
  strings: readonly TunerString[],
  options: { a4?: number; capo?: number; lockedIndex?: number | null } = {},
): StringMatch | null {
  if (strings.length === 0 || !(frequency > 0)) return null;
  const a4 = options.a4 ?? DEFAULT_A4_HZ;
  const capo = options.capo ?? 0;
  const exact = frequencyToMidi(frequency, a4);
  let index = options.lockedIndex ?? -1;
  if (index < 0 || index >= strings.length) {
    index = 0;
    for (let i = 1; i < strings.length; i++) {
      if (Math.abs(exact - (strings[i]!.midi + capo)) < Math.abs(exact - (strings[index]!.midi + capo))) index = i;
    }
  }
  const string = strings[index]!;
  const targetMidi = string.midi + capo;
  return {
    index,
    string,
    targetMidi,
    targetFrequency: midiToFrequency(targetMidi, a4),
    cents: (exact - targetMidi) * 100,
  };
}
