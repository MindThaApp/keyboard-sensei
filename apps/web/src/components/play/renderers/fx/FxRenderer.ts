import * as THREE from "three";
import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { noteMotion, type NotePalette } from "../../notePalette";
import { ClassicRenderer, judgementMark, type KeyboardGeometry } from "../../waterfall";
import { NOTES_STYLE_FALLBACK_EVENT, type NotesStyleFallback, type WaterfallFrame, type WaterfallRenderer } from "../types";
import { Bloom } from "../neon3d/bloom";
import { clearMarks, createFlatLayer, createMarkLayer, MARK_KIND, pushMark, type FlatLayer, type MarkLayer } from "../neon3d/blockMaterial";
import { BLOCK_INSET_PX, MIN_BLOCK_HEIGHT_PX, firstVisibleIndex, isSortedByStart, parseColor, type Rgb } from "../neon3d/layout";
import { QualityGovernor, type QualityTier } from "../neon3d/qualityGovernor";
import { activeFxParams, getFxState, subscribeFx } from "./fxStore";
import {
  effectiveParams,
  gradientStops,
  hslToRgb,
  noteColor,
  type FxParams,
} from "./fxParams";
import {
  BODY_MODE,
  createKeyLayer,
  createLineLayer,
  createNoiseTexture,
  createNoteLayer,
  MAX_LIT_KEYS,
  type KeyLayer,
  type LineLayer,
  type NoteLayer,
} from "./fxLayers";
import { SmokePool, SparkPool } from "./fxParticles";
import { FX_TIERS, tierBloom, tierCounts } from "./fxTiers";

/**
 * The FX notes style: glass (or solid, gradient, outline) notes with an animated smoky
 * inside, a flickering glowing hit line, flare and flame where keys are pressed, curl-
 * swirled sparks and soft smoke rising from them, and one half-resolution bloom. Every
 * look is the numbers in `FxParams` (presets and the user's Custom), read live from
 * `fxStore`.
 *
 * Like Neon 3D it draws with `three` into a canvas of its own over an orthographic,
 * front-on camera (one world unit = one CSS px, origin bottom-left) and only reads
 * frames: judging and audio stay in the engine. A slow frame costs visual work (the
 * governor scales sparks, smoke and bloom down, then hands over to Neon 2D), never input
 * or audio. No WebGL 2 falls back to Classic.
 */

const MISS_GLYPH_S = 0.48;
const GLYPH_S = 0.32;
const WAITING_WINDOW_S = 0.05;
/** Seconds of spark life at the slider's value 1 (the slider is the life itself). */
const SMOKE_LIFE_S = 3.2;
/** Notes sounding at once that fill the spark and smoke pools. */
const FILL_NOTES = 22;
const MAX_EMIT_PER_FRAME = 90;
const DEBUG_KEY = "ks-fx-debug";

const HIT_RGB: Rgb = [0.95, 0.96, 1];

function announceFallback(detail: NotesStyleFallback): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotesStyleFallback>(NOTES_STYLE_FALLBACK_EVENT, { detail }));
}

function uploadRange(attribute: THREE.InstancedBufferAttribute, count: number): void {
  if (count === 0) return;
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

function premultiplied(input: string): [number, number, number, number] {
  const { rgb, alpha } = parseColor(input);
  return [rgb[0] * alpha, rgb[1] * alpha, rgb[2] * alpha, alpha];
}

let liveRenderers = 0;

export class FxRenderer implements WaterfallRenderer {
  private host: HTMLCanvasElement | null = null;
  private hostDisplay = "";
  private canvas: HTMLCanvasElement | null = null;
  private hostWatcher: MutationObserver | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private fallback: WaterfallRenderer | null = null;
  private handingOff = false;
  private contextLost = false;
  private disposed = false;
  private unsubscribe: (() => void) | null = null;

  private readonly scene = new THREE.Scene();
  private readonly emissiveScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly time = { value: 0 };
  private readonly timeF = { value: 0 };
  private readonly epochMs = performance.now();
  private noise: THREE.DataTexture | null = null;
  private flats: FlatLayer | null = null;
  private notes: NoteLayer | null = null;
  private line: LineLayer | null = null;
  private keys: KeyLayer | null = null;
  private sparks: SparkPool | null = null;
  private smoke: SmokePool | null = null;
  private marks: MarkLayer | null = null;
  private bloom: Bloom | null = null;

  private governor = new QualityGovernor("high", performance.now());
  private governorPinned = false;
  private tier: QualityTier = "high";
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;
  private pixelRatio = 1;
  private geometry: KeyboardGeometry | null = null;

  // The look in force.
  private params: FxParams = activeFxParams();
  private lookDirty = true;
  private reducedMotion = false;
  private bloomIntensity = 0;
  private readonly accent = new Float32Array(3);
  private readonly hotSpark = new Float32Array(6);
  /** Per hand and pitch colour, for the modes that do not depend on the note's time. */
  private readonly pitchRgb = new Float32Array(2 * 128 * 3);
  private pitchKey = "";
  private lanes: [number, number, number, number] = [0, 0, 0, 0];
  private barline: [number, number, number, number] = [0, 0, 0, 0];
  private missEdge: Rgb = [0.6, 0.6, 0.6];
  private palette: NotePalette | null = null;

  // Per-geometry key positions, so the frame path never calls xFor.
  private keyGeometry: KeyboardGeometry | null = null;
  private readonly keyX = new Float32Array(128);
  private readonly keyW = new Float32Array(128);

  private song: readonly PlayAlongNote[] | null = null;
  private songSorted = false;
  private longestNoteS = 0;
  private hitAtMs = new Float64Array(0);

  // Notes sounding this frame.
  private activeCount = 0;
  private readonly activeIndex = new Int32Array(MAX_LIT_KEYS);
  private readonly activeAge = new Float32Array(MAX_LIT_KEYS);

  private flatCount = 0;
  private lastSongTimeS = Number.NaN;
  private lastDrawMs = 0;
  private lastBurstMs = -Infinity;
  private vsyncMs = 1000 / 60;
  private visibleNotes = 0;
  private cpuMs = 0;

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
      const context = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      if (!context) throw new Error("WebGL 2 unavailable");
      renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    } catch {
      this.useClassic(hostCanvas);
      return;
    }

    hostCanvas.after(canvas);
    this.hostDisplay = hostCanvas.style.display;
    hostCanvas.style.display = "none";
    this.canvas = canvas;
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

    const noise = createNoiseTexture();
    this.noise = noise;
    this.flats = createFlatLayer(256);
    this.notes = createNoteLayer(1024, this.time, noise);
    this.line = createLineLayer(noise, this.timeF);
    this.keys = createKeyLayer(noise, this.timeF);
    this.sparks = new SparkPool(this.time);
    this.smoke = new SmokePool(this.time);
    this.smoke.uniforms.uNoise.value = noise;
    this.marks = createMarkLayer(this.time);
    this.bloom = new Bloom(renderer);
    this.scene.add(this.flats.mesh, this.smoke.mesh, this.notes.colorMesh, this.line.mesh, this.keys.mesh, this.sparks.mesh, this.marks.mesh);
    this.emissiveScene.add(this.notes.emissiveMesh, this.line.emissiveMesh, this.keys.emissiveMesh, this.sparks.emissiveMesh, this.marks.emissiveMesh);
    this.unsubscribe = subscribeFx(() => {
      this.lookDirty = true;
    });
    this.readDebugFlag();
    this.applyTier(this.tier);
    liveRenderers++;
    exposeForDebugging(this);
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
    const timeS = (nowMs - this.epochMs) / 1000;
    this.time.value = timeS;

    const reduced = frame.reducedMotion ?? false;
    if (reduced !== this.reducedMotion) {
      this.reducedMotion = reduced;
      this.lookDirty = true;
    }
    this.timeF.value = reduced ? 0 : timeS;
    if (this.lookDirty) this.applyLook();
    this.prepare(frame);

    const dt = playing ? Math.min(0.05, Math.max(0, interval / 1000)) : 0;
    this.writeFlats(frame);
    this.writeNotes(frame, nowMs);
    this.writeKeysAndEmit(frame, timeS, dt);

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
    if (bloom?.enabled) bloom.composite(renderer, { intensity: this.bloomIntensity, floorUv: 0.05, reflection: 0 });

    this.measure(startMs, interval, playing);
  }

  onJudgement(index: number, judgement: PlayAlongJudgment, note: PlayAlongNote): void {
    if (this.fallback) {
      this.fallback.onJudgement(index, judgement, note);
      return;
    }
    const marks = this.marks;
    const geometry = this.geometry;
    if (!marks || !geometry) return;
    this.ensureKeys(geometry);
    const width = this.keyW[note.midi] ?? 0;
    if (width <= 0) return;
    const cx = (this.keyX[note.midi] ?? 0) + width / 2;
    const nowMs = performance.now();
    const timeS = (nowMs - this.epochMs) / 1000;
    const mark = judgementMark(judgement, this.lastSongTimeS, note.startS);
    const glyph = Math.max(5, Math.min(width * 0.32, 9));
    const cy = glyph + 6;
    if (mark === "miss") {
      pushMark(marks, { x: cx, y: cy, size: glyph, kind: MARK_KIND.miss, timeS, lifeS: MISS_GLYPH_S, ringS: 0, ringReach: 0, color: this.missEdge });
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
      ringReach: width * (mark === "hit" ? 0.9 : 0.45),
      color: HIT_RGB,
    });
    if (!this.reducedMotion && index >= 0 && index < this.hitAtMs.length) {
      this.hitAtMs[index] = nowMs;
      this.lastBurstMs = nowMs;
    }
  }

  reset(): void {
    if (this.fallback) {
      this.fallback.reset();
      return;
    }
    this.hitAtMs.fill(-Infinity);
    this.sparks?.clear();
    this.smoke?.clear();
    if (this.marks) clearMarks(this.marks);
    this.governor.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.releaseWebGL();
    this.host = null;
  }

  private releaseWebGL(): void {
    this.hostWatcher?.disconnect();
    this.hostWatcher = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.renderer) {
      this.flats?.dispose();
      this.notes?.dispose();
      this.line?.dispose();
      this.keys?.dispose();
      this.sparks?.dispose();
      this.smoke?.dispose();
      this.marks?.dispose();
      this.bloom?.dispose();
      this.noise?.dispose();
      this.scene.clear();
      this.emissiveScene.clear();
      this.renderer.dispose();
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
    this.flats = this.notes = this.line = this.keys = this.marks = this.bloom = null;
    this.sparks = null;
    this.smoke = null;
    this.noise = null;
    exposeForDebugging(null, this);
  }

  // ── Debugging hooks (stats, pinned tiers); enabled by localStorage "ks-fx-debug" ──

  get currentTier(): QualityTier {
    return this.tier;
  }

  /** Stop the governor and stay on `tier` (null lets it work again). */
  pinTier(tier: QualityTier | null): void {
    this.governorPinned = tier !== null;
    if (tier) this.applyTier(tier);
  }

  stats(): FxStats {
    return {
      tier: this.tier,
      p50Ms: this.governor.percentile(0.5),
      p95Ms: this.governor.p95(),
      sparks: this.sparks?.size ?? 0,
      smoke: this.smoke?.size ?? 0,
      pixelRatio: this.pixelRatio,
      songTimeS: this.lastSongTimeS,
      visibleNotes: this.visibleNotes,
      cpuMs: this.cpuMs,
      sounding: this.activeCount,
      glRenderer: this.glRendererString(),
    };
  }

  private glRendererString(): string {
    const gl = this.renderer?.getContext();
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }

  private readDebugFlag(): void {
    try {
      // "pin" holds the starting tier; "pin:medium" holds that one.
      const flag = localStorage.getItem(DEBUG_KEY) ?? "";
      if (flag.startsWith("pin")) {
        this.governorPinned = true;
        const tier = flag.split(":")[1];
        if (tier === "ultra" || tier === "high" || tier === "medium" || tier === "minimal") this.tier = tier;
      }
    } catch {
      // Storage blocked: no debugging hooks.
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private useClassic(hostCanvas: HTMLCanvasElement): void {
    const classic = new ClassicRenderer();
    classic.mount(hostCanvas);
    this.fallback = classic;
    announceFallback({ style: "fx", fallback: "classic", reason: "unsupported" });
  }

  private handOffToNeon2D(): void {
    if (this.handingOff) return;
    this.handingOff = true;
    void import("../neon2d/Neon2DRenderer")
      .then(({ create }) => {
        const host = this.host;
        if (this.disposed || !host) return;
        this.releaseWebGL();
        const next = create();
        next.mount(host);
        if (this.geometry) next.resize(this.geometry, this.cssHeight, this.dpr);
        this.fallback = next;
        announceFallback({ style: "fx", fallback: "neon2d", reason: "performance" });
      })
      .catch(() => undefined);
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.sparks?.clear();
    this.smoke?.clear();
    if (this.marks) clearMarks(this.marks);
    this.bloom?.configure({ width: 0, height: 0, scale: 0, mips: 0 });
    this.applySize();
  };

  private applyTier(tier: QualityTier): void {
    this.tier = tier;
    this.lookDirty = true;
    this.applySize();
  }

  private applySize(): void {
    const renderer = this.renderer;
    const canvas = this.canvas;
    if (!renderer || !canvas || this.cssWidth <= 0 || this.cssHeight <= 0) return;
    this.pixelRatio = Math.min(this.dpr, FX_TIERS[this.tier].dprCap);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(this.cssWidth, this.cssHeight, false);
    canvas.style.width = `${this.cssWidth}px`;
    canvas.style.height = `${this.cssHeight}px`;
    this.camera.left = 0;
    this.camera.right = this.cssWidth;
    this.camera.top = this.cssHeight;
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    const pxSize = 1 / this.pixelRatio;
    if (this.notes) this.notes.uniforms.uPxSize.value = pxSize;
    if (this.marks) this.marks.uniforms.uPxSize.value = pxSize;
    this.sparks?.setPixelRatio(this.pixelRatio);
    if (this.line) this.line.uniforms.uSize.value.x = this.cssWidth;
    this.configureBloom();
    this.lookDirty = true;
    this.governor.clear();
  }

  private configureBloom(): void {
    const renderer = this.renderer;
    if (!renderer || !this.bloom) return;
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    const bloom = tierBloom(this.params, this.tier);
    this.bloomIntensity = bloom.intensity;
    this.bloom.configure({ width: buffer.x, height: buffer.y, scale: bloom.scale, mips: bloom.mips });
  }

  /** Push the look's numbers into uniforms and pools. Runs on a look or tier change. */
  private applyLook(): void {
    this.lookDirty = false;
    const notes = this.notes;
    const line = this.line;
    const keys = this.keys;
    if (!notes || !line || !keys || !this.sparks || !this.smoke) return;
    const p = effectiveParams(activeFxParams(getFxState()), this.reducedMotion);
    this.params = p;
    const tier = FX_TIERS[this.tier];
    const n = notes.uniforms;
    n.uMode.value = BODY_MODE[p.body];
    n.uColorHeight.value = p.colorMode === "byHeight" ? 1 : 0;
    gradientStops(p, n.uStops.value);
    n.uCorner.value = p.cornerRadius;
    n.uRim.value = p.rim;
    n.uNoiseAmt.value = p.noiseAmt;
    n.uNoiseSpeed.value = p.noiseSpeed;
    n.uGlassNoise.value = tier.glassNoise ? 1 : 0;
    n.uNoteGlow.value = p.noteGlow;
    n.uTopFade.value = p.topFade;

    // Accent: the colour of the hit line and the sparks' base.
    if (p.colorMode === "byHeight") {
      this.accent.set(n.uStops.value.subarray(0, 3));
      this.hotSpark.set(n.uStops.value.subarray(0, 3), 0);
      this.hotSpark.set(n.uStops.value.subarray(3, 6), 3);
    } else {
      hslToRgb(p.hue, p.saturation, p.lightness, this.accent);
      this.hotSpark.set(this.accent, 0);
      this.hotSpark.set(this.accent, 3);
    }
    line.uniforms.uAccent.value.fromArray(this.accent);
    line.uniforms.uBright.value = p.lineBrightness;
    line.uniforms.uFlame.value = p.flameHeight;
    line.uniforms.uFlick.value = p.flameFlicker;
    line.uniforms.uSize.value.y = Math.max(6, p.flameHeight * 0.5 + 8);
    keys.uniforms.uFlame.value = p.flameHeight;
    keys.uniforms.uFlare.value = p.flare;
    keys.uniforms.uTint.value = p.keyTint;
    keys.uniforms.uFlick.value = p.flameFlicker;
    this.sparks.setLook(p.sparkRise, p.sparkSwirl, p.sparkSize);
    const counts = tierCounts(p, this.tier);
    if (counts.sparks !== this.sparks.size) this.sparks.setCapacity(counts.sparks);
    if (counts.smoke !== this.smoke.size) this.smoke.setCapacity(counts.smoke);
    const smoke = this.smoke.uniforms;
    smoke.uSwirl.value = p.smokeSwirl;
    smoke.uDensity.value = Math.min(1.4, p.smokeDensity * 2.6);
    const [r, g, b] = parseHex(p.smokeColor);
    smoke.uSmoke.value.set(r, g, b);
    this.pitchKey = "";
    this.configureBloom();
  }

  private prepare(frame: WaterfallFrame): void {
    const palette = frame.palette;
    if (palette !== this.palette) {
      this.palette = palette;
      this.barline = premultiplied(palette.stage.barline);
      this.missEdge = parseColor(palette.judge.missEdge).rgb;
    }
    const geometry = frame.geometry;
    this.ensureKeys(geometry);
    const key = `${geometry.lowestNote}:${geometry.highestNote}`;
    if (key !== this.pitchKey) {
      this.pitchKey = key;
      const p = this.params;
      const stub = { hand: "right", midi: 0, startS: 0 };
      for (let hand = 0; hand < 2; hand++) {
        stub.hand = hand === 0 ? "right" : "left";
        for (let midi = 0; midi < 128; midi++) {
          stub.midi = midi;
          noteColor(p, stub, geometry.lowestNote, geometry.highestNote, this.pitchRgb, (hand * 128 + midi) * 3);
        }
      }
    }
  }

  private ensureKeys(geometry: KeyboardGeometry): void {
    if (geometry === this.keyGeometry) return;
    this.keyGeometry = geometry;
    this.keyW.fill(0);
    for (let midi = geometry.lowestNote; midi <= geometry.highestNote; midi++) {
      const key = geometry.xFor(midi);
      if (!key) continue;
      this.keyX[midi] = key.x + BLOCK_INSET_PX;
      this.keyW[midi] = key.width - BLOCK_INSET_PX * 2;
    }
  }

  private putFlat(flats: FlatLayer, x: number, y: number, w: number, h: number, rgba: readonly number[]): void {
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
    (flats.fade.array as Float32Array)[n] = 0;
    this.flatCount = n + 1;
  }

  private writeFlats(frame: WaterfallFrame): void {
    const flats = this.flats;
    if (!flats) return;
    const { geometry, heightPx, lookaheadS, songTimeS } = frame;
    const p = this.params;
    this.flatCount = 0;
    const bg = p.background;
    if (bg > 0) this.putFlat(flats, 0, 0, geometry.widthPx, heightPx, [0, 0, 0, bg]);
    if (p.laneAlpha > 0) {
      this.lanes[0] = this.lanes[1] = this.lanes[2] = this.lanes[3] = p.laneAlpha;
      for (let note = geometry.lowestNote; note <= geometry.highestNote; note++) {
        if (note % 12 !== 0 || this.keyW[note] === 0) continue;
        this.putFlat(flats, (this.keyX[note] ?? 0) - BLOCK_INSET_PX, 0, 1.5, heightPx, this.lanes);
      }
    }
    if (frame.bars) {
      const pxPerSecond = heightPx / lookaheadS;
      for (const bar of frame.bars) {
        const timeToStart = bar.timeS - songTimeS;
        if (timeToStart < 0 || timeToStart > lookaheadS) continue;
        this.putFlat(flats, 0, Math.round(timeToStart * pxPerSecond) - 1, geometry.widthPx, 1, this.barline);
      }
    }
    const n = this.flatCount;
    (flats.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    uploadRange(flats.rect, n);
    uploadRange(flats.color, n);
    uploadRange(flats.fade, n);
  }

  private trackSong(notes: readonly PlayAlongNote[]): void {
    if (notes === this.song) return;
    this.song = notes;
    this.songSorted = isSortedByStart(notes);
    let longest = 0;
    for (const note of notes) if (note.durationS > longest) longest = note.durationS;
    this.longestNoteS = longest;
    if (this.hitAtMs.length !== notes.length) this.hitAtMs = new Float64Array(notes.length);
    this.hitAtMs.fill(-Infinity);
  }

  private writeNotes(frame: WaterfallFrame, nowMs: number): void {
    let layer = this.notes;
    if (!layer) return;
    const { notes, judgments, songTimeS, lookaheadS, heightPx } = frame;
    this.trackSong(notes);
    layer.uniforms.uHeight.value = heightPx;
    const pxPerSecond = heightPx / lookaheadS;
    const flashMs = Math.max(noteMotion(this.reducedMotion).burstMs, 120);
    const waiting = frame.waitingPitches && frame.waitingPitches.length > 0 ? frame.waitingPitches : null;
    const start = this.songSorted ? firstVisibleIndex(notes, songTimeS, this.longestNoteS) : 0;
    const rainbow = this.params.colorMode === "rainbow";
    const heightMode = this.params.colorMode === "byHeight";
    this.activeCount = 0;

    let n = 0;
    for (let i = start; i < notes.length; i++) {
      const note = notes[i]!;
      const timeToStart = note.startS - songTimeS;
      if (timeToStart > lookaheadS) {
        if (this.songSorted) break;
        continue;
      }
      if (timeToStart + note.durationS < 0) continue;
      const width = this.keyW[note.midi] ?? 0;
      if (width <= 0) continue;
      if (n >= layer.capacity) layer = this.growNotes(layer.capacity * 2);

      const judgment = judgments[i];
      const sounding = timeToStart <= 0;
      const hit = judgment !== undefined && judgment !== "miss";
      const hitAt = this.hitAtMs[i] ?? -Infinity;
      const flash = this.reducedMotion ? 0 : Math.max(0, 1 - (nowMs - hitAt) / flashMs);
      const isWaiting = judgment === undefined && waiting !== null && waiting.includes(note.midi) && Math.abs(timeToStart) <= WAITING_WINDOW_S;

      const r = layer.rect.array as Float32Array;
      r[n * 4] = this.keyX[note.midi]!;
      r[n * 4 + 1] = timeToStart * pxPerSecond;
      r[n * 4 + 2] = width;
      r[n * 4 + 3] = Math.max(MIN_BLOCK_HEIGHT_PX, note.durationS * pxPerSecond);
      const c = layer.color.array as Float32Array;
      if (!heightMode) {
        if (rainbow) noteColor(this.params, note, 0, 0, c, n * 3);
        else {
          const o = ((note.hand === "left" ? 1 : 0) * 128 + note.midi) * 3;
          c[n * 3] = this.pitchRgb[o]!;
          c[n * 3 + 1] = this.pitchRgb[o + 1]!;
          c[n * 3 + 2] = this.pitchRgb[o + 2]!;
        }
      }
      const s = layer.state.array as Float32Array;
      s[n * 4] = sounding || hit ? 1 : 0.35;
      s[n * 4 + 1] = flash;
      s[n * 4 + 2] = (i * 0.6180339887) % 1;
      s[n * 4 + 3] = judgment === "miss" ? 1 : isWaiting ? 2 : 0;
      n++;

      if (sounding && judgment !== "miss" && this.activeCount < MAX_LIT_KEYS) {
        this.activeIndex[this.activeCount] = i;
        this.activeAge[this.activeCount] = -timeToStart;
        this.activeCount++;
      }
    }
    this.visibleNotes = n;
    layer.geometry.instanceCount = n;
    uploadRange(layer.rect, n);
    uploadRange(layer.color, n);
    uploadRange(layer.state, n);
  }

  private growNotes(capacity: number): NoteLayer {
    const old = this.notes!;
    const grown = createNoteLayer(capacity, this.time, this.noise!, old);
    (grown.rect.array as Float32Array).set(old.rect.array as Float32Array);
    (grown.color.array as Float32Array).set(old.color.array as Float32Array);
    (grown.state.array as Float32Array).set(old.state.array as Float32Array);
    this.scene.remove(old.colorMesh);
    this.emissiveScene.remove(old.emissiveMesh);
    this.scene.add(grown.colorMesh);
    this.emissiveScene.add(grown.emissiveMesh);
    old.dispose();
    this.notes = grown;
    return grown;
  }

  /** Lit keys (flare, flame, tint) for every sounding note, and the sparks and smoke they emit. */
  private writeKeysAndEmit(frame: WaterfallFrame, timeS: number, dt: number): void {
    const keys = this.keys;
    const sparks = this.sparks;
    const smoke = this.smoke;
    const song = this.song;
    if (!keys || !sparks || !smoke || !song) return;
    const p = this.params;
    const count = this.activeCount;
    const kRect = keys.key.array as Float32Array;
    const kColor = keys.color.array as Float32Array;
    const heightMode = p.colorMode === "byHeight";
    const rainbow = p.colorMode === "rainbow";
    const sparkLife = p.sparkLife;
    const sparkRate = sparks.size > 0 ? sparks.size / (sparkLife * FILL_NOTES) : 0;
    const smokeRate = smoke.size > 0 ? smoke.size / (SMOKE_LIFE_S * 3) : 0;
    let emitted = 0;
    if (dt > 0) {
      sparks.beginBatch();
      smoke.beginBatch();
    }
    for (let a = 0; a < count; a++) {
      const note = song[this.activeIndex[a]!]!;
      const age = this.activeAge[a]!;
      const remaining = note.durationS - age;
      const x = this.keyX[note.midi]!;
      const w = this.keyW[note.midi]!;
      const o = (note.hand === "left" ? 1 : 0) * 128 * 3 + note.midi * 3;
      let r: number;
      let g: number;
      let b: number;
      if (heightMode) {
        r = this.accent[0]!;
        g = this.accent[1]!;
        b = this.accent[2]!;
      } else if (rainbow) {
        noteColor(p, note, 0, 0, this.hotSpark, 0);
        r = this.hotSpark[0]!;
        g = this.hotSpark[1]!;
        b = this.hotSpark[2]!;
      } else {
        r = this.pitchRgb[o]!;
        g = this.pitchRgb[o + 1]!;
        b = this.pitchRgb[o + 2]!;
      }
      // A key eases out over the last moments of its note rather than snapping off.
      const env = Math.min(1, Math.max(0, remaining / 0.12)) * Math.min(1, 0.35 + age / 0.04);
      kRect[a * 4] = x + w / 2;
      kRect[a * 4 + 1] = w;
      kRect[a * 4 + 2] = env;
      kRect[a * 4 + 3] = (note.midi * 0.37) % 1;
      kColor[a * 4] = r;
      kColor[a * 4 + 1] = g;
      kColor[a * 4 + 2] = b;
      kColor[a * 4 + 3] = age;

      if (dt <= 0 || emitted >= MAX_EMIT_PER_FRAME) continue;
      const onset = 1 + 1.5 * Math.exp(-age * 9);
      const nSparks = Math.floor(sparkRate * onset * dt + Math.random());
      for (let k = 0; k < nSparks; k++) {
        const hot = heightMode && Math.random() < 0.5 ? 3 : 0;
        const sr = heightMode ? this.hotSpark[hot]! : r;
        const sg = heightMode ? this.hotSpark[hot + 1]! : g;
        const sb = heightMode ? this.hotSpark[hot + 2]! : b;
        sparks.emit(x + w / 2, w, timeS, sparkLife, sr, sg, sb);
      }
      emitted += nSparks;
      const nSmoke = Math.floor(smokeRate * dt * (1 + onset * 0.3) + Math.random());
      for (let k = 0; k < nSmoke; k++) smoke.emit(x + w / 2, timeS, SMOKE_LIFE_S, 70 + w * 1.2, 22 + p.smokeSwirl * 10, p.smokeTint, r, g, b);
    }
    if (dt > 0) {
      sparks.endBatch();
      smoke.endBatch();
    }
    keys.geometry.instanceCount = count;
    uploadRange(keys.key, count);
    uploadRange(keys.color, count);
  }

  private measure(startMs: number, interval: number, playing: boolean): void {
    const cpu = performance.now() - startMs;
    this.cpuMs += (cpu - this.cpuMs) * 0.05;
    if (this.governorPinned) return;
    let cost = cpu;
    if (interval > 0) {
      // Track the display's frame interval from quick frames; a frame much longer than
      // that was dropped, whatever this renderer's own CPU share of it was (GPU-bound).
      if (interval < this.vsyncMs * 1.25) this.vsyncMs += (interval - this.vsyncMs) * 0.05;
      if (interval > this.vsyncMs * 1.5 && interval < 250) cost = Math.max(cost, interval);
    }
    const nowMs = performance.now();
    const next = this.governor.sample({ costMs: cost, nowMs, playing, bursting: nowMs - this.lastBurstMs < 250 });
    if (!next) return;
    this.applyTier(next);
    if (next === "minimal") this.handOffToNeon2D();
  }
}

function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface FxStats {
  tier: QualityTier;
  p50Ms: number | null;
  p95Ms: number | null;
  sparks: number;
  smoke: number;
  pixelRatio: number;
  songTimeS: number;
  visibleNotes: number;
  /** Smoothed CPU time of one draw() call. */
  cpuMs: number;
  sounding: number;
  glRenderer: string;
}

/** With localStorage "ks-fx-debug" set, the live renderer is on `window.__ksFx` for measuring it. */
function exposeForDebugging(renderer: FxRenderer | null, leaving?: FxRenderer): void {
  if (typeof window === "undefined") return;
  try {
    if (!localStorage.getItem(DEBUG_KEY)) return;
  } catch {
    return;
  }
  const slot = window as unknown as { __ksFx?: FxRenderer | null; __ksFxLive?: () => number };
  if (renderer) slot.__ksFx = renderer;
  else if (slot.__ksFx === leaving) slot.__ksFx = null;
  slot.__ksFxLive = () => liveRenderers;
}

export function create(): WaterfallRenderer {
  return new FxRenderer();
}
