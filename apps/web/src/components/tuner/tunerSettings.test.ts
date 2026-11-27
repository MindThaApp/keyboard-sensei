import { beforeEach, describe, expect, it } from "vitest";
import { activeStrings, DEFAULT_TUNER_SETTINGS, loadTunerSettings, parseTunerSettings, saveTunerSettings, TUNER_SETTINGS_KEY } from "./tunerSettings";

describe("tuner settings", () => {
  beforeEach(() => localStorage.clear());

  it("defaults: A4 440, standard guitar, ±3 cents", () => {
    expect(loadTunerSettings()).toEqual({ ...DEFAULT_TUNER_SETTINGS, customTunings: [] });
    expect(activeStrings(loadTunerSettings())!.strings.map(s => s.midi)).toEqual([40, 45, 50, 55, 59, 64]);
  });

  it("saves a4Hz under mp-tuner-settings (the key grading reads) and keeps unknown fields", () => {
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ futureField: 1 }));
    saveTunerSettings({ a4Hz: 442 });
    const raw = JSON.parse(localStorage.getItem(TUNER_SETTINGS_KEY)!);
    expect(raw.a4Hz).toBe(442);
    expect(raw.futureField).toBe(1);
    expect(loadTunerSettings().a4Hz).toBe(442);
  });

  it("clamps and validates field by field", () => {
    const s = parseTunerSettings(JSON.stringify({ a4Hz: 500, greenZoneCents: 50, instrument: "banjo", tuningId: "nope", capo: 30 }));
    expect(s).toMatchObject({ a4Hz: 440, greenZoneCents: 3, instrument: "guitar", tuningId: "guitar-standard", capo: 0 });
    expect(parseTunerSettings("{broken")).toMatchObject({ a4Hz: 440 });
    expect(parseTunerSettings(JSON.stringify({ a4Hz: 415, instrument: "violin", tuningId: "violin-standard" }))).toMatchObject({ a4Hz: 415, tuningId: "violin-standard" });
  });

  it("custom tunings are stored, validated and selectable", () => {
    const custom = { id: "c1", name: "Open C", instrument: "guitar" as const, strings: [{ label: "C2", midi: 36 }, { label: "G2", midi: 43 }] };
    saveTunerSettings({ customTunings: [custom], tuningId: "c1" });
    const loaded = loadTunerSettings();
    expect(activeStrings(loaded)).toEqual({ name: "Open C", strings: custom.strings });
    const bad = parseTunerSettings(JSON.stringify({ customTunings: [{ id: "x", name: "x", strings: [{ label: "Z9" }] }] }));
    expect(bad.customTunings).toEqual([]);
  });

  it("chromatic mode has no strings", () => {
    expect(activeStrings({ ...DEFAULT_TUNER_SETTINGS, tuningId: "chromatic" })).toBeNull();
  });
});
