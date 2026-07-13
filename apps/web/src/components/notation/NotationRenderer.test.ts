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
