import type { ExerciseDynamics, Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { chainLessons } from "./content/helpers.js";
import { estimateLessonMinutes } from "./content/build.js";
import { coreLessons, coreExercises } from "./content/core.js";
import { repertoireLessons, repertoireExercises } from "./content/repertoire.js";
import { earTrainingLessons, earTrainingExercises } from "./content/ear-training.js";
import { technique2Lessons, technique2Exercises } from "./content/technique2.js";
import { depthExercises, withPractice } from "./content/depth.js";
import { readingLessons, readingExercises } from "./content/reading.js";
import { modernLessons, modernExercises } from "./content/modern.js";
import { tierOf, withTier, validateTiers } from "./content/tiers.js";
import { keyLessons, keyExercises } from "./content/keys.js";

/**
 * Exercises scored on dynamics as well (see ExerciseDynamics), because their
 * lesson's objectives promise it: lesson 8 "even in volume", lesson 10 "balance
 * all three chord tones", lesson 20 "even in tone", lesson 34 "light and even".
 */
export const DYNAMICS_OPT_IN: Record<string, ExerciseDynamics> = {
  "exercise-08": { evenVolume: true },
  "five-finger-lh": { evenVolume: true },
  "exercise-10": { balancedChords: true },
  "major-minor-pairs": { balancedChords: true },
  "exercise-20": { evenVolume: true },
  "exercise-34": { evenVolume: true },
  "broken-c-f-g-c": { evenVolume: true },
};

export const exercises: MidiExercise[] = [
  ...coreExercises,
  ...repertoireExercises,
  ...earTrainingExercises,
  ...technique2Exercises,
  ...depthExercises,
  ...keyExercises,
  ...readingExercises,
  ...modernExercises,
].map((exercise) => (DYNAMICS_OPT_IN[exercise.exerciseId] ? { ...exercise, dynamics: DYNAMICS_OPT_IN[exercise.exerciseId] } : exercise));

const exerciseById = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise]));

/**
 * The course, in display order. Array position IS the lesson's `order`; lesson ids are
 * explicit and permanent (see content/helpers.ts), so a lesson can be inserted anywhere
 * and the seed reassigns every order safely.
 *
 * Each path is its own unlock chain (every lesson requires the previous one in its path).
 * The main classical-technical path starts open; the other paths branch off it once the
 * lessons they build on are complete.
 *
 * Within a path, lessons are ordered by tier (content/tiers.ts) before chaining, keeping
 * the authored order inside a tier. That way a lesson never waits on one from a later
 * tier; validateTiers checks the cross-path prerequisites too.
 */
const byTier = (sequence: Lesson[]): Lesson[] =>
  [...sequence].sort((a, b) => tierOf(a.id) - tierOf(b.id));

const classicalPath = chainLessons(
  byTier([...coreLessons, ...repertoireLessons, ...earTrainingLessons, ...technique2Lessons, ...keyLessons]),
);

// Reading & Rhythm opens after the first sight-reading drill.
const readingPath = chainLessons(byTier(readingLessons), ["lesson-11"]);

// Modern Chords opens after the foundation assessment (lesson 12), which covers triads.
const modernPath = chainLessons(byTier(modernLessons), ["lesson-12"]);

export const lessons: Lesson[] = [...classicalPath, ...readingPath, ...modernPath]
  .map(withPractice)
  .map(withTier)
  .map((lesson) => ({ ...lesson, estimatedMinutes: estimateLessonMinutes(lesson, exerciseById) }));

validateTiers(lessons);
