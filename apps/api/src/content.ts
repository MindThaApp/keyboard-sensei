import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { coreLessons, coreExercises } from "./content/core.js";
import { repertoireLessons, repertoireExercises } from "./content/repertoire.js";
import { earTrainingLessons, earTrainingExercises } from "./content/ear-training.js";
import { technique2Lessons, technique2Exercises } from "./content/technique2.js";

// Batch order defines the linear unlock chain (each batch's first lesson requires the previous batch's last).
export const lessons: Lesson[] = [...coreLessons, ...repertoireLessons, ...earTrainingLessons, ...technique2Lessons];
export const exercises: MidiExercise[] = [...coreExercises, ...repertoireExercises, ...earTrainingExercises, ...technique2Exercises];
