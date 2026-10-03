import { ProgressStatus, type Prisma } from "@prisma/client";

type ProgressClient = Pick<Prisma.TransactionClient, "userProgress">;

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
