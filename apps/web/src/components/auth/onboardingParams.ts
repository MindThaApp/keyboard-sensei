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

export function formatScoresParam(scores: number[]): string {
  return scores.map((score) => Math.round(score)).join(",");
}
