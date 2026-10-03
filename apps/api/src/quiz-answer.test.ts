import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  lesson: { findMany: vi.fn() },
  quizAttempt: { create: vi.fn(), findMany: vi.fn() },
  userProgress: { upsert: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

import { app } from "./app.js";
import { lessons } from "./content.js";

const lesson = lessons.find((item) => item.sections.some((section) => section.type === "quiz"))!;
const question = lesson.sections.flatMap((section) => section.type === "quiz" ? section.questions : [])[0];
const correctIndex = question.correctIndex;
if (correctIndex === undefined) throw new Error("Test quiz question has no answer key");

async function callQuizAnswer(selectedAnswer: number): Promise<unknown> {
  const router = (app as unknown as { router: { stack: any[] } }).router;
  const route = router.stack.find((layer) => layer.route?.path === "/quiz-questions/:id/answer" && layer.route.methods.post)?.route;
  if (!route) throw new Error("Quiz answer route not found");
  const handler = route.stack[0].handle;
  let status = 200;
  return new Promise((resolve, reject) => {
    const req = { params: { id: question.id }, body: { selectedAnswer }, userId: "user-1" } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(body: unknown) { resolve({ status, body }); return this; },
    } as unknown as Response;
    void handler(req, res, reject);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.lesson.findMany.mockResolvedValue([{ id: lesson.id, order: 1, lesson_json: lesson }]);
  prismaMock.quizAttempt.create.mockResolvedValue({});
  prismaMock.quizAttempt.findMany.mockResolvedValue(lesson.sections.flatMap((section) => section.type === "quiz" ? section.questions.map((item) => ({ question_id: item.id })) : []));
  prismaMock.userProgress.upsert.mockResolvedValue({});
  prismaMock.userProgress.updateMany.mockResolvedValue({ count: 0 });
});

describe("POST /quiz-questions/:id/answer", () => {
  it("does not reveal the answer key after a wrong answer", async () => {
    const wrong = (correctIndex + 1) % question.options.length;
    expect(await callQuizAnswer(wrong)).toEqual({ status: 200, body: { correct: false } });
  });

  it("returns the answer key and explanation after a correct answer", async () => {
    expect(await callQuizAnswer(correctIndex)).toEqual({
      status: 200,
      body: { correct: true, explanation: question.explanation, correctIndex },
    });
  });
});
