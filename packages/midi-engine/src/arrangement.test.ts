import { describe, expect, it } from "vitest";
import {
  BEGINNER_DURATIONS,
  BEGINNER_RANGE,
  INTERMEDIATE_MAX_NOTES_PER_HAND,
  estimateKey,
  extractMelody,
  melodyLine,
  simplifyArrangement,
  type ArrangementNote,
} from "./arrangement.js";

const n = (midi: number, startBeat: number, durationBeats: number, hand: "left" | "right" = "right"): ArrangementNote => ({
  midi,
  startBeat,
  durationBeats,
  hand,
});

const pitches = (notes: ArrangementNote[]): number[] => notes.map((note) => note.midi);

/** Max notes sounding at any onset, per hand. */
function maxSimultaneous(notes: ArrangementNote[], hand: "left" | "right"): number {
  const own = notes.filter((note) => note.hand === hand);
  let max = 0;
  for (const note of own) {
    const sounding = own.filter((o) => o.startBeat <= note.startBeat + 1e-9 && o.startBeat + o.durationBeats > note.startBeat + 1e-9).length;
    max = Math.max(max, sounding);
  }
  return max;
}

const isMonophonic = (notes: ArrangementNote[]): boolean =>
  notes.every((note, i) => i === 0 || notes[i - 1].startBeat + notes[i - 1].durationBeats <= note.startBeat + 1e-9);

/** C major scale tune over an Alberti bass, 4/4, two bars. */
const albertiPiece = (): ArrangementNote[] => {
  const tune = [72, 74, 76, 77, 79, 77, 76, 74].map((midi, i) => n(midi, i, 1));
  const bass: ArrangementNote[] = [];
  for (let i = 0; i < 16; i++) bass.push(n([48, 55, 52, 55][i % 4], i * 0.5, 0.5, "left"));
  return [...tune, ...bass];
};

describe("extractMelody", () => {
  it("takes the top voice and skips an inner voice under a held melody note", () => {
    // Held G#4 over accompaniment triplets that go no higher than E4.
    const notes = [n(68, 0, 3), n(56, 0, 1 / 3), n(61, 1 / 3, 1 / 3), n(64, 2 / 3, 1 / 3), n(56, 1, 1 / 3), n(69, 3, 1)];
    expect(pitches(extractMelody(notes))).toEqual([68, 69]);
  });

  it("swaps an isolated upward spike for a note near its neighbours", () => {
    const notes = [n(60, 0, 1), n(84, 1, 1), n(62, 1, 1), n(64, 2, 1)];
    expect(pitches(extractMelody(notes))).toEqual([60, 62, 64]);
  });

  it("is monophonic: each note ends before the next starts", () => {
    const melody = extractMelody([n(60, 0, 4), n(62, 1, 4), n(64, 2, 4)]);
    expect(isMonophonic(melody)).toBe(true);
    expect(melody[0].durationBeats).toBe(1);
  });
});

describe("melodyLine", () => {
  it("drops grace notes and collapses a trill into one held note", () => {
    const notes = [
      n(71, 0, 0.0625), // grace
      n(72, 0.0625, 0.9375),
      ...[74, 76, 74, 76, 74, 76].map((midi, i) => n(midi, 1 + i * 0.0625, 0.0625)), // trill
      n(77, 2, 1),
    ];
    expect(pitches(melodyLine(notes))).toEqual([72, 74, 77]);
  });

  it("uses notes marked as melody in preference to the right hand's top voice", () => {
    const notes = [{ ...n(55, 0, 1, "left"), melody: true }, n(79, 0, 1), { ...n(57, 1, 1, "left"), melody: true }, n(79, 1, 1)];
    expect(pitches(melodyLine(notes))).toEqual([55, 57]);
  });

  it("ignores notes before melodyStartBeat", () => {
    expect(pitches(melodyLine([n(66, 0, 2), n(78, 3, 1), n(81, 4, 1)], { melodyStartBeat: 3 }))).toEqual([78, 81]);
  });
});

describe("estimateKey", () => {
  it("finds C major and A minor from scale-and-triad material", () => {
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67, 60].map((midi, i) => n(midi, i, 1));
    expect(estimateKey(cMajor)).toEqual({ tonic: 0, mode: "major" });
    const aMinor = [57, 59, 60, 62, 64, 65, 68, 69, 57, 60, 64, 57, 64, 57].map((midi, i) => n(midi, i, 1));
    expect(estimateKey(aMinor)).toEqual({ tonic: 9, mode: "minor" });
  });
});

describe("simplifyArrangement: full", () => {
  it("returns every note, unchanged", () => {
    const notes = albertiPiece();
    const result = simplifyArrangement(notes, {}, "full");
    expect(result.notes).toHaveLength(notes.length);
    expect(result.transpose).toBe(0);
  });
});

describe("simplifyArrangement: beginner", () => {
  it("is right-hand only, monophonic, on an eighth grid, with allowed lengths, inside the range", () => {
    const notes = [
      ...albertiPiece(),
      n(84, 8, 0.25), // a fast run the beginner can't keep
      n(83, 8.25, 0.25),
      n(81, 8.5, 0.25),
      n(79, 8.75, 0.25),
      n(77, 9, 3),
    ];
    const { notes: out } = simplifyArrangement(notes, { key: { tonic: 0, mode: "major" } }, "beginner");
    expect(out.every((note) => note.hand === "right")).toBe(true);
    expect(isMonophonic(out)).toBe(true);
    for (const note of out) {
      expect(note.startBeat % 0.5).toBe(0);
      expect(BEGINNER_DURATIONS).toContain(note.durationBeats);
      expect(note.midi).toBeGreaterThanOrEqual(BEGINNER_RANGE.min);
      expect(note.midi).toBeLessThanOrEqual(BEGINNER_RANGE.max);
    }
    // The 16th run is thinned to eighths: 84 . 81 . then 77.
    expect(pitches(out).slice(8)).toEqual([84, 81, 77]);
  });

  it("keeps an easy key and only places it by octaves", () => {
    const tune = [69, 72, 76, 74, 72, 71, 69, 68].map((midi, i) => n(midi + 12, i, 1)); // A minor, an octave high
    const result = simplifyArrangement(tune, { key: { tonic: 9, mode: "minor" } }, "beginner");
    expect(mod12(result.transpose)).toBe(0);
    expect(pitches(result.notes)).toEqual(tune.map((note) => note.midi + result.transpose));
  });

  it("transposes a hard key to the nearest easy one (Db major → C major)", () => {
    const tune = [61, 63, 65, 66, 68, 66, 65, 63, 61].map((midi, i) => n(midi, i, 1));
    const result = simplifyArrangement(tune, { key: { tonic: 1, mode: "major" } }, "beginner");
    expect(mod12(result.transpose)).toBe(11); // down a semitone, octave placement aside
    expect(pitches(result.notes).map(mod12)).toEqual([0, 2, 4, 5, 7, 5, 4, 2, 0]);
  });

  it("keeps both notes of a dotted-eighth + sixteenth figure (rhythm is straightened, not thinned)", () => {
    const tune = [n(72, 0, 0.75), n(74, 0.75, 0.25), n(76, 1, 1), n(77, 2, 2)];
    const { notes: out } = simplifyArrangement(tune, { key: { tonic: 0, mode: "major" } }, "beginner");
    expect(pitches(out)).toEqual([72, 74, 76, 77]);
    expect(out.map((note) => note.startBeat)).toEqual([0, 0.5, 1, 2]);
  });

  it("preserves the piece's length to within one beat", () => {
    const notes = albertiPiece();
    const { notes: out } = simplifyArrangement(notes, {}, "beginner");
    const end = (xs: ArrangementNote[]) => Math.max(...xs.map((note) => note.startBeat + note.durationBeats));
    expect(Math.abs(end(out) - end(notes))).toBeLessThanOrEqual(1);
  });
});

describe("simplifyArrangement: intermediate", () => {
  it("keeps the tune, turns an Alberti bass into one held bass+chord per bar", () => {
    const { notes: out } = simplifyArrangement(albertiPiece(), { meters: [{ startBeat: 0, numerator: 4, denominator: 4 }] }, "intermediate");
    const rh = out.filter((note) => note.hand === "right");
    const lh = out.filter((note) => note.hand === "left");
    expect(pitches(rh)).toEqual([72, 74, 76, 77, 79, 77, 76, 74]);
    // Bar 1 and bar 2: C3 with E3 and G3 above it, held for the bar.
    expect(lh.map((note) => [note.midi, note.startBeat, note.durationBeats])).toEqual([
      [48, 0, 4],
      [52, 0, 4],
      [55, 0, 4],
      [48, 4, 4],
      [52, 4, 4],
      [55, 4, 4],
    ]);
    expect(maxSimultaneous(out, "left")).toBeLessThanOrEqual(INTERMEDIATE_MAX_NOTES_PER_HAND);
    expect(maxSimultaneous(out, "right")).toBe(1);
  });

  it("uses a dotted-quarter window in compound meters", () => {
    // 6/8: bass D on beat 1, A on beat 2 (1.5 quarters later), as broken eighths.
    const left = [50, 57, 62, 45, 52, 57].map((midi, i) => n(midi, i * 0.5, 0.5, "left"));
    const { notes: out } = simplifyArrangement(
      [...left, n(74, 0, 3)],
      { meters: [{ startBeat: 0, numerator: 6, denominator: 8 }] },
      "intermediate",
    );
    const bassStarts = out.filter((note) => note.hand === "left" && (note.midi === 50 || note.midi === 45)).map((note) => note.startBeat);
    expect(bassStarts).toEqual([0, 1.5]);
  });

  it("thins runs faster than a sixteenth", () => {
    const run = Array.from({ length: 16 }, (_, i) => n(72 + (i % 5), i * 0.125, 0.125));
    const { notes: out } = simplifyArrangement(run, {}, "intermediate");
    const gaps = out.slice(1).map((note, i) => note.startBeat - out[i].startBeat);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.25);
  });
});

describe("simplifyArrangement: determinism and speed", () => {
  const big = (): ArrangementNote[] => {
    // 3,000 notes: a 16th-note right hand over an eighth-note left hand.
    const notes: ArrangementNote[] = [];
    for (let i = 0; i < 2000; i++) notes.push(n(67 + ((i * 7) % 17), i * 0.25, 0.25));
    for (let i = 0; i < 1000; i++) notes.push(n(43 + ((i * 5) % 12), i * 0.5, 0.5, "left"));
    return notes;
  };

  it("gives identical output for identical input", () => {
    for (const level of ["beginner", "intermediate"] as const) {
      expect(simplifyArrangement(big(), {}, level)).toEqual(simplifyArrangement(big(), {}, level));
    }
  });

  it("handles a 3,000-note song in well under a frame budget per level", () => {
    const notes = big();
    simplifyArrangement(notes, {}, "intermediate"); // warm up
    for (const level of ["beginner", "intermediate"] as const) {
      const start = performance.now();
      simplifyArrangement(notes, {}, level);
      const ms = performance.now() - start;
      console.log(`simplifyArrangement(${level}) on 3000 notes: ${ms.toFixed(1)}ms`);
      expect(ms).toBeLessThan(100);
    }
  });
});

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}
