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
export interface QuizQuestion { id: string; prompt: string; options: string[]; correctIndex: number; explanation: string }
export interface QuizSection { type: "quiz"; questions: QuizQuestion[] }
export type LessonSection = MarkdownSection | TheoryCardSection | NotationSection | MidiExerciseSection | QuizSection;
export interface Lesson { id: string; path: LearningPathId; level: LevelId; branch: BranchId; title: string; estimatedMinutes: number; objectives: string[]; sections: LessonSection[]; unlockCriteria: { requiresLessonIds: string[]; minScore: number }; skillRewards: Record<string, number> }

export interface ExpectedNoteEvent { id: string; note: number; startBeat: number; durationBeats: number; hand: "left" | "right" | "both"; finger: number | null; chordGroupId: string | null; voice: "melody" | "bass" | "inner" | "chord" | null }
export interface MidiExercise { exerciseId: string; tempoBpm: number; difficulty: "beginner" | "intermediate" | "advanced"; simultaneityWindowMs: number; timingToleranceMs: number; durationTolerancePercent: number; expected: ExpectedNoteEvent[] }
export interface RawMidiEvent { note: number; velocity: number; type: "noteon" | "noteoff"; timestampMs: number }
export interface PerformedNote { note: number; velocity: number; startTimestampMs: number; endTimestampMs: number | null; durationMs: number | null }
export type ScoringIssue = "wrong" | "missed" | "extra" | "early" | "late" | "missing-chord-tone" | "extra-chord-tone" | "uneven-hand-timing" | "held-too-short" | "held-too-long" | "duration-unknown";
export interface ScoringMistake { noteId: string | null; expectedNote: number | null; performedNote: number | null; chordGroupId: string | null; issue: ScoringIssue }
export interface ScoringResult { score: number; noteAccuracy: number; timingAccuracy: number; rhythmAccuracy: number; chordAccuracy: number; feedback: string[]; mistakes: ScoringMistake[] }
export interface MidiDeviceInfo { id: string; name: string; manufacturer?: string }
export interface MidiAdapter { connect(): Promise<void>; disconnect(): void; listDevices(): MidiDeviceInfo[]; onNoteOn(cb: (note: number, velocity: number, timestampMs: number) => void): void; onNoteOff(cb: (note: number, timestampMs: number) => void): void }

export type LessonStatus = "locked" | "unlocked" | "completed";
export interface LessonProgress { lessonId: string; status: LessonStatus; bestScore: number; completedAt: string | null }
export interface UserProgress {
  completedLessonIds: string[];
  bestScores: Record<string, number>;
  lessonStatuses: LessonProgress[];
}
export interface LessonListItem extends Lesson { order: number; progress: LessonProgress }
export interface LessonDetail { lesson: Lesson; progress: LessonProgress | null; exercises: MidiExercise[] }
export interface AuthUser { id: string; email: string; display_name: string }
export interface AuthResponse { accessToken: string; user: AuthUser }
export interface AssessmentPlacement { completedLessonCount: number; placementScore: number }
export interface AssessmentPlacementPayload { scores: number[] }
export interface ExerciseAttemptPayload { rawEvents?: RawMidiEvent[]; performedNotes?: PerformedNote[] }
export interface QuizAnswerPayload { selectedAnswer: number }
export interface QuizAnswerResponse { correct: boolean; explanation: string }
export interface ApiErrorResponse { error: { code: string; message: string; details?: unknown } }
