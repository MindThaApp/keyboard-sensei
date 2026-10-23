/**
 * The appearance engine. Five user settings (theme, glass style, blur, tint, sheen)
 * plus the device's own preferences resolve to one set of CSS variables on <html>;
 * no component computes colours or alphas itself.
 *
 * The core rule is the readability floor: the glass alpha the user's settings ask for
 * is raised until the dimmest text allowed on glass reaches 4.5:1 against whatever is
 * behind it — measured over black, mid-grey and white backdrops, with and without the
 * sheen highlight. Clear glass keeps its low alpha for the look and instead gets a
 * local text scrim whose alpha is solved the same way.
 */
import { blend, contrastRatio, hexToRgb, mix, rgbTriplet, softLight, type Rgb } from "./colorContrast";

export type ThemePreference = "light" | "dark" | "auto";
export type ColorScheme = "light" | "dark";
export type GlassStyle = "clear" | "frosted" | "solid";
export type SheenLevel = "off" | "subtle" | "vivid";
export type TintId = "red" | "ocean" | "forest" | "violet" | "amber" | "teal" | "graphite";
export type DensityPreference = "auto" | "compact" | "regular";
export type Density = "compact" | "regular";
export type DeviceClass = "phone" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";
export type SolidReason =
  | "user"
  | "reduced-transparency"
  | "more-contrast"
  | "forced-colors"
  | "no-backdrop-filter"
  | "low-end-device";

export interface AppearanceSettings {
  v: 1;
  theme: ThemePreference;
  /** null = not chosen yet: Frosted, or Solid on a low-end device. */
  glass: GlassStyle | null;
  /** 0–100; 50 is the designed look. */
  blur: number;
  tint: TintId;
  sheen: SheenLevel;
  /** No UI yet; "auto" follows the device class. */
  density: DensityPreference;
}

export const APPEARANCE_STORAGE_KEY = "ks-appearance";

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  v: 1,
  theme: "auto",
  glass: null,
  blur: 50,
  tint: "red",
  sheen: "subtle",
  density: "auto",
};

/** WCAG AA body text, plus a little headroom for 8-bit rounding of rgba() channels. */
export const MIN_TEXT_CONTRAST = 4.5;
const SOLVE_TARGET = 4.6;

// ---------------------------------------------------------------------------
// Tint presets (§3.7). `light` is used as text/icons in light mode and as the fill
// behind white text in both modes; `dark` is text/icons in dark mode.

export interface TintPreset {
  id: TintId;
  label: string;
  light: string;
  dark: string;
}

export const TINT_PRESETS: readonly TintPreset[] = [
  { id: "red", label: "Piano red", light: "#B4323E", dark: "#FF6B76" },
  { id: "ocean", label: "Ocean", light: "#0A66C2", dark: "#5AA9FF" },
  { id: "forest", label: "Forest", light: "#1F7A3A", dark: "#4CD872" },
  { id: "violet", label: "Violet", light: "#6E4BD8", dark: "#B39DFF" },
  { id: "amber", label: "Amber", light: "#A34700", dark: "#FFA552" },
  { id: "teal", label: "Teal", light: "#00727A", dark: "#3FD0D9" },
  { id: "graphite", label: "Graphite", light: "#4A4A4F", dark: "#C7C7CC" },
];

export const TINT_SOFT_ALPHA: Record<ColorScheme, number> = { light: 0.12, dark: 0.16 };

export function tintPreset(id: TintId): TintPreset {
  return TINT_PRESETS.find((preset) => preset.id === id) ?? TINT_PRESETS[0];
}

/** Every solid surface tint text may sit on (bg, cell, and the raised dark cell). */
function tintSurfaces(scheme: ColorScheme): Rgb[] {
  const s = SURFACES[scheme];
  return [s.bg, s.cell, s.elevated2].map(hexToRgb);
}

function worstTintContrast(tint: Rgb, scheme: ColorScheme): number {
  let worst = Infinity;
  for (const surface of tintSurfaces(scheme)) {
    const soft = blend(tint, TINT_SOFT_ALPHA[scheme], surface);
    worst = Math.min(worst, contrastRatio(tint, surface), contrastRatio(tint, soft));
  }
  return worst;
}

/**
 * Tint as text and icons. The preset values pass on plain surfaces, but several dip
 * just under 4.5:1 on their own `--tint-soft` (tinted buttons, selected rows) — e.g.
 * Forest on the grouped background, or Piano red on the raised dark cell. Those are
 * nudged darker (light) or lighter (dark) in 1% steps until every pairing passes.
 */
export function tintTextColor(preset: TintPreset, scheme: ColorScheme): Rgb {
  const start = hexToRgb(scheme === "dark" ? preset.dark : preset.light);
  const towards: Rgb = scheme === "dark" ? [255, 255, 255] : [0, 0, 0];
  for (let step = 0; step <= 60; step += 1) {
    const candidate = mix(start, towards, step / 100).map(Math.round) as unknown as Rgb;
    if (worstTintContrast(candidate, scheme) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return towards;
}

/** Worst contrast of the resolved tint text on plain and tint-soft surfaces. */
export function tintContrast(id: TintId, scheme: ColorScheme): number {
  return worstTintContrast(tintTextColor(tintPreset(id), scheme), scheme);
}

// ---------------------------------------------------------------------------
// Surface colours the maths needs (mirrors tokens.css).

export const SURFACES: Record<ColorScheme, { bg: string; cell: string; elevated2: string; label: string; label2: string }> = {
  light: { bg: "#F2F2F7", cell: "#FFFFFF", elevated2: "#FFFFFF", label: "#000000", label2: "#3C3C43" },
  dark: { bg: "#000000", cell: "#1C1C1E", elevated2: "#2C2C2E", label: "#FFFFFF", label2: "#EBEBF5" },
};

/** The worst cases for text on a translucent panel: whatever scrolls underneath. */
export const GLASS_BACKDROPS: readonly Rgb[] = [hexToRgb("#000000"), hexToRgb("#808080"), hexToRgb("#FFFFFF")];

// ---------------------------------------------------------------------------
// Glass material (§3.3)

export interface GlassVariant {
  base: Rgb;
  /** Every text colour allowed on this glass: label and label-2. */
  texts: readonly Rgb[];
  /** White lift painted over the fill (dark glass only). */
  lift: number;
}

const WHITE: Rgb = [255, 255, 255];

export const GLASS_VARIANTS = {
  light: { base: [255, 255, 255], texts: [hexToRgb("#000000"), hexToRgb("#3C3C43")], lift: 0 },
  dark: { base: [32, 32, 32], texts: [hexToRgb("#FFFFFF"), hexToRgb("#EBEBF5")], lift: 0.05 },
  /** Bars over the practice stage and keybed, in both themes. */
  onDark: { base: [20, 20, 22], texts: [hexToRgb("#FFFFFF"), hexToRgb("#EBEBF5")], lift: 0 },
} satisfies Record<string, GlassVariant>;

/** Designed alphas; the floor may raise them. */
export const GLASS_DESIGN_ALPHA = 0.55;
const CLEAR_ALPHA_FACTOR = 0.4;
const ON_DARK_DESIGN_ALPHA = 0.42;
/** The fill is a vertical gradient from `a` to `a * GRADIENT_FALLOFF`. */
export const GRADIENT_FALLOFF = 0.85;
/** The sheen highlight's peak alpha inside its radial gradient (index.css `.glass::before`). */
export const SHEEN_PEAK = 0.55;
const SELECTION_MIN_ALPHA = 0.92;

export const SHEEN_OPACITY: Record<ColorScheme, Record<SheenLevel, number>> = {
  light: { off: 0, subtle: 0.55, vivid: 0.9 },
  dark: { off: 0, subtle: 0.3, vivid: 0.49 },
};
const REFRACTION_LEVEL: Record<SheenLevel, number> = { off: 0, subtle: 0, vivid: 0.6 };

interface CompositeLayers {
  alpha: number;
  sheen: number;
  scrim: number;
}

/** What a reader actually sees behind a glyph: backdrop → fill → lift → sheen → scrim. */
export function glassComposite(variant: GlassVariant, backdrop: Rgb, layers: CompositeLayers): Rgb {
  let colour = blend(variant.base, layers.alpha, backdrop);
  if (variant.lift > 0) colour = blend(WHITE, variant.lift, colour);
  if (layers.sheen > 0) colour = softLight(WHITE, layers.sheen * SHEEN_PEAK, colour);
  if (layers.scrim > 0) colour = blend(variant.base, layers.scrim, colour);
  return colour;
}

/** Lowest text contrast on this glass over every backdrop, with and without the sheen. */
export function worstGlassContrast(variant: GlassVariant, alpha: number, sheen: number, scrim = 0): number {
  let worst = Infinity;
  for (const backdrop of GLASS_BACKDROPS) {
    for (const s of sheen > 0 ? [0, sheen] : [0]) {
      const surface = glassComposite(variant, backdrop, { alpha, sheen: s, scrim });
      for (const text of variant.texts) worst = Math.min(worst, contrastRatio(text, surface));
    }
  }
  return worst;
}

function solveMinimum(passes: (value: number) => boolean): number {
  for (let step = 0; step <= 100; step += 1) {
    const value = step / 100;
    if (passes(value)) return value;
  }
  return 1;
}

/** The readability floor: the smallest alpha at which every allowed text colour reads. */
export function alphaFloor(variant: GlassVariant, sheen: number): number {
  return solveMinimum((a) => worstGlassContrast(variant, a, sheen) >= SOLVE_TARGET);
}

function roundUp(value: number): number {
  return Math.ceil(value * 100 - 1e-9) / 100;
}

export interface GlassMetrics {
  /** Top and bottom stops of the fill gradient. */
  alphaTop: number;
  alphaBottom: number;
  /** Alpha of the local backing behind text runs (Clear only; 0 otherwise). */
  scrim: number;
  floor: number;
  /** Worst measured text contrast, including the scrim where one applies. */
  contrast: number;
}

export function glassMetrics(variant: GlassVariant, style: "clear" | "frosted", designAlpha: number, sheen: number): GlassMetrics {
  const floor = alphaFloor(variant, sheen);
  if (style === "clear") {
    const alphaTop = roundUp(designAlpha * CLEAR_ALPHA_FACTOR);
    const alphaBottom = alphaTop * GRADIENT_FALLOFF;
    const scrim = solveMinimum((s) => worstGlassContrast(variant, alphaBottom, sheen, s) >= SOLVE_TARGET);
    return { alphaTop, alphaBottom, scrim, floor, contrast: worstGlassContrast(variant, alphaBottom, sheen, scrim) };
  }
  const alphaTop = Math.min(1, roundUp(Math.max(designAlpha, floor / GRADIENT_FALLOFF)));
  const alphaBottom = alphaTop * GRADIENT_FALLOFF;
  return { alphaTop, alphaBottom, scrim: 0, floor, contrast: worstGlassContrast(variant, alphaBottom, sheen) };
}

/** Selected-item capsule on glass: cell colour, opaque enough for tint text over anything. */
export function selectionAlpha(scheme: ColorScheme, tintText: Rgb): number {
  const cell = hexToRgb(SURFACES[scheme].cell);
  const passes = (a: number) =>
    GLASS_BACKDROPS.every((backdrop) => contrastRatio(tintText, blend(cell, a, backdrop)) >= SOLVE_TARGET);
  return Math.max(SELECTION_MIN_ALPHA, solveMinimum(passes));
}

/** Blur slider: 0 → 0px, 50 → 20px (designed), 100 → 24px. */
export function blurPx(slider: number): number {
  const v = clamp(slider, 0, 100);
  return v <= 50 ? (20 * v) / 50 : 20 + (4 * (v - 50)) / 50;
}

/** Above 75 the slider adds a milk veil in the glass base colour, up to 0.3. */
export function milkAlpha(slider: number): number {
  const v = clamp(slider, 0, 100);
  return v <= 75 ? 0 : (0.3 * (v - 75)) / 25;
}

/** The hero-only "magnifying rim" (§3.3), for whoever renders it. */
export function refractionGeometry(width: number, height: number, level: number) {
  const band = Math.min(16 + 28 * level, Math.min(width, height) / 4);
  const d = band * (0.25 + 0.5 * level);
  return { band, scale: width / (width + 2 * d), opacity: 0.35 + 0.65 * level, bevel: 0.16 * level };
}

// ---------------------------------------------------------------------------
// Device class and density

/** A short side under this is a phone: the compact UI. */
export const PHONE_MAX_SHORT_SIDE = 600;
/** At or above this width with a fine pointer is a laptop/desktop. */
export const DESKTOP_MIN_WIDTH = 1024;

export function classifyDevice(width: number, height: number, finePointer: boolean): DeviceClass {
  if (Math.min(width, height) < PHONE_MAX_SHORT_SIDE) return "phone";
  if (width >= DESKTOP_MIN_WIDTH && finePointer) return "desktop";
  return "tablet";
}

export function resolveDensity(preference: DensityPreference, device: DeviceClass): Density {
  if (preference !== "auto") return preference;
  return device === "phone" ? "compact" : "regular";
}

// ---------------------------------------------------------------------------
// Environment

export interface AppearanceEnvironment {
  prefersDark: boolean;
  reducedTransparency: boolean;
  moreContrast: boolean;
  forcedColors: boolean;
  backdropFilter: boolean;
  lowEndDevice: boolean;
  width: number;
  height: number;
  finePointer: boolean;
}

export const MEDIA_QUERIES = {
  dark: "(prefers-color-scheme: dark)",
  reducedTransparency: "(prefers-reduced-transparency: reduce)",
  moreContrast: "(prefers-contrast: more)",
  forcedColors: "(forced-colors: active)",
  finePointer: "(pointer: fine)",
} as const;

export function readEnvironment(win: Window = window): AppearanceEnvironment {
  const matches = (query: string) => win.matchMedia?.(query).matches ?? false;
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  const supportsCss = (decl: string) => (typeof CSS !== "undefined" && typeof CSS.supports === "function" ? CSS.supports(decl) : false);
  return {
    prefersDark: matches(MEDIA_QUERIES.dark),
    reducedTransparency: matches(MEDIA_QUERIES.reducedTransparency),
    moreContrast: matches(MEDIA_QUERIES.moreContrast),
    forcedColors: matches(MEDIA_QUERIES.forcedColors),
    backdropFilter: supportsCss("backdrop-filter: blur(1px)") || supportsCss("-webkit-backdrop-filter: blur(1px)"),
    lowEndDevice: cores <= 4 && memory <= 3,
    width: win.innerWidth,
    height: win.innerHeight,
    finePointer: matches(MEDIA_QUERIES.finePointer),
  };
}

// ---------------------------------------------------------------------------
// Resolution

export interface ResolvedAppearance {
  scheme: ColorScheme;
  glass: GlassStyle;
  solidReason: SolidReason | null;
  device: DeviceClass;
  density: Density;
  orientation: Orientation;
  regular: GlassMetrics;
  onDark: GlassMetrics;
  vars: Record<string, string>;
}

/** Why glass is solid, or null. System reasons win over the user's own choice. */
export function solidReasonFor(settings: AppearanceSettings, env: AppearanceEnvironment): SolidReason | null {
  if (env.forcedColors) return "forced-colors";
  if (env.reducedTransparency) return "reduced-transparency";
  if (env.moreContrast) return "more-contrast";
  if (!env.backdropFilter) return "no-backdrop-filter";
  if (settings.glass === "solid") return "user";
  if (settings.glass === null && env.lowEndDevice) return "low-end-device";
  return null;
}

/** The legacy felt-* scale (kept as an alias during migration), derived from the tint. */
function legacyAccentRamp(tint: Rgb): Record<string, string> {
  const white = WHITE;
  const black: Rgb = [0, 0, 0];
  const stops: Record<number, Rgb> = {
    50: mix(tint, white, 0.94),
    100: mix(tint, white, 0.86),
    300: mix(tint, white, 0.45),
    400: mix(tint, white, 0.22),
    500: mix(tint, white, 0.1),
    600: tint,
    700: mix(tint, black, 0.17),
    800: mix(tint, black, 0.32),
    900: mix(tint, black, 0.46),
  };
  return Object.fromEntries(Object.entries(stops).map(([k, v]) => [`--color-felt-${k}`, rgbTriplet(v)]));
}

export function resolveAppearance(settings: AppearanceSettings, env: AppearanceEnvironment): ResolvedAppearance {
  const scheme: ColorScheme = settings.theme === "auto" ? (env.prefersDark ? "dark" : "light") : settings.theme;
  const solidReason = solidReasonFor(settings, env);
  const glass: GlassStyle = solidReason ? "solid" : settings.glass ?? "frosted";
  const device = classifyDevice(env.width, env.height, env.finePointer);
  const density = resolveDensity(settings.density, device);
  const orientation: Orientation = env.width >= env.height ? "landscape" : "portrait";

  const preset = tintPreset(settings.tint);
  const tintText = tintTextColor(preset, scheme);
  const tintFill = hexToRgb(preset.light);
  const sheen = glass === "solid" ? 0 : SHEEN_OPACITY[scheme][settings.sheen];
  const style = glass === "clear" ? "clear" : "frosted";
  const regular = glassMetrics(GLASS_VARIANTS[scheme], style, GLASS_DESIGN_ALPHA, sheen);
  // Bars over the stage always use the floor, never the Clear look (§3.7 practice cap).
  const onDark = glassMetrics(GLASS_VARIANTS.onDark, "frosted", ON_DARK_DESIGN_ALPHA, sheen);
  const selection = selectionAlpha(scheme, tintText);
  // Clear-dark bars are dark in both themes, so they always take the dark tint.
  const tintOnDark = tintTextColor(preset, "dark");
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

  const vars: Record<string, string> = {
    "--tint-rgb": rgbTriplet(tintText),
    "--tint-fill-rgb": rgbTriplet(tintFill),
    "--tint-soft-a": fmt(TINT_SOFT_ALPHA[scheme]),
    "--tint-pressed-rgb": rgbTriplet(mix(tintFill, [0, 0, 0], 0.14)),
    ...legacyAccentRamp(tintFill),
    "--glass-a": fmt(regular.alphaTop),
    "--glass-a2": fmt(regular.alphaBottom),
    "--glass-scrim-a": fmt(regular.scrim),
    "--glass-input-a": fmt(Math.min(regular.alphaTop + 0.1, 0.97)),
    "--glass-pane-a": fmt(regular.alphaTop / 2),
    "--glass-milk-a": fmt(milkAlpha(settings.blur)),
    "--glass-blur-user": `${fmt(blurPx(settings.blur))}px`,
    "--glass-sheen": fmt(sheen),
    "--glass-selection-a": fmt(selection),
    "--glass-od-a": fmt(onDark.alphaTop),
    "--glass-od-a2": fmt(onDark.alphaBottom),
    "--tint-on-dark-rgb": rgbTriplet(tintOnDark),
    "--glass-od-selection-a": fmt(selectionAlpha("dark", tintOnDark)),
    "--refraction-l": fmt(glass === "solid" ? 0 : REFRACTION_LEVEL[settings.sheen]),
  };

  return { scheme, glass, solidReason, device, density, orientation, regular, onDark, vars };
}

/** Writes a resolved appearance onto <html>. The only place appearance touches the DOM. */
export function writeAppearance(resolved: ResolvedAppearance, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(resolved.vars)) root.style.setProperty(name, value);
  root.classList.toggle("dark", resolved.scheme === "dark");
  root.classList.toggle("appearance-solid", resolved.glass === "solid");
  root.dataset.theme = resolved.scheme;
  root.dataset.glassStyle = resolved.glass;
  root.dataset.density = resolved.density;
  root.dataset.device = resolved.device;
  root.dataset.orientation = resolved.orientation;
  if (resolved.solidReason) root.dataset.solidReason = resolved.solidReason;
  else delete root.dataset.solidReason;

  const themeColor = resolved.scheme === "dark" ? "#000000" : "#F2F2F7";
  root.ownerDocument.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", themeColor));
}

export function applyAppearance(
  settings: AppearanceSettings,
  env: AppearanceEnvironment = readEnvironment(),
  root?: HTMLElement,
): ResolvedAppearance {
  const resolved = resolveAppearance(settings, env);
  writeAppearance(resolved, root);
  return resolved;
}

/**
 * During a slider drag only blur and milk change; the floor maths waits for release.
 */
export function previewBlur(slider: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty("--glass-blur-user", `${blurPx(slider)}px`);
  root.style.setProperty("--glass-milk-a", String(milkAlpha(slider)));
}

// ---------------------------------------------------------------------------
// Storage (per device, versioned JSON)

const LEGACY_THEME_KEY = "keyboard-sensei-theme";
const LEGACY_ACCENT_KEY = "keyboard-sensei-accent-theme";
const LEGACY_ACCENTS: Record<string, TintId> = { felt: "red", ocean: "ocean", forest: "forest", violet: "violet" };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function parseAppearance(raw: unknown): AppearanceSettings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AppearanceSettings, unknown>>;
  const d = DEFAULT_APPEARANCE;
  const blur = typeof input.blur === "number" && Number.isFinite(input.blur) ? clamp(Math.round(input.blur), 0, 100) : d.blur;
  return {
    v: 1,
    theme: oneOf<ThemePreference>(input.theme, ["light", "dark", "auto"], d.theme),
    glass: input.glass === null || input.glass === undefined ? null : oneOf<GlassStyle>(input.glass, ["clear", "frosted", "solid"], "frosted"),
    blur,
    tint: oneOf<TintId>(input.tint, TINT_PRESETS.map((p) => p.id), d.tint),
    sheen: oneOf<SheenLevel>(input.sheen, ["off", "subtle", "vivid"], d.sheen),
    density: oneOf<DensityPreference>(input.density, ["auto", "compact", "regular"], d.density),
  };
}

export function loadAppearance(storage: Storage = localStorage): AppearanceSettings {
  try {
    const stored = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (stored) return parseAppearance(JSON.parse(stored));
    // First run after the redesign: carry over the old theme and accent pickers.
    const legacyTheme = storage.getItem(LEGACY_THEME_KEY);
    const legacyAccent = storage.getItem(LEGACY_ACCENT_KEY);
    return parseAppearance({
      // The old picker always stored "light" (its default), so only a dark choice carries over.
      theme: legacyTheme === "dark" || legacyTheme === "midnight" ? "dark" : undefined,
      tint: legacyAccent ? LEGACY_ACCENTS[legacyAccent] : undefined,
    });
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(settings: AppearanceSettings, storage: Storage = localStorage): void {
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the setting still applies for this session.
  }
}
