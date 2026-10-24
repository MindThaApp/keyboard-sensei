// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PracticeResultSheet, { submitStateForError, type FinishedRun } from "./PracticeResultSheet";
import { ApiError } from "../../services/api";

const finished = {
  result: { judgments: ["perfect", "perfect"], accuracyPct: 100, wrongPressCount: 0 },
  liveJudgments: [],
  run: { bars: [{ timeS: 0, barIndex: 0 }], notes: [{ startS: 0 }, { startS: 1 }], loop: null },
  waitMode: false,
  level: "easy",
  hands: "both",
  tempoPct: 100,
  score: 1000,
  grade: "A",
  multiplier: 1,
  loopNote: null,
} as unknown as FinishedRun;

const renderSheet = (submitState: Parameters<typeof PracticeResultSheet>[0]["submitState"]) =>
  render(
    <PracticeResultSheet
      open
      onClose={() => undefined}
      finished={finished}
      submitState={submitState}
      harderRung={null}
      easierRung={null}
      onPlayAgain={() => undefined}
      onPlayForStars={() => undefined}
      onTryWait={() => undefined}
      onStepLadder={() => undefined}
      onLoopBars={() => undefined}
    />,
  );

describe("submitStateForError", () => {
  it("treats a 404 (song retired mid-session) as final, anything else as a failed save", () => {
    expect(submitStateForError(new ApiError("Not found", 404, "NOT_FOUND"))).toBe("retired");
    expect(submitStateForError(new ApiError("Boom", 500))).toBe("failed");
    expect(submitStateForError(new TypeError("Failed to fetch"))).toBe("failed");
  });
});

describe("PracticeResultSheet save status", () => {
  it("says the song is no longer available on a retired song, and still shows the result", () => {
    renderSheet("retired");
    expect(screen.getByRole("status").textContent).toBe("This song is no longer available, so this result wasn't saved.");
    expect(screen.queryByText("Couldn't save this run")).toBeNull();
    expect(screen.getByText("Your result")).toBeTruthy();
  });

  it("keeps the generic message for other failures", () => {
    renderSheet("failed");
    expect(screen.getByRole("status").textContent).toBe("Couldn't save this run");
  });
});
