import { describe, expect, it } from "vitest";
import { DEFAULT_KEY_HIGHLIGHT, isKeyHighlight, KEY_HIGHLIGHTS, resolveKeyMode } from "./keyHighlight";
import { KeyLightWriter, getKeyLights, keyLightRgb, packKeyLight } from "./keyLights";
import { FX_PRESET_PARAMS, noteColor } from "../play/renderers/fx/fxParams";

describe("resolveKeyMode", () => {
  it("defaults to matching the look", () => {
    expect(DEFAULT_KEY_HIGHLIGHT).toBe("match");
    expect(KEY_HIGHLIGHTS.map((o) => o.value)).toEqual(["match", "glow", "flat", "off"]);
  });

  it("matches FX with a full glow and other styles with a soft one", () => {
    expect(resolveKeyMode("match", true)).toBe("glow");
    expect(resolveKeyMode("match", false)).toBe("soft");
  });

  it("lets an explicit choice win in either style", () => {
    for (const fx of [true, false]) {
      expect(resolveKeyMode("glow", fx)).toBe("glow");
      expect(resolveKeyMode("flat", fx)).toBe("flat");
      expect(resolveKeyMode("off", fx)).toBe("off");
    }
  });

  it("recognises only the four choices", () => {
    expect(isKeyHighlight("glow")).toBe(true);
    expect(isKeyHighlight("neon")).toBe(false);
    expect(isKeyHighlight(undefined)).toBe(false);
  });
});

describe("key colour mapping", () => {
  it("turns a 0..1 colour into the css triplet the keys use", () => {
    expect(keyLightRgb(packKeyLight(1, 0.5, 0))).toBe("255 128 0");
  });

  it("colours Spectrum keys by pitch and a one-colour look the same everywhere", () => {
    const lo = [0, 0, 0];
    const hi = [0, 0, 0];
    noteColor(FX_PRESET_PARAMS.spectrum, { hand: "right", midi: 40, startS: 0 }, 36, 96, lo);
    noteColor(FX_PRESET_PARAMS.spectrum, { hand: "right", midi: 90, startS: 0 }, 36, 96, hi);
    expect(packKeyLight(lo[0]!, lo[1]!, lo[2]!)).not.toBe(packKeyLight(hi[0]!, hi[1]!, hi[2]!));
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    noteColor(FX_PRESET_PARAMS.crimson, { hand: "right", midi: 40, startS: 0 }, 36, 96, a);
    noteColor(FX_PRESET_PARAMS.crimson, { hand: "right", midi: 90, startS: 0 }, 36, 96, b);
    expect(a).toEqual(b);
  });
});

describe("accent", () => {
  it("is published with the key lights", () => {
    const writer = new KeyLightWriter();
    writer.setActive(true);
    writer.setAccent(1, 0, 0);
    expect(keyLightRgb(getKeyLights().accent)).toBe("255 0 0");
    writer.setActive(false);
  });
});
