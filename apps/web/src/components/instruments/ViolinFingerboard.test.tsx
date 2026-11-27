// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViolinFingerboard, fingerboardGeometry, patternMarks, tapeOffsets } from "./ViolinFingerboard";

describe("fingerboardGeometry", () => {
  it("puts higher notes further from the nut, with shrinking steps", () => {
    const ys = [0, 1, 2, 3, 4].map(fingerboardGeometry.yFor);
    expect(ys[0]).toBe(fingerboardGeometry.nutY);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]!);
    expect(ys[2]! - ys[1]!).toBeGreaterThan(ys[4]! - ys[3]! - 1e-9);
  });

  it("keeps the strings in G D A E order, left to right", () => {
    const x = fingerboardGeometry.stringX;
    expect(x.G).toBeLessThan(x.D);
    expect(x.D).toBeLessThan(x.A);
    expect(x.A).toBeLessThan(x.E);
  });
});

describe("tape offsets", () => {
  it("high 2 and low 2 differ only in the second finger", () => {
    expect(tapeOffsets("high2")).toEqual([2, 4, 5, 7]);
    expect(tapeOffsets("low2")).toEqual([2, 3, 5, 7]);
  });
});

describe("ViolinFingerboard (snapshot)", () => {
  it("draws the first pattern on the A string", () => {
    render(<ViolinFingerboard marks={patternMarks("high2", ["A"])} pattern="high2" />);
    const marks = screen.getAllByTestId("finger-mark").map((el) => `${el.getAttribute("data-string")}${el.getAttribute("data-finger")}`);
    expect(marks).toMatchInlineSnapshot(`
      [
        "A1",
        "A2",
        "A3",
        "A4",
      ]
    `);
    expect(screen.getAllByTestId("finger-tape")).toHaveLength(4);
  });

  it("draws an open string above the nut and a heard note as an outline", () => {
    const { container } = render(
      <ViolinFingerboard marks={[{ string: "E", finger: 0, offset: 0 }, { string: "D", finger: 2, offset: 4, kind: "heard" }]} />,
    );
    const circles = [...container.querySelectorAll("circle")];
    expect(Number(circles[0]!.getAttribute("cy"))).toBeLessThan(fingerboardGeometry.nutY);
    expect(circles[1]!.getAttribute("fill")).toBe("none");
  });

  it("exposes an accessible name", () => {
    render(<ViolinFingerboard marks={[]} title="D string, first pattern" />);
    expect(screen.getByRole("img", { name: "D string, first pattern" })).toBeTruthy();
  });
});
