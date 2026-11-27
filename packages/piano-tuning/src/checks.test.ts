import { describe, expect, it } from "vitest";
import {
  adviseForPitchLevel, checkOctave, computeTuningCurve, detectBeats, deviationAt, MAX_OVERPULL_CENTS, measurePianoNote,
  overpullCents, partialHz, pitchLevelCents, shiftCents, synthPianoTone, unisonVerdict,
} from "./index.js";

const SR = 48000;

describe("unison check (beats between strings of one note)", () => {
  it.each([[69, 3], [69, 6], [69, 10], [60, 8], [81, 4]])("midi %i with a string %f cents off beats at the right rate", (midi, cents) => {
    const tone = synthPianoTone({ midi, inharmonicityB: 5e-4, unisonDetuneCents: [cents], durationS: 3, partials: 6, snrDb: 30 });
    const f = shiftCents(440 * 2 ** ((midi - 69) / 12), cents / 2);
    const expected = 440 * 2 ** ((midi - 69) / 12) * (2 ** (cents / 1200) - 1);
    const r = detectBeats(tone, SR, f);
    expect(Math.abs(r.beatHz - expected) / expected).toBeLessThan(0.1);
    expect(unisonVerdict(r)).toBe("beating");
  });

  it("reports a clean unison as clean", () => {
    const tone = synthPianoTone({ midi: 69, inharmonicityB: 5e-4, unisonDetuneCents: [0, 0], durationS: 3, partials: 6, snrDb: 30 });
    const r = detectBeats(tone, SR, 440);
    expect(unisonVerdict(r)).toBe("clean");
  });

  it("detects a three-string unison with one side string off", () => {
    const tone = synthPianoTone({ midi: 64, inharmonicityB: 5e-4, unisonDetuneCents: [0, 5], durationS: 3, partials: 6 });
    const r = detectBeats(tone, SR, 329.63);
    expect(r.beatHz).toBeGreaterThan(0.8);
    expect(r.beatHz).toBeLessThan(1.1);
  });
});

describe("octave check", () => {
  const curve = computeTuningCurve([]);
  const tone = (midi: number, extraCents = 0) => {
    const t = curve.targets[midi];
    return measurePianoNote(synthPianoTone({ midi, pitchHz: shiftCents(t.targetHz, extraCents), inharmonicityB: t.inharmonicityB, partials: 12 }), SR, midi)!;
  };

  it("passes an octave tuned to the curve", () => {
    const r = checkOctave(tone(60), tone(72), curve.targets[72].match!);
    expect(r.verdict).toBe("clean");
    expect(Math.abs(r.cents)).toBeLessThan(0.3);
  });

  it("flags an octave whose upper note is 3 cents sharp, with the beat rate", () => {
    const r = checkOctave(tone(60), tone(72, 3), { low: 4, high: 2 });
    expect(r.cents).toBeGreaterThan(2.5);
    expect(r.cents).toBeLessThan(3.5);
    expect(r.verdict).toBe("beating");
    expect(r.beatHz).toBeCloseTo(r.highPartialHz - r.lowPartialHz, 9);
  });

  it("checks a 6:3 bass octave on the right partials", () => {
    const low = tone(33);
    const high = tone(45);
    const r = checkOctave(low, high, { low: 6, high: 3 });
    expect(r.lowPartialHz).toBeCloseTo(partialHz(low.f0Hz, low.inharmonicityB, 6), 0);
    expect(r.verdict).toBe("clean");
  });

  it("hears beats between two keys played together", () => {
    const a = synthPianoTone({ midi: 57, pitchHz: 220, inharmonicityB: 0, partials: 4, durationS: 3 });
    const b = synthPianoTone({ midi: 69, pitchHz: shiftCents(440, 5), inharmonicityB: 0, partials: 2, durationS: 3 });
    const mix = a.map((v, i) => v + b[i]);
    const r = detectBeats(mix, SR, 440);
    expect(Math.abs(r.beatHz - 440 * (2 ** (5 / 1200) - 1))).toBeLessThan(0.15);
  });
});

describe("pitch raise", () => {
  it("advises by pitch level", () => {
    expect(adviseForPitchLevel(-5)).toBe("fine-tune");
    expect(adviseForPitchLevel(-30)).toBe("pitch-raise");
    expect(adviseForPitchLevel(-140)).toBe("professional");
  });

  it("overpulls a small, capped amount and never for sharp notes", () => {
    expect(overpullCents(-40, 60)).toBeCloseTo(10, 9);
    expect(overpullCents(-20, 60)).toBeCloseTo(5, 9);
    expect(overpullCents(-20, 30)).toBeCloseTo(2.5, 9);
    expect(overpullCents(-500, 60)).toBe(MAX_OVERPULL_CENTS);
    expect(overpullCents(4, 60)).toBe(0);
  });

  it("uses a robust pitch level and interpolates deviations", () => {
    expect(pitchLevelCents([-30, -28, -31, 5, -29])).toBe(-29);
    const d = [{ midi: 21, cents: -40 }, { midi: 69, cents: -20 }];
    expect(deviationAt(d, 45)).toBeCloseTo(-30, 9);
    expect(deviationAt(d, 100)).toBe(-20);
  });
});
