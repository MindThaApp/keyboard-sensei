import type { AssessmentPlacement, AttemptsResponse, AuthResponse, AuthUser, ExerciseAttemptPayload, LessonDetail, LessonListItem, MidiExercise, QuizAnswerPayload, QuizAnswerResponse, ScoringResult, UserProgress } from "@keyboard-sensei/shared-types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const TOKEN_KEY = "keyboard-sensei-access-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  return body as T;
}

export const login = (email: string, password: string) => request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (email: string, password: string, display_name: string) => request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify({ email, password, display_name }) });
export const getLessons = () => request<LessonListItem[]>("/lessons");
export const getLesson = (id: string) => request<LessonDetail>(`/lessons/${encodeURIComponent(id)}`);
export const getProgress = () => request<UserProgress>("/users/me/progress");
export const getAttempts = () => request<AttemptsResponse>("/users/me/attempts");
export const submitExerciseAttempt = (exerciseId: string, payload: ExerciseAttemptPayload) => request<ScoringResult>(`/exercises/${encodeURIComponent(exerciseId)}/attempts`, { method: "POST", body: JSON.stringify(payload) });
export const submitQuizAnswer = (questionId: string, payload: QuizAnswerPayload) => request<QuizAnswerResponse>(`/quiz-questions/${encodeURIComponent(questionId)}/answer`, { method: "POST", body: JSON.stringify(payload) });
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
}
export const submitFeedback = (type: FeedbackType, message: string, page_path: string) =>
  request<{ ok: true }>("/feedback", { method: "POST", body: JSON.stringify({ type, message, page_path }) });
export const getAdminFeedback = (status: "open" | "resolved" | "all") =>
  request<{ feedback: FeedbackItem[] }>(`/admin/feedback?status=${status}`);
export const setFeedbackStatus = (id: string, status: "open" | "resolved") =>
  request<{ id: string; status: string }>(`/admin/feedback/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });

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
