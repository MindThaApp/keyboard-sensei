import { describe, expect, it } from "vitest";
import { isPdf, scaledSize } from "./sheetMusicImage";

describe("scaledSize", () => {
  it("shrinks a large photo to the long-side limit, keeping its shape", () => {
    expect(scaledSize(6000, 8000)).toEqual({ width: 3000, height: 4000 });
    expect(scaledSize(8064, 6048, 4000)).toEqual({ width: 4000, height: 3000 });
  });

  it("never enlarges", () => {
    expect(scaledSize(1200, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});

describe("isPdf", () => {
  it("goes by type, or by name when the browser gives no type", () => {
    expect(isPdf(new File([], "song.pdf", { type: "application/pdf" }))).toBe(true);
    expect(isPdf(new File([], "SONG.PDF"))).toBe(true);
    expect(isPdf(new File([], "song.jpg", { type: "image/jpeg" }))).toBe(false);
  });
});
