import * as THREE from "three";
import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { noteMotion, type NotePalette } from "../../notePalette";
import { ClassicRenderer, judgementMark, type KeyboardGeometry } from "../../waterfall";
import type { WaterfallFrame, WaterfallRenderer } from "../types";
import { Bloom } from "./bloom";
import {
  clearMarks,
  createBlockLayer,
  createFlatLayer,
  createMarkLayer,
  MARK_KIND,
  pushMark,
  type BlockLayer,
  type FlatLayer,
  type MarkLayer,
} from "./blockMaterial";
import {
  blockRect,
  buildPitchColors,
  firstVisibleIndex,
  isSortedByStart,
  parseColor,
  parseRgbTriplet,
  pitchColorOffset,
  type BlockRect,
  type Rgb,
} from "./layout";
import { ParticlePool } from "./particles";
import { QualityGovernor, TIERS, type QualityTier } from "./qualityGovernor";

/**
 * The Neon 3D notes style (spec §3.12): bevelled glass blocks with an emissive core,
 * selective bloom, and a cloud of neon powder when a note is hit, drawn with `three`.
 *
 * - Alignment: an orthographic, front-on camera where one world unit is one CSS pixel,
 *   origin at the stage's bottom-left. Block x/width come only from `geometry.xFor`, y
 *   from `songTimeS`/`lookaheadS` exactly as Classic, so blocks sit on their keys.
 * - Timing: the renderer only reads frames. Judging and audio stay in the engine; a slow
 *   frame costs visual quality (the governor steps tiers down), never input or audio.
 * - Canvas: WebGL draws into a canvas of its own, placed where the host's canvas was
 *   (which is hidden meanwhile and restored on dispose). A canvas can only ever have one
 *   kind of context, and the host's may already be a 2D one from the Classic style.
 * - No WebGL 2: this falls back to Classic on the host canvas, with a notice.
 */

/** Burst sizes per tier; early/late use half. */
const BURST_PARTICLES: Record<QualityTier, number> = { ultra: 160, high: 90, medium: 40, minimal: 0 };
/** "Mid-burst": the explosive first moments of a burst, during which tiers never change. */
const BURST_PHASE_MS = 250;
const MISS_GLYPH_S = 0.48;
const GLYPH_S = 0.32;
const KEY_LIGHT_S = 0.4;
const BLOOM_INTENSITY = 0.85;
const REFLECTION_OPACITY = 0.15;
/** Height of the reflective floor band above the hit line, CSS px. */
const FLOOR_PX = 28;
/** In wait mode the song freezes at the note's start; a bar this close to the hit line is the target. */
const WAITING_WINDOW_S = 0.05;
const FALLBACK_EVENT = "ks:notes-style-fallback";

interface PaletteColors {
  miss: Rgb;
  missEdge: Rgb;
  waiting: Rgb;
  hitCore: Rgb;
  lane: [number, number, number, number];
  barline: [number, number, number, number];
  hitline: [number, number, number, number];
}

function premultiplied(input: string): [number, number, number, number] {
  const { rgb, alpha } = parseColor(input);
  return [rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha];
}

function paletteColors(palette: NotePalette): PaletteColors {
  const hitline = parseRgbTriplet(palette.stage.hitlineRgb);
  const peak = palette.stage.hitlinePeak;
  return {
    miss: parseColor(palette.judge.miss).rgb,
    missEdge: parseColor(palette.judge.missEdge).rgb,
    waiting: parseColor(palette.judge.waiting).rgb,
    hitCore: parseColor(palette.judge.hitCore).rgb,
    lane: premultiplied(palette.stage.lane),
    barline: premultiplied(palette.stage.barline),
    hitline: [hitline[0] * peak, hitline[1] * peak, hitline[2] * peak, peak],
  };
}

/** GPU time of a frame through EXT_disjoint_timer_query_webgl2, where the browser has it. */
class GpuTimer {
  private readonly free: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  lastMs: number | null = null;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number },
  ) {}

  static create(gl: WebGL2RenderingContext): GpuTimer | null {
    const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    return ext ? new GpuTimer(gl, ext) : null;
  }

  begin(): void {
    this.poll();
    if (this.active || this.pending.length >= 4) return;
    const query = this.free.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  private poll(): void {
    const gl = this.gl;
    while (this.pending.length > 0) {
      const query = this.pending[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
      this.pending.shift();
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) this.lastMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      this.free.push(query);
    }
  }

  dispose(): void {
    if (this.active) this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    for (const query of [...this.free, ...this.pending]) this.gl.deleteQuery(query);
    if (this.active) this.gl.deleteQuery(this.active);
    this.free.length = 0;
    this.pending.length = 0;
    this.active = null;
  }
}

/** A short notice for when Neon 3D cannot run here, plus an event the host may turn into a toast. */
function announceFallback(reason: string): HTMLElement | null {
  if (typeof window === "undefined") return null;
  window.dispatchEvent(new CustomEvent(FALLBACK_EVENT, { detail: { style: "neon3d", fallback: "classic", reason } }));
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.textContent = "Neon 3D needs WebGL 2, which isn't available here. Showing Classic notes.";
  Object.assign(notice.style, {
    position: "fixed",
    left: "50%",
    top: "calc(76px + env(safe-area-inset-top))",
    transform: "translateX(-50%)",
    maxWidth: "calc(100% - 32px)",
    padding: "10px 14px",
    borderRadius: "14px",
    background: "rgb(20 21 30 / 0.94)",
    color: "#fff",
    font: "500 14px/1.35 system-ui, -apple-system, sans-serif",
    zIndex: "60",
    pointerEvents: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 6000);
  return notice;
}

let liveRenderers = 0;

/** Upload the first `count` instances of an attribute, and nothing past them. */
function uploadRange(attribute: THREE.InstancedBufferAttribute, count: number): void {
  if (count === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

export class Neon3DRenderer implements WaterfallRenderer {
  private host: HTMLCanvasElement | null = null;
  private hostDisplay = "";
  private canvas: HTMLCanvasElement | null = null;
  private hostWatcher: MutationObserver | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private fallback: ClassicRenderer | null = null;
  private notice: HTMLElement | null = null;
  private contextLost = false;
  private disposed = false;

  private readonly scene = new THREE.Scene();
  private readonly emissiveScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly time = { value: 0 };
  private readonly epochMs = performance.now();
  private blocks: BlockLayer | null = null;
  private flats: FlatLayer | null = null;
  private marks: MarkLayer | null = null;
  private particles: ParticlePool | null = null;
  private bloom: Bloom | null = null;
  private gpuTimer: GpuTimer | null = null;

  private governor = new QualityGovernor("high", performance.now());
  private tier: QualityTier = "high";
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private pixelRatio = 1;
  private geometry: KeyboardGeometry | null = null;

  private palette: NotePalette | null = null;
  private colors: PaletteColors | null = null;
  private pitchColors: Float32Array | null = null;
  private pitchColorsKey = "";

  private notes: readonly PlayAlongNote[] | null = null;
  private notesSorted = false;
  private longestNoteS = 0;
  private hitAtMs = new Float64Array(0);
  private readonly rect: BlockRect = { x: 0, y: 0, w: 0, h: 0 };

  private flatCount = 0;
  private lastSongTimeS = Number.NaN;
  private lastDrawMs = 0;
  private lastBurstMs = -Infinity;
  private vsyncMs = 1000 / 60;
  private reducedMotion = false;
  private capture: ((value: Neon3DCapture) => void) | null = null;

  mount(hostCanvas: HTMLCanvasElement): void {
    this.host = hostCanvas;
    const canvas = document.createElement("canvas");
    canvas.className = hostCanvas.className;
    canvas.setAttribute("aria-label", hostCanvas.getAttribute("aria-label") ?? "Falling notes");
    canvas.style.display = "block";
    canvas.style.width = hostCanvas.style.width;
    canvas.style.height = hostCanvas.style.height;

    let renderer: THREE.WebGLRenderer;
    try {
      // three needs WebGL 2. Asking for the context first lets a device without it fall
      // back quietly instead of three logging an error.
      const context = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
      if (!context) throw new Error("WebGL 2 unavailable");
      renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    } catch (error) {
      this.useClassic(hostCanvas, error instanceof Error ? error.message : "WebGL 2 unavailable");
      return;
    }

    hostCanvas.after(canvas);
    this.hostDisplay = hostCanvas.style.display;
    hostCanvas.style.display = "none";
    this.canvas = canvas;
    // If the page removes its canvas (e.g. a notation-only view) without disposing this
    // renderer first, hide ours too rather than leave a frozen frame over the keys.
    if (hostCanvas.parentNode) {
      this.hostWatcher = new MutationObserver(() => {
        if (this.canvas && this.host && !this.host.isConnected) this.canvas.style.display = "none";
      });
      this.hostWatcher.observe(hostCanvas.parentNode, { childList: true });
    }
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.gpuTimer = GpuTimer.create(renderer.getContext() as WebGL2RenderingContext);

    this.flats = createFlatLayer(256);
    this.blocks = createBlockLayer(1024);
    this.marks = createMarkLayer(this.time);
    this.particles = new ParticlePool(this.time);
    this.bloom = new Bloom(renderer);
    this.scene.add(this.flats.mesh, this.blocks.colorMesh, this.particles.mesh, this.marks.mesh);
    this.emissiveScene.add(this.blocks.emissiveMesh, this.particles.emissiveMesh, this.marks.emissiveMesh);
    this.applyTier(this.tier);
    liveRenderers++;
    exposeForDevelopment(this);
  }

  resize(geometry: KeyboardGeometry, heightPx: number, dpr: number): void {
    if (this.fallback) {
      this.fallback.resize(geometry, heightPx, dpr);
      return;
    }
    this.geometry = geometry;
    if (geometry.widthPx === this.cssWidth && heightPx === this.cssHeight && dpr === this.dpr) return;
    this.cssWidth = geometry.widthPx;
    this.cssHeight = heightPx;
    this.dpr = dpr;
    this.applySize();
  }

  draw(frame: WaterfallFrame): void {
    if (this.fallback) {
      this.fallback.draw(frame);
      return;
    }
    const renderer = this.renderer;
    if (!renderer || this.contextLost || this.disposed || this.cssWidth <= 0 || this.cssHeight <= 0) return;
    const startMs = performance.now();
    const nowMs = frame.nowMs ?? startMs;
    const interval = this.lastDrawMs > 0 ? startMs - this.lastDrawMs : 0;
    const playing = frame.songTimeS !== this.lastSongTimeS && !Number.isNaN(this.lastSongTimeS);
    this.lastDrawMs = startMs;
    this.lastSongTimeS = frame.songTimeS;
    this.geometry = frame.geometry;
    this.time.value = (nowMs - this.epochMs) / 1000;
    if (frame.reducedMotion !== this.reducedMotion) {
      this.reducedMotion = frame.reducedMotion ?? false;
      if (this.reducedMotion) this.particles?.clear();
    }

    this.gpuTimer?.begin();
    this.preparePalette(frame);
    this.writeFlats(frame);
    this.writeBlocks(frame, nowMs);

    renderer.setRenderTarget(null);
    renderer.clear();
    const bloom = this.bloom;
    if (bloom?.enabled) {
      renderer.setRenderTarget(bloom.input);
      renderer.clear();
      renderer.render(this.emissiveScene, this.camera);
      bloom.run(renderer);
      renderer.setRenderTarget(null);
    }
    renderer.render(this.scene, this.camera);
    if (bloom?.enabled) {
      bloom.composite(renderer, {
        intensity: BLOOM_INTENSITY,
        floorUv: Math.min(0.5, FLOOR_PX / this.cssHeight),
        reflection: TIERS[this.tier].reflection ? REFLECTION_OPACITY : 0,
      });
    }
    this.gpuTimer?.end();
    if (this.capture) this.readCapture(renderer);

    this.measure(startMs, interval, playing);
  }

  onJudgement(index: number, judgement: PlayAlongJudgment, note: PlayAlongNote): void {
    if (this.fallback) {
      this.fallback.onJudgement(index, judgement, note);
      return;
    }
    const key = this.geometry?.xFor(note.midi);
    const marks = this.marks;
    const colors = this.colors;
    if (!key || !marks || !colors) return;
    const nowMs = performance.now();
    const timeS = (nowMs - this.epochMs) / 1000;
    const mark = judgementMark(judgement, this.lastSongTimeS, note.startS);
    const cx = key.x + key.width / 2;
    const glyph = Math.max(5, Math.min(key.width * 0.32, 9));
    const cy = glyph + 6;

    if (mark === "miss") {
      pushMark(marks, { x: cx, y: cy, size: glyph, kind: MARK_KIND.miss, timeS, lifeS: MISS_GLYPH_S, ringS: 0, ringReach: 0, color: colors.missEdge });
      return;
    }
    const burstMs = noteMotion(this.reducedMotion).burstMs;
    pushMark(marks, {
      x: cx,
      y: cy,
      size: glyph,
      kind: MARK_KIND[mark],
      timeS,
      lifeS: Math.max(GLYPH_S, burstMs / 1000),
      ringS: burstMs / 1000,
      ringReach: key.width * (mark === "hit" ? 0.9 : 0.45),
      color: colors.hitCore,
    });
    // Reduced motion: only the ring and the glyph. No flash, key light or particles.
    if (this.reducedMotion) return;
    if (index >= 0 && index < this.hitAtMs.length) this.hitAtMs[index] = nowMs;
    const table = this.pitchColors;
    if (!table) return;
    const offset = pitchColorOffset(note.hand, note.midi);
    const base = table.subarray(offset, offset + 3);
    const hi = table.subarray(offset + 3, offset + 6);
    pushMark(marks, { x: cx, y: 0, size: key.width, kind: MARK_KIND.keyLight, timeS, lifeS: KEY_LIGHT_S, ringS: 0, ringReach: 0, color: base });
    const count = BURST_PARTICLES[this.tier] * (mark === "hit" ? 1 : 0.5);
    if (count > 0) {
      this.particles?.burst({ x: cx, width: key.width, count: Math.round(count), color: hi, timeS });
      this.lastBurstMs = nowMs;
    }
  }

  reset(): void {
    if (this.fallback) {
      this.fallback.reset();
      return;
    }
    this.hitAtMs.fill(-Infinity);
    this.particles?.clear();
    if (this.marks) clearMarks(this.marks);
    this.governor.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.notice?.remove();
    this.notice = null;
    this.hostWatcher?.disconnect();
    this.hostWatcher = null;
    this.capture = null;
    if (this.renderer) {
      this.gpuTimer?.dispose();
      this.blocks?.dispose();
      this.flats?.dispose();
      this.marks?.dispose();
      this.particles?.dispose();
      this.bloom?.dispose();
      this.scene.clear();
      this.emissiveScene.clear();
      this.renderer.dispose();
      // Give the context back now rather than whenever the GC gets to it: browsers cap
      // live WebGL contexts, and entering and leaving the page must not run into that.
      this.renderer.forceContextLoss();
      this.renderer = null;
      liveRenderers--;
    }
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
      this.canvas.remove();
      this.canvas = null;
    }
    if (this.host) this.host.style.display = this.hostDisplay;
    this.host = null;
    this.blocks = null;
    this.flats = null;
    this.marks = null;
    this.particles = null;
    this.bloom = null;
    this.gpuTimer = null;
    exposeForDevelopment(null, this);
  }

  // ── Development hooks (stats, forced tiers, pixel capture) ─────────────────

  get currentTier(): QualityTier {
    return this.tier;
  }

  forceTier(tier: QualityTier): void {
    this.applyTier(tier);
  }

  stats(): Neon3DStats {
    const memory = this.renderer?.info.memory;
    return {
      tier: this.tier,
      p50Ms: this.governor.percentile(0.5),
      p95Ms: this.governor.p95(),
      gpuMs: this.gpuTimer?.lastMs ?? null,
      vsyncMs: this.vsyncMs,
      pixelRatio: this.pixelRatio,
      particles: TIERS[this.tier].particles,
      geometries: memory?.geometries ?? 0,
      textures: memory?.textures ?? 0,
      programs: this.renderer?.info.programs?.length ?? 0,
      liveRenderers,
    };
  }

  /** Pixels of the next frame, read straight after it is drawn. */
  captureNextFrame(): Promise<Neon3DCapture> {
    return new Promise((resolve) => {
      this.capture = resolve;
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private useClassic(hostCanvas: HTMLCanvasElement, reason: string): void {
    const classic = new ClassicRenderer();
    classic.mount(hostCanvas);
    this.fallback = classic;
    this.notice = announceFallback(reason);
  }

  private readonly onContextLost = (event: Event): void => {
    // Keep the context restorable; draw nothing until it is back.
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.particles?.clear();
    if (this.marks) clearMarks(this.marks);
    // Bloom targets are recreated at the current size.
    this.bloom?.configure({ width: 0, height: 0, scale: 0, mips: 0 });
    this.applySize();
  };

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    this.particles?.setCapacity(TIERS[tier].particles);
    this.applySize();
  }

  private applySize(): void {
    const renderer = this.renderer;
    const canvas = this.canvas;
    if (!renderer || !canvas || this.cssWidth <= 0 || this.cssHeight <= 0) return;
    const settings = TIERS[this.tier];
    this.pixelRatio = Math.min(this.dpr, settings.dprCap);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(this.cssWidth, this.cssHeight, false);
    canvas.style.width = `${this.cssWidth}px`;
    canvas.style.height = `${this.cssHeight}px`;
    // One world unit = one CSS pixel, origin at the bottom-left, y up.
    this.camera.left = 0;
    this.camera.right = this.cssWidth;
    this.camera.top = this.cssHeight;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    const pxSize = 1 / this.pixelRatio;
    if (this.blocks) this.blocks.uniforms.uPxSize.value = pxSize;
    if (this.marks) this.marks.uniforms.uPxSize.value = pxSize;
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloom?.configure({ width: buffer.x, height: buffer.y, scale: settings.bloomScale, mips: settings.bloomMips });
    // Frames right after a resize pay for new targets and say nothing about steady state.
    this.governor.clear();
  }

  private preparePalette(frame: WaterfallFrame): void {
    const { palette, geometry } = frame;
    if (palette !== this.palette) {
      this.palette = palette;
      this.colors = paletteColors(palette);
      const blocks = this.blocks;
      if (blocks) {
        blocks.uniforms.uMiss.value.fromArray(this.colors.miss);
        blocks.uniforms.uMissEdge.value.fromArray(this.colors.missEdge);
        blocks.uniforms.uWaiting.value.fromArray(this.colors.waiting);
      }
    }
    const key = `${palette.tone}:${geometry.lowestNote}:${geometry.highestNote}`;
    if (key !== this.pitchColorsKey || !this.pitchColors) {
      this.pitchColorsKey = key;
      this.pitchColors = buildPitchColors(palette, geometry.lowestNote, geometry.highestNote);
    }
  }

  private writeFlats(frame: WaterfallFrame): void {
    const flats = this.flats;
    const colors = this.colors;
    if (!flats || !colors) return;
    const { geometry, heightPx, lookaheadS, songTimeS } = frame;
    this.flatCount = 0;
    // Octave lane guides on the C lines.
    for (let note = geometry.lowestNote; note <= geometry.highestNote; note++) {
      if (note % 12 !== 0) continue;
      const lane = geometry.xFor(note);
      if (lane) this.putFlat(flats, lane.x, 0, 1.5, heightPx, colors.lane, 0);
    }
    // Falling barlines, the same transform as the notes.
    if (frame.bars) {
      const pxPerSecond = heightPx / lookaheadS;
      for (const bar of frame.bars) {
        const timeToStart = bar.timeS - songTimeS;
        if (timeToStart < 0 || timeToStart > lookaheadS) continue;
        this.putFlat(flats, 0, Math.round(timeToStart * pxPerSecond) - 1, geometry.widthPx, 1, colors.barline, 0);
      }
    }
    // The hit line, centre-weighted.
    this.putFlat(flats, 0, 0, geometry.widthPx, 2, colors.hitline, 1);
    const n = this.flatCount;
    flats.count = n;
    (flats.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    uploadRange(flats.rect, n);
    uploadRange(flats.color, n);
    uploadRange(flats.fade, n);
  }

  private putFlat(flats: FlatLayer, x: number, y: number, w: number, h: number, rgba: readonly number[], fades: number): void {
    const n = this.flatCount;
    if (n >= flats.capacity) return;
    const rect = flats.rect.array as Float32Array;
    const color = flats.color.array as Float32Array;
    rect[n * 4] = x;
    rect[n * 4 + 1] = y;
    rect[n * 4 + 2] = w;
    rect[n * 4 + 3] = h;
    color[n * 4] = rgba[0]!;
    color[n * 4 + 1] = rgba[1]!;
    color[n * 4 + 2] = rgba[2]!;
    color[n * 4 + 3] = rgba[3]!;
    (flats.fade.array as Float32Array)[n] = fades;
    this.flatCount = n + 1;
  }

  private trackNotes(notes: readonly PlayAlongNote[]): void {
    if (notes === this.notes) return;
    this.notes = notes;
    this.notesSorted = isSortedByStart(notes);
    let longest = 0;
    for (const note of notes) if (note.durationS > longest) longest = note.durationS;
    this.longestNoteS = longest;
    if (this.hitAtMs.length !== notes.length) this.hitAtMs = new Float64Array(notes.length);
    this.hitAtMs.fill(-Infinity);
  }

  private writeBlocks(frame: WaterfallFrame, nowMs: number): void {
    const { notes, judgments, songTimeS, lookaheadS, geometry, heightPx } = frame;
    const table = this.pitchColors;
    if (!this.blocks || !table) return;
    this.trackNotes(notes);
    const pxPerSecond = heightPx / lookaheadS;
    const flashMs = Math.max(noteMotion(this.reducedMotion).burstMs, 120);
    const waiting = frame.waitingPitches && frame.waitingPitches.length > 0 ? frame.waitingPitches : null;
    const start = this.notesSorted ? firstVisibleIndex(notes, songTimeS, this.longestNoteS) : 0;

    let blocks = this.blocks;
    let n = 0;
    for (let i = start; i < notes.length; i++) {
      const note = notes[i]!;
      const timeToStart = note.startS - songTimeS;
      if (timeToStart > lookaheadS) {
        if (this.notesSorted) break;
        continue;
      }
      if (timeToStart + note.durationS < 0) continue;
      const rect = blockRect(geometry, note, songTimeS, pxPerSecond, this.rect);
      if (!rect) continue;
      if (n >= blocks.capacity) blocks = this.growBlocks(blocks.capacity * 2);

      const judgment = judgments[i];
      const sounding = timeToStart <= 0;
      const hit = judgment !== undefined && judgment !== "miss";
      const hitAt = this.hitAtMs[i] ?? -Infinity;
      const flash = this.reducedMotion ? 0 : Math.max(0, 1 - (nowMs - hitAt) / flashMs);
      const isWaiting = judgment === undefined && waiting !== null && waiting.includes(note.midi) && Math.abs(timeToStart) <= WAITING_WINDOW_S;
      const offset = pitchColorOffset(note.hand, note.midi);

      const r = blocks.rect.array as Float32Array;
      r[n * 4] = rect.x;
      r[n * 4 + 1] = rect.y;
      r[n * 4 + 2] = rect.w;
      r[n * 4 + 3] = rect.h;
      const base = blocks.base.array as Float32Array;
      base[n * 3] = table[offset]!;
      base[n * 3 + 1] = table[offset + 1]!;
      base[n * 3 + 2] = table[offset + 2]!;
      const hi = blocks.hi.array as Float32Array;
      hi[n * 3] = table[offset + 3]!;
      hi[n * 3 + 1] = table[offset + 4]!;
      hi[n * 3 + 2] = table[offset + 5]!;
      const state = blocks.state.array as Float32Array;
      state[n * 4] = sounding || hit ? 1 : 0.35;
      state[n * 4 + 1] = flash;
      state[n * 4 + 2] = judgment === "miss" ? 1 : 0;
      state[n * 4 + 3] = isWaiting ? 1 : 0;
      n++;
    }
    blocks.geometry.instanceCount = n;
    uploadRange(blocks.rect, n);
    uploadRange(blocks.base, n);
    uploadRange(blocks.hi, n);
    uploadRange(blocks.state, n);
  }

  /** More notes on screen than the buffers hold (rare): rebuild them twice as large. */
  private growBlocks(capacity: number): BlockLayer {
    const old = this.blocks!;
    const grown = createBlockLayer(capacity);
    (grown.rect.array as Float32Array).set(old.rect.array as Float32Array);
    (grown.base.array as Float32Array).set(old.base.array as Float32Array);
    (grown.hi.array as Float32Array).set(old.hi.array as Float32Array);
    (grown.state.array as Float32Array).set(old.state.array as Float32Array);
    grown.uniforms.uMiss.value.copy(old.uniforms.uMiss.value);
    grown.uniforms.uMissEdge.value.copy(old.uniforms.uMissEdge.value);
    grown.uniforms.uWaiting.value.copy(old.uniforms.uWaiting.value);
    grown.uniforms.uPxSize.value = old.uniforms.uPxSize.value;
    this.scene.remove(old.colorMesh);
    this.emissiveScene.remove(old.emissiveMesh);
    this.scene.add(grown.colorMesh);
    this.emissiveScene.add(grown.emissiveMesh);
    old.dispose();
    this.blocks = grown;
    return grown;
  }

  /** Feed the governor this frame's cost and apply any tier change it decides on. */
  private measure(startMs: number, interval: number, playing: boolean): void {
    const cpuMs = performance.now() - startMs;
    let cost = cpuMs + (this.gpuTimer?.lastMs ?? 0);
    if (interval > 0) {
      // Track the display's frame interval from the quick frames; a frame that took much
      // longer than that was dropped, whatever this renderer's own share of it was.
      if (interval < this.vsyncMs * 1.25) this.vsyncMs += (interval - this.vsyncMs) * 0.05;
      if (interval > this.vsyncMs * 1.5 && interval < 250) cost = Math.max(cost, interval);
    }
    const nowMs = performance.now();
    const next = this.governor.sample({ costMs: cost, nowMs, playing, bursting: nowMs - this.lastBurstMs < BURST_PHASE_MS });
    if (next) this.applyTier(next);
  }

  private readCapture(renderer: THREE.WebGLRenderer): void {
    const resolve = this.capture;
    this.capture = null;
    if (!resolve) return;
    const gl = renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    resolve({ width, height, cssWidth: this.cssWidth, cssHeight: this.cssHeight, pixels });
  }
}

export interface Neon3DStats {
  tier: QualityTier;
  p50Ms: number | null;
  p95Ms: number | null;
  gpuMs: number | null;
  vsyncMs: number;
  pixelRatio: number;
  particles: number;
  geometries: number;
  textures: number;
  programs: number;
  liveRenderers: number;
}

/** Bottom-up rows (as WebGL reads them), RGBA, premultiplied. */
export interface Neon3DCapture {
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
  pixels: Uint8Array;
}

/** In development only: the live renderer on `window.__ksNeon3D`, for measuring it. */
function exposeForDevelopment(renderer: Neon3DRenderer | null, leaving?: Neon3DRenderer): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const slot = window as unknown as { __ksNeon3D?: Neon3DRenderer | null; __ksNeon3DLive?: () => number };
  if (renderer) slot.__ksNeon3D = renderer;
  else if (slot.__ksNeon3D === leaving) slot.__ksNeon3D = null;
  slot.__ksNeon3DLive = () => liveRenderers;
}

export function create(): WaterfallRenderer {
  return new Neon3DRenderer();
}
