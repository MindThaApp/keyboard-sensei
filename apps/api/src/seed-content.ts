import { ProgressStatus, type Prisma, type PrismaClient } from "@prisma/client";
import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";

const json = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * `Lesson.order` is UNIQUE and Postgres checks that per row, mid-statement. Before
 * assigning final orders, every existing row is moved by this offset to a range no
 * final order can reach, so no intermediate state can collide. It only has to exceed
 * the largest |order| that can exist, which is bounded by the size of the content.
 */
const ORDER_PARKING_OFFSET = 1_000_000;

export interface SeedContentReport {
  upserted: number;
  deletedLessonIds: string[];
  retiredLessonIds: string[];
  deletedExerciseIds: string[];
  retiredExerciseIds: string[];
}

/**
 * Write lessons and exercises to the database in ONE transaction.
 *
 * - Order is the lesson's position in `lessons` (1-based); ids are never consulted for
 *   order, so a lesson can be inserted mid-sequence without renumbering anything.
 * - Pruning policy for rows no longer in content:
 *     * no user data references it  -> deleted;
 *     * user data references it      -> KEPT and marked `retired_at` (hidden from the
 *       course, given a negative order outside the 1..N unlock chain), with a warning.
 *   "User data" = QuizAttempt rows or meaningful UserProgress rows (anything but a
 *   locked, unscored placeholder) for a lesson, ExerciseAttempt rows for an exercise
 *   (or any exercise of a lesson). History is never deleted by a seed.
 * - Quiz questions live inside lesson_json, so a removed question simply stops being
 *   served; QuizAttempt rows that reference it are left untouched as history.
 * - A retired row that reappears in content is revived (`retired_at` cleared).
 */
export async function seedContent(
  prisma: PrismaClient,
  lessons: Lesson[],
  exercises: MidiExercise[],
  log: Pick<Console, "warn"> = console,
): Promise<SeedContentReport> {
  const lessonIds = lessons.map((lesson) => lesson.id);
  if (new Set(lessonIds).size !== lessonIds.length) throw new Error("Duplicate lesson ids in content");
  const exerciseIds = exercises.map((exercise) => exercise.exerciseId);
  if (new Set(exerciseIds).size !== exerciseIds.length) throw new Error("Duplicate exercise ids in content");

  const ownerOf = new Map<string, string>();
  for (const exercise of exercises) {
    const owner = lessons.find((lesson) =>
      lesson.sections.some((section) => section.type === "midi-exercise" && section.exerciseId === exercise.exerciseId),
    );
    if (!owner) throw new Error(`No lesson owns ${exercise.exerciseId}`);
    ownerOf.set(exercise.exerciseId, owner.id);
  }

  return prisma.$transaction(
    async (tx) => {
      const report: SeedContentReport = {
        upserted: 0,
        deletedLessonIds: [],
        retiredLessonIds: [],
        deletedExerciseIds: [],
        retiredExerciseIds: [],
      };

      // 1. Park every existing order out of the way (see ORDER_PARKING_OFFSET).
      await tx.lesson.updateMany({ data: { order: { decrement: ORDER_PARKING_OFFSET } } });

      // 2. Upsert content lessons with their final 1-based order.
      for (const [index, lesson] of lessons.entries()) {
        const data = {
          lesson_json: json(lesson),
          path: lesson.path,
          level: lesson.level,
          branch: lesson.branch,
          tier: lesson.tier,
          skills: lesson.skills,
          order: index + 1,
          retired_at: null,
        };
        await tx.lesson.upsert({ where: { id: lesson.id }, create: { id: lesson.id, ...data }, update: data });
        report.upserted += 1;
      }

      // 3. Upsert exercises (an exercise may move between lessons; lesson_id follows content).
      for (const exercise of exercises) {
        const data = { exercise_json: json(exercise), lesson_id: ownerOf.get(exercise.exerciseId)!, retired_at: null };
        await tx.exercise.upsert({
          where: { id: exercise.exerciseId },
          create: { id: exercise.exerciseId, ...data },
          update: data,
        });
      }

      // 4. Exercises no longer in content: delete if nobody attempted them, else retire.
      const staleExercises = await tx.exercise.findMany({
        where: { id: { notIn: exerciseIds } },
        select: { id: true, retired_at: true, _count: { select: { attempts: true } } },
      });
      for (const stale of staleExercises) {
        if (stale._count.attempts === 0) {
          await tx.exercise.delete({ where: { id: stale.id } });
          report.deletedExerciseIds.push(stale.id);
        } else {
          if (!stale.retired_at) await tx.exercise.update({ where: { id: stale.id }, data: { retired_at: new Date() } });
          report.retiredExerciseIds.push(stale.id);
        }
      }

      // 5. Lessons no longer in content: same policy, and retired ones get orders -1, -2, ...
      const staleLessons = await tx.lesson.findMany({
        where: { id: { notIn: lessonIds } },
        orderBy: { order: "asc" },
        select: {
          id: true,
          retired_at: true,
          _count: {
            select: {
              // A never-reached placeholder row (locked, unscored, never completed — e.g.
              // the demo user's seeded rows) records nothing about the user; it's
              // cascade-deleted with the lesson rather than keeping the lesson alive.
              progress: {
                where: {
                  OR: [{ status: { not: ProgressStatus.locked } }, { best_score: { gt: 0 } }, { completed_at: { not: null } }],
                },
              },
              quiz_attempts: true,
              exercises: true,
            },
          },
        },
      });
      let retiredOrder = 0;
      for (const stale of staleLessons) {
        // Any exercise still attached here survived step 4 only because it has attempts.
        const referenced = stale._count.progress + stale._count.quiz_attempts + stale._count.exercises > 0;
        if (!referenced) {
          await tx.lesson.delete({ where: { id: stale.id } });
          report.deletedLessonIds.push(stale.id);
        } else {
          retiredOrder -= 1;
          await tx.lesson.update({
            where: { id: stale.id },
            data: { order: retiredOrder, retired_at: stale.retired_at ?? new Date() },
          });
          report.retiredLessonIds.push(stale.id);
        }
      }

      if (report.retiredLessonIds.length > 0 || report.retiredExerciseIds.length > 0) {
        log.warn(
          `Content pruning: kept and retired rows that user data still references — ` +
            `lessons [${report.retiredLessonIds.join(", ")}], exercises [${report.retiredExerciseIds.join(", ")}]. ` +
            `They are hidden from the course but their history is preserved.`,
        );
      }
      return report;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
