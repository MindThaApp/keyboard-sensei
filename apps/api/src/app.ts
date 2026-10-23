import express, { type NextFunction, type Request, type Response } from "express";
import { readFile } from "node:fs/promises";
import cors from "cors";
import bcrypt from "bcryptjs";
import { Prisma, ProgressStatus } from "@prisma/client";
import { z, ZodError } from "zod";
import type {
  AttemptSummary,
  AttemptsResponse,
  Lesson,
  MidiExercise,
  PerformedNote,
  RawMidiEvent,
} from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents, scoreMidiExercise } from "@keyboard-sensei/midi-engine";
import {
  calculateAssessmentPlacement,
  lessonCompletion,
  resolveLessonStatus,
  validateLesson,
  validateMidiExercise,
} from "@keyboard-sensei/lesson-engine";
import { isAdmin, requireAuth } from "./auth.js";
import { authRouter } from "./auth-routes.js";
import { prisma } from "./db.js";
import { env } from "./config.js";
import { lessons } from "./content.js";
import { currentTtsPeriod, ensureTtsUsage, getOrCreateNarration, summarizeUsage, TtsLimitError } from "./tts.js";
import { feedbackRouter } from "./feedback.js";
import { adminUsersRouter } from "./admin-users.js";
import { songsRouter } from "./songs.js";
import { instrumentsRouter } from "./instruments.js";
import { archiveRouter } from "./archive.js";
import { progressionRouter } from "./progression/router.js";
import { rewardExerciseAttempt, rewardQuizAnswer, type Rewards } from "./progression/rewards.js";
import { exerciseSeconds } from "./progression/practice-time.js";
import { dayKey, isValidTimeZone } from "./progression/days.js";
import { exerciseBestsFor, recordLessonOutcome, scoreFromResult, unlockLesson } from "./progress.js";
import { narrationVoiceIdSchema } from "./narration-voices.js";
import { createSentryTunnelRouter, parseAllowedDsns } from "./sentry-tunnel.js";
import { reportServerError } from "./sentry.js";
import { instrumentUploadRateLimit, songUploadRateLimit } from "./rate-limits.js";

const updateProfileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    narration_voice_id: narrationVoiceIdSchema.nullable().optional(),
    daily_goal_minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]).optional(),
    timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone").optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one profile field");

const PROFILE_SELECT = {
  id: true,
  email: true,
  display_name: true,
  narration_voice_id: true,
  role: true,
  daily_goal_minutes: true,
  timezone: true,
  google_sub: true,
} as const;

/** The profile as clients see it: whether Google is linked, never the Google id itself. */
const profileOf = ({ google_sub, ...user }: Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>) => ({
  ...user,
  google_linked: google_sub !== null,
});

/**
 * Progress rewards for an attempt that is already saved. A failure here is logged and
 * reported as `rewards: null` rather than failing the request: the attempt itself is
 * safe, and the backfill (scripts/backfill-progression.ts) can award it later.
 */
async function rewardsOrNull(work: () => Promise<Rewards>): Promise<Rewards | null> {
  try {
    return await work();
  } catch (error) {
    console.error("Awarding progress failed", error);
    return null;
  }
}

const narrationSchema = z.object({
  voiceId: narrationVoiceIdSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const rawEventSchema = z.object({
  note: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  type: z.enum(["noteon", "noteoff"]),
  timestampMs: z.number().nonnegative(),
});

const performedSchema = z.object({
  note: z.number().int().min(0).max(127),
  velocity: z.number().int().min(0).max(127),
  startTimestampMs: z.number().nonnegative(),
  endTimestampMs: z.number().nonnegative().nullable(),
  durationMs: z.number().nonnegative().nullable(),
});

// Continuous since 2026-07-12 (was the literal union 25|50|75|100). Lessons drive
// this from a real 25-200 BPM slider against the exercise's authored tempoBpm.
const tempoPctSchema = z.number().min(10).max(250);

const performanceSchema = z
  .object({
    rawEvents: z.array(rawEventSchema).optional(),
    performedNotes: z.array(performedSchema).optional(),
    tempoPct: tempoPctSchema.optional(),
  })
  .refine(
    (value) => (value.rawEvents === undefined) !== (value.performedNotes === undefined),
    "Supply exactly one of rawEvents or performedNotes",
  );

const json = (value: unknown) => value as Prisma.InputJsonValue;

const userId = (req: Request) => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

/**
 * Strip `correctIndex` from every quiz question before a lesson leaves the API.
 * Stored lesson JSON keeps the answer key (the quiz-answer route validates
 * against it server-side); clients must never receive it. Call this AFTER
 * validateLesson so stored content is still schema-checked in full.
 */
const sanitizeLesson = (lesson: Lesson): Lesson => ({
  ...lesson,
  sections: lesson.sections.map((section) => {
    if (section.type !== "quiz") return section;
    return {
      ...section,
      questions: section.questions.map(({ correctIndex: _stripped, ...question }) => question),
    };
  }),
});

/** Read the `title` out of a stored lesson JSON without requiring a full schema parse. */
const lessonTitleFromJson = (lessonJson: Prisma.JsonValue): string => {
  if (typeof lessonJson === "object" && lessonJson !== null && !Array.isArray(lessonJson)) {
    const title = (lessonJson as Record<string, unknown>).title;
    if (typeof title === "string") return title;
  }
  return "Unknown lesson";
};

export const app: ReturnType<typeof express> = express();

// Behind Caddy -> nginx in the LAN deploy; without this every request appears to come
// from the proxy and the IP-keyed auth rate limits would be shared by all clients.
app.set("trust proxy", env.TRUST_PROXY);

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()),
    // Custom response headers aren't CORS-safelisted by default -- without
    // this, /songs/fetch-url-preview's x-song-* metadata headers are
    // invisible to the browser on cross-origin development (web :5174 -> API
    // :3001); production uses nginx's same-origin /api proxy. Without this,
    // URL-import preview silently showed "0:00 / 0 notes / difficulty 1" in dev.
    exposedHeaders: ["x-song-duration-sec", "x-song-note-count", "x-song-difficulty"],
  }),
);
// Before the JSON parser: envelopes are not JSON, and the tunnel reads its own raw body.
app.use(createSentryTunnelRouter(() => parseAllowedDsns(env.SENTRY_TUNNEL_DSNS)));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

/** Deployment features the web app adapts to (e.g. no archive search on a public catalogue). */
app.get("/config", (_req, res) =>
  res.json({
    publicCatalogue: env.PUBLIC_CATALOGUE,
    googleSignIn: env.GOOGLE_CLIENT_IDS.length > 0,
    registrationOpen: env.REGISTRATION_OPEN,
  }),
);

app.use(authRouter);

app.get("/tts/audio/:id", async (req, res, next) => {
  try {
    const narration = await prisma.ttsNarration.findUnique({ where: { id: req.params.id } });
    if (!narration) {
      res.status(404).json({ error: { code: "not_found", message: "Narration audio not found" } });
      return;
    }
    try {
      const audio = await readFile(narration.filePath);
      res.type("audio/mpeg").send(audio);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Narration audio file not found" } });
        return;
      }
      throw error;
    }
  } catch (e) {
    next(e);
  }
});

app.use(requireAuth);

// Path-scoped (not per-route) so they run after requireAuth and can key on req.userId.
app.use("/songs/upload", songUploadRateLimit);
app.use("/instruments/upload", instrumentUploadRateLimit);

app.use(feedbackRouter);
app.use(adminUsersRouter);
app.use(songsRouter);
app.use(instrumentsRouter);
app.use(archiveRouter);
app.use(progressionRouter);

app.get("/users/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId(req) }, select: PROFILE_SELECT });
    if (!user) {
      res.status(404).json({ error: { code: "not_found", message: "User not found" } });
      return;
    }
    res.json(profileOf(user));
  } catch (e) {
    next(e);
  }
});

app.patch("/users/me", async (req, res, next) => {
  try {
    const input = updateProfileSchema.parse(req.body);
    const uid = userId(req);
    const user = await prisma.user.update({ where: { id: uid }, data: input, select: PROFILE_SELECT });
    if (input.daily_goal_minutes !== undefined) {
      // A goal changed mid-day applies to today too, unless today's goal is already met.
      await prisma.practiceDay.updateMany({
        where: { user_id: uid, day: dayKey(new Date(), user.timezone), goal_met_at: null },
        data: { goal_minutes: input.daily_goal_minutes },
      });
    }
    res.json(profileOf(user));
  } catch (e) {
    next(e);
  }
});

app.post("/users/me/password", async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    const uid = userId(req);
    const user = await prisma.user.findUnique({ where: { id: uid }, select: { password_hash: true } });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.password_hash))) {
      res.status(401).json({ error: { code: "invalid_credentials", message: "Current password is incorrect" } });
      return;
    }
    const password_hash = await bcrypt.hash(input.newPassword, 12);
    await prisma.user.update({ where: { id: uid }, data: { password_hash } });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/**
 * Status as the learner sees it: stored progress, plus a read-time check of each
 * lesson's prerequisites (see resolveLessonStatus). Admins see every lesson unlocked
 * without seeded UserProgress rows, so new lessons are automatically open to them.
 */
async function completedLessonIdsFor(uid: string): Promise<Set<string>> {
  const rows = await prisma.userProgress.findMany({
    where: { user_id: uid, status: ProgressStatus.completed },
    select: { lesson_id: true },
  });
  return new Set(rows.map((row) => row.lesson_id));
}

app.get("/lessons", async (req, res, next) => {
  try {
    const uid = userId(req);
    const [admin, completedIds, rows] = await Promise.all([
      isAdmin(uid),
      completedLessonIdsFor(uid),
      prisma.lesson.findMany({
        where: { retired_at: null },
        orderBy: { order: "asc" },
        include: { progress: { where: { user_id: uid } } },
      }),
    ]);
    res.json(
      rows.map((row) => {
        const progress = row.progress[0];
        const lesson = validateLesson(row.lesson_json);
        return {
          ...sanitizeLesson(lesson),
          order: row.order,
          progress: {
            lessonId: row.id,
            status: resolveLessonStatus(lesson, progress?.status, completedIds, admin),
            bestScore: progress?.best_score ?? 0,
            completedAt: progress?.completed_at ?? null,
          },
        };
      }),
    );
  } catch (e) {
    next(e);
  }
});

app.get("/lessons/:id", async (req, res, next) => {
  try {
    const uid = userId(req);
    const row = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        progress: { where: { user_id: uid } },
        exercises: { where: { retired_at: null } },
      },
    });
    if (!row || row.retired_at) {
      res.status(404).json({ error: { code: "not_found", message: "Lesson not found" } });
      return;
    }
    const lesson = validateLesson(row.lesson_json);
    const [admin, completedIds, exerciseBests] = await Promise.all([
      isAdmin(uid),
      completedLessonIdsFor(uid),
      exerciseBestsFor(prisma, uid, row.exercises.map((item) => item.id)),
    ]);
    const stored = row.progress[0];
    res.json({
      lesson: sanitizeLesson(lesson),
      progress: {
        lessonId: row.id,
        status: resolveLessonStatus(lesson, stored?.status, completedIds, admin),
        bestScore: stored?.best_score ?? 0,
        completedAt: stored?.completed_at ?? null,
      },
      exercises: row.exercises.map((item) => validateMidiExercise(item.exercise_json)),
      exerciseBests,
    });
  } catch (e) {
    next(e);
  }
});

app.get("/tts/usage", async (_req, res, next) => {
  try {
    const period = currentTtsPeriod();
    const usage = await ensureTtsUsage(prisma, period);
    res.json({ period, ...summarizeUsage(usage.charactersUsed) });
  } catch (e) {
    next(e);
  }
});

app.post("/lessons/:lessonId/sections/:sectionIndex/narrate", async (req, res, next) => {
  try {
    const { voiceId } = narrationSchema.parse(req.body);
    const lesson = lessons.find((item) => item.id === req.params.lessonId);
    if (!lesson) {
      res.status(404).json({ error: { code: "not_found", message: "Lesson not found" } });
      return;
    }
    const sectionIndex = z.coerce.number().int().nonnegative().parse(req.params.sectionIndex);
    const section = lesson.sections[sectionIndex];
    if (!section) {
      res.status(404).json({ error: { code: "not_found", message: "Lesson section not found" } });
      return;
    }
    if (section.type !== "markdown" && section.type !== "theory-card") {
      res.status(400).json({
        error: { code: "invalid_section_type", message: "Only markdown and theory-card sections can be narrated" },
      });
      return;
    }
    const result = await getOrCreateNarration(prisma, {
      userId: userId(req),
      userDailyLimit: env.TTS_USER_DAILY_LIMIT,
      lessonId: lesson.id,
      sectionIndex,
      voiceId,
      text: section.body,
    });
    res.json({ audioUrl: `/tts/audio/${result.narration.id}`, cached: result.cached, usage: result.usage });
  } catch (e) {
    if (e instanceof TtsLimitError) {
      if (e.scope === "user-daily") {
        res.status(429).json({ error: { code: "tts_user_daily_limit_reached", message: e.message } });
        return;
      }
      res.status(402).json({ error: { code: "tts_limit_reached", message: e.message } });
      return;
    }
    next(e);
  }
});

app.post("/exercises/:id/attempts", async (req, res, next) => {
  try {
    const input = performanceSchema.parse(req.body);
    const row = await prisma.exercise.findUnique({
      where: { id: req.params.id },
      include: { lesson: true },
    });
    if (!row || row.retired_at || row.lesson.retired_at) {
      res.status(404).json({ error: { code: "not_found", message: "Exercise not found" } });
      return;
    }
    const exercise = validateMidiExercise(row.exercise_json);
    const performedNotes = (input.performedNotes ??
      pairRawMidiEvents(input.rawEvents as RawMidiEvent[])) as PerformedNote[];
    const result = scoreMidiExercise({ exercise, performedNotes, tempoPct: input.tempoPct });
    const uid = userId(req);

    const lesson = validateLesson(row.lesson.lesson_json);
    const lessonExerciseIds = lesson.sections.flatMap((section) =>
      section.type === "midi-exercise" ? [section.exerciseId] : [],
    );

    const attempt = await prisma.$transaction(async (tx) => {
      const created = await tx.exerciseAttempt.create({
        data: {
          user_id: uid,
          exercise_id: row.id,
          submitted_events: json(input),
          performed_notes: json(performedNotes),
          result: json(result),
        },
      });
      // A lesson is passed when EVERY one of its exercises has been passed (see lessonCompletion).
      const bests = await exerciseBestsFor(tx, uid, lessonExerciseIds);
      await recordLessonOutcome(tx, uid, row.lesson_id, lessonCompletion(lesson, bests));
      return created;
    });

    const rewards = await rewardsOrNull(() =>
      rewardExerciseAttempt(prisma, {
        userId: uid,
        attemptId: attempt.id,
        exerciseId: row.id,
        lessonId: row.lesson_id,
        practiceSeconds: exerciseSeconds(performedNotes),
      }),
    );
    res.status(201).json({ ...result, rewards });
  } catch (e) {
    next(e);
  }
});

type QuizSectionOfLesson = Extract<Lesson["sections"][number], { type: "quiz" }>;
type StoredQuizQuestion = QuizSectionOfLesson["questions"][number];

app.post("/quiz-questions/:id/answer", async (req, res, next) => {
  try {
    const { selectedAnswer } = z.object({ selectedAnswer: z.number().int().nonnegative() }).parse(req.body);

    // Question ids live inside the lesson_json blob (sections[].questions[].id),
    // nested two array levels deep — Prisma's JSON filters can't index into that,
    // so we scan. The lessons table is small (dozens of rows), so a full scan per
    // answer is fine; prefer this clarity over a raw-SQL jsonpath query.
    const rows = await prisma.lesson.findMany({
      where: { retired_at: null },
      select: { id: true, order: true, lesson_json: true },
    });

    let found: { lesson: Lesson; order: number; question: StoredQuizQuestion } | null = null;
    for (const row of rows) {
      const lesson = validateLesson(row.lesson_json);
      const question = lesson.sections
        .flatMap((section) => (section.type === "quiz" ? section.questions : []))
        .find((candidate) => candidate.id === req.params.id);
      if (question) {
        found = { lesson, order: row.order, question };
        break;
      }
    }
    if (!found) {
      res.status(404).json({ error: { code: "not_found", message: "Quiz question not found" } });
      return;
    }
    if (selectedAnswer >= found.question.options.length) {
      res.status(400).json({
        error: { code: "invalid_answer", message: "Selected answer is outside the available options" },
      });
      return;
    }

    // correctIndex is optional on the shared QuizQuestion type (it is stripped from
    // lesson payloads), but stored content must always carry it — treat absence as
    // corrupt content and let the 500 handler report it.
    const correctIndex = found.question.correctIndex;
    if (correctIndex === undefined) {
      throw new Error(`Stored quiz question ${found.question.id} is missing correctIndex`);
    }

    const correct = selectedAnswer === correctIndex;
    const uid = userId(req);
    await prisma.quizAttempt.create({
      data: {
        user_id: uid,
        lesson_id: found.lesson.id,
        question_id: found.question.id,
        selected_answer: selectedAnswer,
        correct,
      },
    });

    if (correct) {
      const questionIds = found.lesson.sections.flatMap((section) =>
        section.type === "quiz" ? section.questions.map((question) => question.id) : [],
      );
      const correctAttempts = await prisma.quizAttempt.findMany({
        where: {
          user_id: uid,
          lesson_id: found.lesson.id,
          correct: true,
          question_id: { in: questionIds },
        },
        select: { question_id: true },
      });
      const completion = lessonCompletion(found.lesson, {}, new Set(correctAttempts.map((item) => item.question_id)));
      if (completion.completed) {
        await prisma.$transaction((tx) => recordLessonOutcome(tx, uid, found!.lesson.id, completion));
      }
    }

    const rewards = await rewardsOrNull(() => rewardQuizAnswer(prisma, { userId: uid, lessonId: found!.lesson.id }));
    if (!correct) {
      res.json({ correct: false, rewards });
      return;
    }
    res.json({ correct: true, explanation: found.question.explanation, correctIndex, rewards });
  } catch (e) {
    next(e);
  }
});

app.get("/users/me/progress", async (req, res, next) => {
  try {
    const progress = await prisma.userProgress.findMany({
      where: { user_id: userId(req) },
      include: { lesson: { select: { order: true } } },
      orderBy: { lesson: { order: "asc" } },
    });
    res.json({
      completedLessonIds: progress.filter((p) => p.status === "completed").map((p) => p.lesson_id),
      bestScores: Object.fromEntries(progress.map((p) => [p.lesson_id, p.best_score])),
      lessonStatuses: progress.map((p) => ({
        lessonId: p.lesson_id,
        status: p.status,
        bestScore: p.best_score,
        completedAt: p.completed_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

app.get("/users/me/attempts", async (req, res, next) => {
  try {
    const rows = await prisma.exerciseAttempt.findMany({
      where: { user_id: userId(req) },
      orderBy: { created_at: "desc" },
      take: 100,
      include: {
        exercise: {
          select: {
            lesson_id: true,
            lesson: { select: { lesson_json: true } },
          },
        },
      },
    });
    const attempts: AttemptSummary[] = rows.map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      lessonId: row.exercise.lesson_id,
      lessonTitle: lessonTitleFromJson(row.exercise.lesson.lesson_json),
      score: scoreFromResult(row.result),
      createdAt: row.created_at.toISOString(),
    }));
    const response: AttemptsResponse = { attempts };
    res.json(response);
  } catch (e) {
    next(e);
  }
});

app.post("/users/me/assessment-placement", async (req, res, next) => {
  try {
    const { scores } = z.object({ scores: z.array(z.number().min(0).max(100)).max(5) }).parse(req.body);
    const placement = calculateAssessmentPlacement(scores);
    if (placement.completedLessonCount > 0) {
      const uid = userId(req);
      const rows = await prisma.lesson.findMany({
        where: { retired_at: null },
        orderBy: { order: "asc" },
        take: placement.completedLessonCount + 1,
      });
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        for (const [index, lesson] of rows.entries()) {
          const current = await tx.userProgress.findUnique({
            where: { user_id_lesson_id: { user_id: uid, lesson_id: lesson.id } },
          });
          const completing = index < placement.completedLessonCount;
          await tx.userProgress.upsert({
            where: { user_id_lesson_id: { user_id: uid, lesson_id: lesson.id } },
            create: {
              user_id: uid,
              lesson_id: lesson.id,
              status: completing ? ProgressStatus.completed : ProgressStatus.unlocked,
              best_score: completing ? placement.placementScore : 0,
              completed_at: completing ? now : null,
            },
            update: completing
              ? {
                  status: ProgressStatus.completed,
                  best_score: Math.max(current?.best_score ?? 0, placement.placementScore),
                  completed_at: current?.completed_at ?? now,
                }
              : {},
          });
        }
        const nextLesson = rows[placement.completedLessonCount];
        if (nextLesson) await unlockLesson(tx, uid, nextLesson.id);
      });
    }
    res.json(placement);
  } catch (e) {
    next(e);
  }
});

app.post("/practice/score", async (req, res, next) => {
  try {
    const body = z
      .object({
        exercise: z.unknown(),
        rawEvents: z.array(rawEventSchema).optional(),
        performedNotes: z.array(performedSchema).optional(),
        tempoPct: tempoPctSchema.optional(),
      })
      .parse(req.body);
    const performance = performanceSchema.parse(body);
    const exercise = validateMidiExercise(body.exercise) as MidiExercise;
    const performedNotes = (performance.performedNotes ??
      pairRawMidiEvents(performance.rawEvents as RawMidiEvent[])) as PerformedNote[];
    res.json(scoreMidiExercise({ exercise, performedNotes, tempoPct: performance.tempoPct }));
  } catch (e) {
    next(e);
  }
});

app.use((req, res) =>
  res.status(404).json({ error: { code: "not_found", message: `No route for ${req.method} ${req.path}` } }),
);

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Request validation failed", details: error.flatten() },
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: { code: "conflict", message: "A record with that unique value already exists" } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2025" || error.code === "P2003")) {
    res.status(404).json({ error: { code: "not_found", message: "Record not found" } });
    return;
  }
  // Errors that carry an explicit 4xx status are client errors, not 500s: e.g.
  // createInstrumentFromBytes's Object.assign(new Error(...), { statusCode: 422 }), and
  // body-parser's own errors (malformed JSON -> 400, oversized body -> 413).
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
    const code = statusCode === 413 ? "payload_too_large" : statusCode === 422 ? "unprocessable" : "bad_request";
    res.status(statusCode).json({ error: { code, message: (error as Error).message } });
    return;
  }
  // Only unexpected failures reach Sentry; every 4xx above is the client's doing.
  reportServerError(error, req);
  console.error(error);
  res.status(500).json({ error: { code: "internal_error", message: "An unexpected error occurred" } });
});
