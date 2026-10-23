import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { noteMotion, type NotePalette } from "./notePalette";
import type { JudgementMark, WaterfallFrame, WaterfallRenderer } from "./renderers/types";

export type { WaterfallFrame } from "./renderers/types";

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

// ── Classic notes style (spec §3.11) ──────────────────────────────────────────

/** A judgement animation in flight. */
interface JudgementEffect {
  midi: number;
  mark: JudgementMark;
  atMs: number;
}

/** How long a judgement glyph stays up. The ring grows over `burstMs` (not at all under reduced motion). */
const GLYPH_MS = 320;
const MISS_GLYPH_MS = 480;
/** More glowing notes than this and the rest go without: shadowBlur is the costly part of a frame. */
const MAX_GLOWING_NOTES = 10;
const GLOW_BLUR_PX = 18;
/** In wait mode the song freezes at the note's start; a bar this close to the hit line is the target. */
const WAITING_WINDOW_S = 0.05;

const isHit = (judgment: PlayAlongJudgment | undefined): boolean =>
  judgment === "perfect" || judgment === "good" || judgment === "ok";

/** A press judged good or ok is drawn as early or late, by which side of the note's start it landed. */
export function judgementMark(judgment: PlayAlongJudgment, pressTimeS: number, noteStartS: number): JudgementMark {
  if (judgment === "miss") return "miss";
  if (judgment === "perfect") return "hit";
  return pressTimeS < noteStartS ? "early" : "late";
}

function roundedBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // Fully rounded ends: radius = min(width / 2, 10 px).
  const radius = Math.max(0, Math.min(w / 2, 10, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** An 8px diagonal hatch for missed bars, built once per palette. */
function hatchPattern(ctx: CanvasRenderingContext2D, palette: NotePalette): CanvasPattern | null {
  if (typeof document === "undefined") return null;
  const tile = document.createElement("canvas");
  tile.width = 8;
  tile.height = 8;
  const tileCtx = tile.getContext("2d");
  if (!tileCtx) return null;
  tileCtx.strokeStyle = palette.judge.missEdge;
  tileCtx.globalAlpha = 0.55;
  tileCtx.lineWidth = 1.5;
  tileCtx.beginPath();
  tileCtx.moveTo(-2, 10);
  tileCtx.lineTo(10, -2);
  tileCtx.moveTo(6, 10);
  tileCtx.lineTo(10, 6);
  tileCtx.moveTo(-2, 2);
  tileCtx.lineTo(2, -2);
  tileCtx.stroke();
  return ctx.createPattern(tile, "repeat");
}

export interface ClassicDrawOptions {
  effects?: readonly JudgementEffect[];
  hatch?: CanvasPattern | null;
  reducedMotion?: boolean;
}

/**
 * Draw one Classic frame. y = bottom edge is "now" (the hit line sits there, keys
 * directly below); a note occupies the vertical span of its duration and slides down
 * as time advances. The stage gradient is the element behind the canvas, so a frame
 * only clears and paints the notes.
 */
export function drawWaterfall(ctx: CanvasRenderingContext2D, frame: WaterfallFrame, options: ClassicDrawOptions = {}): void {
  const { notes, judgments, songTimeS, lookaheadS, geometry, heightPx, palette } = frame;
  const width = geometry.widthPx;
  const nowMs = frame.nowMs ?? performance.now();
  const motion = noteMotion(frame.reducedMotion ?? options.reducedMotion ?? false);
  ctx.clearRect(0, 0, width, heightPx);

  // Octave lane guides on the C lines.
  ctx.fillStyle = palette.stage.lane;
  for (let note = geometry.lowestNote; note <= geometry.highestNote; note++) {
    if (note % 12 !== 0) continue;
    const lane = geometry.xFor(note);
    if (lane) ctx.fillRect(lane.x, 0, 1.5, heightPx);
  }

  const pxPerSecond = heightPx / lookaheadS;

  // Falling barlines: the same transform as the notes (bar.timeS in place of
  // note.startS), drawn first so notes paint over them. Bars only, not beats.
  if (frame.bars) {
    ctx.fillStyle = palette.stage.barline;
    for (const bar of frame.bars) {
      const timeToStart = bar.timeS - songTimeS;
      if (timeToStart < 0 || timeToStart > lookaheadS) continue;
      ctx.fillRect(0, Math.round(heightPx - timeToStart * pxPerSecond), width, 1);
    }
  }

  const waiting = frame.waitingPitches && frame.waitingPitches.length > 0 ? frame.waitingPitches : null;
  let flashing: Set<number> | null = null;
  for (const effect of options.effects ?? []) {
    if (effect.mark !== "miss" && nowMs - effect.atMs < Math.max(motion.burstMs, 120)) (flashing ??= new Set()).add(effect.midi);
  }
  let glowing = 0;

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i]!;
    const timeToStart = note.startS - songTimeS;
    if (timeToStart > lookaheadS) continue; // not yet visible
    if (timeToStart + note.durationS < 0) continue; // fully past
    const rect = geometry.xFor(note.midi);
    // A note outside the rendered range has no key to fall onto: skip it rather than
    // drawing it on the lowest key. Play-Along sizes its geometry to cover the song.
    if (!rect) continue;

    const x = rect.x + 1.5;
    const w = rect.width - 3;
    const bottomY = heightPx - timeToStart * pxPerSecond;
    const h = Math.max(6, note.durationS * pxPerSecond);
    const topY = bottomY - h;
    const judgment = judgments[i];

    if (judgment === "miss") {
      // Hatched grey with a dashed edge: readable without telling red from green.
      roundedBar(ctx, x, topY, w, h);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = palette.judge.miss;
      ctx.fill();
      if (options.hatch) {
        ctx.fillStyle = options.hatch;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.judge.missEdge;
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }

    const hand = palette.note[note.hand === "left" ? "left" : "right"];
    const sounding = timeToStart <= 0 && timeToStart + note.durationS >= 0;
    const gradient = ctx.createLinearGradient(0, topY, 0, bottomY);
    gradient.addColorStop(0, hand.hi);
    gradient.addColorStop(0.35, hand.base);
    gradient.addColorStop(1, hand.lo);
    roundedBar(ctx, x, topY, w, h);
    if (sounding && glowing < MAX_GLOWING_NOTES) {
      glowing++;
      ctx.shadowColor = hand.glow;
      ctx.shadowBlur = GLOW_BLUR_PX;
    }
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // A soft vertical highlight band, a 1px top rim and a 2px bottom shade.
    const inset = Math.min(w / 2, 10);
    const bodyHeight = h - inset * 2;
    if (bodyHeight > 0) {
      ctx.fillStyle = "rgb(255 255 255 / 0.28)";
      ctx.fillRect(x + w * 0.16, topY + inset, Math.max(1, w * 0.12), bodyHeight);
    }
    if (w > inset * 2) {
      ctx.fillStyle = "rgb(255 255 255 / 0.6)";
      ctx.fillRect(x + inset, topY, w - inset * 2, 1);
      ctx.fillStyle = "rgb(0 0 0 / 0.18)";
      ctx.fillRect(x + inset, bottomY - 2, w - inset * 2, 2);
    }

    // A hit flashes brighter for a moment.
    if (isHit(judgment) && flashing?.has(note.midi)) {
      roundedBar(ctx, x, topY, w, h);
      ctx.fillStyle = "rgb(255 255 255 / 0.15)";
      ctx.fill();
    }

    // Wait mode: outline the bar the song is waiting on.
    if (judgment === undefined && waiting?.includes(note.midi) && Math.abs(timeToStart) <= WAITING_WINDOW_S) {
      roundedBar(ctx, x - 2, topY - 2, w + 4, h + 4);
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.judge.waiting;
      ctx.stroke();
    }
  }

  // Hit line: centre-weighted, fading towards the edges.
  const line = ctx.createLinearGradient(0, 0, width, 0);
  const rgb = palette.stage.hitlineRgb;
  line.addColorStop(0, `rgb(${rgb} / 0)`);
  line.addColorStop(0.5, `rgb(${rgb} / ${palette.stage.hitlinePeak})`);
  line.addColorStop(1, `rgb(${rgb} / 0)`);
  ctx.fillStyle = line;
  ctx.fillRect(0, heightPx - 2, width, 2);

  for (const effect of options.effects ?? []) drawJudgement(ctx, effect, frame, nowMs, motion.burstMs);
}

function drawJudgement(ctx: CanvasRenderingContext2D, effect: JudgementEffect, frame: WaterfallFrame, nowMs: number, burstMs: number): void {
  const elapsed = nowMs - effect.atMs;
  const lifetime = effect.mark === "miss" ? MISS_GLYPH_MS : Math.max(GLYPH_MS, burstMs);
  if (elapsed < 0 || elapsed > lifetime) return;
  const rect = frame.geometry.xFor(effect.midi);
  if (!rect) return;
  const { palette, heightPx } = frame;
  const cx = rect.x + rect.width / 2;
  const glyph = Math.max(5, Math.min(rect.width * 0.32, 9));
  const cy = heightPx - glyph - 6;
  const opacity = Math.min(1, (1 - elapsed / lifetime) * 1.6);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  if (effect.mark === "miss") {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = palette.judge.missEdge;
    ctx.beginPath();
    ctx.moveTo(cx - glyph * 0.6, cy - glyph * 0.6);
    ctx.lineTo(cx + glyph * 0.6, cy + glyph * 0.6);
    ctx.moveTo(cx + glyph * 0.6, cy - glyph * 0.6);
    ctx.lineTo(cx - glyph * 0.6, cy + glyph * 0.6);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.strokeStyle = palette.judge.hitCore;
  // The ring expands from the key top; early and late rings are half size.
  if (burstMs > 0 && elapsed < burstMs) {
    const progress = elapsed / burstMs;
    const maxRadius = rect.width * (effect.mark === "hit" ? 0.9 : 0.45);
    ctx.globalAlpha = 1 - progress;
    ctx.beginPath();
    ctx.arc(cx, cy, glyph + progress * maxRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  if (effect.mark === "hit") {
    ctx.moveTo(cx - glyph * 0.6, cy);
    ctx.lineTo(cx - glyph * 0.15, cy + glyph * 0.5);
    ctx.lineTo(cx + glyph * 0.65, cy - glyph * 0.55);
  } else {
    // ˄ early, ˅ late.
    const dir = effect.mark === "early" ? 1 : -1;
    ctx.moveTo(cx - glyph * 0.55, cy + dir * glyph * 0.3);
    ctx.lineTo(cx, cy - dir * glyph * 0.3);
    ctx.lineTo(cx + glyph * 0.55, cy + dir * glyph * 0.3);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The Classic notes style as a WaterfallRenderer. It owns the canvas backing store
 * (resized only when the rounded pixel size really changes: canvas.width is an integer
 * setter, so comparing against an unrounded size reallocates on every frame) and the
 * judgement animations. It never owns timing.
 */
export class ClassicRenderer implements WaterfallRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private readonly effects: JudgementEffect[] = [];
  private lastSongTimeS = 0;
  private hatch: CanvasPattern | null = null;
  private hatchFor: NotePalette | null = null;

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(geometry: KeyboardGeometry, heightPx: number, dpr: number): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = dpr;
    const targetWidth = Math.round(geometry.widthPx * dpr);
    const targetHeight = Math.round(heightPx * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
  }

  draw(frame: WaterfallFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const nowMs = frame.nowMs ?? performance.now();
    this.lastSongTimeS = frame.songTimeS;
    if (this.hatchFor !== frame.palette) {
      this.hatch = hatchPattern(ctx, frame.palette);
      this.hatchFor = frame.palette;
    }
    // Drop finished animations in place, without allocating each frame.
    let kept = 0;
    for (const effect of this.effects) {
      if (nowMs - effect.atMs <= MISS_GLYPH_MS) this.effects[kept++] = effect;
    }
    this.effects.length = kept;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawWaterfall(ctx, { ...frame, nowMs }, { effects: this.effects, hatch: this.hatch });
  }

  onJudgement(_index: number, judgement: PlayAlongJudgment, note: PlayAlongNote): void {
    this.effects.push({ midi: note.midi, mark: judgementMark(judgement, this.lastSongTimeS, note.startS), atMs: performance.now() });
  }

  reset(): void {
    this.effects.length = 0;
  }

  dispose(): void {
    this.effects.length = 0;
    this.canvas = null;
    this.ctx = null;
  }
}

