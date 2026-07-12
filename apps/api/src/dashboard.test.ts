import type { Request, Response } from "express";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeStreak } from "./dashboard.js";

// --- computeStreak: pure function, no DB involved ---
describe("computeStreak", () => {
  const day = (offsetFromNow: number, now: Date): Date =>
    new Date(now.getTime() + offsetFromNow * 86_400_000);

  it("returns zeroes for no activity", () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0, lastActiveDate: null });
  });

  it("computes a current streak ending today", () => {
    const now = new Date("2026-07-12T15:00:00Z");
    const dates = [day(-2, now), day(-1, now), day(0, now)];
    const result = computeStreak(dates, now);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.lastActiveDate).toBe("2026-07-12");
  });

  it("still counts a current streak if the last activity was yesterday", () => {
    const now = new Date("2026-07-12T08:00:00Z");
    const dates = [day(-3, now), day(-2, now), day(-1, now)];
    const result = computeStreak(dates, now);
    expect(result.current).toBe(3);
  });

  it("resets current streak to 0 if the last activity was 2+ days ago", () => {
    const now = new Date("2026-07-12T08:00:00Z");
    const dates = [day(-5, now), day(-4, now), day(-3, now)];
    const result = computeStreak(dates, now);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it("finds the longest historical streak even when it isn't the current one", () => {
    const now = new Date("2026-07-12T08:00:00Z");
    // A 5-day run far in the past, then a gap, then a lone day today.
    const dates = [
      day(-20, now),
      day(-19, now),
      day(-18, now),
      day(-17, now),
      day(-16, now),
      day(0, now),
    ];
    const result = computeStreak(dates, now);
    expect(result.longest).toBe(5);
    expect(result.current).toBe(1);
  });

  it("collapses multiple same-day timestamps into a single day", () => {
    const now = new Date("2026-07-12T08:00:00Z");
    const dates = [
      new Date("2026-07-12T01:00:00Z"),
      new Date("2026-07-12T09:00:00Z"),
      new Date("2026-07-12T23:00:00Z"),
    ];
    const result = computeStreak(dates, now);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });
});

// --- Achievement unlock persistence: exercised through the real route handler
// against a mocked Prisma client that behaves like a real DB for
// UserAchievement (unique-key semantics via achievement_key). ---

interface FakeAchievementRow {
  id: string;
  user_id: string;
  achievement_key: string;
  unlocked_at: Date;
}

const state = vi.hoisted(() => ({
  achievementRows: [] as FakeAchievementRow[],
  completedLessonCount: 0,
}));

const prismaMock = vi.hoisted(() => ({
  lesson: { findMany: vi.fn() },
  userProgress: { findMany: vi.fn() },
  exerciseAttempt: { findMany: vi.fn() },
  playAlongAttempt: { findMany: vi.fn() },
  quizAttempt: { count: vi.fn() },
  userAchievement: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

import { dashboardRouter } from "./dashboard.js";

const USER_ID = "user-1";

function resetFakeDb() {
  state.achievementRows = [];
  state.completedLessonCount = 0;
  vi.clearAllMocks();

  prismaMock.lesson.findMany.mockResolvedValue([
    { id: "lesson-01", level: "foundation" },
    { id: "lesson-02", level: "foundation" },
  ]);
  prismaMock.userProgress.findMany.mockImplementation(async () => {
    const rows = [];
    for (let i = 0; i < state.completedLessonCount; i += 1) {
      rows.push({
        status: "completed",
        completed_at: new Date("2026-07-12T10:00:00Z"),
        lesson: { level: "foundation", lesson_json: { title: `Lesson ${i + 1}` } },
      });
    }
    return rows;
  });
  prismaMock.exerciseAttempt.findMany.mockResolvedValue([]);
  prismaMock.playAlongAttempt.findMany.mockResolvedValue([]);
  prismaMock.quizAttempt.count.mockResolvedValue(0);

  prismaMock.userAchievement.findMany.mockImplementation(async ({ where }: { where: { user_id: string } }) =>
    state.achievementRows.filter((row) => row.user_id === where.user_id),
  );
  prismaMock.userAchievement.createMany.mockImplementation(
    async ({ data }: { data: { user_id: string; achievement_key: string }[] }) => {
      let count = 0;
      for (const entry of data) {
        const exists = state.achievementRows.some(
          (row) => row.user_id === entry.user_id && row.achievement_key === entry.achievement_key,
        );
        if (exists) continue;
        state.achievementRows.push({
          id: `ach-${state.achievementRows.length}`,
          user_id: entry.user_id,
          achievement_key: entry.achievement_key,
          unlocked_at: new Date(),
        });
        count += 1;
      }
      return { count };
    },
  );
}

async function getDashboard(): Promise<{ status: number; body: Record<string, unknown> }> {
  return await new Promise((resolve, reject) => {
    let status = 200;
    let settled = false;
    const url = "/users/me/dashboard";
    const req = {
      method: "GET",
      url,
      originalUrl: url,
      baseUrl: "",
      path: url,
      query: {},
      userId: USER_ID,
    } as unknown as Request;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        settled = true;
        resolve({ status, body: payload });
        return this;
      },
    } as Response;

    (dashboardRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error) reject(error);
        else if (!settled) reject(new Error("dashboard route did not respond"));
      },
    );
  });
}

describe("GET /users/me/dashboard achievement persistence", () => {
  beforeEach(() => {
    resetFakeDb();
  });

  it("unlocks first_lesson_completed once the criteria is met, and it stays unlocked", async () => {
    state.completedLessonCount = 1;
    const first = await getDashboard();
    const firstEntry = (first.body.achievements as Array<{ key: string; unlocked: boolean; unlockedAt: string | null }>).find(
      (a) => a.key === "first_lesson_completed",
    );
    expect(firstEntry?.unlocked).toBe(true);
    expect(firstEntry?.unlockedAt).not.toBeNull();
    expect(state.achievementRows.filter((r) => r.achievement_key === "first_lesson_completed")).toHaveLength(1);

    const firstUnlockedAt = firstEntry?.unlockedAt;

    // Criteria stops being true (e.g. progress reset), but a previously
    // unlocked achievement must not re-lock, and calling the endpoint again
    // must not create a duplicate row.
    state.completedLessonCount = 0;
    const second = await getDashboard();
    const secondEntry = (second.body.achievements as Array<{ key: string; unlocked: boolean; unlockedAt: string | null }>).find(
      (a) => a.key === "first_lesson_completed",
    );
    expect(secondEntry?.unlocked).toBe(true);
    expect(secondEntry?.unlockedAt).toBe(firstUnlockedAt);
    expect(state.achievementRows.filter((r) => r.achievement_key === "first_lesson_completed")).toHaveLength(1);
  });

  it("does not unlock achievements whose criteria was never met", async () => {
    state.completedLessonCount = 0;
    const result = await getDashboard();
    const entry = (result.body.achievements as Array<{ key: string; unlocked: boolean }>).find(
      (a) => a.key === "first_lesson_completed",
    );
    expect(entry?.unlocked).toBe(false);
  });

  it("calling the endpoint twice with the same true criteria does not duplicate rows", async () => {
    state.completedLessonCount = 1;
    await getDashboard();
    await getDashboard();
    expect(state.achievementRows.filter((r) => r.achievement_key === "first_lesson_completed")).toHaveLength(1);
  });
});
