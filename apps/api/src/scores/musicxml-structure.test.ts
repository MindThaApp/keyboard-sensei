import { describe, expect, it } from "vitest";
import { parseMusicXml, playOrder, repairRepeats, scoreForm, serializeMusicXml, type MeasureForm } from "./musicxml-structure.js";

const bar = (overrides: Partial<MeasureForm> = {}): MeasureForm => ({
  number: "",
  forward: false,
  backward: false,
  times: 2,
  endings: null,
  daCapo: false,
  dalSegno: null,
  segno: null,
  fine: false,
  toCoda: null,
  coda: null,
  meter: [4, 4],
  ...overrides,
});

/** Played order as 1-based bar numbers, for readable expectations. */
const order = (bars: MeasureForm[]): number[] => playOrder(bars).map((index) => index + 1);

describe("playOrder", () => {
  it("plays straight through without repeats", () => {
    expect(order([bar(), bar(), bar()])).toEqual([1, 2, 3]);
  });

  it("repeats from the start when there is no forward sign", () => {
    expect(order([bar(), bar({ backward: true }), bar()])).toEqual([1, 2, 1, 2, 3]);
  });

  it("repeats back to the forward sign, `times` times", () => {
    expect(order([bar(), bar({ forward: true }), bar({ backward: true, times: 3 }), bar()])).toEqual([1, 2, 3, 2, 3, 2, 3, 4]);
  });

  it("takes first and second endings", () => {
    const bars = [bar({ forward: true }), bar(), bar({ endings: [1], backward: true }), bar({ endings: [2] }), bar()];
    expect(order(bars)).toEqual([1, 2, 3, 1, 2, 4, 5]);
  });

  it("takes an ending shared by passes 1 and 2, then the third", () => {
    const bars = [bar(), bar({ endings: [1, 2], backward: true, times: 3 }), bar({ endings: [3] })];
    expect(order(bars)).toEqual([1, 2, 1, 2, 1, 3]);
  });

  it("returns after the previous repeated section when a repeat has no forward sign", () => {
    const bars = [bar(), bar({ backward: true }), bar(), bar({ backward: true }), bar()];
    expect(order(bars)).toEqual([1, 2, 1, 2, 3, 4, 3, 4, 5]);
  });

  it("follows D.C. al Fine without taking the repeats again", () => {
    const bars = [bar(), bar({ backward: true }), bar({ fine: true }), bar(), bar({ daCapo: true })];
    expect(order(bars)).toEqual([1, 2, 1, 2, 3, 4, 5, 1, 2, 3]);
  });

  it("follows D.S. al Coda", () => {
    const bars = [bar(), bar({ segno: "s1" }), bar({ toCoda: "c1" }), bar({ dalSegno: "s1" }), bar({ coda: "c1" })];
    expect(order(bars)).toEqual([1, 2, 3, 4, 2, 3, 5]);
  });

  it("plays only the last ending after a D.C.", () => {
    const bars = [bar(), bar({ endings: [1], backward: true }), bar({ endings: [2] }), bar({ daCapo: true })];
    expect(order(bars)).toEqual([1, 2, 1, 3, 4, 1, 3, 4]);
  });
});

const score = (measures: string[], parts = 1, staves = 1): string => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>${Array.from({ length: parts }, (_, p) => `<score-part id="P${p}"><part-name>P</part-name></score-part>`).join("")}</part-list>
${Array.from(
  { length: parts },
  (_, p) => `<part id="P${p}">${measures
    .map((content, index) => `<measure number="${index + 1}">${index === 0 ? `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>${p === parts - 1 ? staves : 1}</staves></attributes>` : ""}${content}</measure>`)
    .join("")}</part>`,
).join("")}
</score-partwise>`;

describe("repairRepeats", () => {
  it("brackets an unmarked last ending, in every part", () => {
    const doc = parseMusicXml(
      score(
        [
          `<barline location="left"><repeat direction="forward"/></barline>`,
          `<barline location="left"><ending number="1" type="start"/></barline><barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>`,
          ``,
        ],
        2,
      ),
    );
    expect(scoreForm(doc).playOrder).toEqual([0, 1, 0, 2]);
    expect(repairRepeats(doc)).toBe(1);
    const xml = serializeMusicXml(doc);
    expect(xml.match(/<ending number="2" type="start"\/>/g)).toHaveLength(2);
    expect(xml.match(/<ending number="2" type="discontinue"\/>/g)).toHaveLength(2);
    // The repair doesn't change how the score is read, only how Verovio reads it.
    expect(scoreForm(doc).playOrder).toEqual([0, 1, 0, 2]);
  });

  it("writes in the forward repeat after an earlier repeated section", () => {
    const doc = parseMusicXml(
      score([
        `<barline location="right"><repeat direction="backward"/></barline>`,
        ``,
        `<barline location="right"><repeat direction="backward"/></barline>`,
      ]),
    );
    expect(repairRepeats(doc)).toBe(1);
    const forms = scoreForm(doc).measures;
    expect(forms.map((form) => form.forward)).toEqual([false, true, false]);
  });

  it("leaves well-formed repeats alone", () => {
    const doc = parseMusicXml(score([`<barline location="left"><repeat direction="forward"/></barline>`, `<barline location="right"><repeat direction="backward"/></barline>`]));
    expect(repairRepeats(doc)).toBe(0);
  });
});

describe("scoreForm", () => {
  it("finds the keyboard part's staves across parts", () => {
    const form = scoreForm(parseMusicXml(score([``], 3, 2)));
    expect(form.staffCount).toBe(4);
    expect(form.keyboardStaves).toEqual([2, 3]);
  });

  it("reports jumps written only as words", () => {
    const words = `<direction><direction-type><words>D.S. al Coda</words></direction-type></direction>`;
    expect(scoreForm(parseMusicXml(score([words]))).unplayableJumps).toEqual(["dal segno", "coda"]);
    const withSound = `<direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes"/></direction>`;
    expect(scoreForm(parseMusicXml(score([withSound]))).unplayableJumps).toEqual([]);
  });

  it("refuses MusicXML that isn't partwise or isn't well-formed", () => {
    expect(() => parseMusicXml("<score-timewise/>")).toThrow(/partwise/);
    expect(() => parseMusicXml("<score-partwise><part>")).toThrow(/well-formed/);
  });
});
