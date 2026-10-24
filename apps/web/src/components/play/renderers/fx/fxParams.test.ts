import { describe, expect, it } from "vitest";
import {
  DEFAULT_FX_PRESET,
  effectiveParams,
  FX_CUSTOM_START,
  FX_PRESET_PARAMS,
  FX_PRESETS,
  FX_RANGES,
  gradientStops,
  hexHsl,
  hslToRgb,
  noteColor,
  paramsFor,
  REDUCED_MOTION_SPARK_FRACTION,
  rgbToHsl,
  sanitizeParams,
  type FxNumericKey,
  type FxParams,
} from "./fxParams";
import { generateNoise, NOISE_SIZE } from "./fxNoise";

const rgb = (params: FxParams, note: { hand: string; midi: number; startS: number }, lo = 36, hi = 96): number[] => {
  const out = [0, 0, 0];
  noteColor(params, note, lo, hi, out);
  return out;
};
const hueOf = (c: number[]) => rgbToHsl([c[0]!, c[1]!, c[2]!])[0];
const right = { hand: "right", midi: 60, startS: 0 };

describe("presets", () => {
  it("lists the eight looks from the reference, then Custom", () => {
    expect(FX_PRESETS.map((p) => p.label)).toEqual(["Ember", "Spectrum", "Gold", "Frost", "Crimson", "Glass Blue", "Moonlight Smoke", "Clean", "Custom"]);
  });

  it("keeps every preset value inside the slider ranges", () => {
    for (const [id, params] of Object.entries(FX_PRESET_PARAMS)) {
      for (const key of Object.keys(FX_RANGES) as FxNumericKey[]) {
        expect(params[key], `${id}.${key}`).toBeGreaterThanOrEqual(FX_RANGES[key].min);
        expect(params[key], `${id}.${key}`).toBeLessThanOrEqual(FX_RANGES[key].max);
      }
    }
  });

  it("maps the reference table onto parameters", () => {
    const { ember, spectrum, gold, frost, crimson, glassBlue, moonlight, clean } = FX_PRESET_PARAMS;
    expect([ember.colorMode, ember.stops, ember.sparkCount, ember.sparkRise, ember.flare]).toEqual(["byHeight", ["#FFD25A", "#FF9A4A", "#FF5C6E"], 3000, 60, 0.9]);
    expect([spectrum.stops.length, spectrum.sparkCount, spectrum.flare]).toEqual([4, 3500, 0.8]);
    expect([gold.colorMode, gold.body, gold.sparkCount]).toEqual(["single", "gradient", 2000]);
    expect([frost.smokeDensity, frost.sparkSwirl]).toEqual([0.15, 0.6]);
    expect([crimson.hue, crimson.noteGlow, crimson.keyTint]).toEqual([0, 0.5, 0.8]);
    expect([glassBlue.body, glassBlue.noiseAmt, glassBlue.noiseSpeed, glassBlue.rim, glassBlue.sparkSwirl, glassBlue.flare]).toEqual(["glass", 0.5, 0.5, 0.4, 0.8, 1]);
    expect([moonlight.sparkCount, moonlight.smokeDensity, moonlight.noteGlow]).toEqual([4000, 0.35, 0.3]);
    expect([clean.sparkCount, clean.smokeDensity, clean.flare, clean.keyTint, clean.colorMode]).toEqual([0, 0, 0.2, 0.3, "byHand"]);
  });

  it("starts on Custom, whose starting look is the red glass target", () => {
    expect(DEFAULT_FX_PRESET).toBe("custom");
    expect(FX_CUSTOM_START.body).toBe("glass");
    expect(FX_CUSTOM_START.hue).toBe(0);
    expect(FX_CUSTOM_START.noiseAmt).toBeGreaterThan(0.4);
    expect(FX_CUSTOM_START.flameFlicker).toBeGreaterThan(0.5);
    expect(FX_CUSTOM_START.sparkCount).toBeGreaterThan(0);
    expect(FX_CUSTOM_START.smokeDensity).toBeGreaterThan(0);
  });

  it("uses the stored numbers for Custom and the preset's own otherwise", () => {
    const mine = { ...FX_CUSTOM_START, hue: 123 };
    expect(paramsFor("custom", mine)).toBe(mine);
    expect(paramsFor("gold", mine)).toBe(FX_PRESET_PARAMS.gold);
  });
});

describe("sanitizeParams", () => {
  it("clamps numbers, drops unknown keys and bad enums, and fills gaps", () => {
    const out = sanitizeParams({ hue: 999, glow: -4, body: "stone", colorMode: "rainbow", sparkCount: "many", extra: 1, smokeColor: "red", stops: ["#112233", "nope", "#445566"] });
    expect(out.hue).toBe(FX_RANGES.hue.max);
    expect(out.glow).toBe(FX_RANGES.glow.min);
    expect(out.body).toBe(FX_CUSTOM_START.body);
    expect(out.colorMode).toBe("rainbow");
    expect(out.sparkCount).toBe(FX_CUSTOM_START.sparkCount);
    expect(out.smokeColor).toBe(FX_CUSTOM_START.smokeColor);
    expect(out.stops).toEqual(["#112233", "#445566"]);
    expect("extra" in out).toBe(false);
  });

  it("survives garbage", () => {
    expect(sanitizeParams(null)).toEqual(FX_CUSTOM_START);
    expect(sanitizeParams("x")).toEqual(FX_CUSTOM_START);
  });
});

describe("colour modes", () => {
  const base: FxParams = { ...FX_CUSTOM_START, hue: 10, saturation: 1, lightness: 0.5, handOffset: 150, pitchSpan: 300, cycleSpeed: 30 };

  it("single: every note takes the hue", () => {
    const p = { ...base, colorMode: "single" as const };
    expect(hueOf(rgb(p, right))).toBeCloseTo(10, 0);
    expect(hueOf(rgb(p, { hand: "left", midi: 40, startS: 9 }))).toBeCloseTo(10, 0);
  });

  it("byHand: the left hand is offset by the slider", () => {
    const p = { ...base, colorMode: "byHand" as const };
    expect(hueOf(rgb(p, right))).toBeCloseTo(10, 0);
    expect(hueOf(rgb(p, { hand: "left", midi: 60, startS: 0 }))).toBeCloseTo(160, 0);
  });

  it("byPitch: the span runs from the lowest to the highest key", () => {
    const p = { ...base, colorMode: "byPitch" as const };
    expect(hueOf(rgb(p, { hand: "right", midi: 36, startS: 0 }))).toBeCloseTo(10, 0);
    expect(hueOf(rgb(p, { hand: "right", midi: 66, startS: 0 }))).toBeCloseTo(160, 0);
    expect(hueOf(rgb(p, { hand: "right", midi: 96, startS: 0 }))).toBeCloseTo(310, 0);
    // Out-of-range pitches clamp rather than wrap.
    expect(hueOf(rgb(p, { hand: "right", midi: 120, startS: 0 }))).toBeCloseTo(310, 0);
  });

  it("rainbow: fixed per note at its start time, cycling with the song", () => {
    const p = { ...base, colorMode: "rainbow" as const };
    expect(hueOf(rgb(p, { hand: "right", midi: 60, startS: 2 }))).toBeCloseTo(70, 0);
    expect(rgb(p, { hand: "right", midi: 60, startS: 2 })).toEqual(rgb(p, { hand: "right", midi: 90, startS: 2 }));
  });

  it("byHeight: the stops are rotated so the first lands on the hue slider", () => {
    const p = { ...FX_PRESET_PARAMS.ember };
    const stops = gradientStops(p);
    expect(stops.length).toBe(12);
    const first = hexHsl(p.stops[0]!).hue;
    expect(hueOf([stops[0]!, stops[1]!, stops[2]!])).toBeCloseTo(first, 0);
    const turned = gradientStops({ ...p, hue: first + 120 });
    expect(hueOf([turned[0]!, turned[1]!, turned[2]!])).toBeCloseTo((first + 120) % 360, 0);
    expect(hueOf([turned[3]!, turned[4]!, turned[5]!])).toBeCloseTo((hexHsl(p.stops[1]!).hue + 120) % 360, 0);
  });

  it("repeats the last stop when there are fewer than four", () => {
    const stops = gradientStops({ stops: ["#FF0000", "#00FF00"], hue: 0 });
    expect(Array.from(stops.slice(3, 6))).toEqual(Array.from(stops.slice(9, 12)));
  });
});

describe("hsl helpers", () => {
  it("round-trips", () => {
    const out = [0, 0, 0];
    hslToRgb(200, 0.6, 0.4, out);
    const [h, s, l] = rgbToHsl([out[0]!, out[1]!, out[2]!]);
    expect([Math.round(h), Math.round(s * 100) / 100, Math.round(l * 100) / 100]).toEqual([200, 0.6, 0.4]);
  });
});

describe("reduced motion", () => {
  it("stops the flicker and the texture, and leaves few particles", () => {
    const calm = effectiveParams(FX_CUSTOM_START, true);
    expect(calm.flameFlicker).toBe(0);
    expect(calm.noiseSpeed).toBe(0);
    expect(calm.cycleSpeed).toBe(0);
    expect(calm.sparkCount).toBe(Math.round(FX_CUSTOM_START.sparkCount * REDUCED_MOTION_SPARK_FRACTION));
    expect(calm.sparkCount).toBeLessThan(500);
    expect(calm.smokeDensity).toBeLessThan(FX_CUSTOM_START.smokeDensity);
  });

  it("is the look itself when motion is fine", () => {
    expect(effectiveParams(FX_CUSTOM_START, false)).toBe(FX_CUSTOM_START);
  });
});

describe("noise texture", () => {
  it("is deterministic, fills all four channels and tiles", () => {
    const a = generateNoise();
    expect(generateNoise()).toEqual(a);
    const channels = [0, 1, 2, 3].map((c) => {
      const values = new Set<number>();
      for (let i = c; i < a.length; i += 4 * 97) values.add(a[i]!);
      return values.size;
    });
    for (const distinct of channels) expect(distinct).toBeGreaterThan(20);
    // Neighbouring texels across the wrap are as close as neighbours inside.
    let wrap = 0;
    let inside = 0;
    for (let y = 0; y < NOISE_SIZE; y++) {
      wrap += Math.abs(a[(y * NOISE_SIZE) * 4]! - a[(y * NOISE_SIZE + NOISE_SIZE - 1) * 4]!);
      inside += Math.abs(a[(y * NOISE_SIZE + 1) * 4]! - a[(y * NOISE_SIZE) * 4]!);
    }
    expect(wrap / NOISE_SIZE).toBeLessThan((inside / NOISE_SIZE) * 3 + 2);
  });
});
