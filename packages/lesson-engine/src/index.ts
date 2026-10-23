import { z } from "zod";
import { SKILL_CHIPS, type Lesson, type LessonStatus, type MidiExercise } from "@keyboard-sensei/shared-types";

const quizQuestion = z.object({ id:z.string().min(1), prompt:z.string().min(1), options:z.array(z.string().min(1)).min(2), correctIndex:z.number().int().nonnegative(), explanation:z.string().min(1) }).refine(q => q.correctIndex < q.options.length, "correctIndex must identify an option");
export const contentRightsSchema = z.object({
  workTitle:z.string().min(1),
  composer:z.string().min(1),
  status:z.enum(["original","public-domain","licensed-copyright"]),
  copyrightHolder:z.string().min(1).nullable(),
  licenseReference:z.string().min(1).nullable()
}).superRefine((rights,ctx)=>{
  if(rights.status==="licensed-copyright"&&!rights.copyrightHolder)ctx.addIssue({code:z.ZodIssueCode.custom,path:["copyrightHolder"],message:"Licensed copyrighted works require a copyright holder"});
  if(rights.status==="licensed-copyright"&&!rights.licenseReference)ctx.addIssue({code:z.ZodIssueCode.custom,path:["licenseReference"],message:"Licensed copyrighted works require a license reference"});
});
const section = z.discriminatedUnion("type", [
  z.object({type:z.literal("markdown"),title:z.string().min(1),body:z.string().min(1)}),
  z.object({type:z.literal("theory-card"),title:z.string().min(1),body:z.string().min(1)}),
  z.object({type:z.literal("notation"),title:z.string().optional(),vexflowData:z.record(z.unknown()),contentRights:contentRightsSchema.optional()}),
  z.object({type:z.literal("midi-exercise"),title:z.string().min(1),instructions:z.string().min(1),exerciseId:z.string().min(1)}),
  z.object({type:z.literal("quiz"),questions:z.array(quizQuestion).min(1)})
]);
export const lessonSchema = z.object({ id:z.string().min(1), path:z.enum(["classical-technical","modern-chords","sightreading-intensive"]), level:z.enum(["foundation","elementary","intermediate","late-intermediate","advanced","virtuoso"]), branch:z.enum(["technique","theory","repertoire"]), tier:z.number().int().min(0).max(7).default(0), skills:z.array(z.enum(SKILL_CHIPS)).default([]), title:z.string().min(1), estimatedMinutes:z.number().int().positive(), objectives:z.array(z.string().min(1)).min(1), sections:z.array(section).min(1), unlockCriteria:z.object({requiresLessonIds:z.array(z.string()),minScore:z.number().min(0).max(100)}), skillRewards:z.record(z.number().nonnegative()) });
const expectedNote = z.object({id:z.string().min(1),note:z.number().int().min(0).max(127),startBeat:z.number().nonnegative(),durationBeats:z.number().positive(),hand:z.enum(["left","right","both"]),finger:z.number().int().min(1).max(5).nullable(),chordGroupId:z.string().nullable(),voice:z.enum(["melody","bass","inner","chord"]).nullable()});
export const midiExerciseSchema = z.object({exerciseId:z.string().min(1),tempoBpm:z.number().positive(),difficulty:z.enum(["beginner","intermediate","advanced"]),simultaneityWindowMs:z.number().positive(),timingToleranceMs:z.number().positive(),durationTolerancePercent:z.number().positive(),scoring:z.enum(["timed","untimed"]).optional(),beatsPerBar:z.number().int().positive().optional(),beatUnit:z.number().int().positive().optional(),keySignature:z.object({fifths:z.number().int().min(-7).max(7),mode:z.enum(["major","minor"])}).optional(),dynamics:z.object({evenVolume:z.boolean().optional(),balancedChords:z.boolean().optional()}).optional(),expected:z.array(expectedNote).min(1)});

export function validateLesson(lesson: unknown): Lesson { return lessonSchema.parse(lesson) as Lesson }
export function validateMidiExercise(exercise: unknown): MidiExercise { return midiExerciseSchema.parse(exercise) as MidiExercise }
export function isLessonUnlocked({lesson,completedLessonIds,scoresByLessonId}:{lesson:Lesson;completedLessonIds:string[];scoresByLessonId:Record<string,number>}): boolean {
  return lesson.unlockCriteria.requiresLessonIds.every(id => completedLessonIds.includes(id) && (scoresByLessonId[id] ?? 0) >= lesson.unlockCriteria.minScore);
}

/** One-path MVP placement: strong results on all harder prompts skip the first three lessons. */
export function calculateAssessmentPlacement(scores: number[]): { completedLessonCount: number; placementScore: number } {
  if (scores.length < 3) return { completedLessonCount: 0, placementScore: 0 };
  const placementScore = Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
  const harderPrompts = scores.slice(1);
  const clearlySkilled = placementScore >= 85 && harderPrompts.every((score) => score >= 80);
  return { completedLessonCount: clearlySkilled ? 3 : 0, placementScore };
}

/** Score every exercise in a lesson must reach for the lesson to count as passed. */
export const LESSON_PASS_SCORE = 70;

export interface LessonCompletion {
  /** Mean of the per-exercise best scores (unplayed exercises count as 0); 100 for a finished quiz-only lesson. */
  score: number;
  completed: boolean;
  exercisesPassed: number;
  exercisesTotal: number;
}

/**
 * Whether a lesson is finished, from the learner's best score on each of its exercises.
 *
 * - A lesson with exercises is complete when EVERY exercise has a best score of at least
 *   LESSON_PASS_SCORE. Its score is the mean of those bests, so the warm-up alone can't
 *   carry it. Quiz sections in such a lesson are knowledge checks and don't gate it.
 * - A lesson with no exercises is complete when every quiz question has been answered
 *   correctly at least once (score 100).
 */
export function lessonCompletion(
  lesson: Pick<Lesson, "sections">,
  exerciseBests: Readonly<Record<string, number>>,
  correctQuestionIds: ReadonlySet<string> = new Set(),
): LessonCompletion {
  const exerciseIds = lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []));
  if (exerciseIds.length > 0) {
    const bests = exerciseIds.map((id) => exerciseBests[id] ?? 0);
    const exercisesPassed = bests.filter((best) => best >= LESSON_PASS_SCORE).length;
    return {
      score: Math.round(bests.reduce((sum, best) => sum + best, 0) / bests.length),
      completed: exercisesPassed === exerciseIds.length,
      exercisesPassed,
      exercisesTotal: exerciseIds.length,
    };
  }
  const questionIds = lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : []));
  const completed = questionIds.length > 0 && questionIds.every((id) => correctQuestionIds.has(id));
  return { score: completed ? 100 : 0, completed, exercisesPassed: 0, exercisesTotal: 0 };
}

/**
 * The status a learner sees for a lesson. Progress rows are written when a lesson is
 * unlocked or completed, but prerequisites are also checked here at read time, so a
 * lesson added to the course later opens for everyone who already finished what it
 * requires (no backfill of progress rows needed). A lesson with no prerequisites is open.
 */
export function resolveLessonStatus(
  lesson: Pick<Lesson, "unlockCriteria">,
  stored: LessonStatus | undefined,
  completedLessonIds: ReadonlySet<string>,
  admin = false,
): LessonStatus {
  if (stored === "completed") return "completed";
  if (admin || stored === "unlocked") return "unlocked";
  return lesson.unlockCriteria.requiresLessonIds.every((id) => completedLessonIds.has(id)) ? "unlocked" : "locked";
}

/** Lessons whose prerequisites are all met once `completedLessonId` is finished, and that require it. */
export function lessonsUnlockedBy<T extends Pick<Lesson, "id" | "unlockCriteria">>(
  lessons: readonly T[],
  completedLessonId: string,
  completedLessonIds: ReadonlySet<string>,
): T[] {
  const completed = new Set(completedLessonIds).add(completedLessonId);
  return lessons.filter(
    (lesson) =>
      lesson.unlockCriteria.requiresLessonIds.includes(completedLessonId) &&
      lesson.unlockCriteria.requiresLessonIds.every((id) => completed.has(id)),
  );
}
