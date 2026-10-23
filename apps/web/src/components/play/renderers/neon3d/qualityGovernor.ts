/**
 * Automatic quality tiers for the Neon 3D style (spec §3.12), chosen by measured frame
 * cost, never by user agent. Pure logic: the renderer feeds it one sample per frame and
 * applies whatever tier it returns.
 *
 * "minimal" stands in for the spec's "fall back to Neon 2D" row: blocks only, no bloom,
 * particles or reflection, at a reduced pixel ratio. It is the cheapest thing this style
 * can draw while still being itself; a host that has Neon 2D can swap to it when the
 * governor reports `minimal`.
 */

export type QualityTier = "ultra" | "high" | "medium" | "minimal";

export interface TierSettings {
  /** Upper bound on the device pixel ratio used for the drawing buffer. */
  dprCap: number;
  /** Bloom resolution as a fraction of the drawing buffer (0 = no bloom). */
  bloomScale: number;
  bloomMips: number;
  /** Particle pool size (0 = no particles). */
  particles: number;
  reflection: boolean;
}

export const TIERS: Record<QualityTier, TierSettings> = {
  ultra: { dprCap: 2, bloomScale: 0.5, bloomMips: 5, particles: 6000, reflection: true },
  high: { dprCap: 1.5, bloomScale: 0.5, bloomMips: 4, particles: 3000, reflection: true },
  medium: { dprCap: 1, bloomScale: 0.25, bloomMips: 3, particles: 1200, reflection: false },
  minimal: { dprCap: 0.75, bloomScale: 0, bloomMips: 0, particles: 0, reflection: false },
};

/** Best first. */
export const TIER_ORDER: readonly QualityTier[] = ["ultra", "high", "medium", "minimal"];

/** p95 frame cost (ms) above which a tier steps down. */
const DOWN_ABOVE_MS: Record<QualityTier, number> = { ultra: 12, high: 14, medium: 20, minimal: Infinity };
/** p95 frame cost (ms) below which the tier above may be tried. Well under that tier's own
 *  step-down threshold, so a tier change cannot flap. */
const UP_BELOW_MS: Record<QualityTier, number> = { ultra: 9, high: 9, medium: 12, minimal: 0 };

export const WINDOW_FRAMES = 120;
export const STEP_DOWN_AFTER_MS = 2_000;
export const STEP_UP_AFTER_MS = 10_000;
export const MIN_CHANGE_GAP_MS = 10_000;
export const STARTUP_GRACE_MS = 5_000;

export interface GovernorSample {
  /** What this frame cost, ms. */
  costMs: number;
  nowMs: number;
  /** Only playback counts: previews and pauses neither measure nor change anything. */
  playing: boolean;
  /** A burst is on screen: a change waits until it has finished. */
  bursting: boolean;
}

export class QualityGovernor {
  private tierValue: QualityTier;
  private readonly samples = new Float32Array(WINDOW_FRAMES);
  private readonly sorted = new Float32Array(WINDOW_FRAMES);
  private count = 0;
  private cursor = 0;
  private overSinceMs: number | null = null;
  private underSinceMs: number | null = null;
  private lastChangeMs: number;

  constructor(initial: QualityTier = "high", nowMs = 0) {
    this.tierValue = initial;
    // Nothing changes in the first few seconds, so start-up frames (shader compiles,
    // first uploads, the song's audio decoding) cannot knock the tier down.
    this.lastChangeMs = nowMs - MIN_CHANGE_GAP_MS + STARTUP_GRACE_MS;
  }

  get tier(): QualityTier {
    return this.tierValue;
  }

  /** The p95 of the current window, or null until the window is full. */
  p95(): number | null {
    return this.percentile(0.95);
  }

  percentile(p: number): number | null {
    if (this.count < WINDOW_FRAMES) return null;
    this.sorted.set(this.samples);
    this.sorted.sort();
    return this.sorted[Math.min(WINDOW_FRAMES - 1, Math.floor(p * WINDOW_FRAMES))]!;
  }

  /** Feed one frame. Returns the new tier when it changes, otherwise null. */
  sample({ costMs, nowMs, playing, bursting }: GovernorSample): QualityTier | null {
    if (!playing) {
      this.overSinceMs = null;
      this.underSinceMs = null;
      return null;
    }
    this.samples[this.cursor] = costMs;
    this.cursor = (this.cursor + 1) % WINDOW_FRAMES;
    if (this.count < WINDOW_FRAMES) this.count++;
    const p95 = this.p95();
    if (p95 === null) return null;

    const index = TIER_ORDER.indexOf(this.tierValue);
    const lower = TIER_ORDER[index + 1];
    const upper = index > 0 ? TIER_ORDER[index - 1] : undefined;

    if (lower && p95 > DOWN_ABOVE_MS[this.tierValue]) {
      this.underSinceMs = null;
      this.overSinceMs ??= nowMs;
      if (nowMs - this.overSinceMs >= STEP_DOWN_AFTER_MS) return this.change(lower, nowMs, bursting);
      return null;
    }
    this.overSinceMs = null;

    if (upper && p95 < UP_BELOW_MS[upper]) {
      this.underSinceMs ??= nowMs;
      if (nowMs - this.underSinceMs >= STEP_UP_AFTER_MS) return this.change(upper, nowMs, bursting);
      return null;
    }
    this.underSinceMs = null;
    return null;
  }

  /** Forget the window, e.g. after the drawing buffer was resized. */
  clear(): void {
    this.count = 0;
    this.cursor = 0;
    this.overSinceMs = null;
    this.underSinceMs = null;
  }

  private change(next: QualityTier, nowMs: number, bursting: boolean): QualityTier | null {
    if (bursting || nowMs - this.lastChangeMs < MIN_CHANGE_GAP_MS) return null;
    this.tierValue = next;
    this.lastChangeMs = nowMs;
    // The old tier's frame costs say nothing about the new one.
    this.clear();
    return next;
  }
}
