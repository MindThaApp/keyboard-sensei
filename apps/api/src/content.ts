import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { chainLessons } from "./content/helpers.js";
import { coreLessons, coreExercises } from "./content/core.js";
import { repertoireLessons, repertoireExercises } from "./content/repertoire.js";
import { earTrainingLessons, earTrainingExercises } from "./content/ear-training.js";
import { technique2Lessons, technique2Exercises } from "./content/technique2.js";

// Array position IS the lesson order and the linear unlock chain (each lesson requires
// the one before it). Lesson ids are explicit and permanent — see content/helpers.ts —
// so a new lesson can be inserted anywhere here; the seed reassigns every order safely.
export const lessons: Lesson[] = chainLessons([
  ...coreLessons,
  ...repertoireLessons,
  ...earTrainingLessons,
  ...technique2Lessons,
]);
export const exercises: MidiExercise[] = [...coreExercises, ...repertoireExercises, ...earTrainingExercises, ...technique2Exercises];
