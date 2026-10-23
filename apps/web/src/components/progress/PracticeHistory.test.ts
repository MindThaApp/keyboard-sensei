import { describe, expect, it } from "vitest";
import { playAlongStats } from "./PracticeHistory";

describe("playAlongStats", () => {
  it("counts wait-for-me runs as runs but never as a best or in accuracy", () => {
    const stats = playAlongStats([
      { score: 82.4, accuracy: 90, wait_mode: false },
      { score: 0, accuracy: 0, wait_mode: true },
      { score: 70, accuracy: 80, wait_mode: false },
    ]);
    expect(stats).toEqual({ runs: 3, best: 82, averageAccuracy: 85 });
  });

  it("has no best or accuracy when every run was wait-for-me", () => {
    expect(playAlongStats([{ score: 0, accuracy: 0, wait_mode: true }])).toEqual({ runs: 1, best: null, averageAccuracy: null });
  });
});
