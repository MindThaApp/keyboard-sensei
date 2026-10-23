import { beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  GLASS_BACKDROPS,
  GLASS_VARIANTS,
  MIN_TEXT_CONTRAST,
  SURFACES,
  TINT_PRESETS,
  TINT_SOFT_ALPHA,
  blurPx,
  classifyDevice,
  loadAppearance,
  milkAlpha,
  parseAppearance,
  refractionGeometry,
  resolveAppearance,
  resolveDensity,
  selectionAlpha,
  tintTextColor,
  worstGlassContrast,
  type AppearanceEnvironment,
  type AppearanceSettings,
  type ColorScheme,
} from "./appearance";
import { blend, contrastRatio, hexToRgb } from "./colorContrast";

const ENV: AppearanceEnvironment = {
  prefersDark: false,
  reducedTransparency: false,
  moreContrast: false,
  forcedColors: false,
  backdropFilter: true,
  lowEndDevice: false,
  width: 1024,
  height: 768,
  finePointer: false,
};

const SCHEMES: ColorScheme[] = ["light", "dark"];

function settings(patch: Partial<AppearanceSettings> = {}): AppearanceSettings {
  return { ...DEFAULT_APPEARANCE, ...patch };
}

describe("colour maths", () => {
  it("matches the published WCAG ratios", () => {
    expect(contrastRatio(hexToRgb("#000000"), hexToRgb("#FFFFFF"))).toBeCloseTo(21, 5);
    expect(contrastRatio(hexToRgb("#B4323E"), hexToRgb("#FFFFFF"))).toBeCloseTo(6.06, 2);
    expect(contrastRatio(hexToRgb("#FF6B76"), hexToRgb("#1C1C1E"))).toBeCloseTo(6.17, 2);
  });
});

describe("tint presets (§3.7 table)", () => {
  it.each(TINT_PRESETS.map((p) => [p.id, p] as const))("%s keeps the spec's measured ratios on plain surfaces", (_id, preset) => {
    const white = hexToRgb("#FFFFFF");
    expect(contrastRatio(hexToRgb(preset.light), white)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(hexToRgb(preset.light), hexToRgb("#F2F2F7"))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(hexToRgb(preset.dark), hexToRgb("#1C1C1E"))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrastRatio(hexToRgb(preset.dark), hexToRgb("#2C2C2E"))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    // tint-fill is the light value in both themes, under white text.
    expect(contrastRatio(white, hexToRgb(preset.light))).toBeGreaterThanOrEqual(5.38);
  });

  it.each(TINT_PRESETS.flatMap((p) => SCHEMES.map((s) => [p.id, s, p] as const)))(
    "%s (%s) tint text passes on every surface and on its own tint-soft",
    (_id, scheme, preset) => {
      const tint = tintTextColor(preset, scheme);
      const s = SURFACES[scheme];
      for (const hex of [s.bg, s.cell, s.elevated2]) {
        const surface = hexToRgb(hex);
        expect(contrastRatio(tint, surface)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        expect(contrastRatio(tint, blend(tint, TINT_SOFT_ALPHA[scheme], surface))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    },
  );

  it.each(TINT_PRESETS.flatMap((p) => SCHEMES.map((s) => [p.id, s, p] as const)))(
    "%s (%s) tint text reads inside the selection capsule over any backdrop",
    (_id, scheme, preset) => {
      const tint = tintTextColor(preset, scheme);
      const alpha = selectionAlpha(scheme, tint);
      expect(alpha).toBeGreaterThanOrEqual(0.92);
      for (const backdrop of GLASS_BACKDROPS) {
        const capsule = blend(hexToRgb(SURFACES[scheme].cell), alpha, backdrop);
        expect(contrastRatio(tint, capsule)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    },
  );

  it("leaves presets that already pass untouched", () => {
    const red = TINT_PRESETS.find((p) => p.id === "red")!;
    expect(tintTextColor(red, "light")).toEqual(hexToRgb("#B4323E"));
  });
});

describe("glass readability floor", () => {
  const blurValues = Array.from({ length: 101 }, (_, i) => i);
  const cases = SCHEMES.flatMap((theme) =>
    (["clear", "frosted"] as const).flatMap((glass) => (["off", "subtle", "vivid"] as const).map((sheen) => ({ theme, glass, sheen }))),
  );

  it.each(cases)("$theme / $glass / sheen $sheen: text reads at every blur value", ({ theme, glass, sheen }) => {
    for (const blur of blurValues) {
      const resolved = resolveAppearance(settings({ theme, glass, sheen, blur }), ENV);
      const variant = GLASS_VARIANTS[theme];
      const sheenOpacity = Number(resolved.vars["--glass-sheen"]);
      for (const alpha of [resolved.regular.alphaTop, resolved.regular.alphaBottom]) {
        expect(worstGlassContrast(variant, alpha, sheenOpacity, resolved.regular.scrim)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
      for (const alpha of [resolved.frosted.alphaTop, resolved.frosted.alphaBottom]) {
        expect(worstGlassContrast(variant, alpha, sheenOpacity)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
      for (const alpha of [resolved.onDark.alphaTop, resolved.onDark.alphaBottom]) {
        expect(worstGlassContrast(GLASS_VARIANTS.onDark, alpha, sheenOpacity)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      }
    }
  });

  it("raises Frosted only as far as it must: one step under the floor fails", () => {
    for (const theme of SCHEMES) {
      const resolved = resolveAppearance(settings({ theme, glass: "frosted" }), ENV);
      const sheenOpacity = Number(resolved.vars["--glass-sheen"]);
      const floor = resolved.regular.floor;
      expect(worstGlassContrast(GLASS_VARIANTS[theme], floor - 0.01, sheenOpacity)).toBeLessThan(4.6);
    }
  });

  it("keeps Clear see-through and protects its text with the scrim instead", () => {
    const resolved = resolveAppearance(settings({ glass: "clear" }), ENV);
    expect(resolved.regular.alphaTop).toBeGreaterThanOrEqual(0.15);
    expect(resolved.regular.alphaTop).toBeLessThanOrEqual(0.25);
    expect(resolved.regular.scrim).toBeGreaterThan(0);
    expect(worstGlassContrast(GLASS_VARIANTS.light, resolved.regular.alphaBottom, 0)).toBeLessThan(MIN_TEXT_CONTRAST);
  });

  it("maps the Blur slider with 50 as the designed look", () => {
    expect(blurPx(0)).toBe(0);
    expect(blurPx(50)).toBe(20);
    expect(blurPx(100)).toBe(24);
    expect(milkAlpha(75)).toBe(0);
    expect(milkAlpha(100)).toBeCloseTo(0.3, 5);
  });

  it("writes the derived alphas for inputs and panes", () => {
    const resolved = resolveAppearance(settings(), ENV);
    expect(Number(resolved.vars["--glass-input-a"])).toBeCloseTo(Math.min(resolved.frosted.alphaTop + 0.1, 0.97), 3);
    expect(Number(resolved.vars["--glass-pane-a"])).toBeCloseTo(resolved.regular.alphaTop / 2, 3);
  });

  it("caps refraction to a quarter of the short side", () => {
    expect(refractionGeometry(400, 80, 1).band).toBe(20);
    expect(refractionGeometry(400, 400, 0.6).band).toBeCloseTo(32.8, 5);
  });
});

describe("solid fallbacks", () => {
  it.each([
    ["reducedTransparency", "reduced-transparency"],
    ["moreContrast", "more-contrast"],
    ["forcedColors", "forced-colors"],
  ] as const)("%s forces Solid even when the user picked Clear", (flag, reason) => {
    const resolved = resolveAppearance(settings({ glass: "clear" }), { ...ENV, [flag]: true });
    expect(resolved.glass).toBe("solid");
    expect(resolved.solidReason).toBe(reason);
    expect(resolved.vars["--glass-sheen"]).toBe("0");
  });

  it("goes Solid without backdrop-filter support", () => {
    expect(resolveAppearance(settings(), { ...ENV, backdropFilter: false }).solidReason).toBe("no-backdrop-filter");
  });

  it("honours the user's Solid choice", () => {
    expect(resolveAppearance(settings({ glass: "solid" }), ENV).solidReason).toBe("user");
  });

  it("defaults low-end devices to Solid, but an explicit choice wins", () => {
    const lowEnd = { ...ENV, lowEndDevice: true };
    expect(resolveAppearance(settings(), lowEnd).glass).toBe("solid");
    expect(resolveAppearance(settings({ glass: "frosted" }), lowEnd).glass).toBe("frosted");
  });

  it("follows the system scheme only on Auto", () => {
    expect(resolveAppearance(settings({ theme: "auto" }), { ...ENV, prefersDark: true }).scheme).toBe("dark");
    expect(resolveAppearance(settings({ theme: "light" }), { ...ENV, prefersDark: true }).scheme).toBe("light");
  });
});

describe("device class and density", () => {
  it.each([
    [390, 844, false, "phone"],
    [844, 390, false, "phone"],
    [768, 1024, false, "tablet"],
    [1024, 768, false, "tablet"],
    [1024, 768, true, "desktop"],
    [1440, 900, true, "desktop"],
    [900, 700, true, "tablet"],
  ] as const)("%ix%i (fine pointer %s) is a %s", (w, h, fine, device) => {
    expect(classifyDevice(w, h, fine)).toBe(device);
  });

  it("is compact on phones unless overridden", () => {
    expect(resolveDensity("auto", "phone")).toBe("compact");
    expect(resolveDensity("auto", "tablet")).toBe("regular");
    expect(resolveDensity("regular", "phone")).toBe("regular");
    expect(resolveAppearance(settings(), { ...ENV, width: 390, height: 844 }).density).toBe("compact");
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips and rejects junk", () => {
    expect(parseAppearance({ theme: "sepia", blur: 400, tint: "pink", glass: "glossy" })).toEqual({
      ...DEFAULT_APPEARANCE,
      blur: 100,
      glass: "frosted",
    });
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "{not json");
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("carries over the old dark/midnight theme and accent, but not the old default light", () => {
    localStorage.setItem("keyboard-sensei-theme", "midnight");
    localStorage.setItem("keyboard-sensei-accent-theme", "ocean");
    expect(loadAppearance()).toMatchObject({ theme: "dark", tint: "ocean" });
    localStorage.setItem("keyboard-sensei-theme", "light");
    expect(loadAppearance().theme).toBe("auto");
  });
});
