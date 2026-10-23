import { describe, expect, it } from "vitest";
import { getGlossaryEntry, glossary, levelTitle } from "./glossary";

describe("glossary", () => {
  it("looks entries up by key", () => {
    expect(getGlossaryEntry("waitMode")?.plain).toBe("Wait for me");
    expect(getGlossaryEntry("nope")).toBeUndefined();
  });

  it("gives every entry plain wording", () => {
    for (const entry of Object.values(glossary)) expect(entry.plain.length).toBeGreaterThan(0);
  });

  it("titles levels without the tier counter and renames Novice", () => {
    expect(levelTitle(1, "Novice")).toBe("Level 1 · Beginner");
    expect(levelTitle(8, "Apprentice")).toBe("Level 8 · Apprentice");
  });
});
