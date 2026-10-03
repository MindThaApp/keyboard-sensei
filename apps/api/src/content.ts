import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { chainLessons } from "./content/helpers.js";
import { estimateLessonMinutes } from "./content/build.js";
import { coreLessons, coreExercises } from "./content/core.js";
import { repertoireLessons, repertoireExercises } from "./content/repertoire.js";
import { earTrainingLessons, earTrainingExercises } from "./content/ear-training.js";
import { technique2Lessons, technique2Exercises } from "./content/technique2.js";
import { depthExercises, withPractice } from "./content/depth.js";
import { readingLessons, readingExercises } from "./content/reading.js";
import { modernLessons, modernExercises } from "./content/modern.js";
import { keyLessons, keyExercises } from "./content/keys.js";

export const exercises: MidiExercise[] = [
  ...coreExercises,
  ...repertoireExercises,
  ...earTrainingExercises,
  ...technique2Exercises,
  ...depthExercises,
  ...keyExercises,
  ...readingExercises,
  ...modernExercises,
];

const exerciseById = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise]));

/**
 * The course, in display order. Array position IS the lesson's `order`; lesson ids are
 * explicit and permanent (see content/helpers.ts), so a lesson can be inserted anywhere
 * and the seed reassigns every order safely.
 *
 * Each path is its own unlock chain (every lesson requires the previous one in its path).
 * The main classical-technical path starts open; the other paths branch off it once the
 * lessons they build on are complete.
 */
const classicalPath = chainLessons([
  ...coreLessons,
  ...repertoireLessons,
  ...earTrainingLessons,
  ...technique2Lessons,
  ...keyLessons,
]);

// Reading & Rhythm opens after the first sight-reading drill.
const readingPath = chainLessons(readingLessons, ["lesson-11"]);

// Modern Chords opens after the foundation assessment (lesson 12), which covers triads.
const modernPath = chainLessons(modernLessons, ["lesson-12"]);

export const lessons: Lesson[] = [...classicalPath, ...readingPath, ...modernPath]
  .map(withPractice)
  .map((lesson) => ({ ...lesson, estimatedMinutes: estimateLessonMinutes(lesson, exerciseById) }));
