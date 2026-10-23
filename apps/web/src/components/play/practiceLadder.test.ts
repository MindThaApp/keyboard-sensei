import { describe, expect, it } from "vitest";
import type { PlayAlongJudgment } from "@keyboard-sensei/midi-engine";
import {
  applyRung,
  barResults,
  barTone,
  bestSpan,
  BEGINNER_START,
  ladderPosition,
  ladderStep,
  PRACTICE_LADDER,
  runStars,
  simpleOpening,
  simpleStart,
  starCap,
  trickySpan,
  type LadderState,
} from "./practiceSession";

const rung = (index: number): LadderState => applyRung({ level: "full", hands: "both", tempoPct: 100, waitMode: false }, index);

describe("Easier / Harder ladder", () => {
  it("walks every rung in order, from Learn it to Full", () => {
    let state: LadderState = rung(0);
    expect(state).toEqual({ level: "melody", hands: "right", tempoPct: 60, waitMode: true });
    const seen = [ladderPosition(state).index];
    for (let i = 1; i < PRACTICE_LADDER.length; i++) {
      state = applyRung(state, ladderStep(state, 1)!);
      seen.push(ladderPosition(state).index);
    }
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(state).toEqual({ level: "full", hands: "both", tempoPct: 100, waitMode: false });
    expect(ladderStep(state, 1)).toBeNull();
  });

  it("turns Wait for me off when leaving Learn it, and keeps a chosen left hand", () => {
    expect(applyRung(rung(0), 1).waitMode).toBe(false);
    expect(applyRung({ level: "full", hands: "left", tempoPct: 80, waitMode: false }, 5).hands).toBe("left");
    // Just the tune has no left hand: it always plays the right.
    expect(applyRung({ level: "full", hands: "left", tempoPct: 80, waitMode: false }, 1).hands).toBe("right");
  });

  it("from settings between rungs, Harder goes to the next rung up and Easier to the one below", () => {
    // Fewer notes at 70%: between Tune + bass (3) and Fewer notes (4).
    const between: LadderState = { level: "simplified", hands: "both", tempoPct: 70, waitMode: false };
    expect(ladderPosition(between)).toEqual({ index: 3, exact: false });
    expect(ladderStep(between, 1)).toBe(4);
    expect(ladderStep(between, -1)).toBe(3);
  });

  it("stops at the easiest end", () => {
    expect(ladderStep(rung(0), -1)).toBeNull();
    expect(ladderStep({ level: "melody", hands: "right", tempoPct: 40, waitMode: false }, -1)).toBeNull();
  });
});

describe("Simple mode start", () => {
  it("opens a new song with the beginner defaults, the same rung again, or one rung up after a pass", () => {
    const current: LadderState = { level: "full", hands: "both", tempoPct: 100, waitMode: false };
    expect(simpleStart(null, current)).toEqual(BEGINNER_START);
    expect(simpleStart({ rung: 3, passed: false }, current)).toEqual({ level: "easy", hands: "both", tempoPct: 100, waitMode: false });
    expect(simpleStart({ rung: 3, passed: true }, current)).toEqual({ level: "simplified", hands: "both", tempoPct: 100, waitMode: false });
    expect(simpleStart({ rung: 0, passed: true }, current)).toEqual({ level: "melody", hands: "right", tempoPct: 70, waitMode: false });
    expect(simpleStart({ rung: 7, passed: true }, current)).toEqual({ level: "full", hands: "both", tempoPct: 100, waitMode: false });
  });
});

describe("Simple mode opening of a song", () => {
  const current: LadderState = { level: "full", hands: "both", tempoPct: 100, waitMode: false };

  it("gives the beginner start on the first open only", () => {
    expect(simpleOpening(null, null, current)).toEqual(BEGINNER_START);
    // Opened before but never finished a run: no longer the first open.
    expect(simpleOpening(null, {}, current)).toEqual(current);
  });

  it("keeps Wait for me as the user set it, over the beginner start's and the ladder's", () => {
    expect(simpleOpening(null, { waitMode: false }, current)).toEqual({ ...current, waitMode: false });
    expect(simpleOpening({ rung: 0, passed: false }, { waitMode: false }, current)).toEqual({ level: "melody", hands: "right", tempoPct: 60, waitMode: false });
    expect(simpleOpening({ rung: 3, passed: true }, { waitMode: true }, current)).toMatchObject({ level: "simplified", waitMode: true });
  });

  it("leaves the ladder alone when the user never touched Wait for me", () => {
    expect(simpleOpening({ rung: 3, passed: true }, {}, current)).toEqual(simpleStart({ rung: 3, passed: true }, current));
  });
});

describe("stars on the result sheet", () => {
  it("follows the API's thresholds and caps", () => {
    expect(runStars(96, { level: "full", hands: "both", isLoop: false })).toBe(3);
    expect(runStars(96, { level: "full", hands: "right", isLoop: false })).toBe(2);
    expect(runStars(96, { level: "melody", hands: "right", isLoop: false })).toBe(1);
    expect(runStars(86, { level: "simplified", hands: "both", isLoop: false })).toBe(2);
    expect(runStars(69.9, { level: "full", hands: "both", isLoop: false })).toBe(0);
    expect(starCap({ level: "full", hands: "both", isLoop: true })).toBe(0);
  });
});

describe("bar-by-bar results", () => {
  // A fixture run: four 2-second bars; bar 3 (index 2) has no notes.
  const bars = [0, 2, 4, 6].map((timeS, barIndex) => ({ timeS, barIndex: barIndex + 8 }));
  const notes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 6, 6.5, 7, 7.5].map((startS) => ({ startS }));
  const judgments: (PlayAlongJudgment | undefined)[] = [
    "perfect", "perfect", "good", "ok", // bar 9: 4 of 4
    "perfect", "miss", "miss", "good", // bar 10: 2 of 4
    "miss", "perfect", "good", "perfect", // bar 12: 3 of 4
  ];

  it("counts each bar's notes from the judgements, keeping the song's bar numbers", () => {
    const results = barResults(bars, notes, judgments);
    expect(results).toEqual([
      { barIndex: 8, total: 4, played: 4 },
      { barIndex: 9, total: 4, played: 2 },
      { barIndex: 10, total: 0, played: 0 },
      { barIndex: 11, total: 4, played: 3 },
    ]);
    expect(results.map(barTone)).toEqual(["good", "poor", "empty", "fair"]);
  });

  it("counts unjudged notes (a cut-short run) as not played", () => {
    expect(barResults(bars.slice(0, 1), notes.slice(0, 2), ["perfect"])).toEqual([{ barIndex: 8, total: 2, played: 1 }]);
  });

  it("picks the tricky part around the weakest bar and no best part below 90%", () => {
    const results = barResults(bars, notes, judgments);
    expect(trickySpan(results)).toEqual({ startBar: 8, endBar: 9, total: 8, played: 6 });
    expect(bestSpan(results)).toBeNull();
  });

  it("picks the best 2–4 bars when they went well, and no tricky part when every bar did", () => {
    const clean = barResults(bars, notes, notes.map(() => "perfect"));
    expect(trickySpan(clean)).toBeNull();
    expect(bestSpan(clean)).toEqual({ startBar: 8, endBar: 9, total: 8, played: 8 });
  });
});
