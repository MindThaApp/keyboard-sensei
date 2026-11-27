import { describe, expect, it } from "vitest";
import {
  centsBetween, equalTemperamentHz, inharmonicityAt, measureLivePitch, measurePianoNote, partialHz, shiftCents,
  synthPianoTone, TYPICAL_INHARMONICITY,
} from "./index.js";

const SR = 48000;
const typicalB = (m: number) => inharmonicityAt(TYPICAL_INHARMONICITY, m);

describe("measurePianoNote (synthetic piano tones)", () => {
  const cases: [number, number][] = [[21, -12], [28, 7], [33, 15], [40, 3], [52, -8], [60, 0], [69, 0.5], [76, -2], [84, 9], [96, -6], [105, 4], [108, 2]];
  for (const snrDb of [30, 20]) {
    it.each(cases)(`recovers detune within 1 cent and B within 10%% (midi %i, %f cents, SNR ${snrDb} dB)`, (midi, detune) => {
      const b = typicalB(midi) * 1.3;
      const tone = synthPianoTone({ midi, detuneCents: detune, inharmonicityB: b, partials: 16, fundamentalLevel: midi < 40 ? 0.2 : 1, snrDb, seed: midi });
      const m = measurePianoNote(tone, SR, midi)!;
      expect(m).not.toBeNull();
      expect(Math.abs(centsBetween(m.pitchHz, equalTemperamentHz(midi)) - detune)).toBeLessThan(1);
      expect(Math.abs(m.inharmonicityB / b - 1)).toBeLessThan(0.1);
      expect(m.confidence).toBeGreaterThan(0.5);
    });
  }

  it("finds the pitch in the bass when the fundamental is missing", () => {
    const tone = synthPianoTone({ midi: 24, detuneCents: -20, inharmonicityB: 3e-4, partials: 16, fundamentalLevel: 0 });
    const m = measurePianoNote(tone, SR, 24)!;
    expect(Math.abs(centsBetween(m.pitchHz, equalTemperamentHz(24)) + 20)).toBeLessThan(1);
    expect(m.partials.some((p) => p.n === 1)).toBe(false);
  });

  it("measures a note far below pitch", () => {
    const tone = synthPianoTone({ midi: 64, detuneCents: -95, inharmonicityB: 4e-4 });
    const m = measurePianoNote(tone, SR, 64)!;
    expect(Math.abs(centsBetween(m.pitchHz, equalTemperamentHz(64)) + 95)).toBeLessThan(1);
  });

  it("follows the reference pitch", () => {
    const tone = synthPianoTone({ midi: 69, a4Hz: 442, inharmonicityB: 4e-4 });
    const m = measurePianoNote(tone, SR, 69, { a4Hz: 442 })!;
    expect(Math.abs(m.pitchHz - 442)).toBeLessThan(0.05);
  });

  it("returns null on silence", () => {
    expect(measurePianoNote(new Float32Array(SR), SR, 60)).toBeNull();
  });
});

describe("measureLivePitch", () => {
  it.each([[30, 3], [40, 2], [60, 1], [88, 1]])("reads midi %i on partial %i within 0.2 cents from a 0.6 s block", (midi, n) => {
    const b = typicalB(midi);
    const target = equalTemperamentHz(midi) * 1.001;
    for (const off of [-30, -3.5, 0, 0.7, 12]) {
      const tone = synthPianoTone({ midi, pitchHz: shiftCents(target, off), inharmonicityB: b, durationS: 0.6, partials: 10, fundamentalLevel: midi < 40 ? 0.2 : 1, snrDb: 25, seed: 7 });
      const r = measureLivePitch(tone, SR, target, b, n)!;
      expect(Math.abs(r.cents - off)).toBeLessThan(0.2);
    }
  });

  it("uses the right partial frequency", () => {
    const b = 5e-4;
    const f0 = 100;
    expect(partialHz(f0, b, 3)).toBeCloseTo(3 * f0 * Math.sqrt(1 + 9 * b), 9);
  });

  it("returns null on silence", () => {
    expect(measureLivePitch(new Float32Array(24000), SR, 440, 4e-4, 1)).toBeNull();
  });
});
