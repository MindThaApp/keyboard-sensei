import { describe, expect, it } from "vitest";
import { synthPiano } from "./testing/synth.js";
import {
  analyseCheck, bandFor, buildNoteList, cents, derivedStretch, etFrequency, measureNote, pickSteadyPart,
  railsbackStretch, typicalB, loadReports, saveReport, makeReport, compareReports, PIANO_CHECK_REPORTS_KEY,
  PIANO_SAFETY_NOTE, type NoteMeasurement,
} from "./index.js";

const SR = 48000;

function tone(midi: number, detuneCents: number, B: number, extra: Partial<Parameters<typeof synthPiano>[0]> = {}) {
  const f0 = etFrequency(midi) * Math.pow(2, detuneCents / 1200);
  const x = synthPiano({ f0, B, sampleRate: SR, ...extra });
  const cap = pickSteadyPart(x, SR);
  expect(cap.problem).toBeNull();
  return { f0, m: measureNote(cap.part!.samples, SR, midi)! };
}

describe("measureNote on synthetic tones", () => {
  const cases: Array<[number, number]> = [
    [24, 8], [33, -12], [105, 6], [108, -4], [45, 5], [57, -20], [60, 0], [69, 14], [76, -7], [84, 3], [96, -9],
  ];
  for (const [midi, det] of cases) {
    it(`recovers detune within 1 cent and B within 10% (midi ${midi}, ${det}c)`, () => {
      const B = typicalB(midi);
      const { f0, m } = tone(midi, det, B);
      expect(Math.abs(cents(m.f0, f0))).toBeLessThan(1);
      expect(m.B).not.toBeNull();
      expect(Math.abs(m.B! / B - 1)).toBeLessThan(0.1);
    });
  }

  it("fits B across a range of B values on a mid note", () => {
    for (const B of [1e-4, 4e-4, 1.5e-3, 5e-3]) {
      const { f0, m } = tone(60, -6, B);
      expect(m.fitted).toBe(true);
      expect(Math.abs(m.B! / B - 1)).toBeLessThan(0.1);
      expect(Math.abs(cents(m.f0, f0))).toBeLessThan(1);
    }
  });

  it("finds f0 when the fundamental is missing (bass)", () => {
    const B = typicalB(30);
    const { f0, m } = tone(30, 6, B, { fundamentalGain: 0 });
    expect(Math.abs(cents(m.f0, f0))).toBeLessThan(1);
    expect(m.partials[0].n).toBeGreaterThan(1);
  });

  it("works with background noise and 44.1 kHz", () => {
    const f0 = etFrequency(52) * Math.pow(2, 9 / 1200);
    const x = synthPiano({ f0, B: typicalB(52), sampleRate: 44100, noise: 0.01 });
    const m = measureNote(pickSteadyPart(x, 44100).part!.samples, 44100, 52)!;
    expect(Math.abs(cents(m.f0, f0))).toBeLessThan(1);
  });

  it("measures against a non-440 A4", () => {
    const a4 = 442;
    const f0 = etFrequency(69, a4);
    const x = synthPiano({ f0, B: typicalB(69), sampleRate: SR });
    const m = measureNote(pickSteadyPart(x, SR).part!.samples, SR, 69, { a4 })!;
    expect(Math.abs(cents(m.f0, f0))).toBeLessThan(1);
  });

  it("flags a detuned unison but not a clean single string", () => {
    const clean = tone(60, 0, typicalB(60)).m;
    const split = tone(60, 0, typicalB(60), { extraStringsCents: [14] }).m;
    const beating = tone(60, 0, typicalB(60), { extraStringsCents: [3] }).m;
    expect(clean.splitCents).toBeNull();
    expect(clean.beatDb).toBeLessThan(3);
    expect(split.splitCents).not.toBeNull();
    expect(beating.beatDb).toBeGreaterThan(3);
  });
});

describe("capture", () => {
  it("rejects silence and clipping, and short captures", () => {
    expect(pickSteadyPart(new Float32Array(SR * 3), SR).problem).toBe("too_quiet");
    expect(pickSteadyPart(new Float32Array(SR * 3).fill(1), SR).problem).toBe("clipped");
    const x = synthPiano({ f0: 261.6, B: 3e-4, sampleRate: SR, seconds: 0.6 });
    expect(pickSteadyPart(x, SR).problem).toBe("too_short");
  });
  it("skips the attack", () => {
    const x = synthPiano({ f0: 261.6, B: 3e-4, sampleRate: SR, seconds: 3 });
    const { part } = pickSteadyPart(x, SR);
    expect(part!.samples.length).toBe(Math.round(SR * 1.5));
  });
});

describe("note list", () => {
  it("quick is about 20 notes and covers every A and C", () => {
    const q = buildNoteList("quick");
    expect(q.length).toBe(20);
    expect(q).toContain(21);
    expect(q).toContain(108);
    expect(q.filter((m) => m % 12 === 9).length).toBe(8);
  });
  it("full is all 88 keys and respects short ranges", () => {
    expect(buildNoteList("full").length).toBe(88);
    expect(buildNoteList("full", { low: 36, high: 96 })[0]).toBe(36);
    expect(buildNoteList("quick", { low: 48, high: 72 }).every((m) => m >= 48 && m <= 72)).toBe(true);
  });
});

describe("stretch and analysis", () => {
  it("Railsback curve is flat at A4 and widens outward", () => {
    expect(railsbackStretch(69)).toBe(0);
    expect(railsbackStretch(21)).toBeLessThan(-20);
    expect(railsbackStretch(108)).toBeGreaterThan(20);
  });

  it("derived curve from B values is monotonic and anchored at A4", () => {
    const pts = Array.from({ length: 30 }, (_, i) => [21 + i * 3, typicalB(21 + i * 3)] as const);
    const c = derivedStretch(pts)!;
    expect(c(69)).toBe(0);
    expect(c(100)).toBeGreaterThan(c(80));
    expect(c(30)).toBeLessThan(c(50));
    expect(derivedStretch(pts.slice(0, 3))).toBeNull();
  });

  function synthPianoSet(levelCents: number, perNote: (m: number) => number = () => 0): NoteMeasurement[] {
    // Tuned to the stretch implied by this piano's own inharmonicity.
    const own = derivedStretch(Array.from({ length: 88 }, (_, i) => [21 + i, typicalB(21 + i)] as const))!;
    return buildNoteList("quick").map((midi) => {
      const B = typicalB(midi);
      const det = levelCents + own(midi) + perNote(midi);
      return tone(midi, det, B).m;
    });
  }

  it("a well tuned stretched piano is in good shape", () => {
    const a = analyseCheck(synthPianoSet(0));
    expect(a.summary.verdict).toBe("good");
    expect(a.summary.redCount).toBe(0);
    expect(Math.abs(a.summary.levelCents)).toBeLessThan(3);
  });

  it("judging a stretched piano against ET alone would flag the extremes", () => {
    const a = analyseCheck(synthPianoSet(0), 440, { target: "equal_temperament" });
    expect(a.notes.find((n) => n.midi === 21)!.band).toBe("red");
  });

  it("reports the overall level and a pitch-raise verdict when far flat", () => {
    const a = analyseCheck(synthPianoSet(-30));
    expect(a.summary.levelCents).toBeLessThan(-25);
    expect(a.summary.verdict).toBe("pitch_raise");
  });

  it("names individual out-of-tune notes with their cents", () => {
    const a = analyseCheck(synthPianoSet(0, (m) => (m === 57 ? -22 : 0)));
    const n = a.notes.find((x) => x.midi === 57)!;
    expect(n.band).toBe("red");
    expect(n.centsStretch).toBeLessThan(-18);
    expect(a.summary.worst[0].midi).toBe(57);
    expect(a.summary.verdict).toBe("tuning_helps");
  });

  it("band thresholds", () => {
    expect(bandFor(5)).toBe("green");
    expect(bandFor(-5.1)).toBe("amber");
    expect(bandFor(15.1)).toBe("red");
  });
});

describe("reports", () => {
  function memory() {
    const d = new Map<string, string>();
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) };
  }
  const analysis = analyseCheck(
    [48, 60, 72].map((midi) => tone(midi, 2, typicalB(midi)).m),
  );

  it("stores reports newest first without touching other keys, and survives bad data", () => {
    const s = memory();
    s.setItem("other-key", "keep");
    saveReport(s, makeReport(analysis, "quick", new Date(1000)));
    const list = saveReport(s, makeReport(analysis, "full", new Date(2000)));
    expect(list.map((r) => r.mode)).toEqual(["full", "quick"]);
    expect(s.getItem("other-key")).toBe("keep");
    s.setItem(PIANO_CHECK_REPORTS_KEY, "{broken");
    expect(loadReports(s)).toEqual([]);
  });

  it("caps history and compares before and after", () => {
    const s = memory();
    for (let i = 0; i < 25; i++) saveReport(s, makeReport(analysis, "quick", new Date(i * 1000)));
    expect(loadReports(s).length).toBe(20);
    const [a, b] = loadReports(s);
    expect(compareReports(b, a).perNote.length).toBe(3);
  });
});

describe("safety note", () => {
  it("carries the spec wording", () => {
    expect(PIANO_SAFETY_NOTE).toContain("piano tuning lever (tuning hammer)");
    expect(PIANO_SAFETY_NOTE).toContain("never use pliers, wrenches or socket sets");
    expect(PIANO_SAFETY_NOTE).toContain("need a professional");
  });
});
