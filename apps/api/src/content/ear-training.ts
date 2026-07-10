import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { defineLesson, quiz, midiSection, note, rewards, ELEMENTARY_CONFIG } from "./helpers.js";

// Ear-training batch: lessons 28-30. The web player's "▶ Listen" button plays each
// exercise's expected notes aloud, so these lessons work as hear-then-play-back drills.
// Notation sections are deliberately omitted from the play-back exercises — reading the
// score would defeat the point. ELEMENTARY_CONFIG tolerances: pitch memory is the skill
// being trained here, not precision timing.

const earEx = (exerciseId: string, expected: MidiExercise["expected"]): MidiExercise =>
  ({ exerciseId, tempoBpm: 72, difficulty: "intermediate", ...ELEMENTARY_CONFIG, expected });

export const earTrainingExercises: MidiExercise[] = [
  // Lesson 28 — steps vs skips.
  earEx("exercise-28a", [
    note("em-step-c", 60, 0, 1, "right"),
    note("em-step-d", 62, 1, 1, "right"),
    note("em-step-e", 64, 2, 1, "right"),
  ]),
  earEx("exercise-28b", [
    note("em-skip-c", 60, 0, 1, "right"),
    note("em-skip-e", 64, 1, 1, "right"),
    note("em-skip-g", 67, 2, 1, "right"),
  ]),
  // Lesson 29 — major vs minor triad quality, played back as blocked chords.
  earEx("exercise-29a", [
    note("em-cmaj-c", 60, 0, 2, "right", 1, "em-cmaj", "chord"),
    note("em-cmaj-e", 64, 0, 2, "right", 3, "em-cmaj", "chord"),
    note("em-cmaj-g", 67, 0, 2, "right", 5, "em-cmaj", "chord"),
  ]),
  earEx("exercise-29b", [
    note("em-amin-a", 57, 0, 2, "right", 1, "em-amin", "chord"),
    note("em-amin-c", 60, 0, 2, "right", 2, "em-amin", "chord"),
    note("em-amin-e", 64, 0, 2, "right", 4, "em-amin", "chord"),
  ]),
  // Lesson 30 — a six-note original melody caught entirely by ear.
  earEx("exercise-30", [
    note("em-mel-0", 60, 0, 1, "right"),
    note("em-mel-1", 62, 1, 1, "right"),
    note("em-mel-2", 64, 2, 1, "right"),
    note("em-mel-3", 67, 3, 1, "right"),
    note("em-mel-4", 64, 4, 1, "right"),
    note("em-mel-5", 60, 5, 2, "right"),
  ]),
];

export const earTrainingLessons: Lesson[] = [
  defineLesson({
    n: 28,
    title: "Ear training: steps and skips",
    level: "intermediate",
    branch: "theory",
    estimatedMinutes: 15,
    requiresLessonIds: ["lesson-27"],
    objectives: [
      "Tell a step (2nd) from a skip (3rd) by sound alone, without looking at the keys",
      "Play back a short three-note pattern from memory after hearing it",
    ],
    sections: [
      {
        type: "theory-card",
        title: "Hearing the distance between notes",
        body: "In lesson 9 you measured intervals by counting letter names: C to D is a second (a step), C to E is a third (a skip). Now learn what those distances sound like. A step sounds narrow — the two notes are neighbors, and a melody moving by step feels smooth and connected, like walking. A skip sounds open — there is a gap in the middle, and the melody feels like it leapt over something. Try singing along: sing C to D and your voice barely moves; sing C to E and you feel your voice jump. Singing what you hear is the fastest way to make your ear reliable.",
      },
      {
        type: "quiz",
        questions: [
          quiz(
            "q28-1",
            "You hear two notes very close together moving up — step or skip?",
            ["Step (a 2nd)", "Skip (a 3rd)", "A fifth", "The same note twice"],
            0,
            "Adjacent, narrow-sounding notes are a step: a second, like C to D.",
          ),
          quiz(
            "q28-2",
            "A melody leaps and you can hear a gap between the two notes. What did you most likely hear?",
            ["A repeated note", "A step (2nd)", "A skip (3rd)", "A rest"],
            2,
            "A skip jumps over one letter name, like C to E, and leaves an audible gap a step does not have.",
          ),
        ],
      },
      midiSection(
        "exercise-28a",
        "Hear then play: three steps",
        "Take your eyes off the keyboard and press ▶ Listen. You will hear three notes climbing by step. Listen two or three times and sing along until the pattern is in your head, then play it back from memory with the right hand starting on C4.",
      ),
      midiSection(
        "exercise-28b",
        "Hear then play: two skips",
        "Press ▶ Listen with your eyes off the keys. This pattern also starts on C4 and climbs, but by skips — hear how much wider each move feels than the steps you just played. Listen two or three times, then play it back from memory.",
      ),
    ],
    skillRewards: rewards({ theory: 3, note_reading: 1, keyboard_layout: 1 }),
  }),
  defineLesson({
    n: 29,
    title: "Ear training: major or minor?",
    level: "intermediate",
    branch: "theory",
    estimatedMinutes: 15,
    objectives: [
      "Recognize a triad as major or minor by its sound alone",
      "Play back a triad heard as one chord, matching all three notes",
    ],
    sections: [
      {
        type: "theory-card",
        title: "Two colors from one middle note",
        body: "You built C major (C-E-G) and A minor (A-C-E) in lesson 10. By ear, the two qualities have unmistakable characters: a major triad sounds bright, open, and settled — the sound of arrival. A minor triad sounds darker and more shadowed, as if the same chord had clouded over. Here is the remarkable part: the outer interval is the same perfect fifth in both. Only the middle note — the third — differs, sitting one semitone lower in minor. That single semitone is the entire difference in color. When you listen, aim your attention at the middle of the chord.",
      },
      {
        type: "quiz",
        questions: [
          quiz(
            "q29-1",
            "A triad sounds bright and settled, like a point of rest. Which quality is it?",
            ["Minor", "Major", "Diminished", "It cannot be judged by ear"],
            1,
            "Bright and settled is the classic description of a major triad.",
          ),
          quiz(
            "q29-2",
            "Which single note changes when a major triad becomes minor?",
            ["The root", "The third (middle note)", "The fifth", "All three notes"],
            1,
            "Root and fifth stay put; the third drops one semitone, and that alone darkens the color.",
          ),
        ],
      },
      midiSection(
        "exercise-29a",
        "Hear then play: the bright triad",
        "Eyes off the keyboard — press ▶ Listen and hear one chord, played as a single block. Notice its bright, settled color. Listen two or three times, then play back C major: C4, E4, and G4 sounding together as one attack.",
      ),
      midiSection(
        "exercise-29b",
        "Hear then play: the dark triad",
        "Press ▶ Listen again without watching the keys. This chord is darker — the minor color. Listen two or three times, comparing it in your memory with the major chord you just played, then play back A minor: A3, C4, and E4 together.",
      ),
    ],
    skillRewards: rewards({ theory: 3, chords: 3 }),
  }),
  defineLesson({
    n: 30,
    title: "Ear training: play a melody by ear",
    level: "intermediate",
    branch: "theory",
    estimatedMinutes: 18,
    objectives: [
      "Catch a six-note melody by ear using direction and step-vs-skip listening",
      "Play back a heard melody from memory, keeping a steady pulse",
    ],
    sections: [
      {
        type: "markdown",
        title: "A strategy for catching melodies",
        body: "Playing by ear is not magic — it is a repeatable process:\n\n1. **Find the first note.** Everything else is measured from it. Here it is C4.\n2. **Sing what you hear.** If you can sing it, you have truly memorized it; if you cannot, listen again.\n3. **Track the direction.** Is the line going up, down, or turning around? Sketch the shape in your mind.\n4. **Hear steps vs skips.** Use lesson 28's skill: narrow neighbor moves are steps, gapped leaps are skips.\n5. **Build in chunks.** Secure the first two or three notes, then add the rest. Nobody catches a whole melody in one pass.\n\nThe melody in this exercise rises, leaps once, then settles back home. Trust your ear over your eyes.",
      },
      {
        type: "quiz",
        questions: [
          quiz(
            "q30-1",
            "What is the most useful first move when learning a melody by ear?",
            ["Guess notes at random until one sounds right", "Find and secure the first note, then measure everything from it", "Play as fast as possible", "Start from the last note"],
            1,
            "Anchoring the first note gives every later interval a reference point; direction and step-vs-skip listening do the rest.",
          ),
        ],
      },
      midiSection(
        "exercise-30",
        "Catch the melody",
        "Eyes off the keyboard. Press ▶ Listen at least three times before you touch a key: first pass for the overall shape, second to sing along, third to confirm where the single skip happens. The melody starts on C4, rises by step, leaps up once, then walks back down to rest on a long final C4. When you can sing all six notes, play it back from memory at a steady pulse.",
      ),
    ],
    skillRewards: rewards({ theory: 2, note_reading: 2, timing: 2 }),
  }),
];
