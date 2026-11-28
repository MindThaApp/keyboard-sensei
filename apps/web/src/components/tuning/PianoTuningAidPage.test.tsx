// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSession,
  curveForSession,
  inharmonicityAt,
  serializeSession,
  shiftCents,
  synthPianoTone,
  tuningReducer,
  TYPICAL_INHARMONICITY,
  type FlowAction,
  type TuningSession,
} from "@keyboard-sensei/piano-tuning";
import PianoTuningAidPage, { TUNING_SESSION_KEY, TUNER_SETTINGS_KEY } from "./PianoTuningAidPage";
import type { SampleSource } from "./sampleSource";

const SR = 48000;

/** Plays whatever synthetic tone the test sets; no microphone involved. */
class FakeSource implements SampleSource {
  readonly sampleRate = SR;
  tone: (durationS: number) => Float32Array = (d) => new Float32Array(Math.round(d * SR));
  started = 0;
  async start() {
    this.started++;
  }
  stop() {}
  latest(count: number) {
    return this.tone(count / SR);
  }
  async capture(durationMs: number) {
    return this.tone(durationMs / 1000);
  }
}

/** A typical piano whose notes sit `offsetCents` from this session's stretch curve. */
function pianoNote(session: TuningSession, midi: number, offsetCents: number, extra: Partial<Parameters<typeof synthPianoTone>[0]> = {}) {
  const target = curveForSession(session).targets[midi];
  return (durationS: number) =>
    synthPianoTone({
      midi,
      pitchHz: shiftCents(target.targetHz, offsetCents),
      inharmonicityB: inharmonicityAt(TYPICAL_INHARMONICITY, midi),
      partials: 14,
      fundamentalLevel: midi < 40 ? 0.3 : 1,
      durationS,
      snrDb: 30,
      seed: midi,
      ...extra,
    });
}

function seed(...actions: FlowAction[]): TuningSession {
  const s = [{ type: "ACKNOWLEDGE_SAFETY", understood: true } as FlowAction, ...actions].reduce(tuningReducer, createSession());
  localStorage.setItem(TUNING_SESSION_KEY, serializeSession(s));
  return s;
}

function acknowledge() {
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /I understand, continue/ }));
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("PianoTuningAidPage: safety first", () => {
  it("shows the safety note before any guidance and needs the explicit acknowledgement", () => {
    const source = new FakeSource();
    render(<PianoTuningAidPage source={source} />);
    expect(screen.getByTestId("safety-note").textContent).toMatch(/piano tuning lever \(tuning hammer\)/);
    expect(screen.getByTestId("safety-note").textContent).toMatch(/never use pliers, wrenches or socket sets/);
    expect(screen.getAllByTestId("technician-recommendation").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Piano Technicians Guild/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Listen" })).toBeNull();
    const cont = screen.getByRole("button", { name: /I understand, continue/ }) as HTMLButtonElement;
    expect(cont.disabled).toBe(true);
    fireEvent.click(cont);
    expect(screen.queryByRole("button", { name: "Listen" })).toBeNull();
    acknowledge();
    expect(screen.getByRole("button", { name: "Listen" })).toBeTruthy();
    expect(source.started).toBe(0); // the mic is only opened when the owner asks to measure
  });

  it("asks again when a saved session is resumed", () => {
    seed({ type: "SKIP_SAMPLE" }, { type: "SKIP_SAMPLE" });
    render(<PianoTuningAidPage source={new FakeSource()} />);
    expect(screen.getByTestId("safety-note")).toBeTruthy();
    acknowledge();
    expect(screen.getByTestId("measure-progress").textContent).toMatch(/Key 3 of/);
  });

  it("uses the reference pitch from the tuner settings", () => {
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ a4Hz: 442 }));
    render(<PianoTuningAidPage source={new FakeSource()} />);
    acknowledge();
    const saved = JSON.parse(localStorage.getItem(TUNING_SESSION_KEY)!) as TuningSession;
    expect(saved.a4Hz).toBe(442);
    expect(saved.acknowledged).toBe(false);
  });
});

describe("PianoTuningAidPage: guided flow with synthetic piano tones", () => {
  it("measures the piano, shows the plan, and guides A4 with a live fine display", async () => {
    const source = new FakeSource();
    const session = createSession();
    render(<PianoTuningAidPage source={source} readingIntervalMs={20} />);
    acknowledge();
    for (let i = 0; i < session.sampleNotes.length; i++) {
      source.tone = pianoNote(session, session.sampleNotes[i], -8);
      fireEvent.click(screen.getByRole("button", { name: "Listen" }));
      await waitFor(() =>
        expect(screen.queryByTestId("measure-progress")?.textContent ?? "done").not.toMatch(new RegExp(`Key ${i + 1} of`)),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "See the tuning plan" }));
    expect(screen.getByText(/8 cents flat/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start fine tuning" }));

    expect(screen.getByTestId("tune-note").textContent).toBe("A4");
    expect(screen.getByTestId("tune-instructions").textContent).toMatch(/Mute the left and right strings/);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("tune-instructions").textContent).toMatch(/centre string/);

    source.tone = pianoNote(session, 69, 3, { durationS: 0.6 });
    await waitFor(() => expect(screen.getByTestId("cents-reading").textContent).toBe("+3.0 c"));
    expect(screen.getByText(/Sharp/)).toBeTruthy();
    source.tone = pianoNote(session, 69, 0.3);
    await waitFor(() => expect(screen.getByText("In tune")).toBeTruthy());
  });

  it("checks a unison by its beats", async () => {
    seed({ type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" }, { type: "NEXT_SUBSTEP" }, { type: "NEXT_SUBSTEP" });
    const source = new FakeSource();
    const session = createSession();
    render(<PianoTuningAidPage source={source} />);
    acknowledge();
    expect(screen.getByTestId("tune-instructions").textContent).toMatch(/left string/);
    source.tone = pianoNote(session, 69, 0, { unisonDetuneCents: [6], partials: 6 });
    fireEvent.click(screen.getByRole("button", { name: "Check unison" }));
    await waitFor(() => expect(screen.getByTestId("check-result").textContent).toMatch(/Beating/));
    source.tone = pianoNote(session, 69, 0, { unisonDetuneCents: [0], partials: 6 });
    fireEvent.click(screen.getByRole("button", { name: "Check unison" }));
    await waitFor(() => expect(screen.getByTestId("check-result").textContent).toMatch(/Clean/));
  });

  it("stops guiding a note when the owner reports a loose pin and recommends a technician", async () => {
    seed({ type: "FINISH_MEASURE" }, { type: "CHOOSE_MODE", mode: "fine" }, { type: "NEXT_SUBSTEP" });
    render(<PianoTuningAidPage source={new FakeSource()} />);
    acknowledge();
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    fireEvent.click(screen.getByRole("button", { name: "The pin turns too easily" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Stopped guiding A4/);
    expect(screen.getByRole("alert").textContent).toMatch(/tuning pin turns too easily/);
    expect(screen.getByRole("alert").textContent).toMatch(/qualified piano technician/);
    expect(screen.queryByTestId("strobe")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Leave this note and continue/ }));
    expect(screen.getByTestId("tune-note").textContent).toBe("A3");
  });

  it("offers a pitch raise with a warning for a piano far flat, and refuses one that is too far", async () => {
    const base = createSession();
    const sample = (offset: number): FlowAction[] =>
      base.sampleNotes.map((midi) => ({
        type: "RECORD_SAMPLE",
        measurement: { midi, f0Hz: 0, inharmonicityB: inharmonicityAt(TYPICAL_INHARMONICITY, midi), pitchHz: shiftCents(curveForSession(base).targets[midi].targetHz, offset), partials: [], confidence: 1 },
      }));
    seed(...sample(-40), { type: "FINISH_MEASURE" });
    render(<PianoTuningAidPage source={new FakeSource()} />);
    acknowledge();
    expect(screen.getByText(/adds a lot of stress to old strings/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start pitch raise/ }));
    expect(screen.getByTestId("tune-progress").textContent).toMatch(/Rough pass/);
    expect(screen.getByText(/overpull/)).toBeTruthy();
    cleanup();

    localStorage.clear();
    seed(...sample(-160), { type: "FINISH_MEASURE" });
    render(<PianoTuningAidPage source={new FakeSource()} />);
    acknowledge();
    expect(screen.getByText(/will not guide it/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Start pitch raise/ })).toBeNull();
    expect(screen.getByRole("button", { name: /current pitch instead/ })).toBeTruthy();
  });

  it("starts over with a fresh session and the safety note again", () => {
    seed({ type: "SKIP_SAMPLE" });
    render(<PianoTuningAidPage source={new FakeSource()} />);
    acknowledge();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    });
    expect(screen.getByTestId("safety-note")).toBeTruthy();
    acknowledge();
    expect(screen.getByTestId("measure-progress").textContent).toMatch(/Key 1 of/);
  });
});
