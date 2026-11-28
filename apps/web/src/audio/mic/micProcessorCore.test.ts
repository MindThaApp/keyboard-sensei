import { describe, expect, it } from "vitest";
import { sawtooth, concat, silence } from "@keyboard-sensei/audio-analysis/testing";
import { MicProcessorCore, type ToMainMessage } from "./micProcessorCore";

describe("mic worklet core", () => {
  it("turns render quanta into frames on the AudioContext clock", () => {
    const messages: ToMainMessage[] = [];
    const core = new MicProcessorCore({ profile: "violin" }, 48000, m => messages.push(m));
    const signal = concat(silence(0.2), sawtooth({ frequency: 440, durationS: 0.5 }));
    const startTime = 12.5;
    for (let i = 0; i + 128 <= signal.length; i += 128) core.process(signal.subarray(i, i + 128), startTime + i / 48000);
    const frames = messages.flatMap(m => (m.type === "frames" ? m.frames : []));
    expect(frames.length).toBeGreaterThan(80);
    expect(frames[0]!.time).toBeGreaterThan(startTime);
    expect(messages.some(m => m.type === "samples")).toBe(false);
    const voiced = frames.filter(f => f.frequency !== null);
    expect(Math.abs(voiced[voiced.length - 1]!.frequency! - 440)).toBeLessThan(0.1);
    // An onset near the start of the tone, in context time.
    const onset = frames.find(f => f.onset !== null)!.onset!;
    expect(Math.abs(onset - (startTime + 0.2))).toBeLessThan(0.02);
  });

  it("posts raw blocks only while capture is on, and applies a new gate", () => {
    const messages: ToMainMessage[] = [];
    const core = new MicProcessorCore({ profile: "guitar" }, 48000, m => messages.push(m));
    const block = new Float32Array(128).fill(0.001);
    core.process(block, 0);
    core.handle({ type: "config", capture: true, gateDb: -20 });
    core.process(block, 128 / 48000);
    core.handle({ type: "config", capture: false });
    core.process(block, 256 / 48000);
    expect(messages.filter(m => m.type === "samples")).toHaveLength(1);
  });
});
