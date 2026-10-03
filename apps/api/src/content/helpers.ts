import type { ExpectedNoteEvent, Lesson, LessonSection, MidiExercise, QuizQuestion } from "@keyboard-sensei/shared-types";
import { BEGINNER_CONFIG, ELEMENTARY_CONFIG, INTERMEDIATE_CONFIG } from "@keyboard-sensei/midi-engine";

export { BEGINNER_CONFIG, ELEMENTARY_CONFIG, INTERMEDIATE_CONFIG };

export const quiz = (id:string,prompt:string,options:string[],correctIndex:number,explanation:string): QuizQuestion => ({id,prompt,options,correctIndex,explanation});
export const midiSection = (exerciseId:string,title:string,instructions:string): LessonSection => ({type:"midi-exercise",exerciseId,title,instructions});
export const note = (id:string,pitch:number,startBeat:number,durationBeats=1,hand:"left"|"right"|"both"="right",finger:number|null=null,chordGroupId:string|null=null,voice:ExpectedNoteEvent["voice"]="melody"): ExpectedNoteEvent => ({id,note:pitch,startBeat,durationBeats,hand,finger,chordGroupId,voice});
export const ex = (exerciseId:string,expected:ExpectedNoteEvent[],elementary=false): MidiExercise => ({exerciseId,tempoBpm:80,difficulty:"beginner",...(elementary?ELEMENTARY_CONFIG:BEGINNER_CONFIG),expected});
export const intermediateEx = (exerciseId:string,expected:ExpectedNoteEvent[],tempoBpm=72): MidiExercise => ({exerciseId,tempoBpm,difficulty:"intermediate",...INTERMEDIATE_CONFIG,expected});
export const rewards = (values:Partial<Record<"note_reading"|"rhythm"|"technique"|"theory"|"keyboard_layout"|"sight_reading"|"chords"|"timing",number>>) => values as Record<string,number>;
/** Hand-written learning objectives per lesson — concrete, checkable skills, not restatements of the title. */
export const OBJECTIVES: Record<number, string[]> = {
  1: ["Locate any C instantly using the two-black-key group", "Name a note's octave (C3, C4, C5) and find it without counting keys"],
  2: ["Know finger numbers 1–5 in both hands without hesitation", "Sit with curved fingers, level wrists, and relaxed shoulders"],
  3: ["Recognize middle C on its own ledger line between the staves", "See how the treble and bass staves join into the grand staff"],
  4: ["Count quarter, half, and whole notes against a steady 1-2-3-4", "Explain how note values fill a measure of 4/4"],
  5: ["Read C4–G4 on the treble staff at sight", "Play the five-finger ascent with one finger per note and an even pulse"],
  6: ["Read C3 down to F2 on the bass staff", "Play an even left-hand descent with fingers 1–5"],
  7: ["Alternate hands without breaking the pulse", "Keep each hand ready over its keys while the other plays"],
  8: ["Play C4–G4 and back with fingers 1-2-3-4-5-4-3-2-1", "Keep every note even in volume and length"],
  9: ["Name seconds, thirds, and fifths from any starting note", "Play stacked intervals so both notes sound exactly together"],
  10: ["Spell C major (C-E-G) and A minor (A-C-E)", "Balance all three chord tones at one volume", "Hear the difference between major and minor quality"],
  11: ["Scan a phrase for direction, repeats, and rhythm before playing", "Play a five-note melody through without stopping to correct"],
  12: ["Combine single notes, an interval, and a triad in one steady take", "Hold the pulse through changing textures"],
  13: ["Explain sharps, flats, and enharmonic names (C♯ = D♭)", "Play the chromatic scale in even eighth notes with 1-3 fingering"],
  14: ["Build a major scale from its whole–whole–half pattern", "Play G and D major with the correct sharps and thumb-under fingering"],
  15: ["Walk the sharp keys clockwise: C, G, D, A, E", "Recite the order sharps appear: F♯, C♯, G♯, D♯"],
  16: ["Play E and D natural minor with their key-signature notes", "Hear the minor third that darkens the scale's color"],
  17: ["Spell G7 (G-B-D-F) and find its tritone tension", "Resolve G7 to C major and hear the tension release"],
  18: ["Name a triad's inversion from its bass note alone", "Play C major in root position, first, and second inversion cleanly"],
  19: ["Count eighth-note subdivisions aloud: 1-and-2-and", "Hold dotted quarters through the off-beat without rushing"],
  20: ["Play both hands in opposite directions with simultaneous attacks", "Keep two moving lines even in tone and time"],
  21: ["Time a delayed pedal change: keys, lift, press", "Connect chord changes without blurring harmonies"],
  22: ["Unfold C and G major triads into one-octave arpeggios", "Shift the hand smoothly with 1-2-3-5 fingering instead of stretching"],
  23: ["Preview meter, range, and rhythm patterns before playing", "Keep going through dotted rhythms without restarting"],
  24: ["Combine a sharp-key scale, a seventh chord, an inversion, and a dotted rhythm in one take", "Hold one pulse across four different textures"],
};
/**
 * Core-batch lesson builder (lessons 1-24).
 *
 * `id` is the lesson's permanent database key: UserProgress, ExerciseAttempt and
 * QuizAttempt rows on the live server are keyed on it, so it must NEVER change once
 * shipped. It is deliberately not derived from `n` or from the lesson's position.
 * `n` is only a frozen content key for the defaults below (level, estimated minutes,
 * OBJECTIVES lookup) — it is not the lesson's order. Order comes from the lesson's
 * position in the `lessons` array (src/content.ts), and the unlock chain
 * (`unlockCriteria.requiresLessonIds`) is filled in there from that same position.
 */
export const lesson = (
  id: string,
  n: number,
  title: string,
  branch: Lesson["branch"],
  sections: LessonSection[],
  skillRewards: Record<string, number>,
  estimatedMinutes = n < 5 ? 8 : 12,
): Lesson => ({
  id,
  path: "classical-technical",
  level: n <= 6 ? "foundation" : n <= 12 ? "elementary" : "intermediate",
  branch,
  title,
  estimatedMinutes,
  objectives: OBJECTIVES[n] ?? [`Understand ${title.toLowerCase()}`, "Apply the concept accurately at the keyboard"],
  sections,
  unlockCriteria: { requiresLessonIds: [], minScore: 70 },
  skillRewards,
});


/**
 * Fully explicit lesson builder for post-core batches (repertoire, ear training, ...).
 *
 * `id` is permanent (see `lesson` above). Existing lessons keep their historical
 * `lesson-NN` ids; NEW lessons must use a descriptive slug that says nothing about
 * position, e.g. `"lesson-hanon-1"`, so they can be inserted anywhere in the sequence.
 */
export const defineLesson = (input: {
  id: string; title: string; level: Lesson["level"]; branch: Lesson["branch"];
  objectives: string[]; sections: LessonSection[]; skillRewards: Record<string, number>;
  estimatedMinutes: number;
}): Lesson => ({
  id: input.id,
  path: "classical-technical",
  level: input.level,
  branch: input.branch,
  title: input.title,
  estimatedMinutes: input.estimatedMinutes,
  objectives: input.objectives,
  sections: input.sections,
  unlockCriteria: { requiresLessonIds: [], minScore: 70 },
  skillRewards: input.skillRewards,
});

/**
 * Link a sequence of lessons into the linear unlock chain by array position:
 * each lesson requires the one before it. Lesson ids are never consulted, so a
 * lesson can be inserted anywhere in the array without renumbering anything.
 */
export const chainLessons = (sequence: Lesson[]): Lesson[] =>
  sequence.map((item, index) => ({
    ...item,
    unlockCriteria: {
      ...item.unlockCriteria,
      requiresLessonIds: index === 0 ? [] : [sequence[index - 1]!.id],
    },
  }));
