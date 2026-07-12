import { describe, expect, it } from "vitest";
import { keyboardGeometry, fitWhiteKeyWidth } from "./waterfall";

describe("keyboardGeometry (parameterised width)", () => {
  it("scales white key x-positions with whiteKeyWidthPx", () => {
    const g = keyboardGeometry(60, 72, 20);
    expect(g.xFor(60)).toEqual({ x: 0, width: 20 });
    expect(g.xFor(62)).toEqual({ x: 20, width: 20 });
    expect(g.whiteKeyWidthPx).toBe(20);
  });

  it("scales black keys proportionally and centres them on the white-key boundary", () => {
    const g = keyboardGeometry(60, 72, 20);
    const blackWidth = g.blackKeyWidthPx;
    expect(blackWidth).toBeCloseTo(20 * (26 / 40));
    // C#4 (61) sits on the boundary after one white key (C4)
    expect(g.xFor(61).x).toBeCloseTo(20 - blackWidth / 2);
  });

  it("defaults to the legacy 40px width when omitted", () => {
    expect(keyboardGeometry(60, 72).xFor(62)).toEqual({ x: 40, width: 40 });
  });

  it("total width scales with the key width", () => {
    expect(keyboardGeometry(60, 72, 20).widthPx).toBe(keyboardGeometry(60, 72, 40).widthPx / 2);
  });
});

describe("fitWhiteKeyWidth", () => {
  it("returns the width that makes the range exactly fill the container", () => {
    const width = fitWhiteKeyWidth(60, 72, 400);
    expect(keyboardGeometry(60, 72, width).widthPx).toBeCloseTo(400);
  });
});
