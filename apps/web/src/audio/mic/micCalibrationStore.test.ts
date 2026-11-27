import { beforeEach, describe, expect, it } from "vitest";
import { defaultCalibration } from "@keyboard-sensei/audio-analysis";
import { micCalibrationFor, micCalibrationKey, resetMicCalibrationCache, saveMicCalibration, storedMicCalibration, lastMicDeviceId } from "./micCalibrationStore";

describe("mic calibration storage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMicCalibrationCache();
  });

  it("uses the spec's key per device, with 'default' for an unnamed device", () => {
    expect(micCalibrationKey("abc")).toBe("mp-mic-calibration:abc");
    expect(micCalibrationKey("")).toBe("mp-mic-calibration:default");
  });

  it("returns defaults until a device is calibrated, and saves without touching other keys", () => {
    localStorage.setItem("ks-audio-latency-ms", "120");
    localStorage.setItem("mp-mic-calibration:other", JSON.stringify({ ...defaultCalibration("other"), gateDb: -40 }));
    expect(storedMicCalibration("mic-1")).toBeNull();
    expect(micCalibrationFor("mic-1").gateDb).toBe(-60);
    saveMicCalibration({ ...defaultCalibration("mic-1"), gateDb: -51, latencyMs: 24, latencyMethod: "loopback" });
    resetMicCalibrationCache();
    expect(micCalibrationFor("mic-1")).toMatchObject({ gateDb: -51, latencyMs: 24, latencyMethod: "loopback" });
    expect(lastMicDeviceId()).toBe("mic-1");
    expect(localStorage.getItem("ks-audio-latency-ms")).toBe("120");
    expect(micCalibrationFor("other").gateDb).toBe(-40);
  });

  it("stores the gateDb and latencyMs fields other readers expect", () => {
    saveMicCalibration({ ...defaultCalibration("m"), gateDb: -48, latencyMs: 33 });
    const raw = JSON.parse(localStorage.getItem("mp-mic-calibration:m")!);
    expect(raw.gateDb).toBe(-48);
    expect(raw.latencyMs).toBe(33);
  });

  it("reads partial records and ignores garbage without throwing", () => {
    localStorage.setItem("mp-mic-calibration:p", JSON.stringify({ gateDb: -45, latencyMs: 30 }));
    localStorage.setItem("mp-mic-calibration:bad", "{not json");
    expect(micCalibrationFor("p")).toMatchObject({ gateDb: -45, latencyMs: 30 });
    expect(storedMicCalibration("bad")).toBeNull();
    expect(localStorage.getItem("mp-mic-calibration:bad")).toBe("{not json");
  });
});
