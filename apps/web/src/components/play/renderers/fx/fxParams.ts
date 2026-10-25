/**
 * The FX notes style's settings: every look is a set of these numbers. Pure data and
 * maths (no three, no DOM), so the settings sheet can list presets and sliders without
 * pulling the renderer's chunk, and the mapping can be unit-tested.
 */

export type FxBody = "glass" | "solid" | "gradient" | "outline";
export type FxColorMode = "single" | "byHand" | "byPitch" | "rainbow" | "byHeight";

export const FX_BODIES: readonly FxBody[] = ["glass", "solid", "gradient", "outline"];
export const FX_COLOR_MODES: readonly FxColorMode[] = ["single", "byHand", "byPitch", "rainbow", "byHeight"];

export interface FxParams {
  // Note body
  body: FxBody;
  /** 0 square .. 1 fully rounded ends. */
  cornerRadius: number;
  /** Brightness of the thin rim, 0..1. */
  rim: number;
  /** Strength of the animated smoky texture inside glass notes, 0..1. */
  noiseAmt: number;
  /** Scroll speed of that texture, 0..2. */
  noiseSpeed: number;
  // Colour
  colorMode: FxColorMode;
  /** Base hue in degrees. Gradient mode rotates its stops by (hue - first stop's hue). */
  hue: number;
  saturation: number;
  lightness: number;
  /** Colours at the hit line first, then upwards (1 to 4 `#RRGGBB`). Used by "byHeight". */
  stops: readonly string[];
  /** Degrees between the hands in "byHand". */
  handOffset: number;
  /** Degrees across the keyboard in "byPitch". */
  pitchSpan: number;
  /** Degrees per second of song time in "rainbow". */
  cycleSpeed: number;
  // Glow
  /** Bloom strength, 0 = off. */
  glow: number;
  /** Halo hugging each note. */
  noteGlow: number;
  // Hit line
  lineBrightness: number;
  /** Height of the flame tongues in px. */
  flameHeight: number;
  /** 0 steady .. 1 wild. */
  flameFlicker: number;
  /** Star flare on a pressed key. */
  flare: number;
  // Sparks
  sparkCount: number;
  sparkSize: number;
  sparkRise: number;
  sparkSwirl: number;
  sparkLife: number;
  // Smoke
  smokeDensity: number;
  smokeSwirl: number;
  /** `#RRGGBB` of the haze. */
  smokeColor: string;
  /** How much the smoke takes the colour of the note that made it. */
  smokeTint: number;
  // Pressed key
  keyTint: number;
  // Stage
  /** 0 shows the page's stage gradient, 1 is pure black. */
  background: number;
  laneAlpha: number;
  topFade: number;
}

export interface FxRange {
  min: number;
  max: number;
  step: number;
}

/** Slider ranges, also the clamp applied to anything loaded from storage. */
export const FX_RANGES = {
  cornerRadius: { min: 0, max: 1, step: 0.05 },
  rim: { min: 0, max: 1, step: 0.05 },
  noiseAmt: { min: 0, max: 1, step: 0.05 },
  noiseSpeed: { min: 0, max: 2, step: 0.05 },
  hue: { min: 0, max: 360, step: 1 },
  saturation: { min: 0, max: 1, step: 0.05 },
  lightness: { min: 0.3, max: 1, step: 0.01 },
  handOffset: { min: 0, max: 360, step: 5 },
  pitchSpan: { min: 0, max: 360, step: 5 },
  cycleSpeed: { min: 0, max: 120, step: 1 },
  glow: { min: 0, max: 1.5, step: 0.05 },
  noteGlow: { min: 0, max: 1, step: 0.05 },
  lineBrightness: { min: 0, max: 1, step: 0.05 },
  flameHeight: { min: 0, max: 60, step: 1 },
  flameFlicker: { min: 0, max: 1, step: 0.05 },
  flare: { min: 0, max: 1, step: 0.05 },
  sparkCount: { min: 0, max: 5000, step: 100 },
  sparkSize: { min: 0.5, max: 4, step: 0.1 },
  sparkRise: { min: 0, max: 200, step: 5 },
  sparkSwirl: { min: 0, max: 1, step: 0.05 },
  sparkLife: { min: 0.2, max: 2.5, step: 0.1 },
  smokeDensity: { min: 0, max: 1, step: 0.05 },
  smokeSwirl: { min: 0, max: 1, step: 0.05 },
  smokeTint: { min: 0, max: 1, step: 0.05 },
  keyTint: { min: 0, max: 1, step: 0.05 },
  background: { min: 0, max: 1, step: 0.05 },
  laneAlpha: { min: 0, max: 0.3, step: 0.01 },
  topFade: { min: 0, max: 0.5, step: 0.01 },
} as const satisfies Partial<Record<keyof FxParams, FxRange>>;

export type FxNumericKey = keyof typeof FX_RANGES;

export const FX_MAX_STOPS = 4;

// ── Colour maths ─────────────────────────────────────────────────────────────

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

/** Hue in degrees, saturation and lightness in 0..1. */
export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
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

/** Writes into `out` so callers on the frame path allocate nothing. */
export function hslToRgb(h: number, s: number, l: number, out: Float32Array | number[], offset = 0): void {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  out[offset] = r + m;
  out[offset + 1] = g + m;
  out[offset + 2] = b + m;
}

/** The hue, saturation and lightness of a `#RRGGBB`. */
export function hexHsl(hex: string): { hue: number; saturation: number; lightness: number } {
  const [hue, saturation, lightness] = rgbToHsl(hexToRgb(hex));
  return { hue: Math.round(hue), saturation: Math.round(saturation * 100) / 100, lightness: Math.round(lightness * 100) / 100 };
}

/** The colour of a note in the modes that give one colour per note (everything but "byHeight"). */
export function noteColor(
  params: Pick<FxParams, "colorMode" | "hue" | "saturation" | "lightness" | "handOffset" | "pitchSpan" | "cycleSpeed">,
  note: { hand: string; midi: number; startS: number },
  lowestNote: number,
  highestNote: number,
  out: Float32Array | number[],
  offset = 0,
): void {
  let hue = params.hue;
  switch (params.colorMode) {
    case "byHand":
      if (note.hand === "left") hue += params.handOffset;
      break;
    case "byPitch": {
      const span = highestNote - lowestNote;
      const t = span > 0 ? Math.min(1, Math.max(0, (note.midi - lowestNote) / span)) : 0;
      hue += t * params.pitchSpan;
      break;
    }
    case "rainbow":
      hue += note.startS * params.cycleSpeed;
      break;
    default:
      break;
  }
  hslToRgb(hue, params.saturation, params.lightness, out, offset);
}

/**
 * The height gradient's stops as 4 rgb triplets (a shorter list repeats its last colour),
 * rotated so that the first stop lands on `hue`.
 */
export function gradientStops(params: Pick<FxParams, "stops" | "hue">, out: Float32Array = new Float32Array(FX_MAX_STOPS * 3)): Float32Array {
  const stops = params.stops.length > 0 ? params.stops : ["#ffffff"];
  const shift = params.hue - rgbToHsl(hexToRgb(stops[0]!))[0];
  for (let i = 0; i < FX_MAX_STOPS; i++) {
    const [h, s, l] = rgbToHsl(hexToRgb(stops[Math.min(i, stops.length - 1)]!));
    hslToRgb(h + shift, s, l, out, i * 3);
  }
  return out;
}

// ── Presets ──────────────────────────────────────────────────────────────────

export type FxPresetId = "ember" | "spectrum" | "gold" | "frost" | "crimson" | "glassBlue" | "moonlight" | "clean" | "custom";

const BASE: FxParams = {
  body: "solid",
  cornerRadius: 0.35,
  rim: 0.1,
  noiseAmt: 0,
  noiseSpeed: 0.5,
  colorMode: "single",
  hue: 45,
  saturation: 1,
  lightness: 0.62,
  stops: ["#FFC83D"],
  handOffset: 150,
  pitchSpan: 300,
  cycleSpeed: 30,
  glow: 0.5,
  noteGlow: 0.2,
  lineBrightness: 0.6,
  flameHeight: 22,
  flameFlicker: 0.5,
  flare: 0.7,
  sparkCount: 3000,
  sparkSize: 1.5,
  sparkRise: 50,
  sparkSwirl: 0.5,
  sparkLife: 0.8,
  smokeDensity: 0.05,
  smokeSwirl: 0.4,
  smokeColor: "#8896A8",
  smokeTint: 0.3,
  keyTint: 0.5,
  background: 1,
  laneAlpha: 0.06,
  topFade: 0.1,
};

function fromStops(stops: string[], extra: Partial<FxParams>): FxParams {
  return { ...BASE, ...hexHsl(stops[0]!), colorMode: "byHeight", stops, ...extra };
}

function single(hex: string, extra: Partial<FxParams>): FxParams {
  return { ...BASE, ...hexHsl(hex), colorMode: "single", stops: [hex], ...extra };
}

/**
 * The eight looks from the reference video (reference notes §e), tuned against its frames:
 * wide rounded glass bars with a bright rim, a wide glow, dense spark clouds and a
 * starburst where notes land. Spectrum follows the owner's second reference instead:
 * neon bars across the whole colour range (by pitch), each with a slight hue shift.
 * Custom starts from Ramin's own target: red glass notes with a smoky inside, a
 * flickering line and red sparks and smoke rising from the keys.
 */
export const FX_PRESET_PARAMS: Record<Exclude<FxPresetId, "custom">, FxParams> = {
  ember: fromStops(["#FFD25A", "#FF9A4A", "#FF5C6E"], {
    body: "glass", cornerRadius: 0.6, rim: 0.5, noiseAmt: 0.3, noiseSpeed: 0.5,
    sparkCount: 3000, sparkSize: 1.5, sparkRise: 60, sparkLife: 0.9, sparkSwirl: 0.6,
    smokeDensity: 0.08, smokeColor: "#A0583A", smokeTint: 0.5, flare: 1, keyTint: 0.6, flameHeight: 36, flameFlicker: 0.7,
    glow: 0.95, noteGlow: 0.6, lineBrightness: 0.75,
  }),
  spectrum: {
    ...BASE, ...hexHsl("#8A4BFF"), colorMode: "byPitch", pitchSpan: 300, saturation: 1, lightness: 0.6, stops: ["#FFE066", "#FF7A3C", "#E8336B", "#8A4BFF"],
    body: "glass", cornerRadius: 0.6, rim: 0.55, noiseAmt: 0.35, noiseSpeed: 0.5,
    sparkCount: 3500, sparkSize: 1.4, sparkRise: 55, sparkLife: 1, sparkSwirl: 0.7,
    smokeDensity: 0.12, smokeSwirl: 0.6, smokeTint: 0.85, flare: 0.9, keyTint: 0.6, flameHeight: 28, flameFlicker: 0.6,
    glow: 1.05, noteGlow: 0.7, lineBrightness: 0.6,
  },
  gold: single("#FFC83D", {
    body: "glass", cornerRadius: 0.6, rim: 0.45, noiseAmt: 0.3, noiseSpeed: 0.45,
    sparkCount: 2500, sparkSize: 1.4, sparkRise: 45, sparkLife: 1, sparkSwirl: 0.6,
    smokeDensity: 0.06, smokeColor: "#8A6A30", smokeTint: 0.5, flare: 0.85, keyTint: 0.6, flameHeight: 38, flameFlicker: 0.75,
    glow: 0.9, noteGlow: 0.55, lineBrightness: 0.7,
  }),
  frost: single("#DDF3FF", {
    body: "glass", cornerRadius: 0.55, rim: 0.65, noiseAmt: 0.45, noiseSpeed: 0.4,
    sparkCount: 3000, sparkSize: 1.2, sparkRise: 45, sparkLife: 1.1, sparkSwirl: 0.75,
    smokeDensity: 0.3, smokeSwirl: 0.65, smokeColor: "#8FA6BF", smokeTint: 0.25, flare: 1, keyTint: 0.7, flameHeight: 18,
    glow: 0.95, noteGlow: 0.5, lineBrightness: 0.7,
  }),
  crimson: single("#FF2A2A", {
    body: "glass", cornerRadius: 0.55, rim: 0.8, noiseAmt: 0.8, noiseSpeed: 0.45, lightness: 0.52,
    sparkCount: 3500, sparkSize: 1.3, sparkRise: 50, sparkLife: 1, sparkSwirl: 0.75,
    smokeDensity: 0.18, smokeSwirl: 0.6, smokeColor: "#9A1C1C", smokeTint: 0.7, flare: 0.8, keyTint: 0.9, flameHeight: 30, flameFlicker: 0.8,
    glow: 1.05, noteGlow: 0.7, lineBrightness: 0.85,
  }),
  glassBlue: single("#4A6BFF", {
    body: "glass", cornerRadius: 0.55, rim: 0.65, noiseAmt: 0.65, noiseSpeed: 0.55,
    sparkCount: 3000, sparkSize: 1.4, sparkRise: 55, sparkLife: 1, sparkSwirl: 0.85,
    smokeDensity: 0.25, smokeColor: "#6F86C8", smokeTint: 0.45, flare: 1, keyTint: 0.85, flameHeight: 22,
    glow: 1.05, noteGlow: 0.7, lineBrightness: 0.75,
  }),
  moonlight: single("#F2F8FF", {
    body: "glass", cornerRadius: 0.55, rim: 0.7, noiseAmt: 0.4, noiseSpeed: 0.35,
    sparkCount: 3500, sparkSize: 1.2, sparkRise: 55, sparkLife: 1.2, sparkSwirl: 0.85,
    smokeDensity: 0.5, smokeSwirl: 0.8, smokeColor: "#AFC0D8", smokeTint: 0.15, flare: 1, keyTint: 0.75, flameHeight: 16,
    glow: 0.9, noteGlow: 0.35, lineBrightness: 0.7,
  }),
  clean: { ...BASE, ...hexHsl("#5AA9FF"), colorMode: "byHand", handOffset: 150, stops: ["#5AA9FF"], cornerRadius: 0.5, sparkCount: 0, smokeDensity: 0, flare: 0.2, keyTint: 0.3, glow: 0.2, noteGlow: 0.1, flameHeight: 0, flameFlicker: 0 },
};

/** Where Custom starts, until the user's own tweaks replace it. */
export const FX_CUSTOM_START: FxParams = single("#FF2A2A", {
  body: "glass", cornerRadius: 0.55, rim: 0.75, noiseAmt: 0.75, noiseSpeed: 0.45, lightness: 0.55,
  glow: 1.05, noteGlow: 0.65, lineBrightness: 0.85, flameHeight: 34, flameFlicker: 0.85, flare: 0.85,
  sparkCount: 3500, sparkSize: 1.4, sparkRise: 55, sparkSwirl: 0.75, sparkLife: 1,
  smokeDensity: 0.3, smokeSwirl: 0.6, smokeColor: "#B02020", smokeTint: 0.7, keyTint: 0.85,
});

export interface FxPresetInfo {
  id: FxPresetId;
  label: string;
}

export const FX_PRESETS: readonly FxPresetInfo[] = [
  { id: "ember", label: "Ember" },
  { id: "spectrum", label: "Spectrum" },
  { id: "gold", label: "Gold" },
  { id: "frost", label: "Frost" },
  { id: "crimson", label: "Crimson" },
  { id: "glassBlue", label: "Glass Blue" },
  { id: "moonlight", label: "Moonlight Smoke" },
  { id: "clean", label: "Clean" },
  { id: "custom", label: "Custom" },
];

export function isFxPresetId(value: unknown): value is FxPresetId {
  return FX_PRESETS.some((preset) => preset.id === value);
}

export const DEFAULT_FX_PRESET: FxPresetId = "custom";

/** The numbers behind a preset; Custom uses the user's own. */
export function paramsFor(preset: FxPresetId, custom: FxParams): FxParams {
  return preset === "custom" ? custom : FX_PRESET_PARAMS[preset];
}

const clamp = (value: unknown, range: FxRange, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : fallback;

/** Anything untrusted (storage) into valid params: unknown keys dropped, numbers clamped. */
export function sanitizeParams(input: unknown, fallback: FxParams = FX_CUSTOM_START): FxParams {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const out: FxParams = { ...fallback, stops: [...fallback.stops] };
  for (const key of Object.keys(FX_RANGES) as FxNumericKey[]) out[key] = clamp(raw[key], FX_RANGES[key], fallback[key]);
  out.body = FX_BODIES.includes(raw.body as FxBody) ? (raw.body as FxBody) : fallback.body;
  out.colorMode = FX_COLOR_MODES.includes(raw.colorMode as FxColorMode) ? (raw.colorMode as FxColorMode) : fallback.colorMode;
  out.smokeColor = isHex(raw.smokeColor) ? raw.smokeColor : fallback.smokeColor;
  if (Array.isArray(raw.stops)) {
    const stops = raw.stops.filter(isHex).slice(0, FX_MAX_STOPS);
    if (stops.length > 0) out.stops = stops;
  }
  return out;
}

// ── What a frame actually uses ───────────────────────────────────────────────

/** prefers-reduced-motion: nothing flickers or drifts, and only a few particles remain. */
export const REDUCED_MOTION_SPARK_FRACTION = 0.1;

export function effectiveParams(params: FxParams, reducedMotion: boolean): FxParams {
  if (!reducedMotion) return params;
  return {
    ...params,
    flameFlicker: 0,
    noiseSpeed: 0,
    cycleSpeed: 0,
    sparkCount: Math.round(params.sparkCount * REDUCED_MOTION_SPARK_FRACTION),
    sparkSwirl: 0,
    smokeSwirl: 0,
    smokeDensity: params.smokeDensity * 0.3,
  };
}
