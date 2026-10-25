// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EXPERIENCE_STORAGE_KEY,
  ExperienceProvider,
} from "../../contexts/ExperienceContext";
import { isBeginnerOpening, useBeginnerOpening } from "./beginnerOpening";

describe("beginner opening", () => {
  beforeEach(() => localStorage.clear());

  it("follows the onboarding answer only", () => {
    expect(isBeginnerOpening("simple")).toBe(true);
    expect(isBeginnerOpening("advanced")).toBe(false);
    expect(isBeginnerOpening(null)).toBe(false);
    expect(isBeginnerOpening(undefined)).toBe(false);
  });

  it("reads the stored onboarding answer", () => {
    localStorage.setItem(EXPERIENCE_STORAGE_KEY, "advanced");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExperienceProvider>{children}</ExperienceProvider>
    );
    expect(
      renderHook(() => useBeginnerOpening(), { wrapper }).result.current,
    ).toBe(false);
    localStorage.setItem(EXPERIENCE_STORAGE_KEY, "simple");
    expect(
      renderHook(() => useBeginnerOpening(), { wrapper }).result.current,
    ).toBe(true);
  });
});
