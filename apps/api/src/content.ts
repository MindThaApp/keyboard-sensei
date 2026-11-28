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
import { guitarChordsLessons, guitarExercises, guitarFoundationsLessons } from "./content/guitar.js";
import { violinLessons, violinExercises } from "./content/violin.js";
import { buildGuitarAdvancedLessons, guitarAdvancedExercises } from "./content/guitar-advanced.js";
import { violinTier34Exercises, violinTier34Lessons } from "./content/violin-tier34.js";

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
  ...guitarExercises,
  ...violinExercises,
  ...guitarAdvancedExercises,
  ...violinTier34Exercises,
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

// Guitar has its own two paths, independent of the piano chain: a guitar lesson never unlocks from a piano
// lesson. Chords start once the learner has tuned up and picked their first rhythms.
const guitarFoundationsBase = chainLessons(byTier(guitarFoundationsLessons));
const guitarChordsBase = chainLessons(byTier(guitarChordsLessons), ["guitar-open-string-rhythm"]);

// Tiers 3-4 continue each guitar path from its last tier 0-2 lesson.
const lastId = (path: Lesson[]): string => {
  const last = path[path.length - 1];
  if (!last) throw new Error("content.ts: an instrument path is empty");
  return last.id;
};
const guitarAdvanced = buildGuitarAdvancedLessons({
  foundations: [lastId(guitarFoundationsBase)],
  chordsRhythm: [lastId(guitarChordsBase)],
});
const guitarFoundationsPath = [...guitarFoundationsBase, ...guitarAdvanced.filter((lesson) => lesson.path === "guitar-foundations")];
const guitarChordsPath = [...guitarChordsBase, ...guitarAdvanced.filter((lesson) => lesson.path === "guitar-chords-rhythm")];

// Violin opens straight away: no piano lesson is a prerequisite. Its chain is its own; the
// violin-technique path (tiers 3-4) follows the last tier 0-2 violin lesson.
const violinFoundationsPath = chainLessons(byTier(violinLessons));
const violinTechniquePath: Lesson[] = violinTier34Lessons([lastId(violinFoundationsPath)]);

export const lessons: Lesson[] = [...classicalPath, ...readingPath, ...modernPath, ...guitarFoundationsPath, ...guitarChordsPath, ...violinFoundationsPath, ...violinTechniquePath]
  .map(withPractice)
  .map(withTier)
  .map((lesson) => ({ ...lesson, estimatedMinutes: estimateLessonMinutes(lesson, exerciseById) }));

validateTiers(lessons);
