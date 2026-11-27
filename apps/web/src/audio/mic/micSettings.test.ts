import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MIC_CALIBRATION, TUNER_SETTINGS_KEY, loadA4Hz, loadMicCalibration, micCalibrationKey } from "./micSettings";

beforeEach(() => localStorage.clear());

describe("mic settings", () => {
  it("uses the mp- prefix and a per-device key", () => {
    expect(micCalibrationKey("abc")).toBe("mp-mic-calibration:abc");
    expect(micCalibrationKey("")).toBe("mp-mic-calibration:default");
  });
  it("defaults until the device is calibrated, and on bad data", () => {
    expect(loadMicCalibration("abc")).toEqual(DEFAULT_MIC_CALIBRATION);
    localStorage.setItem(micCalibrationKey("abc"), "{not json");
    expect(loadMicCalibration("abc")).toEqual(DEFAULT_MIC_CALIBRATION);
    localStorage.setItem(micCalibrationKey("abc"), JSON.stringify({ gateDb: 5, latencyMs: -3 }));
    expect(loadMicCalibration("abc")).toEqual(DEFAULT_MIC_CALIBRATION);
  });
  it("reads a calibration without touching the stored value", () => {
    const stored = JSON.stringify({ gateDb: -42, latencyMs: 55, gainHint: 1.5 });
    localStorage.setItem(micCalibrationKey("abc"), stored);
    expect(loadMicCalibration("abc")).toEqual({ gateDb: -42, latencyMs: 55, gainHint: 1.5 });
    expect(localStorage.getItem(micCalibrationKey("abc"))).toBe(stored);
  });
  it("reads A4 from the tuner settings, within 415-466 Hz", () => {
    expect(loadA4Hz()).toBe(440);
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ a4Hz: 442 }));
    expect(loadA4Hz()).toBe(442);
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ a4Hz: 500 }));
    expect(loadA4Hz()).toBe(440);
  });
});
