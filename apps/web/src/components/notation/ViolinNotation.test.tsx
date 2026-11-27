// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotationRenderer from "./NotationRenderer";
import { violinLabels } from "../../utils/violinNotation";

const staff = {
  clef: "treble",
  timeSignature: "4/4",
  keySignature: "D",
  measures: [
    {
      notes: [
        { keys: ["d/4"], duration: "q", violin: { position: 1, string: "D", finger: 0, bow: "down" } },
        { keys: ["e/4"], duration: "q", violin: { finger: 1, bow: "up" } },
        { keys: ["f#/4"], duration: "q", violin: { finger: 2, bow: "down", slur: "start" } },
        { keys: ["g/4"], duration: "q", violin: { finger: 3, slur: "end" } },
      ],
    },
  ],
};

describe("violinLabels", () => {
  it("returns nothing for an unmarked note", () => {
    expect(violinLabels(undefined)).toEqual({ above: [], bowCode: null });
    expect(violinLabels({})).toEqual({ above: [], bowCode: null });
  });

  it("orders position, string numeral, then finger", () => {
    expect(violinLabels({ position: 3, string: "A", finger: 2, bow: "up" })).toEqual({
      above: ["3rd pos.", "II", "2"],
      bowCode: "a|",
    });
  });

  it("keeps finger 0 (open string) visible", () => {
    expect(violinLabels({ finger: 0 }).above).toEqual(["0"]);
  });

  it("maps every string to its roman numeral", () => {
    expect((["E", "A", "D", "G"] as const).map((string) => violinLabels({ string }).above[0])).toEqual(["I", "II", "III", "IV"]);
  });

  it("maps bow direction to VexFlow's string articulations", () => {
    expect(violinLabels({ bow: "down" }).bowCode).toBe("am");
    expect(violinLabels({ bow: "up" }).bowCode).toBe("a|");
  });
});

describe("violin notation rendering (snapshot)", () => {
  it("draws finger numbers, string numeral, position, bows and a slur", () => {
    const { container } = render(<NotationRenderer data={staff} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const texts = [...svg!.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(["1st pos.", "III", "0", "1", "2", "3"]));
    // Marks come out in a stable order: this is the notation snapshot.
    expect(texts.filter((t) => ["1st pos.", "III", "0", "1", "2", "3"].includes(t ?? ""))).toMatchInlineSnapshot(`
      [
        "1st pos.",
        "III",
        "0",
        "1",
        "2",
        "3",
      ]
    `);
    // two bow glyphs per down/up pair and one slur
    expect(svg!.querySelectorAll(".vf-stavetie").length).toBe(1);
    const stripped = {
      ...staff,
      measures: staff.measures.map((m) => ({
        notes: m.notes.map(({ violin, ...rest }) => ({ ...rest, violin: { ...violin, bow: undefined } })),
      })),
    };
    const bare = render(<NotationRenderer data={stripped} />).container.querySelector("svg")!;
    // each bowing mark is one drawn glyph
    expect(svg!.querySelectorAll("path").length - bare.querySelectorAll("path").length).toBe(3);
  });

  it("draws nothing extra for plain notes", () => {
    const plain = { clef: "treble", notes: [{ keys: ["d/4"], duration: "q" }, { keys: ["e/4"], duration: "q" }] };
    const { container } = render(<NotationRenderer data={plain} />);
    expect(container.querySelectorAll(".vf-articulation").length).toBe(0);
    expect(container.querySelectorAll(".vf-stavetie").length).toBe(0);
  });
});

import { applyViolinHints } from "../../utils/violinNotation";
import { notationFor } from "../midi/MidiExercise";

describe("violin exercise notation", () => {
  const exercise = {
    exerciseId: "t", tempoBpm: 60, difficulty: "beginner" as const, simultaneityWindowMs: 80, timingToleranceMs: 250, durationTolerancePercent: 50,
    instrument: "violin" as const,
    expected: [
      { id: "a", note: 55, startBeat: 0, durationBeats: 1, hand: "right" as const, finger: null, chordGroupId: null, voice: "melody" as const },
      { id: "b", note: 57, startBeat: 1, durationBeats: 1, hand: "right" as const, finger: null, chordGroupId: null, voice: "melody" as const },
      { id: "c", note: 62, startBeat: 2, durationBeats: 1, hand: "right" as const, finger: null, chordGroupId: null, voice: "melody" as const },
      { id: "d", note: 64, startBeat: 3, durationBeats: 1, hand: "right" as const, finger: null, chordGroupId: null, voice: "melody" as const },
    ],
    techniqueHints: {
      a: { string: "G" as const, finger: 0 as const, position: 1, bow: "down" as const },
      b: { string: "G" as const, finger: 1 as const, position: 1, bow: "up" as const },
      c: { string: "D" as const, finger: 0 as const, position: 1, bow: "down" as const, slur: "start" as const },
      d: { string: "D" as const, finger: 1 as const, position: 1, slur: "end" as const },
    },
  };

  it("puts G3 on one treble staff (no bass staff for a violin)", () => {
    const data = notationFor(exercise) as { grandStaff?: boolean; clef?: string };
    expect(data.grandStaff).toBeUndefined();
    expect(data.clef).toBe("treble");
  });

  it("prints string numerals only where the string changes, and slurs and bows as authored", () => {
    const data = notationFor(exercise) as { measures: { notes: { violin?: unknown }[] }[] };
    const marks = data.measures.flatMap((m) => m.notes.map((n) => n.violin));
    expect(marks).toMatchInlineSnapshot(`
      [
        {
          "bow": "down",
          "finger": 0,
          "string": "G",
        },
        {
          "bow": "up",
          "finger": 1,
        },
        {
          "bow": "down",
          "finger": 0,
          "slur": "start",
          "string": "D",
        },
        {
          "finger": 1,
          "slur": "end",
        },
      ]
    `);
  });

  it("prints a position label on a first note above first position and when it changes", () => {
    const staff = {
      measures: [{ notes: [
        { ids: ["a"], duration: "q" }, { ids: ["b"], duration: "q" }, { ids: ["c"], duration: "q" },
      ] }],
    };
    const out = applyViolinHints(staff, {
      a: { string: "A", finger: 1, position: 3 },
      b: { string: "A", finger: 2, position: 3 },
      c: { string: "A", finger: 1, position: 1 },
    });
    expect(out.measures[0]!.notes.map((n) => (n as { violin?: { position?: number } }).violin?.position)).toEqual([3, undefined, 1]);
  });

  it("does not mutate its input", () => {
    const staff = { measures: [{ notes: [{ ids: ["a"], duration: "q" }] }] };
    applyViolinHints(staff, { a: { string: "G", finger: 0, position: 1 } });
    expect(staff.measures[0]!.notes[0]).toEqual({ ids: ["a"], duration: "q" });
  });
});

import { fingerboardFromData } from "../../utils/violinNotation";

describe("fingerboardFromData", () => {
  it("is null for ordinary staff notation", () => {
    expect(fingerboardFromData({ clef: "treble", notes: [] })).toBeNull();
    expect(fingerboardFromData({ fingerboard: "nope" })).toBeNull();
  });

  it("keeps well-formed marks and drops the rest", () => {
    const data = fingerboardFromData({
      fingerboard: { pattern: "high2", marks: [{ string: "A", finger: 1, offset: 2 }, { string: "Z", finger: 1, offset: 2 }, { string: "A", finger: 9, offset: 2 }, null] },
    });
    expect(data).toEqual({ pattern: "high2", marks: [{ string: "A", finger: 1, offset: 2 }] });
  });
});
