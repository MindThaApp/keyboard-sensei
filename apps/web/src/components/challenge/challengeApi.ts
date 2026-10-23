import type { ChallengeTier } from "@keyboard-sensei/challenge-gen";
import { API_URL, ApiError, getToken, type Rewards } from "../../services/api";
import { publishRewards } from "../../state/rewards";

/** The daily challenge routes (apps/api/src/challenge/router.ts). */

export interface ChallengeTierState {
  tier: ChallengeTier;
  name: string;
  unlocked: boolean;
  /** Lessons to finish first, when locked. */
  needs: { id: string; title: string }[];
  key: { id: string; name: string; mode: string; fifths: number };
  tempoBpm: number;
  durationSeconds: number;
  attempts: { id: string; attempt: number; score: number | null; finished: boolean }[];
  attemptsLeft: number;
  best: number | null;
  stars: number;
  cleared: boolean;
}

export interface ChallengeTodayResponse {
  date: string;
  mode: string;
  maxAttempts: number;
  clearScore: number;
  tiers: ChallengeTierState[];
}

export interface ChallengeFinishResponse {
  attempt: { id: string; attempt: number; score: number; tier: ChallengeTier; day: string };
  best: number;
  stars: number;
  cleared: boolean;
  rewards: Rewards | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`, response.status, body?.error?.code);
  return body as T;
}

export const getChallengeToday = () => request<ChallengeTodayResponse>("/challenge/today");

/** Uses up one of the tier's attempts for `date` (the learner's today). */
export const startChallengeAttempt = (date: string, tier: ChallengeTier) =>
  request<{ id: string; attempt: number; attemptsLeft: number; key: string }>("/challenge/attempts", {
    method: "POST",
    body: JSON.stringify({ date, tier }),
  });

export const finishChallengeAttempt = async (id: string, score: number, accuracy: number) => {
  const result = await request<ChallengeFinishResponse>(`/challenge/attempts/${encodeURIComponent(id)}/finish`, {
    method: "POST",
    body: JSON.stringify({ score, accuracy }),
  });
  publishRewards(result.rewards);
  return result;
};
