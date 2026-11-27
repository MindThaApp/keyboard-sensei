import { describe, expect, it } from "vitest";
import { FrameAnalyser } from "./analyser.js";
import { midiToFrequency } from "./pitch.js";
import { matchString, TunerSmoother, type TunerReading } from "./tuner.js";
import { standardDeviation } from "./testing/metrics.js";
import { addNoise, concat, detune, karplusStrong, sawtooth, silence, sine } from "./testing/synth.js";

const SR = 48000;

function readings(signal: Float32Array, smoother = new TunerSmoother()): { frameTimes: number[]; readings: (TunerReading | null)[] } {
  const analyser = new FrameAnalyser({ sampleRate: SR, profile: "tuner" });
  const out: (TunerReading | null)[] = [];
  const frameTimes: number[] = [];
  for (let i = 0; i < signal.length; i += 128) {
    for (const frame of analyser.push(signal.subarray(i, i + 128))) {
      frameTimes.push(frame.time);
      out.push(smoother.push({ time: frame.time, frequency: frame.frequency, levelDb: frame.levelDb, gated: frame.gated, aperiodicity: frame.aperiodicity }));
    }
  }
  return { frameTimes, readings: out };
}

const GUITAR_STANDARD = [
  { label: "E2", midi: 40 },
  { label: "A2", midi: 45 },
  { label: "D3", midi: 50 },
  { label: "G3", midi: 55 },
  { label: "B3", midi: 59 },
  { label: "E4", midi: 64 },
];

describe("tuner reading stability", () => {
  for (const [name, make] of [
    ["sine A4 +7 cents", () => sine({ frequency: detune(440, 7), durationS: 2 })],
    ["sawtooth low E -12 cents", () => sawtooth({ frequency: detune(midiToFrequency(40), -12), durationS: 2 })],
    ["sawtooth A4 at 30 dB SNR", () => addNoise(sawtooth({ frequency: 440, durationS: 2 }), 30)],
    ["sawtooth A0 (lowest piano key)", () => sawtooth({ frequency: midiToFrequency(21), durationS: 2 })],
  ] as const) {
    it(`${name}: standard deviation < 0.5 cents once settled`, () => {
      const { readings: r } = readings(make());
      const settled = r.slice(20).filter((x): x is TunerReading => x !== null);
      expect(settled.length).toBeGreaterThan(100);
      expect(standardDeviation(settled.map(x => x.cents))).toBeLessThan(0.5);
    });
  }

  it("shows the right note, octave and frequency to 0.1 Hz", () => {
    const { readings: r } = readings(sawtooth({ frequency: detune(midiToFrequency(57), -7), durationS: 1 }));
    const last = r[r.length - 1]!;
    expect(last.name).toBe("A3");
    expect(last.cents).toBeCloseTo(-7, 0);
    expect(Math.abs(last.frequency - detune(220, -7))).toBeLessThan(0.05);
    expect(last.stable).toBe(true);
  });

  it(">= 20 updates per second and first reading <= 50 ms after the sound reaches a full window centre", () => {
    const start = 0.5;
    const { frameTimes, readings: r } = readings(concat(silence(start), sawtooth({ frequency: 196, durationS: 1 })));
    const span = frameTimes[frameTimes.length - 1]! - frameTimes[0]!;
    expect(frameTimes.length / span).toBeGreaterThanOrEqual(20);
    const first = r.findIndex(x => x !== null && Math.abs(x.cents) < 5);
    expect(first).toBeGreaterThan(0);
    // Sound to display, excluding device latency: the analyser decides as the window fills.
    expect(frameTimes[first]! - start).toBeLessThanOrEqual(0.05);
  });

  it("hysteresis: a tone near +50 cents does not flicker between neighbours", () => {
    // Drifts from +45 to +58 cents above A3: the display stays on A3 (to +65), not jumping to A#3.
    const n = 2 * SR;
    const signal = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const cents = 45 + (13 * i) / n + 2 * Math.sin(i / 900);
      phase += (2 * Math.PI * detune(220, cents)) / SR;
      signal[i] = 0.5 * Math.sin(phase);
    }
    const names = new Set(readings(signal).readings.filter(x => x !== null).map(x => x!.name));
    expect([...names]).toEqual(["A3"]);
  });

  it("silence clears the reading after the hold; the last reading is kept for Hold", () => {
    const smoother = new TunerSmoother();
    const { readings: r } = readings(concat(sawtooth({ frequency: 330, durationS: 0.5 }), silence(1)), smoother);
    expect(r[r.length - 1]).toBeNull();
    expect(r.some(x => x?.name === "E4")).toBe(true);
  });

  it("a guitar pluck settles within a cent of the string's detune", () => {
    const { readings: r } = readings(karplusStrong({ frequency: detune(midiToFrequency(45), 9), durationS: 1.5, decay: 0.998 }));
    const settled = r.slice(15, 60).filter((x): x is TunerReading => x !== null);
    expect(Math.abs(settled[settled.length - 1]!.cents - 9)).toBeLessThan(1);
  });
});

describe("A4 reference", () => {
  it("changing A4 shifts every target", () => {
    for (const a4 of [415, 432, 440, 442, 443, 466]) {
      for (const string of GUITAR_STANDARD) {
        const match = matchString(midiToFrequency(string.midi, a4), GUITAR_STANDARD, { a4 })!;
        expect(match.string.label).toBe(string.label);
        expect(match.targetFrequency).toBeCloseTo(midiToFrequency(string.midi, 440) * (a4 / 440), 6);
        expect(Math.abs(match.cents)).toBeLessThan(1e-6);
      }
    }
  });

  it("the smoother measures against its A4", () => {
    const smoother = new TunerSmoother({ a4: 442 });
    const { readings: r } = readings(sine({ frequency: 440, durationS: 0.6 }), smoother);
    const last = r[r.length - 1]!;
    expect(last.name).toBe("A4");
    expect(last.cents).toBeCloseTo(1200 * Math.log2(440 / 442), 1);
  });

  it("a target-offset curve (stretch) moves the zero point", () => {
    const smoother = new TunerSmoother({ targetOffsetCents: midi => (midi === 81 ? 4 : 0) });
    const { readings: r } = readings(sine({ frequency: detune(880, 4), durationS: 0.6 }), smoother);
    expect(Math.abs(r[r.length - 1]!.cents)).toBeLessThan(0.3);
  });
});

describe("preset string auto-detect", () => {
  it("finds each string of standard tuning when it is up to 40 cents out", () => {
    for (const string of GUITAR_STANDARD) {
      for (const cents of [-40, -15, 0, 20, 40]) {
        const match = matchString(detune(midiToFrequency(string.midi), cents), GUITAR_STANDARD)!;
        expect(match.string.label).toBe(string.label);
        expect(match.cents).toBeCloseTo(cents, 6);
      }
    }
  });

  it("a string tuned a whole tone flat still maps to itself before its neighbour (nearest in pitch)", () => {
    // D3 string tuned down to C3 is closer to D3 (2 st) than to A2 (3 st).
    expect(matchString(midiToFrequency(48), GUITAR_STANDARD)!.string.label).toBe("D3");
  });

  it("a locked string is used whatever is played", () => {
    const match = matchString(midiToFrequency(52), GUITAR_STANDARD, { lockedIndex: 0 })!;
    expect(match.string.label).toBe("E2");
    expect(match.cents).toBeCloseTo(1200, 6);
  });

  it("capo shifts the targets", () => {
    const match = matchString(midiToFrequency(42), GUITAR_STANDARD, { capo: 2 })!;
    expect(match.string.label).toBe("E2");
    expect(match.targetMidi).toBe(42);
    expect(match.cents).toBeCloseTo(0, 6);
  });

  it("detects strings from audio end to end", () => {
    for (const string of GUITAR_STANDARD) {
      const { readings: r } = readings(karplusStrong({ frequency: detune(midiToFrequency(string.midi), -18), durationS: 1, decay: 0.998 }));
      const reading = r.slice(10, 40).filter((x): x is TunerReading => x !== null).pop()!;
      const match = matchString(reading.frequency, GUITAR_STANDARD)!;
      expect(match.string.label).toBe(string.label);
      expect(Math.abs(match.cents + 18)).toBeLessThan(1);
    }
  });
});
