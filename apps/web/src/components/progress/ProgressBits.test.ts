import { describe, expect, it } from "vitest";
import { buildWeek, formatMinutes } from "./ProgressBits";

describe("formatMinutes", () => {
  it("never rounds a partial minute up to match what the header chip shows", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(0.7)).toBe("under 1 min");
    expect(formatMinutes(1.9)).toBe("1 min");
    expect(formatMinutes(125)).toBe("2h 5m");
  });
});

describe("buildWeek", () => {
  // 2026-10-23 is a Friday, so the week runs Mon 19 to Sun 25.
  const calendar = [
    { day: "2026-10-20", minutes: 12, goalMet: true },
    { day: "2026-10-21", minutes: 5, goalMet: false },
    { day: "2026-10-23", minutes: 0.7, goalMet: false },
  ];

  it("returns Monday to Sunday with today and future days marked", () => {
    const week = buildWeek("2026-10-23", calendar, ["2026-10-22"]);
    expect(week.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(week.map((d) => d.state)).toEqual(["none", "met", "practised", "frozen", "practised", "none", "none"]);
    expect(week.filter((d) => d.isToday).map((d) => d.day)).toEqual(["2026-10-23"]);
    expect(week.filter((d) => d.isFuture).length).toBe(2);
  });

  it("starts the week on Monday when today is Sunday", () => {
    const week = buildWeek("2026-10-25", [], []);
    expect(week[0]!.day).toBe("2026-10-19");
    expect(week[6]!.isToday).toBe(true);
  });
});
