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
import { calculateAssessmentPlacement, validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { createAccessToken, isAdmin, requireAuth } from "./auth.js";
import { prisma } from "./db.js";
import { env } from "./config.js";
import { lessons } from "./content.js";
import { currentTtsPeriod, ensureTtsUsage, getOrCreateNarration, summarizeUsage, TtsLimitError } from "./tts.js";
import { feedbackRouter } from "./feedback.js";
import { adminUsersRouter } from "./admin-users.js";
import { songsRouter } from "./songs.js";
import { archiveRouter } from "./archive.js";
import { dashboardRouter } from "./dashboard.js";

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = credentials.extend({
  display_name: z.string().min(1).max(80),
});

const updateProfileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    narration_voice_id: z.string().min(1).max(100).nullable().optional(),
  })
  .refine(
    (value) => value.display_name !== undefined || value.narration_voice_id !== undefined,
    "Supply at least one profile field",
  );

const narrationSchema = z.object({
  voiceId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
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

/** Read the numeric `score` out of a stored attempt result JSON, defaulting to 0. */
const scoreFromResult = (result: Prisma.JsonValue): number => {
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    const score = (result as Record<string, unknown>).score;
    if (typeof score === "number") return score;
  }
  return 0;
};

/** Read the `title` out of a stored lesson JSON without requiring a full schema parse. */
const lessonTitleFromJson = (lessonJson: Prisma.JsonValue): string => {
  if (typeof lessonJson === "object" && lessonJson !== null && !Array.isArray(lessonJson)) {
    const title = (lessonJson as Record<string, unknown>).title;
    if (typeof title === "string") return title;
  }
  return "Unknown lesson";
};

export const app: ReturnType<typeof express> = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()),
    // Custom response headers aren't CORS-safelisted by default -- without
    // this, /songs/fetch-url-preview's x-song-* metadata headers are
    // invisible to the browser on every cross-origin deployment (dev
    // :5174->:3001, prod :8181->:3101 both cross-origin, no proxy), so the
    // URL-import preview silently showed "0:00 / 0 notes / difficulty 1"
    // for every real fetch despite the API sending correct values.
    exposedHeaders: ["x-song-duration-sec", "x-song-note-count", "x-song-difficulty"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const password_hash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        display_name: input.display_name,
        password_hash,
      },
    });
    res.status(201).json({
      accessToken: createAccessToken({ sub: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        narration_voice_id: user.narration_voice_id,
        role: user.role,
      },
    });
  } catch (e) {
    next(e);
  }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const input = credentials.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      res.status(401).json({ error: { code: "invalid_credentials", message: "Email or password is incorrect" } });
      return;
    }
    res.json({
      accessToken: createAccessToken({ sub: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        narration_voice_id: user.narration_voice_id,
        role: user.role,
      },
    });
  } catch (e) {
    next(e);
  }
});

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

app.use(feedbackRouter);
app.use(adminUsersRouter);
app.use(songsRouter);
app.use(archiveRouter);
app.use(dashboardRouter);

app.get("/users/me", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId(req) },
      select: { id: true, email: true, display_name: true, narration_voice_id: true, role: true },
    });
    if (!user) {
      res.status(404).json({ error: { code: "not_found", message: "User not found" } });
      return;
    }
    res.json(user);
  } catch (e) {
    next(e);
  }
});

app.patch("/users/me", async (req, res, next) => {
  try {
    const input = updateProfileSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: userId(req) },
      data: input,
      select: { id: true, email: true, display_name: true, narration_voice_id: true, role: true },
    });
    res.json(user);
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
 * Admins see every lesson unlocked without seeded UserProgress rows (read-time
 * unlock, so new lessons are automatically open to them). Completed stays
 * completed; anything else is reported as unlocked.
 */
const effectiveStatus = (stored: ProgressStatus | undefined, order: number, admin: boolean): ProgressStatus => {
  if (stored === ProgressStatus.completed) return ProgressStatus.completed;
  if (admin) return ProgressStatus.unlocked;
  return stored ?? (order === 1 ? ProgressStatus.unlocked : ProgressStatus.locked);
};

app.get("/lessons", async (req, res, next) => {
  try {
    const uid = userId(req);
    const admin = await isAdmin(uid);
    const rows = await prisma.lesson.findMany({
      orderBy: { order: "asc" },
      include: { progress: { where: { user_id: uid } } },
    });
    res.json(
      rows.map((row) => {
        const progress = row.progress[0];
        return {
          ...sanitizeLesson(validateLesson(row.lesson_json)),
          order: row.order,
          progress: {
            lessonId: row.id,
            status: effectiveStatus(progress?.status, row.order, admin),
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
    const row = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: {
        progress: { where: { user_id: userId(req) } },
        exercises: true,
      },
    });
    if (!row) {
      res.status(404).json({ error: { code: "not_found", message: "Lesson not found" } });
      return;
    }
    const admin = await isAdmin(userId(req));
    res.json({
      lesson: sanitizeLesson(validateLesson(row.lesson_json)),
      progress: row.progress[0]
        ? {
            lessonId: row.id,
            status: effectiveStatus(row.progress[0].status, row.order, admin),
            bestScore: row.progress[0].best_score,
            completedAt: row.progress[0].completed_at,
          }
        : admin
          ? { lessonId: row.id, status: ProgressStatus.unlocked, bestScore: 0, completedAt: null }
          : null,
      exercises: row.exercises.map((item) => validateMidiExercise(item.exercise_json)),
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
      lessonId: lesson.id,
      sectionIndex,
      voiceId,
      text: section.body,
    });
    res.json({ audioUrl: `/tts/audio/${result.narration.id}`, cached: result.cached, usage: result.usage });
  } catch (e) {
    if (e instanceof TtsLimitError) {
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
    if (!row) {
      res.status(404).json({ error: { code: "not_found", message: "Exercise not found" } });
      return;
    }
    const exercise = validateMidiExercise(row.exercise_json);
    const performedNotes = (input.performedNotes ??
      pairRawMidiEvents(input.rawEvents as RawMidiEvent[])) as PerformedNote[];
    const result = scoreMidiExercise({ exercise, performedNotes, tempoPct: input.tempoPct });
    const uid = userId(req);

    await prisma.$transaction(async (tx) => {
      await tx.exerciseAttempt.create({
        data: {
          user_id: uid,
          exercise_id: row.id,
          submitted_events: json(input),
          performed_notes: json(performedNotes),
          result: json(result),
        },
      });
      const current = await tx.userProgress.findUnique({
        where: { user_id_lesson_id: { user_id: uid, lesson_id: row.lesson_id } },
      });
      const best = Math.max(current?.best_score ?? 0, result.score);
      const completed = best >= 70;
      await tx.userProgress.upsert({
        where: { user_id_lesson_id: { user_id: uid, lesson_id: row.lesson_id } },
        create: {
          user_id: uid,
          lesson_id: row.lesson_id,
          status: completed ? ProgressStatus.completed : ProgressStatus.unlocked,
          best_score: best,
          completed_at: completed ? new Date() : null,
        },
        update: {
          best_score: best,
          ...(completed
            ? { status: ProgressStatus.completed, completed_at: current?.completed_at ?? new Date() }
            : {}),
        },
      });
      if (completed) {
        const nextLesson = await tx.lesson.findFirst({ where: { order: row.lesson.order + 1 } });
        if (nextLesson) {
          await tx.userProgress.upsert({
            where: { user_id_lesson_id: { user_id: uid, lesson_id: nextLesson.id } },
            create: { user_id: uid, lesson_id: nextLesson.id, status: ProgressStatus.unlocked },
            update: { status: { set: ProgressStatus.unlocked } },
          });
        }
      }
    });

    res.status(201).json(result);
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
      throw new Error("Selected answer is outside the available options");
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
      if (new Set(correctAttempts.map((item) => item.question_id)).size === questionIds.length) {
        await prisma.userProgress.upsert({
          where: { user_id_lesson_id: { user_id: uid, lesson_id: found.lesson.id } },
          create: {
            user_id: uid,
            lesson_id: found.lesson.id,
            status: ProgressStatus.completed,
            best_score: 100,
            completed_at: new Date(),
          },
          update: { status: ProgressStatus.completed, best_score: 100, completed_at: new Date() },
        });
        const nextLesson = rows.find((row) => row.order === found!.order + 1);
        if (nextLesson) {
          await prisma.userProgress.upsert({
            where: { user_id_lesson_id: { user_id: uid, lesson_id: nextLesson.id } },
            create: { user_id: uid, lesson_id: nextLesson.id, status: ProgressStatus.unlocked },
            update: { status: { set: ProgressStatus.unlocked } },
          });
        }
      }
    }

    res.json({ correct, explanation: found.question.explanation, correctIndex });
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
              : current?.status === ProgressStatus.completed
                ? {}
                : { status: ProgressStatus.unlocked },
          });
        }
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

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
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
  console.error(error);
  res.status(500).json({ error: { code: "internal_error", message: "An unexpected error occurred" } });
});
