import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { noteMotion, type NotePalette } from "../../notePalette";
import {
  MISS_GLYPH_MS,
  WAITING_WINDOW_S,
  drawJudgement,
  hatchPattern,
  isHit,
  judgementMark,
  roundedBar,
  type JudgementEffect,
  type KeyboardGeometry,
} from "../../waterfall";
import type { JudgementMark, WaterfallFrame, WaterfallRenderer } from "../types";

/**
 * Neon 2D notes style (spec §3.12 sibling of Neon 3D): bars coloured by pitch along a
 * spectrum across the keyboard, glowing, and a pooled cloud of neon powder in the note's
 * colour where a played note lands. Canvas 2D only. Per-frame work allocates nothing:
 * particles live in typed arrays, colours are cached strings per pitch and the glow is a
 * pre-rendered sprite blended additively (no shadowBlur except for the few sounding bars).
 */

/** Pitch maps to hue 0 (red) → 300 (magenta) across the rendered keyboard. */
const HUE_SPAN = 300;
const HUE_BUCKETS = 48;
const SPRITE_PX = 48;
const MAX_PARTICLES = 900;
const HIT_PARTICLES = 34;
const NEAR_PARTICLES = 16;
const PARTICLE_LIFE_MS = 780;
const MAX_SOUNDING_GLOW = 10;
const SOUNDING_BLUR_PX = 16;
const MAX_STEP_MS = 50;

interface PitchColors {
  hi: string;
  base: string;
  lo: string;
  glow: string;
}

const hueFor = (midi: number, geometry: KeyboardGeometry): number => {
  const span = Math.max(1, geometry.highestNote - geometry.lowestNote);
  return (HUE_SPAN * (midi - geometry.lowestNote)) / span;
};

export class Neon2DRenderer implements WaterfallRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private geometry: KeyboardGeometry | null = null;
  private readonly effects: JudgementEffect[] = [];
  private lastSongTimeS = 0;
  private lastNowMs = 0;
  private hatch: CanvasPattern | null = null;
  private hatchFor: NotePalette | null = null;
  private hitLine: CanvasGradient | null = null;
  private hitLineKey = "";
  private hitLineWidth = 0;

  private colors: PitchColors[] = [];
  private colorsKey = "";
  private sprites: HTMLCanvasElement[] = [];

  // Particle pool (structure of arrays, ring-buffer reuse).
  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly pvx = new Float32Array(MAX_PARTICLES);
  private readonly pvy = new Float32Array(MAX_PARTICLES);
  private readonly page = new Float32Array(MAX_PARTICLES);
  private readonly psize = new Float32Array(MAX_PARTICLES);
  private readonly pbucket = new Uint8Array(MAX_PARTICLES);
  private readonly plive = new Uint8Array(MAX_PARTICLES);
  private cursor = 0;
  private liveCount = 0;
  private reducedMotion = false;

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buildSprites();
  }

  resize(geometry: KeyboardGeometry, heightPx: number, dpr: number): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = dpr;
    this.geometry = geometry;
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
    const { notes, judgments, songTimeS, lookaheadS, geometry, heightPx, palette } = frame;
    const width = geometry.widthPx;
    const nowMs = frame.nowMs ?? performance.now();
    const stepMs = this.lastNowMs === 0 ? 0 : Math.min(MAX_STEP_MS, Math.max(0, nowMs - this.lastNowMs));
    this.lastNowMs = nowMs;
    this.lastSongTimeS = songTimeS;
    this.geometry = geometry;
    this.reducedMotion = frame.reducedMotion ?? false;
    const motion = noteMotion(this.reducedMotion);
    this.ensureColors(geometry, palette);
    if (this.hatchFor !== palette) {
      this.hatch = hatchPattern(ctx, palette);
      this.hatchFor = palette;
    }
    let kept = 0;
    for (const effect of this.effects) {
      if (nowMs - effect.atMs <= MISS_GLYPH_MS) this.effects[kept++] = effect;
    }
    this.effects.length = kept;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, heightPx);

    ctx.fillStyle = palette.stage.lane;
    for (let note = geometry.lowestNote; note <= geometry.highestNote; note++) {
      if (note % 12 !== 0) continue;
      const lane = geometry.xFor(note);
      if (lane) ctx.fillRect(lane.x, 0, 1.5, heightPx);
    }

    const pxPerSecond = heightPx / lookaheadS;
    if (frame.bars) {
      ctx.fillStyle = palette.stage.barline;
      for (const bar of frame.bars) {
        const timeToStart = bar.timeS - songTimeS;
        if (timeToStart < 0 || timeToStart > lookaheadS) continue;
        ctx.fillRect(0, Math.round(heightPx - timeToStart * pxPerSecond), width, 1);
      }
    }

    const waiting = frame.waitingPitches && frame.waitingPitches.length > 0 ? frame.waitingPitches : null;
    let sounding = 0;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]!;
      const timeToStart = note.startS - songTimeS;
      if (timeToStart > lookaheadS) continue;
      if (timeToStart + note.durationS < 0) continue;
      const rect = geometry.xFor(note.midi);
      if (!rect) continue;

      const x = rect.x + 1.5;
      const w = rect.width - 3;
      const bottomY = heightPx - timeToStart * pxPerSecond;
      const h = Math.max(6, note.durationS * pxPerSecond);
      const topY = bottomY - h;
      const judgment = judgments[i];

      if (judgment === "miss") {
        roundedBar(ctx, x, topY, w, h);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = palette.judge.miss;
        ctx.fill();
        if (this.hatch) {
          ctx.fillStyle = this.hatch;
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

      const color = this.colors[note.midi] ?? this.colors[0]!;
      const isSounding = timeToStart <= 0 && timeToStart + note.durationS >= 0;

      // Soft outer halo: a wider, translucent bar blended additively.
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = isSounding ? 0.38 : 0.2;
      ctx.fillStyle = color.base;
      roundedBar(ctx, x - 3, topY - 3, w + 6, h + 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      roundedBar(ctx, x, topY, w, h);
      if (isSounding && sounding < MAX_SOUNDING_GLOW) {
        sounding++;
        ctx.shadowColor = color.glow;
        ctx.shadowBlur = SOUNDING_BLUR_PX;
      }
      ctx.fillStyle = color.base;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // Bright core stripe, lit leading edge, dark base shade (no per-bar gradient allocation).
      const inset = Math.min(w / 2, 10);
      const bodyHeight = h - inset * 2;
      if (bodyHeight > 0) {
        ctx.fillStyle = color.hi;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(x + w * 0.3, topY + inset, Math.max(1.5, w * 0.4), bodyHeight);
        ctx.globalAlpha = 1;
      }
      if (w > inset * 2) {
        ctx.fillStyle = "rgb(255 255 255 / 0.85)";
        ctx.fillRect(x + inset, bottomY - 2, w - inset * 2, 2);
        ctx.fillStyle = color.lo;
        ctx.fillRect(x + inset, topY, w - inset * 2, 1.5);
      }
      // Hand identity stays shared: a small cap in the hand colour at the bar's trailing end.
      const hand = palette.note[note.hand === "left" ? "left" : "right"];
      ctx.fillStyle = hand.hi;
      ctx.fillRect(x + w * 0.5 - 2, topY + 2, 4, 3);

      if (judgment === undefined && waiting?.includes(note.midi) && Math.abs(timeToStart) <= WAITING_WINDOW_S) {
        roundedBar(ctx, x - 2, topY - 2, w + 4, h + 4);
        ctx.lineWidth = 2;
        ctx.strokeStyle = palette.judge.waiting;
        ctx.stroke();
      }
    }

    this.drawHitLine(ctx, palette, width, heightPx);
    this.stepAndDrawParticles(ctx, stepMs, heightPx);
    for (const effect of this.effects) drawJudgement(ctx, effect, frame, nowMs, motion.burstMs);
  }

  onJudgement(_index: number, judgement: PlayAlongJudgment, note: PlayAlongNote): void {
    const mark: JudgementMark = judgementMark(judgement, this.lastSongTimeS, note.startS);
    const atMs = performance.now();
    this.effects.push({ midi: note.midi, mark, atMs });
    if (!isHit(judgement) || this.reducedMotion || !this.geometry) return;
    const rect = this.geometry.xFor(note.midi);
    if (!rect) return;
    const bucket = this.bucketFor(note.midi, this.geometry);
    this.spawn(rect.x + rect.width / 2, rect.width, bucket, mark === "hit" ? HIT_PARTICLES : NEAR_PARTICLES);
  }

  reset(): void {
    this.effects.length = 0;
    this.plive.fill(0);
    this.liveCount = 0;
    this.lastNowMs = 0;
  }

  dispose(): void {
    this.reset();
    this.canvas = null;
    this.ctx = null;
    this.sprites.length = 0;
  }

  private bucketFor(midi: number, geometry: KeyboardGeometry): number {
    return Math.min(HUE_BUCKETS - 1, Math.max(0, Math.round((hueFor(midi, geometry) / HUE_SPAN) * (HUE_BUCKETS - 1))));
  }

  /** Spawn a cloud at the hit line. y is stored relative to the hit line (0 = on it, negative = up). */
  private spawn(cx: number, keyWidth: number, bucket: number, count: number): void {
    for (let n = 0; n < count; n++) {
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (this.plive[slot] === 0) this.liveCount++;
      const angle = Math.random() * Math.PI;
      const speed = 25 + Math.random() * 120;
      this.px[slot] = cx + (Math.random() - 0.5) * keyWidth * 0.7;
      this.py[slot] = 0;
      this.pvx[slot] = Math.cos(angle) * speed * 0.7;
      this.pvy[slot] = -Math.sin(angle) * speed - 20;
      this.page[slot] = Math.random() * 60;
      this.psize[slot] = 0.5 + Math.random() * 0.9;
      this.pbucket[slot] = bucket;
      this.plive[slot] = 1;
    }
  }

  private stepAndDrawParticles(ctx: CanvasRenderingContext2D, stepMs: number, heightPx: number): void {
    if (this.liveCount === 0) return;
    const dt = stepMs / 1000;
    const drag = Math.exp(-2.2 * dt);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.plive[i] === 0) continue;
      const age = this.page[i]! + stepMs;
      if (age >= PARTICLE_LIFE_MS) {
        this.plive[i] = 0;
        this.liveCount--;
        continue;
      }
      this.page[i] = age;
      this.pvx[i] = this.pvx[i]! * drag;
      this.pvy[i] = this.pvy[i]! * drag - 14 * dt; // powder lifts, then hangs
      this.px[i] = this.px[i]! + this.pvx[i]! * dt;
      this.py[i] = this.py[i]! + this.pvy[i]! * dt;
      const life = 1 - age / PARTICLE_LIFE_MS;
      const sprite = this.sprites[this.pbucket[i]!];
      if (!sprite) continue;
      const size = SPRITE_PX * 0.5 * this.psize[i]! * (0.5 + life * 0.5);
      ctx.globalAlpha = life * life;
      ctx.drawImage(sprite, this.px[i]! - size / 2, heightPx + this.py[i]! - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  private drawHitLine(ctx: CanvasRenderingContext2D, palette: NotePalette, width: number, heightPx: number): void {
    const key = `${palette.stage.hitlineRgb}|${palette.stage.hitlinePeak}|${width}`;
    if (this.hitLineKey !== key || !this.hitLine) {
      const line = ctx.createLinearGradient(0, 0, width, 0);
      const rgb = palette.stage.hitlineRgb;
      line.addColorStop(0, `rgb(${rgb} / 0)`);
      line.addColorStop(0.5, `rgb(${rgb} / ${palette.stage.hitlinePeak})`);
      line.addColorStop(1, `rgb(${rgb} / 0)`);
      this.hitLine = line;
      this.hitLineKey = key;
      this.hitLineWidth = width;
    }
    ctx.fillStyle = this.hitLine;
    ctx.fillRect(0, heightPx - 2, this.hitLineWidth, 2);
  }

  /** Colour strings for every MIDI pitch, rebuilt only when the keyboard range changes. */
  private ensureColors(geometry: KeyboardGeometry, palette: NotePalette): void {
    const key = `${geometry.lowestNote}-${geometry.highestNote}-${palette.tone}`;
    if (key === this.colorsKey) return;
    this.colorsKey = key;
    const light = palette.tone === "light";
    this.colors = [];
    for (let midi = 0; midi < 128; midi++) {
      const hue = Math.round(hueFor(Math.min(geometry.highestNote, Math.max(geometry.lowestNote, midi)), geometry));
      this.colors.push({
        hi: `hsl(${hue} 100% ${light ? 70 : 82}%)`,
        base: `hsl(${hue} 100% ${light ? 50 : 60}%)`,
        lo: `hsl(${hue} 90% ${light ? 34 : 38}%)`,
        glow: `hsl(${hue} 100% 60% / 0.9)`,
      });
    }
  }

  /** One soft radial glow sprite per hue bucket, built once at mount. */
  private buildSprites(): void {
    if (this.sprites.length > 0 || typeof document === "undefined") return;
    for (let b = 0; b < HUE_BUCKETS; b++) {
      const hue = Math.round((b / (HUE_BUCKETS - 1)) * HUE_SPAN);
      const sprite = document.createElement("canvas");
      sprite.width = SPRITE_PX;
      sprite.height = SPRITE_PX;
      const sctx = sprite.getContext("2d");
      if (sctx) {
        const half = SPRITE_PX / 2;
        const g = sctx.createRadialGradient(half, half, 0, half, half, half);
        g.addColorStop(0, `hsl(${hue} 100% 90% / 1)`);
        g.addColorStop(0.25, `hsl(${hue} 100% 62% / 0.75)`);
        g.addColorStop(1, `hsl(${hue} 100% 50% / 0)`);
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
      }
      this.sprites.push(sprite);
    }
  }
}

export function create(): WaterfallRenderer {
  return new Neon2DRenderer();
}

