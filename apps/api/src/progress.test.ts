import { describe, expect, it, vi } from "vitest";
import { ProgressStatus } from "@prisma/client";
import { unlockLesson } from "./progress.js";

describe("unlockLesson", () => {
  it("leaves a completed lesson unchanged", async () => {
    const userProgress = {
      upsert: vi.fn().mockResolvedValue({ status: ProgressStatus.completed }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    await unlockLesson({ userProgress } as never, "user-1", "lesson-2");

    expect(userProgress.upsert).toHaveBeenCalledWith({
      where: { user_id_lesson_id: { user_id: "user-1", lesson_id: "lesson-2" } },
      create: { user_id: "user-1", lesson_id: "lesson-2", status: ProgressStatus.unlocked },
      update: {},
    });
    expect(userProgress.updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", lesson_id: "lesson-2", status: ProgressStatus.locked },
      data: { status: ProgressStatus.unlocked },
    });
  });
});
