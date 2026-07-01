import type { AssessmentPlacement, AuthResponse, AuthUser, ExerciseAttemptPayload, LessonDetail, LessonListItem, MidiExercise, QuizAnswerPayload, QuizAnswerResponse, ScoringResult, UserProgress } from "@keyboard-sensei/shared-types";

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
export const submitExerciseAttempt = (exerciseId: string, payload: ExerciseAttemptPayload) => request<ScoringResult>(`/exercises/${encodeURIComponent(exerciseId)}/attempts`, { method: "POST", body: JSON.stringify(payload) });
export const submitQuizAnswer = (questionId: string, payload: QuizAnswerPayload) => request<QuizAnswerResponse>(`/quiz-questions/${encodeURIComponent(questionId)}/answer`, { method: "POST", body: JSON.stringify(payload) });
export const submitPracticeGymAttempt = (exercise: MidiExercise, payload: ExerciseAttemptPayload) => request<ScoringResult>("/practice/score", { method: "POST", body: JSON.stringify({ exercise, ...payload }) });
export const applyAssessmentPlacement = (scores: number[]) => request<AssessmentPlacement>("/users/me/assessment-placement", { method: "POST", body: JSON.stringify({ scores }) });
export const getCurrentUser = () => request<AuthUser>("/users/me");
export const updateProfile = (display_name: string) => request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ display_name }) });
export const changePassword = (currentPassword: string, newPassword: string) => request<{ ok: true }>("/users/me/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
