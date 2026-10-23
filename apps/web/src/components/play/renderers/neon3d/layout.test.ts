import { describe, expect, it } from "vitest";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { NOTE_PALETTE_DARK } from "../../notePalette";
import { keyboardGeometry } from "../../waterfall";
import {
  blockRect,
  buildPitchColors,
  firstVisibleIndex,
  HUE_SPREAD_DEG,
  parseColor,
  pitchColorOffset,
  pitchHueShift,
  rotateHue,
  type BlockRect,
} from "./layout";

const note = (midi: number, startS: number, durationS = 0.5, hand: PlayAlongNote["hand"] = "right"): PlayAlongNote => ({ midi, startS, durationS, hand });

/** What an orthographic camera spanning [0, cssWidth] onto a drawing buffer of `bufferWidth` pixels
 *  does to a world x, followed by the browser scaling that buffer back to `cssWidth` CSS px. */
function onScreenX(worldX: number, cssWidth: number, dpr: number): number {
  const bufferWidth = Math.floor(cssWidth * dpr);
  const devicePx = (worldX / cssWidth) * bufferWidth;
  return devicePx * (cssWidth / bufferWidth);
}

describe("blockRect", () => {
  const out: BlockRect = { x: 0, y: 0, w: 0, h: 0 };

  it("centres every block on its key across key widths and pixel ratios", () => {
    for (const whiteKeyWidth of [14, 22.5, 31.7, 40, 57.25]) {
      const geometry = keyboardGeometry(21, 108, whiteKeyWidth);
      for (const dpr of [1, 1.5, 2.625]) {
        let worst = 0;
        for (let midi = 21; midi <= 108; midi++) {
          const key = geometry.xFor(midi)!;
          const rect = blockRect(geometry, note(midi, 1), 0, 100, out)!;
          const blockCentre = onScreenX(rect.x + rect.w / 2, geometry.widthPx, dpr);
          const keyCentre = key.x + key.width / 2;
          worst = Math.max(worst, Math.abs(blockCentre - keyCentre));
        }
        expect(worst).toBeLessThan(0.5);
      }
    }
  });

  it("puts y exactly where Classic draws the bar (bottom edge = time to start × px/s)", () => {
    const geometry = keyboardGeometry(48, 72, 30);
    const heightPx = 600;
    const lookaheadS = 3;
    const pxPerSecond = heightPx / lookaheadS;
    for (const songTimeS of [0, 1.25, 59.99, 60.0001]) {
      const n = note(60, 61, 0.75);
      const rect = blockRect(geometry, n, songTimeS, pxPerSecond, out)!;
      // Classic: bottomY (CSS, from the top) = heightPx - timeToStart * pxPerSecond.
      const classicBottomFromTop = heightPx - (n.startS - songTimeS) * pxPerSecond;
      expect(heightPx - rect.y).toBeCloseTo(classicBottomFromTop, 9);
      expect(rect.h).toBeCloseTo(0.75 * pxPerSecond, 9);
    }
  });

  it("does not drift: the same note at the same song time lands on the same pixels after a long run", () => {
    const geometry = keyboardGeometry(48, 72, 30);
    const late = blockRect(geometry, note(64, 3600.5), 3600, 200, { x: 0, y: 0, w: 0, h: 0 })!;
    const early = blockRect(geometry, note(64, 0.5), 0, 200, { x: 0, y: 0, w: 0, h: 0 })!;
    expect(late).toEqual(early);
  });

  it("skips notes outside the keyboard instead of stacking them on the lowest key", () => {
    const geometry = keyboardGeometry(48, 72, 30);
    expect(blockRect(geometry, note(30, 1), 0, 100, out)).toBeNull();
  });
});

describe("pitch colours", () => {
  it("shifts hue slightly across the keyboard, within the spread", () => {
    expect(pitchHueShift(21, 21, 108)).toBeCloseTo(-HUE_SPREAD_DEG / 2);
    expect(pitchHueShift(108, 21, 108)).toBeCloseTo(HUE_SPREAD_DEG / 2);
    expect(pitchHueShift(64.5, 21, 108)).toBeCloseTo(0);
  });

  it("keeps the hand's own colour at the middle of the range and the two hands apart everywhere", () => {
    const table = buildPitchColors(NOTE_PALETTE_DARK, 48, 72);
    const middle = pitchColorOffset("right", 60);
    const base = parseColor(NOTE_PALETTE_DARK.note.right.base).rgb;
    for (let c = 0; c < 3; c++) expect(table[middle + c]).toBeCloseTo(base[c]!, 2);
    for (let midi = 48; midi <= 72; midi++) {
      const right = pitchColorOffset("right", midi);
      const left = pitchColorOffset("left", midi);
      // Rose-coral stays red-dominant and azure stays blue-dominant at every pitch.
      expect(table[right]!).toBeGreaterThan(table[right + 2]!);
      expect(table[left + 2]!).toBeGreaterThan(table[left]!);
    }
  });

  it("rotates hue without changing a grey", () => {
    expect(rotateHue([0.5, 0.5, 0.5], 40)).toEqual([0.5, 0.5, 0.5]);
  });

  it("parses the palette's colour forms", () => {
    expect(parseColor("#FF8000")).toEqual({ rgb: [1, 128 / 255, 0], alpha: 1 });
    expect(parseColor("rgb(255 255 255 / 0.035)").alpha).toBeCloseTo(0.035);
  });
});

describe("firstVisibleIndex", () => {
  it("matches a linear scan for sorted notes", () => {
    const notes = Array.from({ length: 200 }, (_, i) => note(60, i * 0.25, (i % 7) * 0.3 + 0.1));
    const longest = Math.max(...notes.map((n) => n.durationS));
    for (const songTimeS of [0, 3.3, 20, 49.9, 60]) {
      const first = firstVisibleIndex(notes, songTimeS, longest);
      const linear = notes.findIndex((n) => n.startS + n.durationS >= songTimeS);
      // Everything visible is at or after `first`; nothing before it is still on screen.
      expect(first).toBeLessThanOrEqual(linear === -1 ? notes.length : linear);
      for (let i = 0; i < first; i++) expect(notes[i]!.startS + notes[i]!.durationS).toBeLessThan(songTimeS);
    }
  });
});
