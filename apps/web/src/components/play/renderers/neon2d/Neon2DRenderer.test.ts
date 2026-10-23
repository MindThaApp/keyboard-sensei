import { describe, expect, it } from "vitest";
import { NOTES_STYLES, isNotesStyle } from "../index";
import { create } from "./Neon2DRenderer";

describe("Neon 2D notes style", () => {
  it("is registered once and selectable", () => {
    expect(NOTES_STYLES.filter((style) => style.value === "neon2d")).toHaveLength(1);
    expect(isNotesStyle("neon2d")).toBe(true);
  });

  it("resets and disposes safely before it is mounted", () => {
    const renderer = create();
    expect(() => renderer.reset()).not.toThrow();
    expect(() => renderer.dispose()).not.toThrow();
  });
});
