import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RANGE,
  PIANO_HIGHEST,
  PIANO_LOWEST,
  calibratedRangePreference,
  deviceIdentityKey,
  explicitRangePreference,
  growRange,
  loadRange,
  loadRangePreference,
  saveRange,
  saveRangePreference,
} from "./keyboardRange";

describe("persistence", () => {
  beforeEach(() => localStorage.clear());

  it("builds a stable identity key from manufacturer and name, not browser id", () => {
    const firstSession = deviceIdentityKey({ id: "input-1", manufacturer: "Yamaha", name: "P-125" });
    const nextSession = deviceIdentityKey({ id: "input-9", manufacturer: "Yamaha", name: "P-125" });
    expect(nextSession).toBe(firstSession);
  });

  it("falls back to browser id only when manufacturer and name are empty", () => {
    expect(deviceIdentityKey({ id: "abc", manufacturer: "", name: "" })).toBe("abc");
  });

  it("round-trips a range keyed on device identity", () => {
    const key = deviceIdentityKey({ id: "session-id", manufacturer: "Yamaha", name: "P-125" });
    saveRange(key, { lowestNote: 21, highestNote: 108 });
    expect(loadRange(key)).toEqual({ lowestNote: 21, highestNote: 108 });
  });

  it("loads old stored ranges as auto-learn preferences", () => {
    localStorage.setItem("keyboard-sensei-range:Old Piano", JSON.stringify({ lowestNote: 36, highestNote: 96 }));
    expect(loadRangePreference("Old Piano")).toEqual({
      mode: "auto",
      range: { lowestNote: 36, highestNote: 96 },
    });
  });

  it("round-trips explicit keyboard size preferences through the existing range key", () => {
    saveRangePreference("Small Piano", explicitRangePreference(49));
    expect(loadRangePreference("Small Piano")).toEqual({
      mode: "explicit",
      keys: 49,
      range: { lowestNote: 36, highestNote: 84 },
    });
  });

  it("stores calibration as the expected normalized range", () => {
    const preference = calibratedRangePreference(73, 34);
    expect(preference).toEqual({
      mode: "calibrated",
      range: { lowestNote: 33, highestNote: 74 },
    });
  });

  it("round-trips calibrated keyboard ranges", () => {
    saveRangePreference("Roland::FP-30X", calibratedRangePreference(21, 108));
    expect(loadRangePreference("Roland::FP-30X")).toEqual({
      mode: "calibrated",
      range: { lowestNote: 21, highestNote: 108 },
    });
  });

  it("explicit size overrides auto-grow", () => {
    const preference = explicitRangePreference(49);
    const current = preference.mode === "auto" ? growRange(preference.range, 96) : preference.range;
    expect(current).toEqual({ lowestNote: 36, highestNote: 84 });
  });

  it("auto-grow still applies when neither calibration nor explicit size is set", () => {
    const preference = loadRangePreference("Unknown Piano") ?? { mode: "auto" as const, range: DEFAULT_RANGE };
    const current = preference.mode === "auto" ? growRange(preference.range, 100) : preference.range;
    expect(current).toEqual({ lowestNote: 36, highestNote: 100 });
  });

  it("loads a different saved range when the device identity changes", () => {
    const small = deviceIdentityKey({ id: "one", manufacturer: "Akai", name: "MPK mini" });
    const large = deviceIdentityKey({ id: "two", manufacturer: "Roland", name: "FP-30X" });
    saveRangePreference(small, explicitRangePreference(25));
    saveRangePreference(large, calibratedRangePreference(21, 108));
    expect(loadRangePreference(small)?.range).toEqual({ lowestNote: 48, highestNote: 72 });
    expect(loadRangePreference(large)?.range).toEqual({ lowestNote: 21, highestNote: 108 });
  });

  it("returns null for an unseen device", () => {
    expect(loadRange("Never Seen")).toBeNull();
  });

  it("returns null on corrupt stored data rather than throwing", () => {
    localStorage.setItem("keyboard-sensei-range:Broken", "not json");
    expect(loadRange("Broken")).toBeNull();
  });
});
