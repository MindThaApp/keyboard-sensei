import { describe, expect, it } from "vitest";
import { isPracticeRoute } from "./practiceRoutes";

describe("isPracticeRoute", () => {
  it("keeps the screen awake where the user plays", () => {
    for (const path of ["/lessons/abc", "/practice", "/practice/gym", "/practice/record", "/play/42", "/welcome/assessment"]) {
      expect(isPracticeRoute(path), path).toBe(true);
    }
  });

  it("lets it sleep everywhere else", () => {
    for (const path of ["/", "/learn", "/lessons", "/progress", "/settings", "/library", "/play", "/practiced", "/admin/songs"]) {
      expect(isPracticeRoute(path), path).toBe(false);
    }
  });
});
