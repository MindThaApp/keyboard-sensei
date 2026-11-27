import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MidiExercise, PerformedNote } from "@keyboard-sensei/shared-types";
import { scoreExercise } from "@keyboard-sensei/midi-engine";

const prismaMock = vi.hoisted(() => {
  const mock = {
    exercise: { findUnique: vi.fn() },
    exerciseAttempt: { create: vi.fn(), findMany: vi.fn() },
    userProgress: { upsert: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return mock;
});

vi.mock("./db.js", () => ({ prisma: prismaMock }));
vi.mock("./progression/rewards.js", () => ({
  rewardQuizAnswer: vi.fn(async () => null),
  rewardExerciseAttempt: vi.fn(async () => null),
  rewardPlayAlongAttempt: vi.fn(async () => null),
}));

import { app } from "./app.js";

const exercise: MidiExercise = {
  exerciseId: "violin-mic-test",
  tempoBpm: 120,
  difficulty: "beginner",
  simultaneityWindowMs: 100,
  timingToleranceMs: 200,
  durationTolerancePercent: 30,
  instrument: "violin",
  input: "mic-mono",
  intonationToleranceCents: 25,
  expected: [62, 64, 66, 67].map((note, i) => ({ id: `n${i}`, note, startBeat: i, durationBeats: 1, hand: "right" as const, finger: null, chordGroupId: null, voice: "melody" as const })),
};
const lesson = {
  id: "violin-mic-lesson",
  path: "classical-technical",
  level: "foundation",
  branch: "technique",
  tier: 0,
  skills: [],
  title: "Mic lesson",
  estimatedMinutes: 5,
  objectives: ["Play in tune"],
  sections: [{ type: "midi-exercise", title: "Scale", instructions: "Play", exerciseId: exercise.exerciseId }],
  unlockCriteria: { requiresLessonIds: [], minScore: 0 },
  skillRewards: {},
};
const micNotes: PerformedNote[] = [
  { note: 62, velocity: 70, startTimestampMs: 0, endTimestampMs: 450, durationMs: 450, centsOffset: 3, pitchConfidence: 0.95, source: "mic" },
  { note: 64, velocity: 72, startTimestampMs: 505, endTimestampMs: 960, durationMs: 455, centsOffset: -6, pitchConfidence: 0.92, source: "mic" },
  { note: 66, velocity: 68, startTimestampMs: 1010, endTimestampMs: 1440, durationMs: 430, centsOffset: -38, pitchConfidence: 0.9, source: "mic" },
  { note: 67, velocity: 75, startTimestampMs: 1495, endTimestampMs: 1950, durationMs: 455, centsOffset: 12, pitchConfidence: 0.88, source: "mic" },
];

function route(path: string) {
  const router = (app as unknown as { router: { stack: any[] } }).router;
  const found = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.post)?.route;
  if (!found) throw new Error(`Route ${path} not found`);
  return found.stack[0].handle as (req: Request, res: Response, next: (e: unknown) => void) => Promise<void>;
}

function call(path: string, params: Record<string, string>, body: unknown): Promise<{ status: number; body: any }> {
  let status = 200;
  return new Promise((resolve, reject) => {
    const req = { params, body, userId: "user-1" } as unknown as Request;
    const res = {
      status(code: number) { status = code; return this; },
      json(payload: unknown) { resolve({ status, body: payload }); return this; },
    } as unknown as Response;
    void route(path)(req, res, reject);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.exercise.findUnique.mockResolvedValue({ id: exercise.exerciseId, lesson_id: lesson.id, retired_at: null, exercise_json: exercise, lesson: { retired_at: null, lesson_json: lesson } });
  prismaMock.exerciseAttempt.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "attempt-1", ...(data as object) }));
  prismaMock.exerciseAttempt.findMany.mockResolvedValue([]);
  prismaMock.userProgress.findUnique.mockResolvedValue(null);
  prismaMock.userProgress.upsert.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation((work: (tx: typeof prismaMock) => unknown) => work(prismaMock));
});

describe("mic attempts", () => {
  it("keeps the cents fields through the schema and stores them with the attempt", async () => {
    const { status } = await call("/exercises/:id/attempts", { id: exercise.exerciseId }, { performedNotes: micNotes, tempoPct: 100 });
    expect(status).toBe(201);
    const data = prismaMock.exerciseAttempt.create.mock.calls[0]![0].data;
    expect(data.performed_notes).toEqual(micNotes);
  });

  it("re-scores a mic attempt exactly as the client scored it", async () => {
    const client = scoreExercise({ exercise, performedNotes: micNotes, tempoPct: 100 });
    const { body } = await call("/exercises/:id/attempts", { id: exercise.exerciseId }, { performedNotes: micNotes, tempoPct: 100 });
    const { rewards: _rewards, ...server } = body;
    expect(server).toEqual(client);
    expect(server.intonation).toMatchObject({ toleranceCents: 25, measuredNotes: 4, withinTolerancePct: 75 });
    expect(server.mistakes.map((m: { issue: string }) => m.issue)).toContain("flat");
  });

  it("scores mic notes on /practice/score too", async () => {
    const { body } = await call("/practice/score", {}, { exercise, performedNotes: micNotes, tempoPct: 100 });
    expect(body).toEqual(scoreExercise({ exercise, performedNotes: micNotes, tempoPct: 100 }));
  });

  it("rejects cents outside a semitone and a confidence above 1", async () => {
    const bad = [{ ...micNotes[0], centsOffset: 400 }];
    await expect(call("/practice/score", {}, { exercise, performedNotes: bad })).rejects.toBeTruthy();
    const bad2 = [{ ...micNotes[0], pitchConfidence: 2 }];
    await expect(call("/practice/score", {}, { exercise, performedNotes: bad2 })).rejects.toBeTruthy();
  });

  it("scores a MIDI attempt exactly as before (no mic fields, no intonation)", async () => {
    const midiNotes = micNotes.map(({ note, velocity, startTimestampMs, endTimestampMs, durationMs }) => ({ note, velocity, startTimestampMs, endTimestampMs, durationMs }));
    const { body } = await call("/practice/score", {}, { exercise, performedNotes: midiNotes });
    expect(body.intonation).toBeUndefined();
  });
});
