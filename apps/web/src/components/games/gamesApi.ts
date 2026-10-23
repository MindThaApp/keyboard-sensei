import { API_URL, ApiError, getToken } from "../../services/api";
import type { GameConfig } from "./noteReadingDeck";

export interface RoundPayload {
  correct: number;
  total: number;
  median_ms: number;
  seconds: number;
  config: GameConfig;
  slowest: { note: string; medianMs: number }[];
}

export interface RoundResponse {
  id: string;
  xpGained: number;
  skill: { id: "reading"; pointsToday: number; pointsGainedNow: number; dailyCap: number; correctPerPoint: number; total: number };
}

export interface NoteReadingSummary {
  readingPoints: number;
  correctToday: number;
  pointsToday: number;
  dailyCap: number;
  lastPlayedAt: string | null;
  lastSlowest: { note: string; medianMs: number }[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`, response.status, body?.error?.code);
  return body as T;
}

export const saveNoteReadingRound = (payload: RoundPayload) =>
  call<RoundResponse>("/games/note-reading/rounds", { method: "POST", body: JSON.stringify(payload) });

export const getNoteReadingSummary = () => call<NoteReadingSummary>("/games/note-reading/summary");
