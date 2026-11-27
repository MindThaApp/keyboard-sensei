import { describe, expect, it } from "vitest";
import { analyseBuffer } from "./analyser.js";
import {
  assessLevel,
  defaultCalibration,
  detectMainsHum,
  detectProcessing,
  gainHintFor,
  inputLatencyFromRoundTrip,
  inputLatencyFromTaps,
  measureClickLatency,
  measureNoiseFloor,
  parseCalibration,
  MIN_GATE_DB,
} from "./calibration.js";
import { Biquad } from "./filters.js";
import { rmsDb } from "./pitch.js";
import { addNoise, mix, sawtooth, scale, silence, sine, whiteNoise } from "./testing/synth.js";

const SR = 48000;

describe("noise floor and gate", () => {
  it("gate = floor + 12 dB", () => {
    const noise = whiteNoise({ durationS: 2, amplitude: 0.001, seed: 4 }); // -60 dBFS
    const levels = analyseBuffer(noise, { sampleRate: SR, profile: "guitar", levelOnly: true }).map(f => f.levelDb);
    const result = measureNoiseFloor(levels);
    expect(result.floorDb).toBeCloseTo(-60, 0);
    expect(result.gateDb).toBeCloseTo(-48, 0);
    expect(result.digitalSilence).toBe(0);
  });

  it("digital silence: gate clamps to the minimum, and processing is suspected", () => {
    const levels = analyseBuffer(silence(2), { sampleRate: SR, profile: "guitar", levelOnly: true }).map(f => f.levelDb);
    const result = measureNoiseFloor(levels);
    expect(result.gateDb).toBe(MIN_GATE_DB);
    expect(detectProcessing(result)).toBe(true);
  });

  it("an ordinary room is not flagged as processed", () => {
    expect(detectProcessing(measureNoiseFloor([-62, -61, -63, -60]))).toBe(false);
  });

  it("the gate keeps room noise out of pitch analysis but lets playing through", () => {
    const room = whiteNoise({ durationS: 1, amplitude: 0.001, seed: 8 });
    const gate = measureNoiseFloor(analyseBuffer(room, { sampleRate: SR, profile: "guitar", levelOnly: true }).map(f => f.levelDb)).gateDb;
    const roomFrames = analyseBuffer(room, { sampleRate: SR, profile: "guitar", gateDb: gate });
    expect(roomFrames.every(f => f.gated && f.candidates.length === 0)).toBe(true);
    const played = analyseBuffer(addNoise(sawtooth({ frequency: 110, durationS: 0.5, amplitude: 0.1 }), 40), { sampleRate: SR, profile: "guitar", gateDb: gate });
    expect(played.filter(f => !f.gated).length).toBeGreaterThan(played.length * 0.9);
  });
});

describe("level check", () => {
  const peaksOf = (signal: Float32Array) => analyseBuffer(signal, { sampleRate: SR, profile: "guitar", levelOnly: true }).map(f => f.peak);
  it("classifies quiet, good, loud and clipping input", () => {
    expect(assessLevel(peaksOf(sine({ frequency: 220, durationS: 1, amplitude: 0.005 }))).status).toBe("too-quiet");
    expect(assessLevel(peaksOf(sine({ frequency: 220, durationS: 1, amplitude: 0.2 }))).status).toBe("good");
    expect(assessLevel(peaksOf(sine({ frequency: 220, durationS: 1, amplitude: 0.7 }))).status).toBe("too-loud");
    expect(assessLevel(peaksOf(sine({ frequency: 220, durationS: 1, amplitude: 1.4 }).map(x => Math.max(-1, Math.min(1, x))))).status).toBe("clipping");
    expect(assessLevel([]).status).toBe("silent");
    expect(gainHintFor("too-quiet")).toBe("raise");
    expect(gainHintFor("clipping")).toBe("lower");
    expect(gainHintFor("good")).toBe("ok");
  });
});

describe("mains hum", () => {
  it("finds 50 Hz and 60 Hz hum in room noise, and nothing in clean noise", () => {
    const room = whiteNoise({ durationS: 2, amplitude: 0.002, seed: 3 });
    const with50 = mix([{ startS: 0, samples: room }, { startS: 0, samples: sine({ frequency: 50, durationS: 2, amplitude: 0.004 }) }], 2);
    const with60 = mix([{ startS: 0, samples: room }, { startS: 0, samples: sine({ frequency: 120, durationS: 2, amplitude: 0.003 }) }], 2);
    expect(detectMainsHum(with50, SR)).toBe(50);
    expect(detectMainsHum(with60, SR)).toBe(60);
    expect(detectMainsHum(room, SR)).toBeNull();
  });

  it("the analyser's notch removes the hum", () => {
    const hum = sine({ frequency: 60, durationS: 1, amplitude: 0.1 });
    const filtered = Float64Array.from(hum);
    Biquad.notch(SR, 60).process(filtered);
    expect(rmsDb(filtered, SR / 2, SR)).toBeLessThan(rmsDb(hum, SR / 2, SR) - 30);
  });
});

describe("high-pass", () => {
  it("cuts rumble below 60 Hz and keeps low E", () => {
    const level = (f: number) => {
      const x = Float64Array.from(sine({ frequency: f, durationS: 1, amplitude: 0.5 }));
      Biquad.highPass(SR, 60).process(x);
      return rmsDb(x, SR / 2, SR) - rmsDb(sine({ frequency: f, durationS: 1, amplitude: 0.5 }), SR / 2, SR);
    };
    expect(level(20)).toBeLessThan(-15);
    expect(level(82.4)).toBeGreaterThan(-3.5);
    expect(level(200)).toBeGreaterThan(-0.5);
  });
});

describe("click latency (loopback)", () => {
  function recording(delayMs: number, clicks: number[], options: { noise?: number; missing?: number[] } = {}) {
    const click = scale(Float32Array.from(sine({ frequency: 2000, durationS: 0.01, amplitude: 1 }), (x, i) => x * Math.exp(-i / 60)), 0.3);
    const sounds = clicks
      .map((t, i) => ({ t, i }))
      .filter(({ i }) => !options.missing?.includes(i))
      .map(({ t }) => ({ startS: t + delayMs / 1000, samples: click }));
    const dry = mix(sounds, clicks[clicks.length - 1]! + 1);
    return options.noise ? addNoise(dry, options.noise, 2) : dry;
  }
  const clicks = [0.5, 1.1, 1.7, 2.3, 2.9, 3.5];

  it("measures the round trip to within 1 ms, even in noise", () => {
    for (const delay of [12, 37, 85, 210]) {
      const result = measureClickLatency(recording(delay, clicks, { noise: 25 }), SR, clicks);
      expect(result.detected).toBe(clicks.length);
      expect(Math.abs(result.roundTripMs! - delay), `${delay}`).toBeLessThan(1);
      expect(result.spreadMs).toBeLessThan(2);
    }
  });

  it("gives up when too few clicks come back (headphones)", () => {
    const result = measureClickLatency(recording(40, clicks, { missing: [0, 1, 2, 3, 4] }), SR, clicks);
    expect(result.roundTripMs).toBeNull();
  });

  it("input latency = round trip - output latency; taps fallback", () => {
    expect(inputLatencyFromRoundTrip(52, 30)).toBe(22);
    expect(inputLatencyFromRoundTrip(20, 30)).toBe(0);
    expect(inputLatencyFromTaps([180, 190, 185, 200, 182], 150)).toBe(35);
    expect(inputLatencyFromTaps([180], 150)).toBeNull();
  });
});

describe("stored calibration", () => {
  it("round-trips and rejects malformed values", () => {
    const calibration = { ...defaultCalibration("dev-1"), gateDb: -52, latencyMs: 31, latencyMethod: "loopback" as const, humHz: 50 as const };
    expect(parseCalibration(JSON.parse(JSON.stringify(calibration)))).toEqual(calibration);
    expect(parseCalibration(null)).toBeNull();
    expect(parseCalibration({ version: 2 })).toBeNull();
    expect(parseCalibration({ ...calibration, gateDb: "x" })).toBeNull();
    expect(parseCalibration({ ...calibration, gateDb: -500 })!.gateDb).toBe(MIN_GATE_DB);
    expect(parseCalibration({ ...calibration, humHz: 55 })!.humHz).toBeNull();
  });
});
