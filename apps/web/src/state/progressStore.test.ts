import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonListItem, UserProgress } from "@keyboard-sensei/shared-types";
import { useProgressStore } from "./progressStore";
import * as api from "../services/api";

vi.mock("../services/api");

function lesson(id: string, status: LessonListItem["progress"]["status"]): LessonListItem {
  return {
    id,
    title: id,
    level: "foundation",
    order: Number(id.slice(-1)),
    estimatedMinutes: 10,
    objectives: [],
    sections: [],
    progress: { lessonId: id, status, bestScore: 0, completedAt: null },
  } as unknown as LessonListItem;
}

const EMPTY_PROGRESS = { completedLessonIds: [], lessons: [] } as unknown as UserProgress;

describe("progressStore.submitQuiz", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useProgressStore.getState().reset();
  });

  // A quiz-only lesson (e.g. lesson-02) is completed purely by answering its questions.
  // If the store doesn't re-fetch the lesson list, the lesson player never sees
  // status === "completed" and the "Next lesson" button never appears.
  it("refreshes the lesson list so a lesson completed by quiz shows as completed", async () => {
    useProgressStore.setState({
      lessons: [lesson("lesson-02", "unlocked"), lesson("lesson-03", "locked")],
      progress: EMPTY_PROGRESS,
      loaded: true,
    });

    vi.mocked(api.submitQuizAnswer).mockResolvedValue({
      correct: true,
      correctIndex: 0,
      explanation: "Yes",
    });
    vi.mocked(api.getProgress).mockResolvedValue(EMPTY_PROGRESS);
    vi.mocked(api.getLessons).mockResolvedValue([
      lesson("lesson-02", "completed"),
      lesson("lesson-03", "unlocked"),
    ]);

    await useProgressStore.getState().submitQuiz("q1", { selectedAnswer: 0 });

    const { lessons } = useProgressStore.getState();
    expect(lessons[0]!.progress.status).toBe("completed");
    expect(lessons[1]!.progress.status).toBe("unlocked");
  });
});
