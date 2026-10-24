// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { id: string } | null = null;
vi.mock("./AuthContext", () => ({ useAuth: () => ({ user: currentUser }) }));
vi.mock("../services/api", () => ({
  // Offline: saves fail, so a choice stays pending.
  updateExperienceMode: vi.fn(() => Promise.reject(new Error("offline"))),
  getCurrentUser: vi.fn(() => new Promise(() => undefined)),
}));

const { EXPERIENCE_PENDING_KEY, ExperienceProvider, useExperience } = await import("./ExperienceContext");
const { default: ExperienceSync } = await import("./ExperienceSync");

let choose: (mode: "simple" | "advanced") => void = () => undefined;
function Chooser() {
  choose = useExperience().setExperience;
  return null;
}
const tree = () => (
  <ExperienceProvider>
    <ExperienceSync />
    <Chooser />
  </ExperienceProvider>
);

describe("ExperienceSync", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    currentUser = null;
  });

  it("drops an unsaved choice when its account signs out", async () => {
    currentUser = { id: "a" };
    const view = render(tree());
    await act(async () => choose("advanced"));
    expect(localStorage.getItem(EXPERIENCE_PENDING_KEY)).toBe("1");

    currentUser = null;
    await act(async () => view.rerender(tree()));
    expect(localStorage.getItem(EXPERIENCE_PENDING_KEY)).toBeNull();
  });

  it("keeps a choice made before anyone signed in, for the new account", async () => {
    const view = render(tree());
    await act(async () => choose("advanced"));
    await act(async () => view.rerender(tree()));
    expect(localStorage.getItem(EXPERIENCE_PENDING_KEY)).toBe("1");
  });
});
