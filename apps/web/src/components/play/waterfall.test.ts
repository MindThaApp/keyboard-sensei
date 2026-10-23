import { describe, expect, it, vi } from "vitest";
import { keyboardGeometry, fitWhiteKeyWidth, drawWaterfall, judgementMark } from "./waterfall";
import { NOTE_PALETTE_DARK, NOTE_PALETTE_LIGHT } from "./notePalette";
import type { BarGridEntry } from "@keyboard-sensei/playalong-core";

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
    expect(g.xFor(61)!.x).toBeCloseTo(20 - blackWidth / 2);
  });

  it("returns null outside the range instead of silently stacking notes on the lowest key", () => {
    const g = keyboardGeometry(60, 72, 20);
    expect(g.xFor(59)).toBeNull(); // below range — used to render at x = 0
    expect(g.xFor(73)).toBeNull(); // above range
    expect(g.xFor(58)).toBeNull(); // black key below range — used to render at a negative x
    expect(g.xFor(60)).not.toBeNull();
    expect(g.xFor(72)).not.toBeNull();
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

/** Minimal fake CanvasRenderingContext2D that just records fillRect calls (with the fillStyle active at call time) — enough to assert drawWaterfall's barline behaviour without a real canvas. */
function makeFakeCtx() {
  const fillRectCalls: { x: number; y: number; w: number; h: number; fillStyle: unknown }[] = [];
  const fills: unknown[] = [];
  const gradients: { stops: [number, string][] }[] = [];
  const ctx = {
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    globalAlpha: 1,
    lineWidth: 1,
    shadowBlur: 0,
    shadowColor: "",
    lineCap: "butt",
    lineJoin: "miter",
    clearRect: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h, fillStyle: ctx.fillStyle });
    }),
    createLinearGradient: vi.fn(() => {
      const gradient = { stops: [] as [number, string][], addColorStop: (offset: number, color: string) => gradient.stops.push([offset, color]) };
      gradients.push(gradient);
      return gradient;
    }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(() => fills.push(ctx.fillStyle)),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillRectCalls, fills, gradients };
}

describe("drawWaterfall notes (Classic palette)", () => {
  const geometry = keyboardGeometry(60, 72, 20);
  const notes = [
    { midi: 60, startS: 1, durationS: 0.5, hand: "right" as const },
    { midi: 62, startS: 1, durationS: 0.5, hand: "left" as const },
    { midi: 64, startS: 1, durationS: 0.5, hand: "right" as const },
  ];

  it("fills each hand with its own hi → base → lo gradient, and a miss with hatched grey (never red vs green)", () => {
    const { ctx, fills, gradients } = makeFakeCtx();
    drawWaterfall(ctx, { notes, judgments: [undefined, undefined, "miss"], songTimeS: 0, lookaheadS: 4, geometry, heightPx: 400, palette: NOTE_PALETTE_DARK });
    const barGradients = gradients.filter((g) => g.stops.length === 3 && g.stops[1]![0] === 0.35);
    expect(barGradients.map((g) => g.stops.map(([, color]) => color))).toEqual([
      [NOTE_PALETTE_DARK.note.right.hi, NOTE_PALETTE_DARK.note.right.base, NOTE_PALETTE_DARK.note.right.lo],
      [NOTE_PALETTE_DARK.note.left.hi, NOTE_PALETTE_DARK.note.left.base, NOTE_PALETTE_DARK.note.left.lo],
    ]);
    expect(fills).toContain(NOTE_PALETTE_DARK.judge.miss);
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
  });

  it("skips notes outside the keyboard instead of stacking them on the lowest key", () => {
    const { ctx, gradients } = makeFakeCtx();
    drawWaterfall(ctx, {
      notes: [{ midi: 30, startS: 1, durationS: 0.5, hand: "right" }],
      judgments: [],
      songTimeS: 0,
      lookaheadS: 4,
      geometry,
      heightPx: 400,
      palette: NOTE_PALETTE_DARK,
    });
    expect(gradients.filter((g) => g.stops.length === 3 && g.stops[1]![0] === 0.35)).toHaveLength(0);
  });
});

describe("judgementMark", () => {
  it("marks perfect as a hit, a miss as a miss, and good/ok by which side of the note the press landed", () => {
    expect(judgementMark("perfect", 0.9, 1)).toBe("hit");
    expect(judgementMark("miss", 1.5, 1)).toBe("miss");
    expect(judgementMark("good", 0.9, 1)).toBe("early");
    expect(judgementMark("ok", 1.15, 1)).toBe("late");
  });
});

describe("drawWaterfall barlines", () => {
  const geometry = keyboardGeometry(60, 72, 20);

  it("draws a rounded-y 1px barline for each bar within the lookahead window, using the barline colour", () => {
    const { ctx, fillRectCalls } = makeFakeCtx();
    const bars: BarGridEntry[] = [
      { timeS: 2.0, barIndex: 0, numerator: 4, denominator: 4 }, // songTime=0, lookahead=4 -> visible, timeToStart=2
      { timeS: 10.0, barIndex: 1, numerator: 4, denominator: 4 }, // way past lookahead -> not drawn
      { timeS: -1.0, barIndex: -1, numerator: 4, denominator: 4 }, // already passed -> not drawn
    ];
    drawWaterfall(ctx, {
      notes: [],
      judgments: [],
      songTimeS: 0,
      lookaheadS: 4,
      geometry,
      heightPx: 400,
      palette: NOTE_PALETTE_LIGHT,
      bars,
    });

    const barlineCalls = fillRectCalls.filter((c) => c.fillStyle === NOTE_PALETTE_LIGHT.stage.barline);
    expect(barlineCalls).toHaveLength(1);
    // pxPerSecond = 400/4 = 100; timeToStart = 2 - 0 = 2; y = 400 - 2*100 = 200.
    expect(barlineCalls[0]).toEqual(expect.objectContaining({ x: 0, y: 200, w: geometry.widthPx, h: 1 }));
    expect(Number.isInteger(barlineCalls[0].y)).toBe(true);
  });

  it("rounds a fractional bar y to an integer pixel (avoids a blurred 2px line)", () => {
    const { ctx, fillRectCalls } = makeFakeCtx();
    const bars: BarGridEntry[] = [{ timeS: 1.997, barIndex: 0, numerator: 4, denominator: 4 }];
    drawWaterfall(ctx, {
      notes: [],
      judgments: [],
      songTimeS: 0,
      lookaheadS: 4,
      geometry,
      heightPx: 400,
      palette: NOTE_PALETTE_LIGHT,
      bars,
    });
    const barlineCalls = fillRectCalls.filter((c) => c.fillStyle === NOTE_PALETTE_LIGHT.stage.barline);
    expect(barlineCalls).toHaveLength(1);
    expect(Number.isInteger(barlineCalls[0].y)).toBe(true);
  });

  it("draws no barlines when bars is omitted (backward compatible)", () => {
    const { ctx, fillRectCalls } = makeFakeCtx();
    drawWaterfall(ctx, {
      notes: [],
      judgments: [],
      songTimeS: 0,
      lookaheadS: 4,
      geometry,
      heightPx: 400,
      palette: NOTE_PALETTE_LIGHT,
    });
    const barlineCalls = fillRectCalls.filter((c) => c.fillStyle === NOTE_PALETTE_LIGHT.stage.barline);
    expect(barlineCalls).toHaveLength(0);
  });
});
