import type { LessonListItem, MidiExercise, OfflineContentBundle } from "@keyboard-sensei/shared-types";

/** A signed-looking token whose payload has `sub` (the signature is never checked client-side). */
export const tokenFor = (sub: string) =>
  `h.${btoa(JSON.stringify({ sub })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;

export const exercise = (exerciseId: string): MidiExercise => ({
  exerciseId,
  tempoBpm: 60,
  difficulty: "beginner",
  simultaneityWindowMs: 80,
  timingToleranceMs: 250,
  durationTolerancePercent: 50,
  scoring: "untimed",
  expected: [60, 62, 64].map((note, index) => ({
    id: `${exerciseId}-n${index}`,
    note,
    startBeat: index,
    durationBeats: 1,
    hand: "right" as const,
    finger: null,
    chordGroupId: null,
    voice: null,
  })),
});

export const bundle = (contentHash = "hash-1"): OfflineContentBundle => ({
  contentHash,
  generatedAt: "2026-11-27T00:00:00.000Z",
  lessons: [
    { lesson: { id: "lesson-01", title: "First", sections: [] } as never, order: 1, exercises: [exercise("exercise-01")] },
    { lesson: { id: "lesson-02", title: "Second", sections: [] } as never, order: 2, exercises: [exercise("exercise-02")] },
  ],
});

export const listItem = (id: string, status: "locked" | "unlocked" | "completed", order: number): LessonListItem =>
  ({ id, title: id, sections: [], order, progress: { lessonId: id, status, bestScore: status === "completed" ? 90 : 0, completedAt: null } }) as never;

export const goodNotes = [60, 62, 64].map((note, index) => ({
  note,
  velocity: 80,
  startTimestampMs: 1000 + index * 1000,
  endTimestampMs: 1800 + index * 1000,
  durationMs: 800,
}));
