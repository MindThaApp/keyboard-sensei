export interface SteadyPart {
  samples: Float32Array;
  /** Peak level of the capture, 0..1. */
  peak: number;
}

export type CaptureProblem = "too_quiet" | "clipped" | "too_short";

export interface CaptureResult {
  part: SteadyPart | null;
  problem: CaptureProblem | null;
}

export const STEADY_SECONDS = 1.5;
const MIN_SECONDS = 0.8;
const SKIP_AFTER_ATTACK = 0.3;
const QUIET_PEAK = 0.003; // about -50 dBFS
const CLIP_PEAK = 0.99;

/** Find the attack, skip its transient, and return up to ~1.5 s of the ringing tone. */
export function pickSteadyPart(x: Float32Array, sampleRate: number): CaptureResult {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < QUIET_PEAK) return { part: null, problem: "too_quiet" };
  if (peak >= CLIP_PEAK) {
    let hot = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= CLIP_PEAK) hot++;
    if (hot >= 3) return { part: null, problem: "clipped" };
  }
  const frame = Math.max(1, Math.round(sampleRate * 0.02));
  let maxRms = 0;
  let maxIdx = 0;
  const rms: number[] = [];
  for (let s = 0, f = 0; s + frame <= x.length; s += frame, f++) {
    let e = 0;
    for (let i = 0; i < frame; i++) e += x[s + i] * x[s + i];
    const r = Math.sqrt(e / frame);
    rms.push(r);
    if (r > maxRms) { maxRms = r; maxIdx = f; }
  }
  const attack = maxIdx * frame;
  const start = attack + Math.round(sampleRate * SKIP_AFTER_ATTACK);
  const end = Math.min(x.length, start + Math.round(sampleRate * STEADY_SECONDS));
  if (end - start < sampleRate * MIN_SECONDS) return { part: null, problem: "too_short" };
  return { part: { samples: x.slice(start, end), peak }, problem: null };
}
