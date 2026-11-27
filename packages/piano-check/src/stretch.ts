import { PIANO_HIGH_MIDI, PIANO_LOW_MIDI } from "./notes.js";

/**
 * Typical Railsback-style stretch: deviation from equal temperament (cents) of a
 * well-tuned piano, anchored at A4. Linearly interpolated between these points.
 */
const RAILSBACK: ReadonlyArray<readonly [number, number]> = [
  [21, -30], [33, -16], [45, -7], [57, -2.5], [69, 0], [81, 8], [93, 20], [105, 33], [108, 36],
];

export type StretchCurve = (midi: number) => number;

export function interpolate(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return last[1];
}

export const railsbackStretch: StretchCurve = (midi) => interpolate(RAILSBACK, midi);

/** Plain equal temperament: no stretch. */
export const flatStretch: StretchCurve = () => 0;

/** Partials matched across an octave: 6:3 in the bass, 4:2 in the middle, 2:1 in the treble. */
function octavePair(midi: number): number {
  if (midi < 36) return 3;
  if (midi < 84) return 2;
  return 1;
}

/**
 * Stretch curve derived from the piano's own inharmonicity. `bPoints` are
 * [midi, B] pairs (any order). Octaves are tuned so partial 2k of the lower
 * note meets partial k of the upper one; the curve integrates that octave
 * stretch (in cents) outward from A4, so it is smooth and defined for every key.
 * Returns null when there are too few points to be meaningful.
 */
export function derivedStretch(bPoints: ReadonlyArray<readonly [number, number]>): StretchCurve | null {
  const pts = bPoints.filter(([, b]) => b > 0 && Number.isFinite(b)).slice().sort((a, b) => a[0] - b[0]);
  if (pts.length < 6) return null;
  const logB = pts.map(([m, b]) => [m, Math.log(b)] as const);
  const B = (m: number) => Math.exp(interpolate(logB, m));
  // Above the top octave there is no B for the note an octave up, so the last
  // measurable octave's stretch rate is held rather than clamping B (which would blow up).
  const octaveCents = (mRaw: number): number => {
    const m = Math.min(mRaw, PIANO_HIGH_MIDI - 12);
    const k = octavePair(m);
    const lo = Math.sqrt(1 + B(m) * (2 * k) ** 2);
    const hi = Math.sqrt(1 + B(m + 12) * k ** 2);
    return 1200 * Math.log2(lo / hi);
  };
  // Cents of stretch at every semitone, accumulated from A4 (= 0) outward.
  const table = new Map<number, number>();
  table.set(69, 0);
  for (let m = 69; m < PIANO_HIGH_MIDI; m++) table.set(m + 1, table.get(m)! + octaveCents(m + 0.5) / 12);
  for (let m = 69; m > PIANO_LOW_MIDI; m--) table.set(m - 1, table.get(m)! - octaveCents(m - 0.5) / 12);
  return (midi) => {
    const c = Math.max(PIANO_LOW_MIDI, Math.min(PIANO_HIGH_MIDI, midi));
    const lo = Math.floor(c);
    const hi = Math.ceil(c);
    const a = table.get(lo)!;
    const b = table.get(hi)!;
    return a + (b - a) * (c - lo);
  };
}
