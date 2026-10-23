import { describe, expect, it } from "vitest";
import type { Song } from "../../services/api";
import { afterLoop, levelSources, parsePracticePreset, practicePresetSearch, practiceSummary, stepLevel, type LoopOptions } from "./practiceSession";

describe("practiceSummary", () => {
  it("reads like the brief", () => {
    expect(practiceSummary({ hands: "right", loop: { startBar: 8, endBar: 15 }, tempoPct: 70, level: "easy", waitMode: false })).toBe(
      "Right hand · Bars 9–16 · 70% · Tune + bass",
    );
    expect(practiceSummary({ hands: "both", loop: null, tempoPct: 100, level: "full", waitMode: true })).toBe("Both hands · 100% · Full · Wait for me");
    expect(practiceSummary({ hands: "left", loop: { startBar: 3, endBar: 3 }, tempoPct: 55.4, level: "melody", waitMode: false })).toBe(
      "Left hand · Bar 4 · 55% · Just the tune",
    );
  });
});

describe("stepLevel", () => {
  it("moves one step and stops at either end", () => {
    expect(stepLevel("full", 1)).toBe("simplified");
    expect(stepLevel("easy", 1)).toBe("melody");
    expect(stepLevel("melody", 1)).toBe("melody");
    expect(stepLevel("full", -1)).toBe("full");
    expect(stepLevel("easy", -1)).toBe("simplified");
  });
});

describe("practice presets", () => {
  it("round-trips the Gym's link, 1-based in the URL and 0-based inside", () => {
    const search = practicePresetSearch({ hands: "left", firstBar: 5, lastBar: 12 });
    expect(search).toBe("?hands=left&bars=5-12");
    expect(parsePracticePreset(search)).toEqual({ hands: "left", loop: { startBar: 4, endBar: 11 } });
  });

  it("reads a level and ignores anything malformed", () => {
    expect(parsePracticePreset("?level=easy")).toEqual({ level: "easy" });
    expect(parsePracticePreset("?hands=feet&bars=9-2&level=hard")).toEqual({});
    expect(parsePracticePreset("?bars=0-4")).toEqual({});
    expect(parsePracticePreset("")).toEqual({});
  });
});

describe("afterLoop", () => {
  const options = (overrides: Partial<LoopOptions> = {}): LoopOptions => ({
    untilClean: false,
    autoSpeedUp: false,
    speedUpStartPct: 60,
    cleanAccuracyPct: 90,
    ...overrides,
  });

  it("repeats for ever by default", () => {
    expect(afterLoop(100, 80, options(), false)).toEqual({ clean: true, nextTempoPct: 80, again: true });
    expect(afterLoop(40, 80, options(), false)).toEqual({ clean: false, nextTempoPct: 80, again: true });
  });

  it("stops after a clean time round in loop-until-clean", () => {
    expect(afterLoop(92, 80, options({ untilClean: true }), false).again).toBe(false);
    expect(afterLoop(89.9, 80, options({ untilClean: true }), false).again).toBe(true);
  });

  it("raises the speed by 5% after each clean time round, up to 100%", () => {
    expect(afterLoop(95, 60, options({ autoSpeedUp: true }), false).nextTempoPct).toBe(65);
    expect(afterLoop(70, 60, options({ autoSpeedUp: true }), false).nextTempoPct).toBe(60);
    expect(afterLoop(95, 98, options({ autoSpeedUp: true }), false).nextTempoPct).toBe(100);
    expect(afterLoop(95, 100, options({ autoSpeedUp: true }), false).nextTempoPct).toBe(100);
  });

  it("with both, keeps going until clean at full speed", () => {
    const both = options({ autoSpeedUp: true, untilClean: true });
    expect(afterLoop(95, 95, both, false)).toEqual({ clean: true, nextTempoPct: 100, again: true });
    expect(afterLoop(95, 100, both, false)).toEqual({ clean: true, nextTempoPct: 100, again: false });
  });

  it("never calls a wait-mode time round clean", () => {
    expect(afterLoop(100, 60, options({ autoSpeedUp: true, untilClean: true }), true)).toEqual({ clean: false, nextTempoPct: 60, again: true });
  });
});

describe("levelSources", () => {
  const song = (id: string, group: string | null = null, level: string | null = null): Song => ({
    id,
    title: id,
    artist: "x",
    genre: "classical",
    difficulty: 1,
    duration_sec: 1,
    note_count: 1,
    content_rights: "public-domain",
    notation_path: null,
    mine: false,
    collection: group ? "essentials" : null,
    arrangement_group: group,
    arrangement_level: level,
  });
  const library = [
    song("elise-full", "elise", "full"),
    song("elise-int", "elise", "intermediate"),
    song("elise-beg", "elise", "beginner"),
    song("other"),
  ];

  it("an ordinary song is its own base with nothing authored", () => {
    expect(levelSources("other", library)).toEqual({ baseId: "other", authoredId: {}, openedLevel: "full", groupIds: ["other"] });
  });

  it("an Essentials version builds on the Full file and uses the authored ones", () => {
    expect(levelSources("elise-beg", library)).toEqual({
      baseId: "elise-full",
      authoredId: { simplified: "elise-int", melody: "elise-beg" },
      openedLevel: "melody",
      groupIds: ["elise-full", "elise-int", "elise-beg"],
    });
    expect(levelSources("elise-int", library).openedLevel).toBe("simplified");
  });
});
