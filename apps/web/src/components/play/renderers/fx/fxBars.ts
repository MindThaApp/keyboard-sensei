/**
 * Where FX note bars start and stop. Pure maths (no three), so it can be unit-tested.
 *
 * Every note must read as its own bar. Two notes on the same key that touch (legato, or
 * a repeated note played as written) would otherwise draw as one long bar, worst of all
 * in the bright looks where the glow fills the seam. So each bar ends a small gap short
 * of the next note on its key, and is never drawn over it, however short the note is.
 */

/** Space left between a bar and the next note on the same key, in px. */
export const BAR_GAP_PX = 4;
/** Shortest bar drawn for a lone note. */
export const MIN_BAR_PX = 6;
/** A bar squeezed by the note after it is never thinner than this. */
export const MIN_SQUEEZED_BAR_PX = 2;

/**
 * For each note, the start time of the next note on the same key (Infinity if none).
 * Notes can arrive in any order; ties on the same key count as "next" in input order.
 */
export function nextStartOnSameKey(notes: readonly { midi: number; startS: number }[]): Float64Array {
  const next = new Float64Array(notes.length).fill(Number.POSITIVE_INFINITY);
  const order = notes.map((_, i) => i);
  order.sort((a, b) => notes[a]!.midi - notes[b]!.midi || notes[a]!.startS - notes[b]!.startS || a - b);
  for (let k = 0; k + 1 < order.length; k++) {
    const i = order[k]!;
    const j = order[k + 1]!;
    if (notes[i]!.midi === notes[j]!.midi) next[i] = notes[j]!.startS;
  }
  return next;
}

/** A key's bar width: as wide as the key allows, with a hairline either side. */
export function barWidth(keyWidthPx: number): number {
  return Math.max(1, keyWidthPx - Math.min(1, keyWidthPx * 0.05) * 2);
}

/**
 * The height in px of a note's bar: its length less the gap, at least `MIN_BAR_PX`, and
 * always ending `BAR_GAP_PX` before the next note on the same key (`nextStartS`).
 */
export function barHeight(startS: number, durationS: number, nextStartS: number, pxPerSecond: number, gapPx = BAR_GAP_PX): number {
  const length = durationS * pxPerSecond;
  let height = Math.max(MIN_BAR_PX, length - gapPx);
  if (Number.isFinite(nextStartS)) {
    const room = (nextStartS - startS) * pxPerSecond - gapPx;
    height = Math.min(height, Math.max(MIN_SQUEEZED_BAR_PX, room));
  }
  return height;
}
