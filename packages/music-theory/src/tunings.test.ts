import { describe, expect, it } from "vitest";
import { applyCapo, clampReferencePitch, parseNoteName, REFERENCE_PITCH, TUNING_PRESETS, tuningPresetById, tuningPresetsFor, validateCustomTuning } from "./tunings.js";

describe("tuning presets", () => {
  it("match the spec table", () => {
    const table: Record<string, number[]> = {
      "guitar-standard": [40, 45, 50, 55, 59, 64],
      "guitar-drop-d": [38, 45, 50, 55, 59, 64],
      "guitar-half-step-down": [39, 44, 49, 54, 58, 63],
      "guitar-full-step-down": [38, 43, 48, 53, 57, 62],
      "guitar-drop-c": [36, 43, 48, 53, 57, 62],
      "guitar-dadgad": [38, 45, 50, 55, 57, 62],
      "guitar-open-g": [38, 43, 50, 55, 59, 62],
      "guitar-open-d": [38, 45, 50, 54, 57, 62],
      "guitar-open-e": [40, 47, 52, 56, 59, 64],
      "violin-standard": [55, 62, 69, 76],
    };
    expect(TUNING_PRESETS.map(p => p.id)).toEqual(Object.keys(table));
    for (const [id, midis] of Object.entries(table)) expect(tuningPresetById(id)!.strings.map(s => s.midi), id).toEqual(midis);
    expect(tuningPresetsFor("guitar")).toHaveLength(9);
    expect(tuningPresetsFor("violin")).toHaveLength(1);
  });

  it("strings run low to high", () => {
    for (const p of TUNING_PRESETS) {
      const midis = p.strings.map(s => s.midi);
      expect([...midis].sort((a, b) => a - b), p.id).toEqual(midis);
    }
  });

  it("parses note names", () => {
    expect(parseNoteName("A4")).toBe(69);
    expect(parseNoteName("Eb2")).toBe(39);
    expect(parseNoteName("F#3")).toBe(54);
    expect(() => parseNoteName("H2")).toThrow();
  });

  it("capo shifts every string and its name", () => {
    const capo2 = applyCapo(tuningPresetById("guitar-standard")!.strings, 2);
    expect(capo2.map(s => s.midi)).toEqual([42, 47, 52, 57, 61, 66]);
    expect(capo2[0]!.label).toBe("F#2");
    expect(applyCapo(tuningPresetById("guitar-half-step-down")!.strings, 1)[0]!.label).toBe("E2");
  });

  it("reference pitch is clamped to 415-466 Hz, 0.1 Hz resolution", () => {
    expect(clampReferencePitch(400)).toBe(415);
    expect(clampReferencePitch(470)).toBe(466);
    expect(clampReferencePitch(442.34)).toBe(442.3);
    expect(clampReferencePitch(Number.NaN)).toBe(REFERENCE_PITCH.defaultHz);
  });

  it("validates custom tunings", () => {
    expect(validateCustomTuning("Open C", ["C2", "G2", "C3", "G3", "C4", "E4"])).toMatchObject({ ok: true });
    expect(validateCustomTuning("", ["C2"])).toMatchObject({ ok: false });
    expect(validateCustomTuning("x", ["Q2"])).toMatchObject({ ok: false });
    expect(validateCustomTuning("x", ["C0"])).toMatchObject({ ok: false });
  });
});
