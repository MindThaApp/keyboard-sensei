import type { PracticeHands, PracticeLevel } from "@keyboard-sensei/midi-engine";
import type { AssessmentPlacement, AttemptsResponse, AuthResponse, AuthUser, ExerciseAttemptPayload, LessonDetail, LessonListItem, MidiExercise, QuizAnswerPayload, QuizAnswerResponse, ScoringResult, UserProgress } from "@keyboard-sensei/shared-types";

import { publishRewards } from "../state/rewards";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "keyboard-sensei-access-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`, response.status);
  return body as T;
}

export const login = (email: string, password: string) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (email: string, password: string, display_name: string) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, display_name }) });
export const getLessons = () => request<LessonListItem[]>("/lessons");
export const getLesson = (id: string) => request<LessonDetail>(`/lessons/${encodeURIComponent(id)}`);
export const getProgress = () => request<UserProgress>("/users/me/progress");
export const getAttempts = () => request<AttemptsResponse>("/users/me/attempts");
// Saved attempts come back with progress rewards; publishing them here gives every
// screen that saves one the toasts and a refreshed header, for free.
export const submitExerciseAttempt = async (exerciseId: string, payload: ExerciseAttemptPayload) => {
  const result = await request<ScoringResult & { rewards?: Rewards | null }>(`/exercises/${encodeURIComponent(exerciseId)}/attempts`, { method: "POST", body: JSON.stringify(payload) });
  publishRewards(result.rewards);
  return result;
};
export const submitQuizAnswer = async (questionId: string, payload: QuizAnswerPayload) => {
  const result = await request<QuizAnswerResponse & { rewards?: Rewards | null }>(`/quiz-questions/${encodeURIComponent(questionId)}/answer`, { method: "POST", body: JSON.stringify(payload) });
  publishRewards(result.rewards);
  return result;
};
export const submitPracticeGymAttempt = (exercise: MidiExercise, payload: ExerciseAttemptPayload) => request<ScoringResult>("/practice/score", { method: "POST", body: JSON.stringify({ exercise, ...payload }) });
export const applyAssessmentPlacement = (scores: number[]) => request<AssessmentPlacement>("/users/me/assessment-placement", { method: "POST", body: JSON.stringify({ scores }) });
export const getCurrentUser = () => request<AuthUser>("/users/me");
export const updateProfile = (display_name: string) => request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ display_name }) });
export const changePassword = (currentPassword: string, newPassword: string) => request<{ ok: true }>("/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });

export const updateNarrationVoice = (narration_voice_id: string | null) => request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ narration_voice_id }) });

export interface TtsUsage { period: string; charactersUsed: number; limit: number; remaining: number; disabled: boolean }
export const getTtsUsage = () => request<TtsUsage>("/tts/usage");

export interface NarrateResponse { audioUrl: string; cached: boolean; usage: TtsUsage }
export const narrateSection = (lessonId: string, sectionIndex: number, voiceId: string) =>
  request<NarrateResponse>(`/lessons/${encodeURIComponent(lessonId)}/sections/${sectionIndex}/narrate`, {
    method: "POST",
    body: JSON.stringify({ voiceId }),
  });
export const ttsAudioUrl = (audioUrl: string) => `${API_URL}${audioUrl}`;

// --- Feedback ---
export type FeedbackType = "bug" | "idea" | "other";
export interface FeedbackItem {
  id: string;
  type: FeedbackType;
  message: string;
  page_path: string;
  user_agent: string;
  status: "open" | "resolved";
  created_at: string;
  user: { email: string; display_name: string } | null;
  has_screenshot: boolean;
}
export const submitFeedback = (type: FeedbackType, message: string, page_path: string) =>
  request<{ id: string }>("/feedback", { method: "POST", body: JSON.stringify({ type, message, page_path }) });

/**
 * Two requests by design: the message text goes in the JSON body above (never a
 * query string — it would end up in server access logs), then the raw bytes
 * attach to the created row. If the image upload fails the feedback itself is
 * already saved, which is the right way round to lose the race.
 */
export const submitFeedbackWithScreenshot = async (
  type: FeedbackType,
  message: string,
  page_path: string,
  screenshot: File | Blob,
): Promise<{ ok: true }> => {
  const { id } = await submitFeedback(type, message, page_path);
  const token = getToken();
  const response = await fetch(`${API_URL}/feedback/${encodeURIComponent(id)}/screenshot`, {
    method: "POST",
    headers: { "content-type": screenshot.type || "application/octet-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: screenshot,
  });
  const body = await response.json().catch(() => null) as ({ ok: true } & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Screenshot upload failed (${response.status}) — your feedback was still saved.`);
  return body as { ok: true };
};

export const getAdminFeedback = (status: "open" | "resolved" | "all") =>
  request<{ feedback: FeedbackItem[] }>(`/admin/feedback?status=${status}`);
export const setFeedbackStatus = (id: string, status: "open" | "resolved") =>
  request<{ id: string; status: string }>(`/admin/feedback/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });

// The screenshot route is authed (admin-only), so it can't be used as a plain
// <img src>; fetch the bytes with the bearer token and hand back a blob URL.
export const getAdminFeedbackScreenshot = async (id: string): Promise<string> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/admin/feedback/${encodeURIComponent(id)}/screenshot`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Could not load screenshot (${response.status})`);
  return URL.createObjectURL(await response.blob());
};

// --- Admin: users ---
export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "admin";
  created_at: string;
  completed_lessons: number;
  total_lessons: number;
}
export interface AdminUserProgressRow {
  lesson_id: string;
  title: string;
  order: number;
  status: "locked" | "unlocked" | "completed";
  best_score: number;
}
export const getAdminUsers = () => request<{ users: AdminUser[] }>("/admin/users");
export const updateAdminUser = (id: string, fields: Partial<{ email: string; display_name: string; role: "user" | "admin"; password: string }>) =>
  request<Pick<AdminUser, "id" | "email" | "display_name" | "role">>(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
export const deleteAdminUser = (id: string) => request<{ ok: true }>(`/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getAdminUserProgress = (id: string) =>
  request<{ progress: AdminUserProgressRow[] }>(`/admin/users/${encodeURIComponent(id)}/progress`);
export const setAdminUserProgress = (id: string, lessonId: string, status: AdminUserProgressRow["status"], best_score?: number) =>
  request<{ lesson_id: string; status: string; best_score: number }>(
    `/admin/users/${encodeURIComponent(id)}/progress/${encodeURIComponent(lessonId)}`,
    { method: "PUT", body: JSON.stringify({ status, ...(best_score !== undefined ? { best_score } : {}) }) },
  );

// --- Songs / play-along ---
export type SongGenre = "classical" | "pop" | "film" | "game" | "jazz" | "other";
export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: SongGenre;
  difficulty: number;
  duration_sec: number;
  note_count: number;
  content_rights: string;
  notation_path: string | null;
  mine: boolean;
  /** Curated collection for the /play shelves; null for everything else. */
  collection: "beginner" | "essentials" | null;
  /** Versions of one piece at different difficulty levels share a group (the Essentials pack). */
  arrangement_group?: string | null;
  /** "beginner" | "intermediate" | "full" for an Essentials version; null otherwise. */
  arrangement_level?: string | null;
}
export interface ArchiveEntryResult {
  id: string;
  title: string;
  composer: string;
  duration_sec: number;
  note_count: number;
  difficulty: number;
}
export interface PlayAlongAttemptSummary {
  id: string;
  song_id: string;
  title: string;
  artist: string;
  score: number;
  accuracy: number;
  tempo_pct: number;
  tempo_bpm: number | null;
  lookahead_s: number;
  wait_mode: boolean;
  arrangement_level: PracticeLevel;
  hands: PracticeHands;
  loop_start_bar: number | null;
  loop_end_bar: number | null;
  multiplier: number | null;
  is_loop: boolean;
  created_at: string;
}
export interface PlayAlongBest {
  score: number;
  accuracy: number;
}
/** What a play-along run reports. Bars are 1-based and inclusive. */
export interface PlayAlongAttemptPayload {
  score: number;
  accuracy: number;
  tempo_pct: number;
  tempo_bpm?: number | null;
  lookahead_s: number;
  wait_mode: boolean;
  arrangement_level: PracticeLevel;
  hands: PracticeHands;
  loop_start_bar: number | null;
  loop_end_bar: number | null;
  multiplier: number;
  is_loop: boolean;
}
export const getSongs = () => request<{ songs: Song[] }>("/songs");
export const searchArchive = (q: string, offset = 0, limit = 30) =>
  request<{ results: ArchiveEntryResult[] }>(`/archive/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`);

export const importArchiveEntry = (id: string) =>
  request<{ id: string; title: string; artist: string }>(`/archive/${encodeURIComponent(id)}/import`, { method: "POST" });
export const deleteSong = (id: string) => request<{ ok: true }>(`/songs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const updateSong = (id: string, fields: Partial<{ title: string; artist: string; genre: SongGenre }>) =>
  request<Song>(`/songs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
export const adminUpdateSong = (id: string, fields: Partial<{ title: string; artist: string; genre: SongGenre; difficulty: number }>) =>
  request<Song>(`/admin/songs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
export const adminDeleteSong = (id: string) => request<{ ok: true }>(`/admin/songs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getMyPlayAlongAttempts = () =>
  request<{
    /** Best scored whole-song run per song, any level. Loop runs never count. */
    bests: Record<string, PlayAlongBest>;
    bests_by_level: Record<string, Partial<Record<PracticeLevel, PlayAlongBest>>>;
    recent: PlayAlongAttemptSummary[];
  }>("/songs/attempts/me");
export const submitPlayAlongAttempt = async (songId: string, payload: PlayAlongAttemptPayload) => {
  const result = await request<{ id: string; score: number; accuracy: number; rewards?: Rewards | null }>(`/songs/${encodeURIComponent(songId)}/attempts`, { method: "POST", body: JSON.stringify(payload) });
  publishRewards(result.rewards);
  return result;
};

// --- Progression: XP, stars, daily goal, achievements, Today ---
export type { PracticeLevel };
export type Hands = PracticeHands;
export interface LevelInfo {
  totalXp: number;
  level: number;
  tier: string;
  levelInTier: number;
  title: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
}
export interface GoalStreak {
  current: number;
  longest: number;
  freezesAvailable: number;
  frozenDays: string[];
  todayMet: boolean;
  daysToNextFreeze: number;
}
export interface DailySummary {
  today: string;
  dailyGoal: { goalMinutes: number; minutesToday: number; met: boolean };
  streak: GoalStreak;
  level: LevelInfo;
}
export type AchievementCategory = "lessons" | "paths" | "songs" | "streaks" | "practice" | "accuracy" | "exploration" | "mastery";
export interface Achievement {
  key: string;
  category: AchievementCategory;
  title: string;
  description: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number };
}
export interface Rewards {
  xpGained: number;
  items: { amount: number; reason: string }[];
  level: LevelInfo;
  leveledUp: boolean;
  newAchievements: { key: string; title: string; description: string; category: AchievementCategory; categoryLabel: string }[];
  newStars: { kind: "lesson" | "song"; id: string; title: string; stars: number; level?: PracticeLevel }[];
  unlockedSongs: { id: string; title: string; lessonTitle: string }[];
  dailyGoal: { goalMinutes: number; minutesToday: number; met: boolean; justMet: boolean };
  streak: { current: number; freezesAvailable: number };
}
export interface SongStars {
  best: number;
  byLevel: Partial<Record<PracticeLevel, number>>;
}
export interface ReadySong {
  songId: string;
  title: string;
  lessonId: string;
  lessonTitle: string;
  stars: number;
}
export interface TodayResponse extends DailySummary {
  completedLessons: number;
  continue: {
    lessonId: string;
    lessonTitle: string;
    path: string;
    exerciseId: string | null;
    exerciseTitle: string | null;
    exercisesPassed: number;
    exercisesTotal: number;
    started: boolean;
  } | null;
  review: {
    exerciseId: string;
    exerciseTitle: string;
    lessonId: string;
    lessonTitle: string;
    lastScore: number;
    bestScore: number;
    daysSince: number;
    intervalDays: number;
    mistakeCount: number;
    hint: string | null;
  } | null;
  song: { songId: string; title: string; reason: string; hands: Hands; level: PracticeLevel; stars: number } | null;
  readyForYou: ReadySong[];
  recentAchievements: Achievement[];
}
export type SkillId = "reading" | "rhythm" | "technique" | "chords" | "ear" | "repertoire";
export interface ProgressionResponse extends DailySummary {
  achievements: Achievement[];
  categories: Record<AchievementCategory, string>;
  skills: { id: SkillId; label: string; points: number }[];
  lessonStars: Record<string, number>;
  songStars: Record<string, SongStars>;
  songTitles: Record<string, string>;
  readyForYou: ReadySong[];
  practiceMinutes: number;
  calendar: { day: string; minutes: number; goalMet: boolean }[];
  frozenDays: string[];
  recentXp: { amount: number; reason: string; source: string; created_at: string }[];
}
export const DAILY_GOAL_OPTIONS = [5, 10, 15, 20] as const;
export type DailyGoalMinutes = (typeof DAILY_GOAL_OPTIONS)[number];

export const getDailySummary = () => request<DailySummary>("/users/me/summary");
export const getToday = () => request<TodayResponse>("/users/me/today");
export const getProgression = () => request<ProgressionResponse>("/users/me/progression");
export const getMySongStars = () => request<{ stars: Record<string, SongStars> }>("/songs/stars/me");
export const getSongStars = (songId: string) =>
  request<{ songId: string } & SongStars>(`/songs/${encodeURIComponent(songId)}/stars`);
export const updateDailyGoal = (daily_goal_minutes: DailyGoalMinutes) =>
  request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ daily_goal_minutes }) });
export const updateTimezone = (timezone: string) =>
  request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ timezone }) });

export const getSongFile = async (id: string): Promise<ArrayBuffer> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/songs/${encodeURIComponent(id)}/file`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Could not load song file (${response.status})`);
  return response.arrayBuffer();
};

export const getSongNotationFile = async (id: string): Promise<ArrayBuffer | null> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/songs/${encodeURIComponent(id)}/notation`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load notation (${response.status})`);
  return response.arrayBuffer();
};

export const uploadSong = async (
  file: File | Blob,
  meta: { title: string; artist: string; genre: SongGenre; source_url?: string; origin?: "upload" | "recording" },
): Promise<Song> => {
  const token = getToken();
  const params = new URLSearchParams({ title: meta.title, artist: meta.artist, genre: meta.genre });
  if (meta.source_url) params.set("source_url", meta.source_url);
  if (meta.origin) params.set("origin", meta.origin);
  const response = await fetch(`${API_URL}/songs/upload?${params}`, {
    method: "POST",
    headers: { "content-type": "audio/midi", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = await response.json().catch(() => null) as (Song & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  return body as Song;
};

export interface UrlPreview {
  bytes: ArrayBuffer;
  durationSec: number;
  noteCount: number;
  difficulty: number;
}

export const fetchUrlPreview = async (url: string): Promise<UrlPreview> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/songs/fetch-url-preview`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Could not fetch that URL (${response.status})`);
  }
  return {
    bytes: await response.arrayBuffer(),
    durationSec: Number(response.headers.get("x-song-duration-sec") ?? 0),
    noteCount: Number(response.headers.get("x-song-note-count") ?? 0),
    difficulty: Number(response.headers.get("x-song-difficulty") ?? 1),
  };
};

export const createAdminUser = (fields: { email: string; display_name: string; password: string; role: "user" | "admin" }) =>
  request<Pick<AdminUser, "id" | "email" | "display_name" | "role">>("/admin/users", { method: "POST", body: JSON.stringify(fields) });

// --- Instruments (sampled voices) ---
export type InstrumentCategory = "piano" | "keys" | "more";
export interface InstrumentInfo {
  id: string;
  name: string;
  description: string;
  category: InstrumentCategory;
  content_rights: string;
  source_url: string | null;
  mine: boolean;
  created_at: string;
}
export const getInstruments = () => request<{ instruments: InstrumentInfo[] }>("/instruments");
export const deleteInstrument = (id: string) => request<{ ok: true }>(`/instruments/${encodeURIComponent(id)}`, { method: "DELETE" });
export const uploadInstrument = async (
  file: File | Blob,
  meta: { name: string; description: string; category: InstrumentCategory },
): Promise<InstrumentInfo> => {
  const token = getToken();
  const params = new URLSearchParams({ name: meta.name, description: meta.description, category: meta.category });
  const response = await fetch(`${API_URL}/instruments/upload?${params}`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = await response.json().catch(() => null) as (InstrumentInfo & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  return body as InstrumentInfo;
};
export const importInstrumentFromUrl = (fields: { url: string; name: string; description: string; category: InstrumentCategory }) =>
  request<InstrumentInfo>("/instruments/import-url", { method: "POST", body: JSON.stringify(fields) });
