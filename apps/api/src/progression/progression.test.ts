import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lessons } from "../content.js";
import { ESSENTIALS_INDEX } from "../essentials/build.js";
import { ESSENTIALS } from "../essentials/manifest.js";
import { readEssentialsIndex } from "../essentials/replacements.js";
import { ACHIEVEMENTS } from "./achievements.js";
import { CURRICULUM_SONGS } from "./curriculum-songs.js";
import { addDays, dayKey } from "./days.js";
import { levelInfo, xpAtLevel } from "./levels.js";
import { exerciseSeconds, playAlongSeconds } from "./practice-time.js";
import { skillPoints } from "./skills.js";
import { lessonStars, playAlongExtras, playAlongStars, starsForScore } from "./stars.js";
import { computeGoalStreak } from "./streak.js";
import { pickReview, presetFor } from "./today.js";
import { exerciseAttemptXp, playAlongXp, repeatFactor, starXp, streakMilestoneXp } from "./xp.js";

describe("levels", () => {
  it("starts at Novice 1 and follows the 100 + 40(L-1) curve", () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, title: "Novice 1", xpIntoLevel: 0, xpForNextLevel: 100 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 140 });
    expect(xpAtLevel(10)).toBe(2340);
  });

  it("names tiers and numbers levels inside them", () => {
    expect(levelInfo(xpAtLevel(6)).title).toBe("Apprentice 1");
    expect(levelInfo(xpAtLevel(8)).title).toBe("Apprentice 3");
    expect(levelInfo(xpAtLevel(13)).tier).toBe("Player");
    expect(levelInfo(xpAtLevel(21)).tier).toBe("Performer");
    expect(levelInfo(xpAtLevel(31)).title).toBe("Virtuoso 1");
  });
});

describe("XP formulas", () => {
  const base = { attemptId: "a1", exerciseId: "e1", exerciseTitle: "Scale", previousBest: null, earlierToday: 0 };

  it("pays score/5 plus a one-off first-pass bonus", () => {
    const items = exerciseAttemptXp({ ...base, score: 80 });
    expect(items.map((item) => [item.amount, item.dedupeKey])).toEqual([
      [16, "exercise-attempt:a1"],
      [25, "first-pass:e1"],
    ]);
  });

  it("pays a new-best bonus only when beating an earlier best", () => {
    expect(exerciseAttemptXp({ ...base, score: 60 }).some((item) => item.dedupeKey.startsWith("new-best"))).toBe(false);
    const better = exerciseAttemptXp({ ...base, score: 66, previousBest: 60 });
    expect(better.find((item) => item.dedupeKey === "new-best:a1")?.amount).toBe(10);
    expect(exerciseAttemptXp({ ...base, score: 60, previousBest: 60 }).some((item) => item.dedupeKey.startsWith("new-best"))).toBe(false);
  });

  it("gives less for repeats in a day and for already-mastered material", () => {
    expect(repeatFactor(0, null)).toBe(1);
    expect(repeatFactor(2, 80)).toBe(1);
    expect(repeatFactor(3, 80)).toBe(0.5);
    expect(repeatFactor(6, 80)).toBe(0.2);
    expect(repeatFactor(0, 96)).toBe(0.5);
    const amounts = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (earlierToday) => exerciseAttemptXp({ ...base, score: 100, previousBest: 100, earlierToday })[0]!.amount,
    );
    expect(amounts).toEqual([10, 10, 10, 5, 5, 5, 2, 2]);
  });

  const run = {
    attemptId: "p1",
    songId: "s1",
    songTitle: "Song",
    score: 100,
    multiplier: null,
    isLoop: false,
    minutesPlayed: 1,
    earlierToday: 0,
    loopXpToday: 0,
    previousBestAccuracy: null,
  };

  it("scales play-along runs by score, multiplier and length, capped at 60", () => {
    expect(playAlongXp(run)[0]!.amount).toBe(20);
    expect(playAlongXp({ ...run, multiplier: 0.5 })[0]!.amount).toBe(10);
    expect(playAlongXp({ ...run, minutesPlayed: 0.1 })[0]!.amount).toBe(10);
    expect(playAlongXp({ ...run, score: 160, minutesPlayed: 5 })[0]!.amount).toBe(60);
  });

  it("caps loop attempts per attempt and per song per day", () => {
    expect(playAlongXp({ ...run, isLoop: true })[0]!.amount).toBe(5);
    expect(playAlongXp({ ...run, isLoop: true, loopXpToday: 22 })[0]!.amount).toBe(3);
    expect(playAlongXp({ ...run, isLoop: true, loopXpToday: 25 })).toEqual([]);
  });

  it("keys stars and streak milestones so each pays once", () => {
    expect(starXp("lesson:l1", "L", 1, 3).map((item) => item.dedupeKey)).toEqual(["star:lesson:l1:2", "star:lesson:l1:3"]);
    expect(streakMilestoneXp(8).map((item) => item.dedupeKey)).toEqual(["streak:3", "streak:7"]);
  });
});

describe("stars", () => {
  it("uses 70 / 85 / 95 thresholds", () => {
    expect([69.9, 70, 84.9, 85, 94.9, 95, 100].map(starsForScore)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(lessonStars(false, 100)).toBe(0);
    expect(lessonStars(true, 90)).toBe(2);
  });

  it("caps songs by practice level, hands and loops", () => {
    const stars = (row: Record<string, unknown>, accuracy = 99) => playAlongStars(accuracy, playAlongExtras(row));
    expect(stars({})).toBe(3); // an old row: Full, both hands
    expect(stars({ arrangement_level: "full", hands: "both" })).toBe(3);
    expect(stars({ arrangement_level: null, hands: null })).toBe(3);
    expect(stars({ arrangement_level: "simplified" })).toBe(2);
    expect(stars({ arrangement_level: "easy" })).toBe(1);
    expect(stars({ arrangement_level: "melody" })).toBe(1);
    expect(stars({ hands: "right" })).toBe(2);
    expect(stars({ arrangement_level: "easy", hands: "left" })).toBe(1);
    expect(stars({ is_loop: true })).toBe(0);
    expect(stars({ loop_start_bar: 3, loop_end_bar: 6 })).toBe(0);
    expect(stars({ arrangement_level: "simplified" }, 80)).toBe(1);
  });
});

describe("goal streak with freezes", () => {
  const today = "2026-10-20";
  const run = (from: number, to: number) => {
    const days: string[] = [];
    for (let offset = from; offset <= to; offset += 1) days.push(addDays(today, offset));
    return days;
  };

  it("counts consecutive met days and survives an unfinished today", () => {
    expect(computeGoalStreak(run(-3, 0), today)).toMatchObject({ current: 4, longest: 4, todayMet: true });
    expect(computeGoalStreak(run(-3, -1), today)).toMatchObject({ current: 3, todayMet: false });
  });

  it("banks a freeze per 7 days and spends it on a single missed day", () => {
    // Seven met days, then yesterday missed: the freeze covers it.
    const streak = computeGoalStreak(run(-8, -2), today);
    expect(streak).toMatchObject({ current: 7, freezesAvailable: 0, frozenDays: [addDays(today, -1)] });
    const continued = computeGoalStreak([...run(-8, -2), today], today);
    expect(continued.current).toBe(8);
  });

  it("breaks without a freeze, and on two missed days in a row", () => {
    expect(computeGoalStreak(run(-6, -2), today).current).toBe(0);
    expect(computeGoalStreak(run(-20, -3), today)).toMatchObject({ current: 0, longest: 18 });
  });

  it("caps banked freezes at two", () => {
    expect(computeGoalStreak(run(-27, 0), today).freezesAvailable).toBe(2);
  });
});

describe("days", () => {
  it("buckets by the learner's timezone", () => {
    const instant = new Date("2026-10-04T02:30:00Z");
    expect(dayKey(instant, null)).toBe("2026-10-04");
    expect(dayKey(instant, "America/Los_Angeles")).toBe("2026-10-03");
    expect(dayKey(instant, "Not/AZone")).toBe("2026-10-04");
  });
});

describe("practice time", () => {
  it("derives exercise time from the played notes, clamped", () => {
    expect(exerciseSeconds([])).toBe(0);
    expect(exerciseSeconds([{ startTimestampMs: 0, endTimestampMs: 500 }])).toBe(5);
    expect(exerciseSeconds([{ startTimestampMs: 1000, endTimestampMs: null }, { startTimestampMs: 31000, endTimestampMs: 32000 }])).toBe(31);
    expect(exerciseSeconds([{ startTimestampMs: 0, endTimestampMs: 1e7 }])).toBe(300);
  });

  it("derives play-along time from the song length at the tempo played", () => {
    const notLoop = { isLoop: false, loopStartBar: null, loopEndBar: null };
    expect(playAlongSeconds({ duration_sec: 120 }, 50, notLoop, null)).toBe(240);
    expect(playAlongSeconds({ duration_sec: 120 }, 100, { isLoop: true, loopStartBar: 1, loopEndBar: 4 }, 3)).toBe(12);
  });
});

describe("review picker", () => {
  const live = new Set(["a", "b", "c"]);
  const at = (day: string, hour = 12) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  const attempt = (exerciseId: string, day: string, score: number, id = `${exerciseId}-${day}`) => ({ id, exerciseId, createdAt: at(day), score });

  it("brings a weak result back after a day, and picks the weakest", () => {
    const attempts = [attempt("a", "2026-10-01", 60), attempt("b", "2026-10-01", 40), attempt("c", "2026-10-01", 90)];
    expect(pickReview(attempts, live, null, "2026-10-01")).toBeNull();
    expect(pickReview(attempts, live, null, "2026-10-02")).toMatchObject({ exerciseId: "b", intervalDays: 1, lastScore: 40 });
  });

  it("spaces repeated weak results to 3 then 7 days, and retires strong ones", () => {
    const twice = [attempt("a", "2026-10-01", 50), attempt("a", "2026-10-02", 60)];
    expect(pickReview(twice, live, null, "2026-10-04")).toBeNull();
    expect(pickReview(twice, live, null, "2026-10-05")).toMatchObject({ intervalDays: 3 });
    const thrice = [...twice, attempt("a", "2026-10-05", 70)];
    expect(pickReview(thrice, live, null, "2026-10-11")).toBeNull();
    expect(pickReview(thrice, live, null, "2026-10-12")).toMatchObject({ intervalDays: 7 });
    expect(pickReview([...thrice, attempt("a", "2026-10-12", 90)], live, null, "2026-11-30")).toBeNull();
  });

  it("ignores exercises no longer in the course", () => {
    expect(pickReview([attempt("gone", "2026-10-01", 10)], live, null, "2026-10-09")).toBeNull();
  });
});

describe("song presets", () => {
  it("starts beginners on the right hand and simplifies full versions until late", () => {
    expect(presetFor(2, "beginner")).toEqual({ hands: "right", level: "full" });
    expect(presetFor(10, "full")).toEqual({ hands: "both", level: "simplified" });
    expect(presetFor(40, "full")).toEqual({ hands: "both", level: "full" });
  });
});

describe("skills", () => {
  it("maps lesson rewards to six skills, weighted by stars", () => {
    const points = skillPoints(
      [
        { id: "l1", branch: "theory", skillRewards: { note_reading: 2, theory: 1 } },
        { id: "l2", branch: "repertoire", skillRewards: { timing: 1 } },
        { id: "l3", branch: "technique", skillRewards: { technique: 5 } },
      ],
      new Map([
        ["l1", 3],
        ["l2", 1],
      ]),
      [2, 3],
    );
    expect(points).toEqual({ reading: 60, rhythm: 10, technique: 0, chords: 0, ear: 30, repertoire: 10 + 50 });
  });
});

describe("content checks", () => {
  it("has unique achievement keys and about forty of them", () => {
    const keys = ACHIEVEMENTS.map((achievement) => achievement.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(40);
  });

  it("links curriculum songs to real lessons and real Essentials pieces", () => {
    const lessonIds = new Set(lessons.map((lesson) => lesson.id));
    const slugs = new Set(ESSENTIALS.map((piece) => piece.slug));
    for (const link of CURRICULUM_SONGS) {
      expect(lessonIds.has(link.lessonId), link.lessonId).toBe(true);
      expect(slugs.has(link.slug), link.slug).toBe(true);
    }
  });

  // The generated pack is gitignored; when it is present, every linked piece must
  // actually have a Beginner version (some pieces ship without one).
  it.skipIf(!existsSync(ESSENTIALS_INDEX))("only links pieces that have a Beginner version", () => {
    const beginner = new Set(readEssentialsIndex().filter((entry) => entry.level === "beginner").map((entry) => entry.slug));
    for (const link of CURRICULUM_SONGS) expect(beginner.has(link.slug), link.slug).toBe(true);
  });
});
