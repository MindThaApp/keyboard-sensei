import { describe, expect, it } from "vitest";
import { stageLayout, WATERFALL_MIN_HEIGHT_PX, WINDOW_MODE_PX_PER_SECOND } from "./stageLayout";

describe("stageLayout", () => {
  it("fills the stage exactly: canvas + keyboard = stage height", () => {
    const { pianoHeightPx, waterfallHeightPx } = stageLayout({
      stageHeightPx: 400,
      whiteKeyWidthPx: 40,
      visibilityMode: "note-size",
      lookaheadS: 4,
    });
    expect(pianoHeightPx).toBe(128); // 32% of 400, under the 4:1 key shape (160)
    expect(pianoHeightPx + waterfallHeightPx).toBe(400);
  });

  it("never draws keys taller than their 4:1 shape", () => {
    const { pianoHeightPx } = stageLayout({ stageHeightPx: 800, whiteKeyWidthPx: 14, visibilityMode: "note-size", lookaheadS: 4 });
    expect(pianoHeightPx).toBe(56);
  });

  it("caps the keyboard on a tall stage", () => {
    const { pianoHeightPx } = stageLayout({ stageHeightPx: 2000, whiteKeyWidthPx: 60, visibilityMode: "note-size", lookaheadS: 4 });
    expect(pianoHeightPx).toBe(180);
  });

  it("keeps a readable minimum canvas on a tiny stage (the stage scrolls instead)", () => {
    const { waterfallHeightPx } = stageLayout({ stageHeightPx: 150, whiteKeyWidthPx: 40, visibilityMode: "note-size", lookaheadS: 4 });
    expect(waterfallHeightPx).toBe(WATERFALL_MIN_HEIGHT_PX);
  });

  it("window-size mode grows with look-ahead at a fixed falling speed", () => {
    const short = stageLayout({ stageHeightPx: 1000, whiteKeyWidthPx: 40, visibilityMode: "window-size", lookaheadS: 2 });
    const long = stageLayout({ stageHeightPx: 1000, whiteKeyWidthPx: 40, visibilityMode: "window-size", lookaheadS: 6 });
    expect(short.waterfallHeightPx).toBe(Math.max(WATERFALL_MIN_HEIGHT_PX, 2 * WINDOW_MODE_PX_PER_SECOND));
    expect(long.waterfallHeightPx).toBe(6 * WINDOW_MODE_PX_PER_SECOND);
  });

  it("window-size mode never outgrows the stage", () => {
    const layout = stageLayout({ stageHeightPx: 400, whiteKeyWidthPx: 40, visibilityMode: "window-size", lookaheadS: 8 });
    expect(layout.waterfallHeightPx + layout.pianoHeightPx).toBe(400);
  });
});
