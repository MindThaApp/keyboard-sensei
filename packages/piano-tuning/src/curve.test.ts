import { describe, expect, it } from "vitest";
import {
  B_KNOTS, centsBetween, computeTuningCurve, equalTemperamentHz, fitInharmonicity, inharmonicityAt, measurePianoNote,
  partialHz, sampleNotesForCurve, synthPianoTone, tuningOrder, TYPICAL_INHARMONICITY, type InharmonicityModel, type TuningCurve,
} from "./index.js";

const partial = (curve: TuningCurve, midi: number, n: number) => {
  const t = curve.targets[midi];
  return partialHz(t.targetHz / Math.sqrt(1 + t.inharmonicityB), t.inharmonicityB, n);
};

describe("computeTuningCurve", () => {
  const curve = computeTuningCurve([]);

  it("puts A4 at the reference and covers all 88 keys", () => {
    expect(curve.targets[69].targetHz).toBe(440);
    expect(Object.keys(curve.targets)).toHaveLength(88);
    expect(computeTuningCurve([], { a4Hz: 442 }).targets[69].targetHz).toBe(442);
  });

  it("is stretched: bass flat and treble sharp of ET, rising steadily", () => {
    for (let m = 22; m <= 108; m++) expect(curve.targets[m].centsVsEt).toBeGreaterThanOrEqual(curve.targets[m - 1].centsVsEt - 0.05);
    expect(curve.targets[21].centsVsEt).toBeLessThan(-8);
    expect(curve.targets[21].centsVsEt).toBeGreaterThan(-45);
    expect(curve.targets[108].centsVsEt).toBeGreaterThan(10);
    expect(curve.targets[108].centsVsEt).toBeLessThan(50);
    expect(Math.abs(curve.targets[60].centsVsEt)).toBeLessThan(3);
  });

  it("makes the temperament octave a beatless 4:2 and divides it evenly", () => {
    expect(centsBetween(partial(curve, 69, 2), partial(curve, 57, 4))).toBeCloseTo(0, 6);
    const step = centsBetween(curve.targets[58].targetHz, curve.targets[57].targetHz);
    for (let m = 58; m <= 69; m++) expect(centsBetween(curve.targets[m].targetHz, curve.targets[m - 1].targetHz)).toBeCloseTo(step, 6);
  });

  it("matches 4:2 octaves in the middle treble, 2:1 at the top", () => {
    for (let m = 70; m <= 84; m++) expect(centsBetween(partial(curve, m, 2), partial(curve, m - 12, 4))).toBeCloseTo(0, 6);
    for (let m = 91; m <= 108; m++) expect(centsBetween(partial(curve, m, 1), partial(curve, m - 12, 2))).toBeCloseTo(0, 6);
    expect(curve.targets[80].match).toEqual({ low: 4, high: 2 });
    expect(curve.targets[100].match).toEqual({ low: 2, high: 1 });
  });

  it("matches 4:2 octaves near the temperament and wider 6:3 in the bass", () => {
    for (let m = 48; m <= 56; m++) expect(centsBetween(partial(curve, m, 4), partial(curve, m + 12, 2))).toBeCloseTo(0, 6);
    for (let m = 21; m <= 41; m++) expect(centsBetween(partial(curve, m, 6), partial(curve, m + 12, 3))).toBeCloseTo(0, 6);
    expect(curve.targets[30].match).toEqual({ low: 6, high: 3 });
    expect(curve.targets[30].partnerMidi).toBe(42);
    expect(curve.targets[80].partnerMidi).toBe(68);
  });

  it("reduces to equal temperament without inharmonicity", () => {
    const harmonic: InharmonicityModel = { log10BAtKnots: B_KNOTS.map(() => -14), sampleCount: 4 };
    const et = computeTuningCurve(harmonic);
    for (let m = 21; m <= 108; m++) expect(Math.abs(et.targets[m].centsVsEt)).toBeLessThan(0.01);
  });

  it("stretches more on a piano with more inharmonicity", () => {
    const stiff: InharmonicityModel = { log10BAtKnots: TYPICAL_INHARMONICITY.log10BAtKnots.map((v) => v + 0.3), sampleCount: 4 };
    const s = computeTuningCurve(stiff);
    expect(s.targets[108].centsVsEt).toBeGreaterThan(curve.targets[108].centsVsEt + 5);
    expect(s.targets[21].centsVsEt).toBeLessThan(curve.targets[21].centsVsEt - 5);
  });

  it("limits targets to a short keyboard but keeps the same pitches", () => {
    const short = computeTuningCurve([], { lowestMidi: 28, highestMidi: 103 });
    expect(short.targets[27]).toBeUndefined();
    expect(short.targets[104]).toBeUndefined();
    expect(short.targets[40].targetHz).toBeCloseTo(curve.targets[40].targetHz, 9);
  });
});

describe("curve from a measured piano (synthetic tones with a known B profile)", () => {
  const truth: InharmonicityModel = { log10BAtKnots: [-3.2, -3.7, -3.0, -1.6], sampleCount: 4 };
  const notes = sampleNotesForCurve();
  const samples = notes.map((midi) => {
    const tone = synthPianoTone({ midi, inharmonicityB: inharmonicityAt(truth, midi), detuneCents: (midi % 7) - 3, partials: 16, fundamentalLevel: midi < 40 ? 0.3 : 1, snrDb: 25, seed: midi });
    return measurePianoNote(tone, 48000, midi)!;
  });

  it("measures B on every sample within 10%", () => {
    for (const s of samples) expect(Math.abs(s.inharmonicityB / inharmonicityAt(truth, s.midi) - 1)).toBeLessThan(0.1);
  });

  it("fits the B profile and gives a curve within 1 cent of the true one", () => {
    const fitted = fitInharmonicity(samples);
    expect(fitted.sampleCount).toBe(notes.length);
    const ideal = computeTuningCurve(truth);
    const got = computeTuningCurve(samples);
    for (let m = 21; m <= 108; m++) expect(Math.abs(got.targets[m].centsVsEt - ideal.targets[m].centsVsEt)).toBeLessThan(1);
  });

  it("still gives a sensible curve from only three samples", () => {
    const few = computeTuningCurve(samples.filter((s) => [57, 69, 81].includes(s.midi)));
    const full = computeTuningCurve(samples);
    for (let m = 22; m <= 108; m++) expect(few.targets[m].centsVsEt).toBeGreaterThanOrEqual(few.targets[m - 1].centsVsEt - 0.2);
    for (let m = 50; m <= 90; m++) expect(Math.abs(few.targets[m].centsVsEt - full.targets[m].centsVsEt)).toBeLessThan(2);
  });
});

describe("tuningOrder", () => {
  it("does the temperament octave first, then up the treble, then down the bass", () => {
    const order = tuningOrder();
    expect(order).toHaveLength(88);
    expect(order.slice(0, 2)).toEqual([69, 57]);
    expect(order.slice(2, 13)).toEqual([58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68]);
    expect(order[13]).toBe(70);
    expect(order[order.indexOf(108) + 1]).toBe(56);
    expect(order[order.length - 1]).toBe(21);
  });

  it("always tunes a note's octave partner before the note", () => {
    const curve = computeTuningCurve([]);
    const order = tuningOrder();
    for (const m of order) {
      const p = curve.targets[m].partnerMidi;
      if (p !== undefined) expect(order.indexOf(p)).toBeLessThan(order.indexOf(m));
    }
  });

  it("respects a short keyboard", () => {
    const order = tuningOrder(28, 103);
    expect(Math.min(...order)).toBe(28);
    expect(Math.max(...order)).toBe(103);
  });

  it("samples across the range including A4", () => {
    const s = sampleNotesForCurve();
    expect(s).toContain(69);
    expect(s[0]).toBe(21);
    expect(s[s.length - 1]).toBe(108);
    expect(equalTemperamentHz(69)).toBe(440);
  });
});
