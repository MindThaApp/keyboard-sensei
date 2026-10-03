import { describe, expect, it } from "vitest";
import { engrave, type EngraveInputNote, type EngraveOptions, type StaffName } from "./engraving";
import type { NoteData } from "./measureNotation";

const C_MAJOR = [{ startBeat: 0, key: { fifths: 0, mode: "major" as const } }];
const meter = (numerator: number, denominator: number) => [{ startBeat: 0, numerator, denominator }];

let nextId = 0;
const note = (midi: number, startBeat: number, length: number, staff: StaffName = "treble"): EngraveInputNote => ({
  id: `n${nextId++}`,
  midi,
  staff,
  startBeat,
  endBeat: startBeat + length,
});

function run(notes: EngraveInputNote[], options: Partial<EngraveOptions> = {}, staves: StaffName[] = ["treble"]) {
  return engrave(notes, staves, { meters: meter(4, 4), keys: C_MAJOR, showKeySignature: false, ...options });
}

/** Compact view of a measure: "q[c/4]", "8r", "h~[d/4]", "8³[e/4]". */
const show = (notes: NoteData[]) =>
  notes
    .map((n) => {
      const rest = n.duration.includes("r");
      return `${n.duration}${n.tuplet !== undefined ? "³" : ""}${n.tie ? "~" : ""}${rest ? "" : `[${n.keys.join(",")}]`}`;
    })
    .join(" ");

const measuresOf = (result: ReturnType<typeof run>, staff: StaffName = "treble") => result.staves[staff]!.measures.map((m) => show(m.notes));

describe("engrave — rests", () => {
  it("merges a silence into the fewest rests that still show the beat", () => {
    // Beat 1 note, then three beats of silence: q, then a quarter rest to the middle of the bar, then a half rest.
    expect(measuresOf(run([note(60, 0, 1)]))).toEqual(["q[c/4] qr hr"]);
  });

  it("writes a whole silent bar as one whole rest that lasts exactly the bar, in any meter", () => {
    const result = run([note(60, 3, 3)], { meters: meter(3, 4), minMeasureCount: 3 });
    const bars = result.staves.treble!.measures;
    expect(bars[0].notes).toEqual([{ keys: ["b/4"], duration: "wr", barRest: 3 }]);
    expect(show(bars[2].notes)).toBe("wr");
    expect(bars[2].notes[0].barRest).toBe(3);
  });

  it("puts bass-clef rests on the bass staff's middle line", () => {
    const result = run([note(48, 0, 1, "bass")], {}, ["bass"]);
    expect(result.staves.bass!.measures[0].notes[1].keys).toEqual(["d/3"]);
  });

  it("uses dotted rests in compound time", () => {
    expect(measuresOf(run([note(60, 0, 1.5)], { meters: meter(6, 8) }))).toEqual(["qd[c/4] qdr"]);
  });
});

describe("engrave — ties, chords and voicing", () => {
  it("ties a note across the barline, carrying its ids on the first half only", () => {
    const tied = note(62, 3, 2);
    const result = run([note(60, 0, 3), tied, note(64, 5, 3)]);
    const bars = result.staves.treble!.measures;
    expect(bars.map((m) => show(m.notes))).toEqual(["hd[c/4] q~[d/4]", "q[d/4] q~[e/4] h[e/4]"]);
    expect(bars[0].notes[1].ids).toEqual([tied.id]);
    expect(bars[1].notes[0].ids).toBeUndefined();
  });

  it("splits a syncopated half note at the middle of a 4/4 bar", () => {
    expect(measuresOf(run([note(60, 0, 1), note(62, 1, 2), note(64, 3, 1)]))).toEqual(["q[c/4] q~[d/4] q[d/4] q[e/4]"]);
  });

  it("allows a dotted quarter on the beat in simple time", () => {
    expect(measuresOf(run([note(60, 0, 1.5), note(62, 1.5, 0.5), note(64, 2, 2)]))).toEqual(["qd[c/4] 8[d/4] h[e/4]"]);
  });

  it("makes notes struck together one chord, lowest first, ids aligned with keys", () => {
    const top = note(67, 0, 4);
    const bottom = note(60, 0, 4);
    const result = run([top, bottom]);
    const [chord] = result.staves.treble!.measures[0].notes;
    expect(chord.keys).toEqual(["c/4", "g/4"]);
    expect(chord.ids).toEqual([bottom.id, top.id]);
    expect(chord.duration).toBe("w");
  });

  it("cuts a held note off where the next one starts, instead of opening a second voice", () => {
    expect(measuresOf(run([note(60, 0, 4), note(64, 2, 2)]))).toEqual(["h[c/4] h[e/4]"]);
  });

  it("keeps a grand staff's hands bar-for-bar, even when one hand is silent", () => {
    const result = run([note(72, 4, 4), note(48, 0, 4, "bass")], {}, ["treble", "bass"]);
    expect(measuresOf(result, "treble")).toEqual(["wr", "w[c/5]"]);
    expect(measuresOf(result, "bass")).toEqual(["w[c/3]", "wr"]);
  });
});

describe("engrave — quantization", () => {
  it("snaps a rubato performance to the beat instead of producing tiny values", () => {
    const played = [note(60, 0.03, 0.85), note(62, 0.97, 0.9), note(64, 2.04, 0.8), note(65, 2.96, 0.95)];
    expect(measuresOf(run(played, { legato: true }))).toEqual(["q[c/4] q[d/4] q[e/4] q[f/4]"]);
  });

  it("without legato, keeps a deliberate rest", () => {
    expect(measuresOf(run([note(60, 0, 1), note(62, 2, 2)]))).toEqual(["q[c/4] qr h[d/4]"]);
  });

  it("notates three notes to a beat as a triplet", () => {
    const triplet = [note(60, 0, 1 / 3), note(62, 0.34, 1 / 3), note(64, 0.66, 1 / 3), note(65, 1, 3)];
    const [bar] = measuresOf(run(triplet));
    // (The held F crosses the middle of the bar from beat 2, so it shows as a tied quarter + half.)
    expect(bar).toBe("8³[c/4] 8³[d/4] 8³[e/4] q~[f/4] h[f/4]");
  });

  it("keeps straight sixteenths straight", () => {
    const sixteenths = [0, 0.25, 0.5, 0.75].map((t, i) => note(60 + i, t, 0.25));
    expect(measuresOf(run([...sixteenths, note(67, 1, 3)]))[0]).toBe("16[c/4] 16[c#/4] 16[d/4] 16[eb/4] q~[g/4] h[g/4]");
  });

  it("beams compound time in dotted quarters: 6/8 eighths stay eighths", () => {
    const eighths = [0, 0.5, 1, 1.5, 2, 2.5].map((t) => note(60, t, 0.5));
    expect(measuresOf(run(eighths, { meters: meter(6, 8) }))).toEqual(["8[c/4] 8[c/4] 8[c/4] 8[c/4] 8[c/4] 8[c/4]"]);
  });
});

describe("engrave — keys, meters and clefs", () => {
  it("spells in the given key and marks key and meter changes on the bar where they happen", () => {
    const result = engrave([note(61, 0, 4), note(61, 4, 3)], ["treble"], {
      meters: [
        { startBeat: 0, numerator: 4, denominator: 4 },
        { startBeat: 4, numerator: 3, denominator: 4 },
      ],
      keys: [
        { startBeat: 0, key: { fifths: -5, mode: "major" } },
        { startBeat: 4, key: { fifths: 4, mode: "major" } },
      ],
      showKeySignature: true,
    });
    const staff = result.staves.treble!;
    expect(staff.keySignature).toBe("Db");
    expect(staff.timeSignature).toBe("4/4");
    expect(staff.measures[0].notes[0].keys).toEqual(["db/4"]);
    expect(staff.measures[1]).toMatchObject({ keySignature: "E", timeSignature: "3/4" });
    expect(staff.measures[1].notes[0].keys).toEqual(["c#/4"]);
  });

  it("moves a left hand playing high into treble clef for those bars, and back", () => {
    const result = run(
      [note(48, 0, 4, "bass"), note(65, 4, 2, "bass"), note(69, 6, 2, "bass"), note(43, 8, 4, "bass")],
      { clefChanges: true },
      ["bass"],
    );
    const bars = result.staves.bass!.measures;
    expect(bars.map((m) => m.clef)).toEqual([undefined, "treble", "bass"]);
  });
});
