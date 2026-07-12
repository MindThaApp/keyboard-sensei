import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";

/** Must match VirtualPiano's key layout so notes land on their keys. */
export const WHITE_KEY_WIDTH_PX = 40;
export const BLACK_KEY_WIDTH_PX = 26;
const BLACK_KEY_RATIO = BLACK_KEY_WIDTH_PX / WHITE_KEY_WIDTH_PX;

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (note: number): boolean => BLACK_KEY_PITCH_CLASSES.has(((note % 12) + 12) % 12);

export interface KeyboardGeometry {
  lowestNote: number;
  highestNote: number;
  widthPx: number;
  whiteKeyWidthPx: number;
  blackKeyWidthPx: number;
  /** x/width of each MIDI note's key, or null if the note lies outside the range.
   *  The single source of truth: both the rendered keys and the waterfall lanes
   *  read from this, so they cannot drift apart at any zoom level. */
  xFor: (note: number) => { x: number; width: number } | null;
}

/** Octave-aligned range containing the song, ≥ 2 octaves, clamped to the 88 keys. */
export function pianoRangeFor(pitchMin: number, pitchMax: number): { lowestNote: number; highestNote: number } {
  let low = Math.floor(pitchMin / 12) * 12; // down to a C
  let high = Math.ceil((pitchMax + 1) / 12) * 12 - 1; // up to a B
  while (high - low < 24) {
    if (low >= 12 + 12) low -= 12;
    else high += 12;
  }
  return { lowestNote: Math.max(21, low), highestNote: Math.min(108, high) };
}

export function keyboardGeometry(lowestNote: number, highestNote: number, whiteKeyWidthPx: number = WHITE_KEY_WIDTH_PX): KeyboardGeometry {
  const blackKeyWidthPx = whiteKeyWidthPx * BLACK_KEY_RATIO;
  const whiteNotes: number[] = [];
  for (let note = lowestNote; note <= highestNote; note++) {
    if (!isBlackKey(note)) whiteNotes.push(note);
  }
  const whiteIndex = new Map(whiteNotes.map((note, index) => [note, index]));
  /**
   * Returns null for a note outside [lowestNote, highestNote] — callers must skip it.
   * This used to be `whiteIndex.get(note) ?? 0`, which silently stacked every
   * out-of-range note on the lowest key (and rendered out-of-range black keys at a
   * negative x). Play-Along must size its keyboard to union(deviceRange, songRange)
   * so this never fires there; returning null makes a mistake loud instead of drawing
   * a plausible-looking lie.
   */
  const xFor = (note: number): { x: number; width: number } | null => {
    if (note < lowestNote || note > highestNote) return null;
    if (!isBlackKey(note)) {
      return { x: whiteIndex.get(note)! * whiteKeyWidthPx, width: whiteKeyWidthPx };
    }
    const whiteKeysBefore = whiteNotes.filter((white) => white < note).length;
    return { x: whiteKeysBefore * whiteKeyWidthPx - blackKeyWidthPx / 2, width: blackKeyWidthPx };
  };
  return { lowestNote, highestNote, widthPx: whiteNotes.length * whiteKeyWidthPx, whiteKeyWidthPx, blackKeyWidthPx, xFor };
}

/** White-key width that makes [lowestNote, highestNote] exactly fill containerPx. */
export function fitWhiteKeyWidth(lowestNote: number, highestNote: number, containerPx: number): number {
  let whiteCount = 0;
  for (let n = lowestNote; n <= highestNote; n++) if (!isBlackKey(n)) whiteCount++;
  return whiteCount > 0 ? containerPx / whiteCount : WHITE_KEY_WIDTH_PX;
}

export interface WaterfallColors {
  right: string;
  left: string;
  hit: string;
  missed: string;
  lane: string;
  hitLine: string;
}

export const WATERFALL_COLORS_LIGHT: WaterfallColors = {
  right: "#b4323e", // felt-600
  left: "#c9a227", // brass-500
  hit: "#059669", // emerald-600
  missed: "#fb7185", // rose-400
  lane: "rgba(15, 23, 42, 0.04)",
  hitLine: "rgba(180, 50, 62, 0.55)",
};

export const WATERFALL_COLORS_DARK: WaterfallColors = {
  right: "#cf5260", // felt-400
  left: "#d1ad3d", // brass-400
  hit: "#34d399",
  missed: "#fb7185",
  lane: "rgba(255, 255, 255, 0.04)",
  hitLine: "rgba(207, 82, 96, 0.6)",
};

export interface WaterfallFrame {
  notes: PlayAlongNote[];
  judgments: readonly (PlayAlongJudgment | undefined)[];
  songTimeS: number;
  lookaheadS: number;
  geometry: KeyboardGeometry;
  heightPx: number;
  colors: WaterfallColors;
  waitingPitches?: Set<number>;
}

/**
 * Draw one frame. y = bottom edge is "now" (the hit line sits there, keys
 * directly below); a note occupies the vertical span of its duration and
 * slides down as songTime advances.
 */
export function drawWaterfall(ctx: CanvasRenderingContext2D, frame: WaterfallFrame): void {
  const { notes, judgments, songTimeS, lookaheadS, geometry, heightPx, colors } = frame;
  const width = geometry.widthPx;
  ctx.clearRect(0, 0, width, heightPx);

  // Octave lane guides on the C lines.
  ctx.fillStyle = frame.colors.lane;
  for (let note = geometry.lowestNote; note <= geometry.highestNote; note++) {
    if (note % 12 === 0) {
      const lane = geometry.xFor(note);
      if (!lane) continue;
      const { x } = lane;
      ctx.fillRect(x, 0, 1.5, heightPx);
    }
  }

  const pxPerSecond = heightPx / lookaheadS;
  // Recently passed notes remain briefly visible below the hit line…no,
  // the hit line IS the bottom; passed portions simply slide out of view.
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    const timeToStart = note.startS - songTimeS;
    if (timeToStart > lookaheadS) continue; // not yet visible
    if (timeToStart + note.durationS < 0) continue; // fully past
    const rect = geometry.xFor(note.midi);
    // A note outside the rendered range has no key to fall onto. Skip it rather
    // than drawing it at x=0 on top of the lowest key. Play-Along sizes its
    // geometry to union(deviceRange, songRange), so this should never fire there.
    if (!rect) continue;
    const { x, width: keyWidth } = rect;
    const bottomY = heightPx - timeToStart * pxPerSecond;
    const noteHeight = Math.max(6, note.durationS * pxPerSecond);
    const topY = bottomY - noteHeight;

    const judgment = judgments[i];
    let fill = note.hand === "left" ? colors.left : colors.right;
    if (judgment === "perfect" || judgment === "good" || judgment === "ok") fill = colors.hit;
    else if (judgment === "miss") fill = colors.missed;

    const visibleTop = Math.max(0, topY);
    const visibleBottom = Math.min(heightPx, bottomY);
    if (visibleBottom <= visibleTop) continue;
    ctx.fillStyle = fill;
    ctx.globalAlpha = judgment === undefined ? 0.92 : 0.75;
    roundRect(ctx, x + 1.5, visibleTop, keyWidth - 3, visibleBottom - visibleTop, 4);
    ctx.globalAlpha = 1;
  }

  // Hit line.
  ctx.fillStyle = colors.hitLine;
  ctx.fillRect(0, heightPx - 2, width, 2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, Math.max(0, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}
