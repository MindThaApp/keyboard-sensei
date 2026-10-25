import { useExperienceMode } from "../../contexts/ExperienceContext";

/**
 * Whether a song should open with the gentle beginner defaults (slower tempo, wait mode,
 * one rung up after a pass). The signal is the answer the user gave at onboarding, kept
 * as the stored experience value. It only picks starting defaults; it never hides or
 * disables a control.
 */
export function isBeginnerOpening(
  onboardingAnswer: string | null | undefined,
): boolean {
  return onboardingAnswer === "simple";
}

export function useBeginnerOpening(): boolean {
  return isBeginnerOpening(useExperienceMode());
}
