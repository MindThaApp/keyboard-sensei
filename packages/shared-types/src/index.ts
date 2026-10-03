export type LearningPathId = "classical-technical" | "modern-chords" | "sightreading-intensive";
export type LevelId = "foundation" | "elementary" | "intermediate" | "late-intermediate" | "advanced" | "virtuoso";
export type BranchId = "technique" | "theory" | "repertoire";

export interface MarkdownSection { type: "markdown"; title: string; body: string }
export interface TheoryCardSection { type: "theory-card"; title: string; body: string }
export interface ContentRightsMetadata {
  workTitle: string;
  composer: string;
  status: "original" | "public-domain" | "licensed-copyright";
  copyrightHolder: string | null;
  licenseReference: string | null;
}
export interface NotationSection { type: "notation"; title?: string; vexflowData: Record<string, unknown>; contentRights?: ContentRightsMetadata }
export interface MidiExerciseSection { type: "midi-exercise"; title: string; instructions: string; exerciseId: string }
/** correctIndex is present in authored/stored content but stripped from API lesson payloads (answers are validated server-side). */
export interface QuizQuestion { id: string; prompt: string; options: string[]; correctIndex?: number; explanation: string }
export interface QuizSection { type: "quiz"; questions: QuizQuestion[] }
export type LessonSection = MarkdownSection | TheoryCardSection | NotationSection | MidiExerciseSection | QuizSection;
export interface Lesson { id: string; path: LearningPathId; level: LevelId; branch: BranchId; title: string; estimatedMinutes: number; objectives: string[]; sections: LessonSection[]; unlockCriteria: { requiresLessonIds: string[]; minScore: number }; skillRewards: Record<string, number> }

export interface ExpectedNoteEvent { id: string; note: number; startBeat: number; durationBeats: number; hand: "left" | "right" | "both"; finger: number | null; chordGroupId: string | null; voice: "melody" | "bass" | "inner" | "chord" | null }
/** A key on the circle of fifths: +n sharps / -n flats. On an exercise, its signature is drawn and notes are spelled for it. */
export interface ExerciseKey { fifths: number; mode: "major" | "minor" }
/** scoring "untimed" = only pitches (and chord togetherness) are scored — for find-the-notes drills with no pulse. Default "timed". */
/**
 * Opt-in dynamics scoring, for exercises whose lesson promises it. `evenVolume`:
 * every note at the same loudness. `balancedChords`: the tones of each chord at
 * the same loudness. Velocity is never scored unless an exercise asks for it.
 */
export interface ExerciseDynamics { evenVolume?: boolean; balancedChords?: boolean }
export interface MidiExercise { exerciseId: string; tempoBpm: number; difficulty: "beginner" | "intermediate" | "advanced"; simultaneityWindowMs: number; timingToleranceMs: number; durationTolerancePercent: number; scoring?: "timed" | "untimed"; beatsPerBar?: number; beatUnit?: number; keySignature?: ExerciseKey; dynamics?: ExerciseDynamics; expected: ExpectedNoteEvent[] }
/** Practice tempo as a percentage of the exercise's authored tempoBpm. Continuous
 * since 2026-07-12 (was the literal union 25|50|75|100) — the UI is now a real
 * 25-200 BPM slider. The API accepts [10, 250]. */
export type ExerciseTempoPct = number;
export interface RawMidiEvent { note: number; velocity: number; type: "noteon" | "noteoff"; timestampMs: number }
export interface PerformedNote { note: number; velocity: number; startTimestampMs: number; endTimestampMs: number | null; durationMs: number | null }
export type ScoringIssue = "wrong" | "missed" | "extra" | "early" | "late" | "missing-chord-tone" | "extra-chord-tone" | "uneven-hand-timing" | "held-too-short" | "held-too-long" | "duration-unknown";
export interface ScoringMistake { noteId: string | null; expectedNote: number | null; performedNote: number | null; chordGroupId: string | null; issue: ScoringIssue }
/**
 * How evenly the notes were played, for exercises that opt in (see ExerciseDynamics).
 * Velocities are MIDI 1-127. Each score is 0-100; null when there was nothing to measure.
 */
export interface DynamicsResult {
  /** Standard deviation of the matched notes' velocities. */
  velocitySpread: number;
  /** Mean velocity of the matched notes. */
  meanVelocity: number;
  evenness: number | null;
  /** Mean loudest-minus-softest velocity within a chord. */
  chordVelocityRange: number | null;
  chordBalance: number | null;
  /** The dynamics part of the score: the mean of whichever of the two was asked for. */
  score: number;
}
export interface ScoringResult { score: number; noteAccuracy: number; timingAccuracy: number; rhythmAccuracy: number; chordAccuracy: number; feedback: string[]; mistakes: ScoringMistake[]; dynamics?: DynamicsResult }
export interface MidiDeviceInfo { id: string; name: string; manufacturer?: string }
/**
 * A source of MIDI input. Every `on*` registration returns its own unsubscribe
 * function, and any number of listeners may be registered at once. All
 * timestamps share one monotonic millisecond clock chosen by the adapter's owner.
 */
export interface MidiAdapter {
  connect(): Promise<void>;
  disconnect(): void;
  listDevices(): MidiDeviceInfo[];
  onNoteOn(cb: (note: number, velocity: number, timestampMs: number) => void): () => void;
  onNoteOff(cb: (note: number, timestampMs: number) => void): () => void;
  onControlChange(cb: (controller: number, value: number, timestampMs: number) => void): () => void;
}

export type LessonStatus = "locked" | "unlocked" | "completed";
export interface LessonProgress { lessonId: string; status: LessonStatus; bestScore: number; completedAt: string | null }
export interface UserProgress {
  completedLessonIds: string[];
  bestScores: Record<string, number>;
  lessonStatuses: LessonProgress[];
}
export interface LessonListItem extends Lesson { order: number; progress: LessonProgress }
/** `exerciseBests`: the learner's best score per exercise in this lesson (absent = never attempted). */
export interface LessonDetail { lesson: Lesson; progress: LessonProgress | null; exercises: MidiExercise[]; exerciseBests: Record<string, number> }
/** `daily_goal_minutes` / `timezone` come with GET and PATCH /users/me (not with login). */
export interface AuthUser { id: string; email: string; display_name: string; narration_voice_id: string | null; role: "user" | "admin"; daily_goal_minutes?: number; timezone?: string | null }
export interface AuthResponse { accessToken: string; user: AuthUser }
export interface AssessmentPlacement { completedLessonCount: number; placementScore: number }
export interface AssessmentPlacementPayload { scores: number[] }
export interface ExerciseAttemptPayload { rawEvents?: RawMidiEvent[]; performedNotes?: PerformedNote[]; tempoPct?: ExerciseTempoPct }
export interface QuizAnswerPayload { selectedAnswer: number }
export interface QuizAnswerResponse { correct: boolean; explanation?: string; correctIndex?: number }
export interface AttemptSummary { id: string; exerciseId: string; lessonId: string; lessonTitle: string; score: number; createdAt: string }
export interface AttemptsResponse { attempts: AttemptSummary[] }
export interface ApiErrorResponse { error: { code: string; message: string; details?: unknown } }
