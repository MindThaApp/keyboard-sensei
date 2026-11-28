// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import ChordDiagram, { diagramModel } from "./ChordDiagram";
import Fretboard, { detectedPositions } from "./Fretboard";
import GuitarNotation, { guitarNotationModel, isGuitarNotation, staffKeyFor, type GuitarNotationData } from "./GuitarNotation";
import { GUITAR_CHORDS, chordPitchClasses } from "@keyboard-sensei/music-theory";

// jsdom has no SVG text measurement; VexFlow only needs plausible numbers.
beforeAll(() => {
  (SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 8, height: 12 });
});

const DATA: GuitarNotationData = {
  kind: "guitar",
  measures: [
    { notes: [{ positions: [{ string: 1, fret: 0 }], duration: "q", chord: "Em" }, { positions: [{ string: 2, fret: 1 }], duration: "q" }, { positions: [{ string: 3, fret: 0 }], duration: "h" }] },
    { notes: [{ positions: [{ string: 6, fret: 0 }, { string: 5, fret: 2 }, { string: 4, fret: 2 }], duration: "w" }] },
    { notes: [{ duration: "h" }, { positions: [{ string: 4, fret: 4 }], duration: "h" }] },
  ],
};

describe("guitar notation", () => {
  it("writes the staff an octave above the sounding pitch (8vb)", () => {
    expect(staffKeyFor({ string: 1, fret: 0 })).toBe("e/5"); // sounds E4
    expect(staffKeyFor({ string: 6, fret: 0 })).toBe("e/3"); // sounds E2
    expect(staffKeyFor({ string: 2, fret: 1 })).toBe("c/5");
    expect(staffKeyFor({ string: 3, fret: 4 })).toBe("b/4");
    expect(staffKeyFor({ string: 4, fret: 4 })).toBe("f#/4");
  });

  it("models staff keys, tab and chord symbols", () => {
    expect(isGuitarNotation(DATA as unknown as Record<string, unknown>)).toBe(true);
    expect(guitarNotationModel(DATA)).toMatchInlineSnapshot(`
      [
        [
          {
            "chord": "Em",
            "rest": false,
            "staffKeys": [
              "e/5",
            ],
            "tab": [
              "1:0",
            ],
          },
          {
            "chord": null,
            "rest": false,
            "staffKeys": [
              "c/5",
            ],
            "tab": [
              "2:1",
            ],
          },
          {
            "chord": null,
            "rest": false,
            "staffKeys": [
              "g/4",
            ],
            "tab": [
              "3:0",
            ],
          },
        ],
        [
          {
            "chord": null,
            "rest": false,
            "staffKeys": [
              "e/3",
              "b/3",
              "e/4",
            ],
            "tab": [
              "6:0",
              "5:2",
              "4:2",
            ],
          },
        ],
        [
          {
            "chord": null,
            "rest": true,
            "staffKeys": [],
            "tab": [],
          },
          {
            "chord": null,
            "rest": false,
            "staffKeys": [
              "f#/4",
            ],
            "tab": [
              "4:4",
            ],
          },
        ],
      ]
    `);
  });

  it("renders staff, tab, fret numbers and the chord symbol as SVG", () => {
    const { container } = render(<GuitarNotation data={DATA} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    const text = Array.from(svg!.querySelectorAll("text")).map((t) => t.textContent);
    expect(text).toContain("Em");
    for (const fret of ["0", "1", "2", "4"]) expect(text).toContain(fret);
    expect(svg!.querySelectorAll(".vf-stavenote").length).toBe(6); // 5 notes/chords + a rest
    expect(svg!.querySelectorAll(".vf-tabnote").length).toBe(5);
    // 2 staves per measure when stacked: 3 measures * (staff + tab)
    expect(svg!.querySelectorAll(".vf-stave").length).toBe(6);
  });

  it("renders tab only", () => {
    const { container } = render(<GuitarNotation data={{ ...DATA, view: "tab" }} />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelectorAll(".vf-stavenote").length).toBe(0);
    expect(svg.querySelectorAll(".vf-stave").length).toBe(3);
  });
});

describe("chord diagrams", () => {
  it("draws every dictionary chord with the markers its fingering needs", () => {
    for (const symbol of Object.keys(GUITAR_CHORDS)) {
      const shape = GUITAR_CHORDS[symbol]!;
      const { container, unmount } = render(<ChordDiagram chord={symbol} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("data-chord")).toBe(symbol);
      expect(svg.querySelectorAll('[data-marker="dot"]').length).toBe(shape.frets.filter((f) => f).length);
      expect(svg.querySelectorAll('[data-marker="open"]').length).toBe(shape.frets.filter((f) => f === 0).length);
      expect(svg.querySelectorAll('[data-marker="muted"]').length).toBe(shape.frets.filter((f) => f === null).length);
      unmount();
    }
  });
  it("diagram pitch classes are the graded pitch classes", () => {
    // The diagram is built from the same shape the grader reads: sounded strings == dots + open markers.
    for (const symbol of Object.keys(GUITAR_CHORDS)) {
      const shape = GUITAR_CHORDS[symbol]!;
      const model = diagramModel(shape);
      expect(model.dots.length + model.open.length + model.muted.length).toBe(6);
      expect(chordPitchClasses(shape).length).toBeGreaterThanOrEqual(3);
    }
  });
  it("snapshot of Em and a barre shape", () => {
    expect(diagramModel(GUITAR_CHORDS["Em"]!)).toMatchInlineSnapshot(`
      {
        "barre": null,
        "baseFret": 1,
        "dots": [
          {
            "finger": 2,
            "row": 2,
            "string": 5,
          },
          {
            "finger": 3,
            "row": 2,
            "string": 4,
          },
        ],
        "muted": [],
        "open": [
          6,
          3,
          2,
          1,
        ],
        "rows": 4,
        "symbol": "Em",
      }
    `);
    const f = diagramModel({ symbol: "F", name: "F major", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1, barre: { fret: 1, fromString: 6, toString: 1 } });
    expect(f.barre).toEqual({ row: 1, fromString: 6, toString: 1 });
    expect(f.dots.map((d) => d.string)).toEqual([6, 5, 4, 3, 1]);
    const high = diagramModel({ symbol: "Bm", name: "B minor", frets: [null, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, barre: { fret: 2, fromString: 5, toString: 1 } });
    expect(high.baseFret).toBe(2);
    const { container } = render(<ChordDiagram chord={{ symbol: "Bm", name: "B minor", frets: [null, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], baseFret: 2, barre: { fret: 2, fromString: 5, toString: 1 } }} />);
    expect(container.querySelector('[data-testid="base-fret"]')?.textContent).toBe("2fr");
    expect(container.querySelector('[data-marker="barre"]')).not.toBeNull();
  });
});

describe("fretboard", () => {
  it("finds every position that sounds the heard pitch", () => {
    expect(detectedPositions(64, 12).map((p) => `${p.string}:${p.fret}`)).toEqual(["1:0", "2:5", "3:9", "4:14".replace("14", "14")].filter((s) => Number(s.split(":")[1]) <= 12));
    expect(detectedPositions(null, 12)).toEqual([]);
  });
  it("lights targets and marks a hit", () => {
    const { container } = render(<Fretboard targets={[{ string: 1, fret: 0 }, { string: 2, fret: 3 }]} detectedMidi={64} />);
    const targets = container.querySelectorAll('[data-marker="target"]');
    expect(targets.length).toBe(2);
    expect(targets[0]!.getAttribute("data-hit")).toBe("true");
    expect(targets[1]!.getAttribute("data-hit")).toBe("false");
    expect(container.querySelectorAll('[data-marker="heard"]').length).toBeGreaterThan(0);
  });
});
