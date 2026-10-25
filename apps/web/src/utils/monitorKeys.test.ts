import { describe, expect, it, vi } from "vitest";
import { gatedMonitor, parseMonitorKeys } from "./monitorKeys";

const fake = () => ({ playNote: vi.fn(), stopNote: vi.fn(), setSustainPedal: vi.fn() });

describe("monitor gate", () => {
  it("defaults on and only an explicit off turns it off", () => {
    expect(parseMonitorKeys(null)).toBe(true);
    expect(parseMonitorKeys("on")).toBe(true);
    expect(parseMonitorKeys("junk")).toBe(true);
    expect(parseMonitorKeys("off")).toBe(false);
  });

  it("passes note on, off and sustain to the synth when on", () => {
    const synth = fake();
    const gate = gatedMonitor(synth, () => true);
    gate.playNote(60, 90);
    gate.stopNote(60);
    gate.setSustainPedal(true);
    expect(synth.playNote).toHaveBeenCalledWith(60, 90);
    expect(synth.stopNote).toHaveBeenCalledWith(60);
    expect(synth.setSustainPedal).toHaveBeenCalledWith(true);
  });

  it("does not sound notes or sustain when off, but still releases", () => {
    const synth = fake();
    const gate = gatedMonitor(synth, () => false);
    gate.playNote(60, 90);
    gate.setSustainPedal(true);
    gate.stopNote(60);
    gate.setSustainPedal(false);
    expect(synth.setSustainPedal).toHaveBeenCalledTimes(1);
    expect(synth.setSustainPedal).toHaveBeenCalledWith(false);
    expect(synth.playNote).not.toHaveBeenCalled();
    expect(synth.stopNote).toHaveBeenCalledWith(60);
  });
});
