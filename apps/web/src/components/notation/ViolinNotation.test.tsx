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
