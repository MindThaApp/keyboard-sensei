import { create } from "zustand";
import type { ExerciseAttemptPayload, LessonListItem, MidiExercise, QuizAnswerPayload, QuizAnswerResponse, ScoringResult, UserProgress } from "@keyboard-sensei/shared-types";
import * as api from "../services/api";

interface ProgressState {
  lessons: LessonListItem[]; progress: UserProgress | null; loaded: boolean; loading: boolean; error: string | null;
  loadAll(): Promise<void>; submitExercise(id: string, payload: ExerciseAttemptPayload): Promise<ScoringResult>;
  submitPracticeGym(exercise: MidiExercise, payload: ExerciseAttemptPayload): Promise<ScoringResult>;
  submitQuiz(id: string, payload: QuizAnswerPayload): Promise<QuizAnswerResponse>; reset(): void;
}
export const useProgressStore = create<ProgressState>((set) => ({
  lessons: [], progress: null, loaded: false, loading: false, error: null,
  loadAll: async () => { set({ loading: true, error: null }); try { const [lessons, progress] = await Promise.all([api.getLessons(), api.getProgress()]); set({ lessons, progress, loaded: true, loading: false }); } catch (error) { set({ loading: false, error: error instanceof Error ? error.message : "Unable to load lessons" }); } },
  submitExercise: async (id, payload) => { const result = await api.submitExerciseAttempt(id, payload); const progress = await api.getProgress(); set({ progress, lessons: (await api.getLessons()) }); return result; },
  submitPracticeGym: (exercise, payload) => api.submitPracticeGymAttempt(exercise, payload),
  // Answering the last quiz question can complete a lesson (and unlock the next one),
  // so the lesson list must be refetched too — status/Next-button UI reads it, not `progress`.
  submitQuiz: async (id, payload) => { const result = await api.submitQuizAnswer(id, payload); const [progress, lessons] = await Promise.all([api.getProgress(), api.getLessons()]); set({ progress, lessons }); return result; },
  reset: () => set({ lessons: [], progress: null, loaded: false, loading: false, error: null }),
}));
export const getLessonStatus = (_progress: UserProgress | null, lesson: LessonListItem) => lesson.progress.status;
export const getLessonBestScore = (_progress: UserProgress | null, lesson: LessonListItem) => lesson.progress.bestScore;
