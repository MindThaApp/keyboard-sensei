import { describe, expect, it } from "vitest";
import { activeAt, buildScoreTimeline } from "./scoreTimeline";

describe("buildScoreTimeline", () => {
  const timeline = buildScoreTimeline([
    { tstamp: 0, on: ["a", "b"] },
    { tstamp: 500, off: ["a"], on: ["c"] },
    { tstamp: 1000, off: ["b", "c"] },
    // The repeat: the same printed notes again, under -rend ids.
    { tstamp: 1000, on: ["a-rend2"] },
    { tstamp: 1500, off: ["a-rend2"] },
  ]);

  it("tracks what sounds between change points, in song seconds", () => {
    expect(timeline.timesS).toEqual([0, 0.5, 1, 1.5]);
    expect(activeAt(timeline, -0.1)).toEqual([]);
    expect(activeAt(timeline, 0)).toEqual(["a", "b"]);
    expect(activeAt(timeline, 0.75).sort()).toEqual(["b", "c"]);
    expect(activeAt(timeline, 2)).toEqual([]);
  });

  it("maps repeated passes back to the printed note", () => {
    // Two entries at 1 s collapse into one state: b and c off, a (second time) on.
    expect(activeAt(timeline, 1.2)).toEqual(["a"]);
  });
});
