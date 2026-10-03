import { describe, expect, it } from "vitest";
import { expandCropBoxForVerticalRange } from "./NotationRenderer";

function fakeStave(topY: number, spacing = 10) {
  return {
    getYForLine: (line: number) => topY + line * spacing,
    getYForNote: (line: number) => topY + (4 - line) * spacing,
  };
}

describe("expandCropBoxForVerticalRange", () => {
  const treble = fakeStave(100);
  const bass = fakeStave(200);

  it("expands upward for notes far above the treble staff", () => {
    const box = { x: 12, y: 80, width: 300, height: 190 };
    const expanded = expandCropBoxForVerticalRange(
      box,
      { lowestNote: 43, highestNote: 108 },
      { treble, bass },
    );

    expect(expanded.x).toBe(box.x);
    expect(expanded.width).toBe(box.width);
    expect(expanded.y).toBeLessThan(box.y);
    expect(expanded.y + expanded.height).toBe(box.y + box.height);
  });

  it("expands downward for notes far below the bass staff", () => {
    const box = { x: 12, y: 80, width: 300, height: 190 };
    const expanded = expandCropBoxForVerticalRange(
      box,
      { lowestNote: 24, highestNote: 67 },
      { treble, bass },
    );

    expect(expanded.x).toBe(box.x);
    expect(expanded.width).toBe(box.width);
    expect(expanded.y).toBe(box.y);
    expect(expanded.y + expanded.height).toBeGreaterThan(box.y + box.height);
  });

  it("keeps x/width from a DOMRect-like box whose fields are prototype getters", () => {
    // getBBox() returns a DOMRect: x/y/width/height live on the prototype, so
    // an object spread drops them. This is what produced `viewBox="NaN …"`.
    class RectLike {
      get x() { return 12; }
      get y() { return 80; }
      get width() { return 300; }
      get height() { return 190; }
    }
    const expanded = expandCropBoxForVerticalRange(
      new RectLike(),
      { lowestNote: 24, highestNote: 108 },
      { treble, bass },
    );

    expect(expanded.x).toBe(12);
    expect(expanded.width).toBe(300);
    expect(Number.isFinite(expanded.y)).toBe(true);
    expect(Number.isFinite(expanded.height)).toBe(true);
  });

  it("does not expand when the range is already inside the cropped box", () => {
    const box = { x: 12, y: 80, width: 300, height: 190 };
    const expanded = expandCropBoxForVerticalRange(
      box,
      { lowestNote: 43, highestNote: 67 },
      { treble, bass },
    );

    expect(expanded).toEqual(box);
  });
});
