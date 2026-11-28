// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { whiteNoise, sine, mix } from "@keyboard-sensei/audio-analysis/testing";
import type { MicSession, OpenMicSession } from "../../audio/mic/micPipeline";
import type { MicFrame } from "../../audio/mic/micProcessorCore";
import { MicSessionFactoryContext } from "../../audio/mic/useMicSession";
import { resetMicCalibrationCache } from "../../audio/mic/micCalibrationStore";

const clicks: number[] = [];
vi.mock("../../audio/audioEngine", () => ({ getAudioContext: () => ({ currentTime: 10 }), perfTimeAt: (t: number) => t * 1000 }));
vi.mock("../../utils/clickTimbres", () => ({ playClick: (_ctx: unknown, time: number) => clicks.push(time) }));
vi.mock("../../audio/latency", () => ({ latencyOffsetMs: () => 20 }));
vi.mock("../../audio/mic/micPipeline", async importOriginal => ({
  ...(await importOriginal<typeof import("../../audio/mic/micPipeline")>()),
  listMicInputs: async () => [{ deviceId: "usb-1", label: "USB mic" }],
}));
import MicSetup from "./MicSetup";

const SR = 48000;

class FakeSession implements MicSession {
  deviceId = "usb-1";
  deviceLabel = "USB mic";
  sampleRate = SR;
  processingReported = false;
  frames = new Set<(f: MicFrame) => void>();
  samples = new Set<(t: number, s: Float32Array) => void>();
  capture = false;
  gate: number | null = null;
  onFrame(l: (f: MicFrame) => void) {
    this.frames.add(l);
    return () => this.frames.delete(l);
  }
  onSamples(l: (t: number, s: Float32Array) => void) {
    this.samples.add(l);
    return () => this.samples.delete(l);
  }
  setGate(g: number) {
    this.gate = g;
  }
  setCapture(c: boolean) {
    this.capture = c;
  }
  toPerfMs(t: number) {
    return t * 1000;
  }
  close() {}
  frame(partial: Partial<MicFrame> & { time: number }) {
    const f: MicFrame = { pitchTime: partial.time, levelDb: -62, peak: 0.001, clipped: false, gated: true, onset: null, frequency: null, aperiodicity: 1, candidates: [], voicedProbability: 0, ...partial };
    for (const l of [...this.frames]) l(f);
  }
  /** Streams a buffer starting at context time `start`, with a frame per 256 samples. */
  stream(signal: Float32Array, start: number, levelDb = -62) {
    for (let i = 0; i < signal.length; i += 256) {
      const block = signal.slice(i, i + 256);
      if (this.capture) for (const l of [...this.samples]) l(start + i / SR, block);
      this.frame({ time: start + (i + 256) / SR, levelDb });
    }
  }
}

describe("MicSetup", () => {
  beforeEach(() => {
    localStorage.clear();
    resetMicCalibrationCache();
    clicks.length = 0;
  });

  it("walks through device, level, noise, latency and check, then saves per device", async () => {
    const session = new FakeSession();
    const open = vi.fn<OpenMicSession>(async () => session);
    render(
      <MicSessionFactoryContext.Provider value={open}>
        <MicSetup />
      </MicSessionFactoryContext.Provider>,
    );
    expect(screen.getByText(/never recorded or uploaded/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use the microphone" })));

    // 1. Device
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    // 2. Level: notes at a good level.
    act(() => {
      for (let i = 0; i < 50; i++) session.frame({ time: 1 + i * 0.005, levelDb: -20, peak: 0.2, gated: false });
    });
    expect(screen.getByTestId("level-status").textContent).toBe("Good level");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Next" })));

    // 3. Noise: two seconds of a quiet room with 50 Hz hum.
    act(() => fireEvent.click(screen.getByRole("button", { name: "Measure the room" })));
    expect(session.capture).toBe(true);
    const room = mix([{ startS: 0, samples: whiteNoise({ durationS: 2.2, amplitude: 0.001 }) }, { startS: 0, samples: sine({ frequency: 50, durationS: 2.2, amplitude: 0.003 }) }], 2.2);
    act(() => session.stream(room, 2, -58));
    expect(session.gate).toBeCloseTo(-46, 0);

    // 4. Latency: clicks come back 52 ms after they were scheduled; output latency is 20 ms.
    act(() => fireEvent.click(screen.getByRole("button", { name: "Measure the delay" })));
    expect(clicks).toHaveLength(6);
    const recordingStart = 10;
    const click = Float32Array.from({ length: 480 }, (_, i) => 0.4 * Math.sin(i / 3) * Math.exp(-i / 80));
    const recording = mix(clicks.map(t => ({ startS: t - recordingStart + 0.052, samples: click })), clicks[5]! - recordingStart + 0.8);
    act(() => session.stream(mix([{ startS: 0, samples: recording }, { startS: 0, samples: whiteNoise({ durationS: recording.length / SR, amplitude: 0.0005 }) }], recording.length / SR), recordingStart));

    // 5. Instrument check.
    expect(screen.getByRole("heading", { name: /Instrument check/ })).toBeTruthy();
    act(() => session.frame({ time: 20, frequency: 440, voicedProbability: 0.95, gated: false, levelDb: -20 }));
    expect(screen.getByTestId("check-heard").textContent).toBe("A4 (0 cents)");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Looks right" })));

    expect(screen.getByTestId("done-latency").textContent).toBe("32 ms");
    act(() => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const saved = JSON.parse(localStorage.getItem("mp-mic-calibration:usb-1")!);
    expect(saved).toMatchObject({ deviceId: "usb-1", latencyMs: 32, latencyMethod: "loopback", humHz: 50, gainHint: "ok" });
    expect(saved.gateDb).toBeCloseTo(-46, 0);
  });

  it("falls back to tap-along when the clicks don't come back, or can be skipped", async () => {
    const session = new FakeSession();
    render(
      <MicSessionFactoryContext.Provider value={async () => session}>
        <MicSetup />
      </MicSessionFactoryContext.Provider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use the microphone" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    act(() => session.frame({ time: 1, levelDb: -20, peak: 0.2, gated: false }));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Next" })));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Measure the room" })));
    act(() => session.stream(whiteNoise({ durationS: 2.2, amplitude: 0.001 }), 2));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Measure the delay" })));
    // Headphones: silence comes back.
    act(() => session.stream(new Float32Array(Math.round(4.5 * SR)), 10));
    expect(screen.getByRole("alert").textContent).toMatch(/did not come back/);
    act(() => fireEvent.click(screen.getByRole("button", { name: "Tap along instead" })));
    // The learner's notes land 180 ms after each click (20 ms output + reaction + input).
    act(() => {
      clicks.slice(-8).forEach((t, i) => session.frame({ time: t + 0.2, onset: t + 0.18, gated: false, levelDb: -20 }));
      session.frame({ time: 30 });
    });
    act(() => fireEvent.click(screen.getByRole("button", { name: "Skip" })));
    expect(screen.getByTestId("done-latency").textContent).toBe("160 ms");
  });
});
