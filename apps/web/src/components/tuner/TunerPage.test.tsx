// @vitest-environment jsdom
import { act, render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrameAnalyser } from "@keyboard-sensei/audio-analysis";
import { detune, karplusStrong, sawtooth } from "@keyboard-sensei/audio-analysis/testing";
import { MicSessionFactoryContext } from "../../audio/mic/useMicSession";
import { toMicFrame, type MicFrame } from "../../audio/mic/micProcessorCore";
import type { MicSession, OpenMicSession } from "../../audio/mic/micPipeline";
import { MicError } from "../../audio/mic/micPipeline";
import TunerPage from "./TunerPage";
import { TUNER_SETTINGS_KEY } from "./tunerSettings";

vi.mock("../../audio/referenceTone", () => ({
  startReferenceTone: vi.fn(() => ({ setFrequency: vi.fn(), stop: vi.fn() })),
}));
import { startReferenceTone } from "../../audio/referenceTone";

class FakeSession implements MicSession {
  deviceId = "fake";
  deviceLabel = "Fake mic";
  sampleRate = 48000;
  processingReported = false;
  listeners = new Set<(f: MicFrame) => void>();
  closed = false;
  onFrame(l: (f: MicFrame) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onSamples() {
    return () => undefined;
  }
  setGate() {}
  setCapture() {}
  toPerfMs(t: number) {
    return t * 1000;
  }
  close() {
    this.closed = true;
  }
  /** Plays a signal through the real analyser, as the worklet would. */
  play(signal: Float32Array, startTime = 0) {
    const analyser = new FrameAnalyser({ sampleRate: 48000, profile: "tuner", startTime });
    for (const frame of analyser.push(signal)) for (const l of this.listeners) l(toMicFrame(frame));
  }
}

let rafCallbacks: FrameRequestCallback[] = [];
function flushFrames() {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  act(() => callbacks.forEach(cb => cb(performance.now())));
}

function setup(open?: OpenMicSession) {
  const session = new FakeSession();
  const factory: OpenMicSession = open ?? (async () => session);
  render(
    <MicSessionFactoryContext.Provider value={factory}>
      <TunerPage />
    </MicSessionFactoryContext.Provider>,
  );
  return session;
}

async function startListening() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Use the microphone" }));
  });
}

describe("TunerPage", () => {
  beforeEach(() => {
    localStorage.clear();
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
  });

  it("explains the microphone before asking, and asks only on request", async () => {
    const open = vi.fn<OpenMicSession>(async () => new FakeSession());
    setup(open);
    expect(screen.getByText(/never recorded or uploaded/)).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    await startListening();
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ profile: "tuner" }));
    expect(screen.getByTestId("tuner-status").textContent).toBe("Listening");
  });

  it("shows the note, frequency, cents and the needle state; auto-detects the guitar string", async () => {
    const session = setup();
    await startListening();
    act(() => session.play(sawtooth({ frequency: detune(110, -12), durationS: 0.8 })));
    flushFrames();
    expect(screen.getByTestId("tuner-note").textContent).toBe("A2");
    expect(screen.getByTestId("tuner-frequency").textContent).toBe(`${detune(110, -12).toFixed(1)} Hz`);
    expect(screen.getByTestId("tuner-cents").textContent).toBe("-12.0 cents");
    expect(screen.getByRole("meter").getAttribute("data-in-tune")).toBe("false");
    expect(screen.getByRole("button", { name: "A2" }).getAttribute("data-detected")).toBe("true");
  });

  it("green zone: in tune within ±3 cents by default", async () => {
    const session = setup();
    await startListening();
    act(() => session.play(karplusStrong({ frequency: detune(329.63, 1.5), durationS: 0.8, decay: 0.999 })));
    flushFrames();
    expect(screen.getByRole("meter").getAttribute("data-in-tune")).toBe("true");
    expect(screen.getByRole("meter").getAttribute("aria-valuetext")).toBe("In tune");
  });

  it("changing A4 shifts the targets", async () => {
    const session = setup();
    await startListening();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "442" }));
    });
    expect(screen.getByTestId("tuner-a4").textContent).toBe("442.0 Hz");
    expect(JSON.parse(localStorage.getItem(TUNER_SETTINGS_KEY)!).a4Hz).toBe(442);
    // An A2 in tune at 440 is flat against 442.
    act(() => session.play(sawtooth({ frequency: 110, durationS: 0.8 })));
    flushFrames();
    const cents = parseFloat(screen.getByTestId("tuner-cents").textContent!);
    expect(cents).toBeCloseTo(1200 * Math.log2(440 / 442), 0);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Raise A4" }));
    });
    expect(screen.getByTestId("tuner-a4").textContent).toBe("442.5 Hz");
  });

  it("violin preset and a locked string", async () => {
    const session = setup();
    await startListening();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Violin" }));
    });
    expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(expect.arrayContaining(["G3", "D4", "A4", "E5"]));
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "D4" }));
    });
    act(() => session.play(sawtooth({ frequency: 440, durationS: 0.6 })));
    flushFrames();
    // Locked to D4: an A4 reads as 700 cents sharp of the target, clamped on the needle.
    expect(screen.getByTestId("tuner-note").textContent).toBe("D4");
    expect(parseFloat(screen.getByTestId("tuner-cents").textContent!)).toBeCloseTo(700, 0);
    expect(screen.getByTestId("tuner-playing").textContent).toBe("You're playing A4: tune down towards D4");
  });

  it("chromatic mode names any note", async () => {
    const session = setup();
    await startListening();
    act(() => {
      fireEvent.change(screen.getByRole("combobox", { name: "Tuning" }), { target: { value: "chromatic" } });
    });
    act(() => session.play(sawtooth({ frequency: detune(277.18, 5), durationS: 0.6 })));
    flushFrames();
    expect(screen.getByTestId("tuner-note").textContent).toBe("C#4");
  });

  it("hold freezes the last reading", async () => {
    const session = setup();
    await startListening();
    act(() => session.play(sawtooth({ frequency: 196, durationS: 0.6 })));
    flushFrames();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Hold" }));
    });
    act(() => session.play(sawtooth({ frequency: 246.94, durationS: 0.6 }), 1));
    flushFrames();
    expect(screen.getByTestId("tuner-note").textContent).toBe("G3");
    expect(screen.getByTestId("tuner-status").textContent).toBe("Hold");
  });

  it("plays the reference tone for the string at the current A4", async () => {
    setup();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "E2" }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Play E2" }));
    });
    expect(startReferenceTone).toHaveBeenCalledWith(expect.closeTo(82.41, 2), "sine");
    expect(screen.getByRole("button", { name: "Stop E2" })).toBeTruthy();
  });

  it("saves a custom tuning and selects it", async () => {
    setup();
    act(() => {
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Open C" } });
      fireEvent.change(screen.getByLabelText("Notes, low to high"), { target: { value: "C2 G2 C3 G3 C4 E4" } });
      fireEvent.click(screen.getByRole("button", { name: "Save tuning" }));
    });
    expect(screen.getByRole("button", { name: "C2" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(TUNER_SETTINGS_KEY)!).customTunings[0].name).toBe("Open C");
  });

  it("explains a blocked microphone", async () => {
    setup(async () => {
      throw new MicError("denied", "blocked");
    });
    await startListening();
    expect(screen.getByRole("alert").textContent).toMatch(/Microphone access is blocked/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("closes the microphone when leaving the page", async () => {
    const session = new FakeSession();
    const { unmount } = render(
      <MicSessionFactoryContext.Provider value={async () => session}>
        <TunerPage />
      </MicSessionFactoryContext.Provider>,
    );
    await startListening();
    unmount();
    expect(session.closed).toBe(true);
  });
});
