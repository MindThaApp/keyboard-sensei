import { describe, expect, it } from "vitest";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import type { BarGridEntry, BeatGridEntry, SongBeatGrid, TimeSignatureSegment } from "../../utils/playalongSong";
import {
  buildMonotoneCubic,
  buildQuarterBeatAnchors,
  evalMonotoneCubic,
  lerpSeries,
  quantizeNotesToGrid,
} from "./ScrollingScore";

/** Steady 120bpm, 4/4, 2 bars — a beat every 0.5s, a bar every 2s. */
function steady4_4Grid(): SongBeatGrid {
  const bars: BarGridEntry[] = [
    { timeS: 0, barIndex: 0, numerator: 4, denominator: 4 },
    { timeS: 2, barIndex: 1, numerator: 4, denominator: 4 },
  ];
  const beats: BeatGridEntry[] = [];
  for (let bar = 0; bar < 2; bar++) {
    for (let b = 0; b < 4; b++) {
      beats.push({ timeS: bar * 2 + b * 0.5, beatInBar: b, isDownbeat: b === 0, isMainBeat: true });
    }
  }
  return { bars, beats, steadyBpm: 120, clickSafe: true };
}

const segments4_4: TimeSignatureSegment[] = [
  { startTick: 0, startBeat: 0, numerator: 4, denominator: 4, ticksPerBeat: 480, ticksPerBar: 1920, beatsPerBar: 4 },
];

/** Same 2 bars, but 9/8 (Clair de Lune's actual meter) at a fixed tempo, to check the denominator-aware quarter-note conversion. */
function steady9_8Grid(): SongBeatGrid {
  const bars: BarGridEntry[] = [
    { timeS: 0, barIndex: 0, numerator: 9, denominator: 8 },
    { timeS: 3.6, barIndex: 1, numerator: 9, denominator: 8 },
  ];
  const beats: BeatGridEntry[] = [];
  for (let bar = 0; bar < 2; bar++) {
    for (let b = 0; b < 9; b++) {
      beats.push({ timeS: bar * 3.6 + b * 0.4, beatInBar: b, isDownbeat: b === 0, isMainBeat: b % 3 === 0 });
    }
  }
  return { bars, beats, steadyBpm: null, clickSafe: true };
}

const segments9_8: TimeSignatureSegment[] = [
  { startTick: 0, startBeat: 0, numerator: 9, denominator: 8, ticksPerBeat: 240, ticksPerBar: 2160, beatsPerBar: 4.5 },
];

const note = (midi: number, startS: number, durationS: number, hand: "left" | "right" = "right"): PlayAlongNote => ({
  midi,
  startS,
  durationS,
  hand,
});

describe("lerpSeries", () => {
  it("interpolates between two bracketing points", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ];
    expect(lerpSeries(points, 0.5)).toBeCloseTo(5);
    expect(lerpSeries(points, 1.5)).toBeCloseTo(20);
  });

  it("extrapolates past either end using the nearest segment's slope", () => {
    const points = [
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ];
    expect(lerpSeries(points, 0)).toBeCloseTo(-10); // slope 20/unit, one unit before the first point
    expect(lerpSeries(points, 3)).toBeCloseTo(50);
  });

  it("returns the single point's y for a one-point series, and 0 for an empty series", () => {
    expect(lerpSeries([{ x: 5, y: 42 }], 999)).toBe(42);
    expect(lerpSeries([], 1)).toBe(0);
  });
});

describe("buildQuarterBeatAnchors", () => {
  it("maps a steady 4/4 grid's beats to quarter-note beats 1:1", () => {
    const anchors = buildQuarterBeatAnchors(steady4_4Grid(), segments4_4);
    // beat index 4 (bar 1, beatInBar 0) lands at t=2s, quarter-beat 4.
    const anchorAt2s = anchors.find((a) => Math.abs(a.x - 2) < 1e-9);
    expect(anchorAt2s?.y).toBeCloseTo(4);
  });

  it("scales a 9/8 grid's notated beats down to quarter notes (an eighth-note beat is 0.5 quarter notes)", () => {
    const anchors = buildQuarterBeatAnchors(steady9_8Grid(), segments9_8);
    // bar 0 has 9 notated (eighth-note) beats = 4.5 quarter notes; bar 1 starts at t=3.6s.
    const anchorAtBar1Start = anchors.find((a) => Math.abs(a.x - 3.6) < 1e-9);
    expect(anchorAtBar1Start?.y).toBeCloseTo(4.5);
  });
});

describe("buildMonotoneCubic / evalMonotoneCubic", () => {
  it("passes exactly through every anchor", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 30 }, // dense bar: notes packed close in beats, far apart in px
      { x: 2, y: 40 }, // sparse bar right after: notes far apart in beats, close in px
      { x: 4, y: 200 },
    ];
    const spline = buildMonotoneCubic(points);
    for (const p of points) expect(evalMonotoneCubic(spline, p.x)).toBeCloseTo(p.y, 6);
  });

  it("never overshoots (stays monotone) even at a sharp density change that would make a plain cubic spline dip", () => {
    // Same density-change shape as above: a big jump (0->30 over 1 beat) immediately
    // followed by a small one (30->40 over 1 beat) is exactly the kind of corner an
    // un-clamped (natural/Catmull-Rom) cubic spline overshoots and dips below 30 for.
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 30 },
      { x: 2, y: 40 },
      { x: 3, y: 41 },
    ];
    const spline = buildMonotoneCubic(points);
    let prevY = -Infinity;
    for (let x = 0; x <= 3; x += 0.01) {
      const y = evalMonotoneCubic(spline, x);
      expect(y).toBeGreaterThanOrEqual(prevY - 1e-9); // never decreases: the underlying data is non-decreasing
      prevY = y;
    }
  });

  it("has a continuous derivative at interior anchors (no velocity jump), unlike a plain lerp", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 30 },
      { x: 2, y: 40 },
      { x: 3, y: 200 },
    ];
    const spline = buildMonotoneCubic(points);
    const h = 1e-4;
    // Slope just before and just after the interior anchor at x=1 should match closely
    // (C1 continuity) — a piecewise-linear interpolant through the same points would not.
    const slopeBefore = (evalMonotoneCubic(spline, 1) - evalMonotoneCubic(spline, 1 - h)) / h;
    const slopeAfter = (evalMonotoneCubic(spline, 1 + h) - evalMonotoneCubic(spline, 1)) / h;
    expect(Math.abs(slopeAfter - slopeBefore)).toBeLessThan(0.5);
  });

  it("extrapolates past either end using that end's tangent, and degrades gracefully for 0/1 points", () => {
    const spline = buildMonotoneCubic([
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ]);
    expect(evalMonotoneCubic(spline, 0)).toBeCloseTo(-10);
    expect(evalMonotoneCubic({ xs: [], ys: [], ms: [] }, 5)).toBe(0);
    expect(evalMonotoneCubic(buildMonotoneCubic([{ x: 5, y: 42 }]), 999)).toBe(42);
  });
});

describe("quantizeNotesToGrid", () => {
  it("converts note.startS/durationS to quarter-note beats via the grid anchors, matching a fixed-BPM conversion when the tempo really is steady", () => {
    const anchors = buildQuarterBeatAnchors(steady4_4Grid(), segments4_4);
    // 120bpm: 0.5s/beat. A note starting at 0.75s, lasting 0.5s, starts on beat 1.5 and lasts 1 beat.
    const [quantized] = quantizeNotesToGrid([note(60, 0.75, 0.5)], anchors);
    expect(quantized.startBeat).toBeCloseTo(1.5);
    expect(quantized.durationBeats).toBeCloseTo(1);
  });

  it("stays correct through a tempo change, unlike a fixed-BPM conversion would", () => {
    // Bar 0 at 120bpm (0.5s/beat), bar 1 suddenly at 60bpm (1s/beat) — a real
    // tempo map, not a steady one. A fixed-BPM quantizer would misplace any
    // note in bar 1; the grid-anchored one must not.
    const bars: BarGridEntry[] = [
      { timeS: 0, barIndex: 0, numerator: 4, denominator: 4 },
      { timeS: 2, barIndex: 1, numerator: 4, denominator: 4 },
    ];
    const beats: BeatGridEntry[] = [
      { timeS: 0, beatInBar: 0, isDownbeat: true, isMainBeat: true },
      { timeS: 0.5, beatInBar: 1, isDownbeat: false, isMainBeat: true },
      { timeS: 1, beatInBar: 2, isDownbeat: false, isMainBeat: true },
      { timeS: 1.5, beatInBar: 3, isDownbeat: false, isMainBeat: true },
      { timeS: 2, beatInBar: 0, isDownbeat: true, isMainBeat: true },
      { timeS: 3, beatInBar: 1, isDownbeat: false, isMainBeat: true }, // 60bpm now: 1s/beat
      { timeS: 4, beatInBar: 2, isDownbeat: false, isMainBeat: true },
      { timeS: 5, beatInBar: 3, isDownbeat: false, isMainBeat: true },
    ];
    const grid: SongBeatGrid = { bars, beats, steadyBpm: null, clickSafe: false };
    const anchors = buildQuarterBeatAnchors(grid, segments4_4);
    // A note starting exactly at t=3s (the second beat of bar 1, now 1s long) must land on quarter-beat 5, not 6.
    const [quantized] = quantizeNotesToGrid([note(60, 3, 0.25)], anchors);
    expect(quantized.startBeat).toBeCloseTo(5);
  });
});
