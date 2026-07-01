import { z } from "zod";
import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";

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
export const lessonSchema = z.object({ id:z.string().min(1), path:z.enum(["classical-technical","modern-chords","sightreading-intensive"]), level:z.enum(["foundation","elementary","intermediate","late-intermediate","advanced","virtuoso"]), branch:z.enum(["technique","theory","repertoire"]), title:z.string().min(1), estimatedMinutes:z.number().int().positive(), objectives:z.array(z.string().min(1)).min(1), sections:z.array(section).min(1), unlockCriteria:z.object({requiresLessonIds:z.array(z.string()),minScore:z.number().min(0).max(100)}), skillRewards:z.record(z.number().nonnegative()) });
const expectedNote = z.object({id:z.string().min(1),note:z.number().int().min(0).max(127),startBeat:z.number().nonnegative(),durationBeats:z.number().positive(),hand:z.enum(["left","right","both"]),finger:z.number().int().min(1).max(5).nullable(),chordGroupId:z.string().nullable(),voice:z.enum(["melody","bass","inner","chord"]).nullable()});
export const midiExerciseSchema = z.object({exerciseId:z.string().min(1),tempoBpm:z.number().positive(),difficulty:z.enum(["beginner","intermediate","advanced"]),simultaneityWindowMs:z.number().positive(),timingToleranceMs:z.number().positive(),durationTolerancePercent:z.number().positive(),expected:z.array(expectedNote).min(1)});

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
