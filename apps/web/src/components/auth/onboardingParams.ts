/** Onboarding state that has to survive a refresh lives in the URL, not in component state. */

export type OnboardingSource = "demo" | "signup";

export function parseSourceParam(value: string | null): OnboardingSource {
  return value === "demo" ? "demo" : "signup";
}

/** Placement scores are 0–100 integers; anything else in the query string is dropped. */
export function parseScoresParam(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => Number(part))
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100)
    .map((score) => Math.round(score));
}

/** What the learner plays on; it only changes the wording of the guided first steps. */
export type OnboardingDevice = "screen" | "plugged" | "bluetooth";

export function parseDeviceParam(value: string | null): OnboardingDevice {
  return value === "plugged" || value === "bluetooth" ? value : "screen";
}

/** "Have you played piano before?" decides the experience mode and the route. */
export type PlayedBefore = "never" | "yes";

export function experienceFor(answer: PlayedBefore): "simple" | "advanced" {
  return answer === "yes" ? "advanced" : "simple";
}

/** The Ode to Joy opening (E E F G G F E D) used by the last guided step. */
export const ODE_TO_JOY_PHRASE: readonly number[] = [64, 64, 65, 67, 67, 65, 64, 62];

export function formatScoresParam(scores: number[]): string {
  return scores.map((score) => Math.round(score)).join(",");
}
