/**
 * Integration tests against a REAL Postgres, through the real Express app over HTTP.
 * Every other API suite mocks Prisma; this one exists because the bugs that matter here
 * (unique-constraint ordering, unlock chain writes, conditional atomic updates) are
 * database semantics that a mock cannot exhibit.
 *
 * Runs only when TEST_DATABASE_URL is set (vitest.setup.ts points DATABASE_URL at it),
 * otherwise skips. It TRUNCATES every table, so it refuses to run unless the database
 * name contains "test". Kept in ONE file on purpose: vitest runs files in parallel,
 * and two files truncating the same database would race.
 *
 *   export TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/keyboard_sensei_test
 *   DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @keyboard-sensei/api exec prisma migrate deploy
 *   pnpm --filter @keyboard-sensei/api test
 */
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "@keyboard-sensei/shared-types";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

if (enabled && !/test/i.test(new URL(TEST_DATABASE_URL!).pathname)) {
  throw new Error(`TEST_DATABASE_URL must name a database containing "test" — this suite truncates every table`);
}

// Loaded lazily so that, when skipped, nothing here constructs a PrismaClient.
type Modules = {
  app: typeof import("./app.js").app;
  prisma: typeof import("./db.js").prisma;
  createAccessToken: typeof import("./auth.js").createAccessToken;
  content: typeof import("./content.js");
  seedContent: typeof import("./seed-content.js").seedContent;
  tts: typeof import("./tts.js");
};
let m: Modules;
let server: ReturnType<Modules["app"]["listen"]>;
let baseUrl = "";

async function truncateAll(): Promise<void> {
  const tables = await m.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(", ");
  await m.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

async function api(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let userCounter = 0;
const nextEmail = () => {
  userCounter += 1;
  return `user${userCounter}-${Date.now()}@test.local`;
};

/** Through the real route. Rate-limited per IP, so only the auth tests use it. */
async function registerUser(): Promise<{ id: string; token: string; email: string }> {
  const email = nextEmail();
  const res = await api("POST", "/auth/register", {
    body: { email, password: "correct-horse-battery", display_name: "Registered user" },
  });
  expect(res.status).toBe(201);
  return { id: res.body.user.id, token: res.body.accessToken, email };
}

/** Straight into the database, with a real signed token. */
async function createUser(): Promise<{ id: string; token: string; email: string }> {
  const email = nextEmail();
  const user = await m.prisma.user.create({ data: { email, display_name: "Test user", password_hash: "x" } });
  return { id: user.id, token: m.createAccessToken({ sub: user.id, email }), email };
}

const statusOf = async (token: string, lessonId: string): Promise<string> => {
  const res = await api("GET", "/lessons", { token });
  expect(res.status).toBe(200);
  return res.body.find((item: { id: string }) => item.id === lessonId).progress.status;
};

/** exercise-01 is untimed: C3, C4, C5 in order passes; wrong pitches fail. */
const exerciseOneNotes = (pitches: number[]) =>
  pitches.map((note, index) => ({
    note,
    velocity: 80,
    startTimestampMs: index * 750,
    endTimestampMs: index * 750 + 600,
    durationMs: 600,
  }));

const quizQuestions = (lessonId: string) =>
  m.content.lessons
    .find((lesson) => lesson.id === lessonId)!
    .sections.flatMap((section) => (section.type === "quiz" ? section.questions : []));

describe.skipIf(!enabled)("API against a real Postgres", () => {
  beforeAll(async () => {
    m = {
      app: (await import("./app.js")).app,
      prisma: (await import("./db.js")).prisma,
      createAccessToken: (await import("./auth.js")).createAccessToken,
      content: await import("./content.js"),
      seedContent: (await import("./seed-content.js")).seedContent,
      tts: await import("./tts.js"),
    };
    await truncateAll();
    server = m.app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await m.prisma.$disconnect();
  });

  beforeEach(async () => {
    // Every test starts from exactly the shipped content.
    await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
  });

  describe("auth", () => {
    it("registers, logs in, and rejects a wrong password", async () => {
      const user = await registerUser();
      const login = await api("POST", "/auth/login", { body: { email: user.email, password: "correct-horse-battery" } });
      expect(login.status).toBe(200);
      expect(login.body.user.id).toBe(user.id);
      const me = await api("GET", "/users/me", { token: login.body.accessToken });
      expect(me.body.email).toBe(user.email);
      const wrong = await api("POST", "/auth/login", { body: { email: user.email, password: "not-the-password" } });
      expect(wrong.status).toBe(401);
    });

    it("rate-limits repeated failed logins from one client", async () => {
      const user = await registerUser();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        statuses.push((await api("POST", "/auth/login", { body: { email: user.email, password: "wrong-password" } })).status);
      }
      // 10 failures allowed per window (one was spent by the previous test).
      expect(statuses.filter((status) => status === 401).length).toBeLessThanOrEqual(10);
      expect(statuses.at(-1)).toBe(429);
    });
  });

  describe("quiz answers", () => {
    it("a wrong answer reveals nothing about the correct one", async () => {
      const user = await createUser();
      const [question] = quizQuestions("lesson-02");
      const wrongIndex = (question!.correctIndex! + 1) % question!.options.length;
      const res = await api("POST", `/quiz-questions/${question!.id}/answer`, {
        token: user.token,
        body: { selectedAnswer: wrongIndex },
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ correct: false });
    });

    it("an out-of-range answer index is a 400, not a 500", async () => {
      const user = await createUser();
      const [question] = quizQuestions("lesson-02");
      const res = await api("POST", `/quiz-questions/${question!.id}/answer`, {
        token: user.token,
        body: { selectedAnswer: question!.options.length },
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("invalid_answer");
    });
  });

  describe("unlock chain", () => {
    it("completing lesson 1 unlocks lesson 2, and re-passing never downgrades anything", async () => {
      const user = await createUser();
      expect(await statusOf(user.token, "lesson-01")).toBe("unlocked");
      expect(await statusOf(user.token, "lesson-02")).toBe("locked");

      const pass = await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([48, 60, 72]) },
      });
      expect(pass.status).toBe(201);
      expect(pass.body.score).toBeGreaterThanOrEqual(70);
      expect(await statusOf(user.token, "lesson-01")).toBe("completed");
      expect(await statusOf(user.token, "lesson-02")).toBe("unlocked");

      // Finish lesson 2 through its quiz, which unlocks lesson 3.
      for (const question of quizQuestions("lesson-02")) {
        const res = await api("POST", `/quiz-questions/${question.id}/answer`, {
          token: user.token,
          body: { selectedAnswer: question.correctIndex },
        });
        expect(res.body.correct).toBe(true);
      }
      expect(await statusOf(user.token, "lesson-02")).toBe("completed");
      expect(await statusOf(user.token, "lesson-03")).toBe("unlocked");

      // Re-passing lesson 1 re-runs "unlock the next lesson" on an already-COMPLETED
      // lesson 2 — it must stay completed. A later failing attempt must not demote either.
      await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([48, 60, 72]) },
      });
      const fail = await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([49, 61, 73]) },
      });
      expect(fail.body.score).toBeLessThan(70);
      expect(await statusOf(user.token, "lesson-01")).toBe("completed");
      expect(await statusOf(user.token, "lesson-02")).toBe("completed");
      expect(await statusOf(user.token, "lesson-03")).toBe("unlocked");
      const progress = await m.prisma.userProgress.findUniqueOrThrow({
        where: { user_id_lesson_id: { user_id: user.id, lesson_id: "lesson-01" } },
      });
      expect(progress.best_score).toBeGreaterThanOrEqual(70);
    });
  });

  describe("song attempts", () => {
    it("a user cannot log attempts on another user's private song", async () => {
      const owner = await createUser();
      const stranger = await createUser();
      const privateSong = await m.prisma.song.create({
        data: {
          title: "Private upload",
          artist: "Owner",
          genre: "other",
          difficulty: 1,
          duration_sec: 10,
          note_count: 10,
          content_rights: "user-upload",
          file_path: "/nonexistent/private.mid",
          uploader_id: owner.id,
        },
      });
      const publicSong = await m.prisma.song.create({
        data: {
          title: "Library song",
          artist: "Public",
          genre: "classical",
          difficulty: 1,
          duration_sec: 10,
          note_count: 10,
          content_rights: "public-domain",
          file_path: "/nonexistent/public.mid",
        },
      });
      const attempt = { score: 80, accuracy: 90, tempo_pct: 100, lookahead_s: 3, wait_mode: false };

      const strangerRes = await api("POST", `/songs/${privateSong.id}/attempts`, { token: stranger.token, body: attempt });
      expect(strangerRes.status).toBe(404);
      expect(await m.prisma.playAlongAttempt.count({ where: { song_id: privateSong.id } })).toBe(0);

      const ownerRes = await api("POST", `/songs/${privateSong.id}/attempts`, { token: owner.token, body: attempt });
      expect(ownerRes.status).toBe(201);
      const publicRes = await api("POST", `/songs/${publicSong.id}/attempts`, { token: stranger.token, body: attempt });
      expect(publicRes.status).toBe(201);
    });
  });

  describe("narration", () => {
    it("rejects a voice id outside the allow-list before any synthesis", async () => {
      const user = await createUser();
      const res = await api("POST", "/lessons/lesson-01/sections/0/narrate", {
        token: user.token,
        body: { voiceId: "21m00Tcm4TlvDq8ikWAM" },
      });
      expect(res.status).toBe(400);
      expect(await m.prisma.ttsUsage.count()).toBe(0);
    });

    it("reserves quota atomically: concurrent requests never overshoot the monthly pool", async () => {
      const user = await createUser();
      const cacheDir = await mkdtemp(join(tmpdir(), "ks-tts-"));
      try {
        const now = new Date("2031-05-10T12:00:00Z");
        // Pool has room for exactly 3 of the 10 concurrent 1,000-char requests.
        await m.prisma.ttsUsage.create({ data: { period: "2031-05", charactersUsed: m.tts.TTS_LIMIT - 3_000 } });
        const synthesize = vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Uint8Array([1, 2, 3]);
        });
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_, sectionIndex) =>
            m.tts.getOrCreateNarration(m.prisma, {
              userId: user.id,
              lessonId: "lesson-atomic",
              sectionIndex,
              voiceId: "Xb7hH8MSUJpSbSDYk0k2",
              text: "x".repeat(1_000),
              userDailyLimit: 1_000_000,
              now,
              cacheDir,
              synthesize,
            }),
          ),
        );
        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter((result) => result.status === "rejected");
        expect(fulfilled).toHaveLength(3);
        expect(synthesize).toHaveBeenCalledTimes(3);
        for (const result of rejected) {
          expect((result as PromiseRejectedResult).reason).toBeInstanceOf(m.tts.TtsLimitError);
        }
        const usage = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2031-05" } });
        expect(usage.charactersUsed).toBe(m.tts.TTS_LIMIT);
      } finally {
        await rm(cacheDir, { recursive: true, force: true });
      }
    });

    it("enforces the per-user daily cap without consuming the shared pool, and cache hits are free", async () => {
      const user = await createUser();
      const cacheDir = await mkdtemp(join(tmpdir(), "ks-tts-"));
      try {
        const now = new Date("2032-01-15T08:00:00Z");
        const synthesize = vi.fn(async () => new Uint8Array([1]));
        const narrate = (sectionIndex: number) =>
          m.tts.getOrCreateNarration(m.prisma, {
            userId: user.id,
            lessonId: "lesson-daily",
            sectionIndex,
            voiceId: "Xb7hH8MSUJpSbSDYk0k2",
            text: "y".repeat(600),
            userDailyLimit: 1_000,
            now,
            cacheDir,
            synthesize,
          });

        expect((await narrate(0)).cached).toBe(false);
        expect((await narrate(0)).cached).toBe(true); // cache hit: no synthesis, no charge
        await expect(narrate(1)).rejects.toMatchObject({ scope: "user-daily" });
        expect(synthesize).toHaveBeenCalledTimes(1);

        const pool = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2032-01" } });
        expect(pool.charactersUsed).toBe(600); // the refused request's monthly bump rolled back
        const daily = await m.prisma.ttsUserUsage.findUniqueOrThrow({
          where: { user_id_day: { user_id: user.id, day: "2032-01-15" } },
        });
        expect(daily.charactersUsed).toBe(600);
      } finally {
        await rm(cacheDir, { recursive: true, force: true });
      }
    });

    it("refunds the reservation when synthesis fails", async () => {
      const user = await createUser();
      const now = new Date("2033-03-03T00:00:00Z");
      await expect(
        m.tts.getOrCreateNarration(m.prisma, {
          userId: user.id,
          lessonId: "lesson-refund",
          sectionIndex: 0,
          voiceId: "Xb7hH8MSUJpSbSDYk0k2",
          text: "z".repeat(500),
          userDailyLimit: 1_000,
          now,
          synthesize: async () => {
            throw new Error("ElevenLabs is down");
          },
        }),
      ).rejects.toThrow("ElevenLabs is down");
      const pool = await m.prisma.ttsUsage.findUniqueOrThrow({ where: { period: "2033-03" } });
      expect(pool.charactersUsed).toBe(0);
    });
  });

  describe("content seeding", () => {
    const dummyLesson = (id: string): Lesson => ({
      ...m.content.lessons[0]!,
      id,
      title: `Dummy ${id}`,
      sections: [{ type: "markdown", title: "Dummy", body: "Temporary lesson for the seeding test." }],
    });
    const insertAt = (lessons: Lesson[], index: number, lesson: Lesson) => [
      ...lessons.slice(0, index),
      lesson,
      ...lessons.slice(index),
    ];
    const orders = async () =>
      Object.fromEntries(
        (await m.prisma.lesson.findMany({ select: { id: true, order: true } })).map((row) => [row.id, row.order]),
      );

    it("inserting a lesson mid-sequence reseeds cleanly and existing progress still points at the right lessons", async () => {
      const user = await createUser();
      const pass = await api("POST", "/exercises/exercise-01/attempts", {
        token: user.token,
        body: { performedNotes: exerciseOneNotes([48, 60, 72]) },
      });
      expect(pass.status).toBe(201);
      const before = await m.prisma.userProgress.findMany({ where: { user_id: user.id }, orderBy: { lesson_id: "asc" } });
      expect(before.map((row) => [row.lesson_id, row.status])).toEqual([
        ["lesson-01", "completed"],
        ["lesson-02", "unlocked"],
      ]);

      const withDummy = insertAt(m.content.lessons, 1, dummyLesson("lesson-dummy-insert"));
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });

      const after = await orders();
      expect(after["lesson-01"]).toBe(1);
      expect(after["lesson-dummy-insert"]).toBe(2);
      expect(after["lesson-02"]).toBe(3);
      expect(after["lesson-34"]).toBe(35);
      // Progress rows are keyed by id, so they still describe the same lessons.
      const progressAfter = await m.prisma.userProgress.findMany({
        where: { user_id: user.id },
        include: { lesson: { select: { lesson_json: true } } },
        orderBy: { lesson_id: "asc" },
      });
      expect(progressAfter.map((row) => [row.lesson_id, row.status])).toEqual([
        ["lesson-01", "completed"],
        ["lesson-02", "unlocked"],
      ]);
      expect((progressAfter[1]!.lesson.lesson_json as { title: string }).title).toBe("Finger numbers and hand position");

      // A locked, unscored placeholder row (what the seed creates for the demo user) is
      // not user data and must not keep a removed lesson alive.
      await m.prisma.userProgress.create({
        data: { user_id: user.id, lesson_id: "lesson-dummy-insert", status: "locked" },
      });

      // Revert: the dummy has no user data, so it is deleted, and orders return to 1..34.
      const report = await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      expect(report.deletedLessonIds).toEqual(["lesson-dummy-insert"]);
      const reverted = await orders();
      expect(reverted["lesson-02"]).toBe(2);
      expect(Object.keys(reverted)).toHaveLength(m.content.lessons.length);
    });

    it("a removed lesson that users have touched is retired (kept, hidden, outside the chain), not deleted", async () => {
      const user = await createUser();
      const withDummy = insertAt(m.content.lessons, 2, dummyLesson("lesson-dummy-retire"));
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });
      await m.prisma.userProgress.create({
        data: { user_id: user.id, lesson_id: "lesson-dummy-retire", status: "completed", best_score: 90 },
      });

      const warn = vi.fn();
      const report = await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn });
      expect(report.retiredLessonIds).toEqual(["lesson-dummy-retire"]);
      expect(warn).toHaveBeenCalledOnce();

      const row = await m.prisma.lesson.findUniqueOrThrow({ where: { id: "lesson-dummy-retire" } });
      expect(row.retired_at).not.toBeNull();
      expect(row.order).toBeLessThan(0);
      expect(await m.prisma.userProgress.count({ where: { lesson_id: "lesson-dummy-retire" } })).toBe(1);

      const list = await api("GET", "/lessons", { token: user.token });
      expect(list.body.map((item: { id: string }) => item.id)).not.toContain("lesson-dummy-retire");
      expect(list.body).toHaveLength(m.content.lessons.length);
      expect((await api("GET", "/lessons/lesson-dummy-retire", { token: user.token })).status).toBe(404);

      // Bringing it back into content revives it with a normal order.
      await m.seedContent(m.prisma, withDummy, m.content.exercises, { warn: () => undefined });
      const revived = await m.prisma.lesson.findUniqueOrThrow({ where: { id: "lesson-dummy-retire" } });
      expect(revived.retired_at).toBeNull();
      expect(revived.order).toBe(3);

      // Leave the database as the shipped content again (the row stays retired: it has data).
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      await m.prisma.userProgress.deleteMany({ where: { lesson_id: "lesson-dummy-retire" } });
      await m.seedContent(m.prisma, m.content.lessons, m.content.exercises, { warn: () => undefined });
      expect(await m.prisma.lesson.count({ where: { id: "lesson-dummy-retire" } })).toBe(0);
    });
  });
});
