import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import type { HandPalette, NotePalette } from "../../notePalette";
import type { KeyboardGeometry } from "../../waterfall";

/**
 * Pure layout and colour maths for the Neon 3D style, kept free of `three` so it can be
 * unit-tested. World space is the stage in CSS pixels with its origin at the bottom-left
 * (the hit line) and y pointing up, which is what the orthographic camera shows.
 */

/** Same 1.5 px gutter as Classic, so a block is exactly as wide as a Classic bar. */
export const BLOCK_INSET_PX = 1.5;
/** Same minimum height as Classic. */
export const MIN_BLOCK_HEIGHT_PX = 6;
/** Total hue swing from the lowest to the highest key, in degrees: a slight shift, not a rainbow. */
export const HUE_SPREAD_DEG = 28;

export interface BlockRect {
  /** Left edge, world px. */
  x: number;
  /** Bottom edge, world px (0 = hit line). */
  y: number;
  w: number;
  h: number;
}

/**
 * Where a note's block sits. x and width come only from `geometry.xFor` (the function
 * that lays out the keys) and y from `songTimeS` exactly as Classic's `drawWaterfall`
 * does, so the two styles put every note in the same place. Null when the note has no
 * key in the rendered range.
 */
export function blockRect(geometry: KeyboardGeometry, note: PlayAlongNote, songTimeS: number, pxPerSecond: number, out: BlockRect): BlockRect | null {
  const key = geometry.xFor(note.midi);
  if (!key) return null;
  out.x = key.x + BLOCK_INSET_PX;
  out.w = key.width - BLOCK_INSET_PX * 2;
  out.y = (note.startS - songTimeS) * pxPerSecond;
  out.h = Math.max(MIN_BLOCK_HEIGHT_PX, note.durationS * pxPerSecond);
  return out;
}

// ── Colour ────────────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

/** Parses `#RRGGBB` or `rgb(r g b / a)` into 0..1 channels plus alpha. */
export function parseColor(input: string): { rgb: Rgb; alpha: number } {
  const value = input.trim();
  if (value.startsWith("#") && value.length === 7) {
    const n = Number.parseInt(value.slice(1), 16);
    return { rgb: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255], alpha: 1 };
  }
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (!match) throw new Error(`Unsupported colour: ${input}`);
  const alphaText = match[4];
  const alpha = alphaText === undefined ? 1 : alphaText.endsWith("%") ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText);
  return { rgb: [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255], alpha };
}

/** Parses the palette's space-separated "r g b" triplets (e.g. the hit line colour). */
export function parseRgbTriplet(input: string): Rgb {
  const [r = 0, g = 0, b = 0] = input.trim().split(/\s+/).map(Number);
  return [r / 255, g / 255, b / 255];
}

function rgbToHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb([h, s, l]: Rgb): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: Rgb;
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

export function rotateHue(rgb: Rgb, degrees: number): Rgb {
  const [h, s, l] = rgbToHsl(rgb);
  return hslToRgb([h + degrees, s, l]);
}

/** The hue offset for a pitch: -spread/2 at the lowest key, +spread/2 at the highest. */
export function pitchHueShift(midi: number, lowestNote: number, highestNote: number): number {
  const span = highestNote - lowestNote;
  if (span <= 0) return 0;
  const t = Math.min(1, Math.max(0, (midi - lowestNote) / span));
  return (t - 0.5) * HUE_SPREAD_DEG;
}

/**
 * Per-pitch block colours for one palette and key range: for each MIDI note and hand,
 * the hand's `base` (bottom of the block), `hi` (top) and `glow`, rotated slightly by
 * pitch. Hand identity stays: the swing is small next to the 127° between the hands.
 * Layout: [hand 0 = right, 1 = left][midi 0..127][base rgb, hi rgb, glow rgb].
 */
export const COLOR_STRIDE = 9;

export function buildPitchColors(palette: NotePalette, lowestNote: number, highestNote: number): Float32Array {
  const table = new Float32Array(2 * 128 * COLOR_STRIDE);
  const hands: HandPalette[] = [palette.note.right, palette.note.left];
  hands.forEach((hand, handIndex) => {
    const base = parseColor(hand.base).rgb;
    const hi = parseColor(hand.hi).rgb;
    const glow = parseColor(hand.glow).rgb;
    for (let midi = 0; midi < 128; midi++) {
      const shift = pitchHueShift(midi, lowestNote, highestNote);
      const offset = (handIndex * 128 + midi) * COLOR_STRIDE;
      table.set(rotateHue(base, shift), offset);
      table.set(rotateHue(hi, shift), offset + 3);
      table.set(rotateHue(glow, shift), offset + 6);
    }
  });
  return table;
}

export function pitchColorOffset(hand: PlayAlongNote["hand"], midi: number): number {
  const clamped = Math.min(127, Math.max(0, Math.round(midi)));
  return ((hand === "left" ? 1 : 0) * 128 + clamped) * COLOR_STRIDE;
}

/** Index of the first note that could still be on screen, for notes sorted by start time. */
export function firstVisibleIndex(notes: readonly PlayAlongNote[], songTimeS: number, maxDurationS: number): number {
  // Anything starting before (now - longest note) has certainly finished.
  const cutoff = songTimeS - maxDurationS;
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid]!.startS < cutoff) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Whether notes are in start-time order (true for every run the engine builds). */
export function isSortedByStart(notes: readonly PlayAlongNote[]): boolean {
  for (let i = 1; i < notes.length; i++) if (notes[i]!.startS < notes[i - 1]!.startS) return false;
  return true;
}
