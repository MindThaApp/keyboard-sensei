import { ProgressStatus, type Prisma } from "@prisma/client";
import { lessonsUnlockedBy, validateLesson, type LessonCompletion } from "@keyboard-sensei/lesson-engine";

type ProgressClient = Pick<Prisma.TransactionClient, "userProgress">;
type LessonProgressClient = Pick<Prisma.TransactionClient, "userProgress" | "lesson" | "exerciseAttempt">;

/** Create missing progress and promote only a still-locked lesson. */
export async function unlockLesson(tx: ProgressClient, userId: string, lessonId: string): Promise<void> {
  await tx.userProgress.upsert({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    create: { user_id: userId, lesson_id: lessonId, status: ProgressStatus.unlocked },
    update: {},
  });
  await tx.userProgress.updateMany({
    where: { user_id: userId, lesson_id: lessonId, status: ProgressStatus.locked },
    data: { status: ProgressStatus.unlocked },
  });
}

/** Read the numeric `score` out of a stored attempt result JSON, defaulting to 0. */
export const scoreFromResult = (result: Prisma.JsonValue): number => {
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    const score = (result as Record<string, unknown>).score;
    if (typeof score === "number") return score;
  }
  return 0;
};

/** The learner's best score on each of the given exercises (exercises never attempted are absent). */
export async function exerciseBestsFor(
  tx: Pick<Prisma.TransactionClient, "exerciseAttempt">,
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, number>> {
  if (exerciseIds.length === 0) return {};
  const attempts = await tx.exerciseAttempt.findMany({
    where: { user_id: userId, exercise_id: { in: exerciseIds } },
    select: { exercise_id: true, result: true },
  });
  const bests: Record<string, number> = {};
  for (const attempt of attempts) {
    bests[attempt.exercise_id] = Math.max(bests[attempt.exercise_id] ?? 0, scoreFromResult(attempt.result));
  }
  return bests;
}

/**
 * Store a lesson's recomputed outcome and, when it is complete, unlock every lesson
 * that was waiting on it (the next lesson of its path, and the first lesson of any path
 * that branches from it).
 *
 * Nothing is ever downgraded: `best_score` only rises (rows written under the older
 * one-exercise rule keep their score), and a completed lesson stays completed.
 */
export async function recordLessonOutcome(
  tx: LessonProgressClient,
  userId: string,
  lessonId: string,
  completion: LessonCompletion,
): Promise<void> {
  const current = await tx.userProgress.findUnique({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
  });
  const best = Math.max(current?.best_score ?? 0, completion.score);
  await tx.userProgress.upsert({
    where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
    create: {
      user_id: userId,
      lesson_id: lessonId,
      status: completion.completed ? ProgressStatus.completed : ProgressStatus.unlocked,
      best_score: best,
      completed_at: completion.completed ? new Date() : null,
    },
    update: {
      best_score: best,
      ...(completion.completed
        ? { status: ProgressStatus.completed, completed_at: current?.completed_at ?? new Date() }
        : {}),
    },
  });
  if (!completion.completed) return;

  const [rows, completedRows] = await Promise.all([
    tx.lesson.findMany({ where: { retired_at: null }, select: { id: true, lesson_json: true } }),
    tx.userProgress.findMany({
      where: { user_id: userId, status: ProgressStatus.completed },
      select: { lesson_id: true },
    }),
  ]);
  const lessons = rows.map((row) => validateLesson(row.lesson_json));
  const completedIds = new Set(completedRows.map((row) => row.lesson_id));
  for (const lesson of lessonsUnlockedBy(lessons, lessonId, completedIds)) {
    await unlockLesson(tx, userId, lesson.id);
  }
}
