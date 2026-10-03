/**
 * Maps performance.now() milliseconds to AudioContext seconds.
 *
 * The two are different clocks, and AudioContext.currentTime only advances in
 * whole audio-callback blocks (a few to ~20ms), so a single `currentTime - now`
 * reading is a sawtooth that is only exact just after a block boundary. The true
 * offset is the TOP of that sawtooth, so the estimate is the maximum reading over
 * the last half second. A sliding window (rather than an all-time maximum) follows the
 * offset as it moves — the clocks drift apart slowly, and quickly for the first
 * moments after a context starts — and a reading far below the estimate (the
 * context was suspended and resumed) discards the window outright.
 */
export class ClockMap {
  static readonly WINDOW_MS = 500;
  /** A reading this far below the estimate is a discontinuity, not jitter. */
  static readonly RESET_S = 0.05;

  private readings: { perfMs: number; offsetS: number }[] = [];
  private offsetS: number | null = null;

  sample(contextTimeS: number, perfMs: number): void {
    const reading = contextTimeS - perfMs / 1000;
    if (this.offsetS !== null && reading < this.offsetS - ClockMap.RESET_S) this.readings = [];
    // Monotonic deque: drop older readings that can never be the maximum again.
    while (this.readings.length > 0 && this.readings[this.readings.length - 1]!.offsetS <= reading) this.readings.pop();
    this.readings.push({ perfMs, offsetS: reading });
    while (this.readings.length > 1 && this.readings[0]!.perfMs < perfMs - ClockMap.WINDOW_MS) this.readings.shift();
    this.offsetS = this.readings[0]!.offsetS;
  }

  toContextTime(perfMs: number): number {
    return (this.offsetS ?? 0) + perfMs / 1000;
  }

  toPerfMs(contextTimeS: number): number {
    return (contextTimeS - (this.offsetS ?? 0)) * 1000;
  }
}
