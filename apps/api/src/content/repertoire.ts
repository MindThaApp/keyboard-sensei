import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { defineLesson, quiz, midiSection, note, rewards, ELEMENTARY_CONFIG, INTERMEDIATE_CONFIG } from "./helpers.js";

// Repertoire batch 1 — lessons 25–27: first real public-domain pieces.
// Each piece's VexFlow notation is generated from the same [pitch, startBeat, durationBeats]
// data as its MIDI exercise, so the score and the scoring engine can never disagree.

type NoteDatum = readonly [pitch: number, startBeat: number, durationBeats: number];

const KEY_FOR_PITCH: Record<number, string> = {
  41: "f/2", 43: "g/2", 48: "c/3",
  60: "c/4", 62: "d/4", 64: "e/4", 65: "f/4", 67: "g/4", 69: "a/4", 71: "b/4",
  72: "c/5", 74: "d/5", 76: "e/5", 78: "f#/5", 79: "g/5",
};
const DURATION_FOR_BEATS: Record<number, string> = { 0.5: "8", 1: "q", 1.5: "qd", 2: "h", 4: "w" };
const vexNotes = (data: readonly NoteDatum[]) =>
  data.map(([pitch, , beats]) => ({ keys: [KEY_FOR_PITCH[pitch]!], duration: DURATION_FOR_BEATS[beats]! }));

// --- Lesson 25: Ode to Joy (Beethoven) — right hand, C position, 4/4 ---------------------------

const ODE_TO_JOY: readonly NoteDatum[] = [
  // Phrase A, bars 1–4
  [64, 0, 1], [64, 1, 1], [65, 2, 1], [67, 3, 1],
  [67, 4, 1], [65, 5, 1], [64, 6, 1], [62, 7, 1],
  [60, 8, 1], [60, 9, 1], [62, 10, 1], [64, 11, 1],
  [64, 12, 1.5], [62, 13.5, 0.5], [62, 14, 2],
  // Phrase B, bars 5–8
  [64, 16, 1], [64, 17, 1], [65, 18, 1], [67, 19, 1],
  [67, 20, 1], [65, 21, 1], [64, 22, 1], [62, 23, 1],
  [60, 24, 1], [60, 25, 1], [62, 26, 1], [64, 27, 1],
  [62, 28, 1.5], [60, 29.5, 0.5], [60, 30, 2],
];
const C_POSITION_FINGER: Record<number, number> = { 60: 1, 62: 2, 64: 3, 65: 4, 67: 5 };

// --- Lesson 26: Ah! vous dirai-je, maman (Mozart's theme) — two hands, 4/4 ---------------------

const MOZART_MELODY: readonly NoteDatum[] = [
  [60, 0, 1], [60, 1, 1], [67, 2, 1], [67, 3, 1],
  [69, 4, 1], [69, 5, 1], [67, 6, 2],
  [65, 8, 1], [65, 9, 1], [64, 10, 1], [64, 11, 1],
  [62, 12, 1], [62, 13, 1], [60, 14, 2],
];
const MOZART_BASS: readonly NoteDatum[] = [
  [48, 0, 4],
  [41, 4, 2], [48, 6, 2],
  [41, 8, 2], [48, 10, 2],
  [43, 12, 2], [48, 14, 2],
];
const MOZART_LH_FINGER: Record<number, number> = { 48: 1, 43: 4, 41: 5 };

// --- Lesson 27: Minuet in G (Petzold) — right hand, 3/4, first four bars ------------------------

const MINUET_IN_G: readonly NoteDatum[] = [
  [74, 0, 1], [67, 1, 0.5], [69, 1.5, 0.5], [71, 2, 0.5], [72, 2.5, 0.5],
  [74, 3, 1], [67, 4, 1], [67, 5, 1],
  [76, 6, 1], [72, 7, 0.5], [74, 7.5, 0.5], [76, 8, 0.5], [78, 8.5, 0.5],
  [79, 9, 1], [67, 10, 1], [67, 11, 1],
];

export const repertoireExercises: MidiExercise[] = [
  {
    exerciseId: "exercise-25", tempoBpm: 76, difficulty: "intermediate", ...INTERMEDIATE_CONFIG,
    expected: ODE_TO_JOY.map(([pitch, start, beats], i) =>
      note(`ode-${i}`, pitch, start, beats, "right", C_POSITION_FINGER[pitch]!)),
  },
  {
    // Two hands at once is the challenge here, so use the gentler elementary tolerances.
    exerciseId: "exercise-26", tempoBpm: 72, difficulty: "intermediate", ...ELEMENTARY_CONFIG,
    expected: [
      ...MOZART_MELODY.map(([pitch, start, beats], i) =>
        note(`mozart-rh-${i}`, pitch, start, beats, "right", null)),
      ...MOZART_BASS.map(([pitch, start, beats], i) =>
        note(`mozart-lh-${i}`, pitch, start, beats, "left", MOZART_LH_FINGER[pitch]!, null, "bass")),
    ],
  },
  {
    exerciseId: "exercise-27", tempoBpm: 88, difficulty: "intermediate", ...INTERMEDIATE_CONFIG,
    expected: MINUET_IN_G.map(([pitch, start, beats], i) =>
      note(`minuet-${i}`, pitch, start, beats, "right", null)),
  },
];

export const repertoireLessons: Lesson[] = [
  defineLesson({
    n: 25, title: "Ode to Joy (Beethoven)", level: "intermediate", branch: "repertoire",
    estimatedMinutes: 20,
    objectives: [
      "Play the full sixteen-beat Ode to Joy phrase pair from memory or score without stopping",
      "Hold the dotted-quarter/eighth cadence figure in bars 4 and 8 without rushing the short note",
      "Keep one finger per note in C position (1 on C through 5 on G) for the whole melody",
    ],
    sections: [
      {
        type: "markdown", title: "Your first real piece",
        body: "This melody is the **Ode to Joy** theme from the finale of Ludwig van Beethoven's Ninth Symphony (1824) — one of the most recognized tunes ever written, and today the anthem of Europe. Beethoven built it to be singable by everyone: it moves almost entirely by **step** (each note a neighbor of the last) and sits inside a single five-finger C position, which is exactly why it makes an ideal first piece of repertoire — your hand never has to move, so all your attention can go to the music.\n\n**How to practice it:** don't play the whole thing at once. First press the **▶ Listen** button and hear the target until you can sing along. Then learn it in small chunks — bars 1–2, then 3–4, then join them — and only chain the two phrases together once each one is comfortable. Notice that phrase B is almost a repeat of phrase A: only the last bar changes, ending at rest on C instead of pausing on D."
      },
      {
        type: "notation", title: "Ode to Joy — the complete theme",
        vexflowData: { clef: "treble", timeSignature: "4/4", notes: vexNotes(ODE_TO_JOY) },
        contentRights: { workTitle: "Ode to Joy (Symphony No. 9 theme)", composer: "Ludwig van Beethoven", status: "public-domain", copyrightHolder: null, licenseReference: null },
      },
      {
        type: "quiz", questions: [
          quiz("q25-1", "Where does the Ode to Joy melody come from?", ["Beethoven's Fifth Symphony", "The finale of Beethoven's Ninth Symphony", "A Mozart piano sonata", "A traditional folk song Beethoven arranged"], 1, "Beethoven wrote it as the choral theme of his Ninth Symphony's finale."),
          quiz("q25-2", "How does the melody move most of the time?", ["In large leaps", "By step, to neighboring notes", "Only on repeated notes", "In broken chords"], 1, "Almost every note moves by step to its neighbor — that stepwise motion is what makes it so singable and so playable in one hand position."),
        ]
      },
      midiSection("exercise-25", "Play Ode to Joy", "Right hand in C position, one finger per note (C=1, D=2, E=3, F=4, G=5). Listen first, then play both phrases in one take. Watch the dotted-quarter/eighth figure at the end of each phrase: hold the long note through 'and' before the quick one."),
    ],
    skillRewards: rewards({ sight_reading: 2, note_reading: 3, technique: 2, timing: 2, rhythm: 2 }),
  }),
  defineLesson({
    n: 26, title: "Mozart's theme: Ah! vous dirai-je, maman", level: "intermediate", branch: "repertoire",
    estimatedMinutes: 22,
    objectives: [
      "Play the melody and the sustained left-hand bass line together at one steady pulse",
      "Land each left-hand change (C, F, and G bass notes) exactly with its right-hand beat",
      "Practice hands separately, then join them at a slower tempo without stopping",
    ],
    sections: [
      {
        type: "markdown", title: "Two hands, one piece",
        body: "This French tune — *Ah! vous dirai-je, maman* — is the melody you know as *Twinkle, Twinkle, Little Star*. Wolfgang Amadeus Mozart loved it enough to write **twelve variations on it (K. 265)**, turning the simple theme into a virtuoso showpiece. You'll play the theme the way Mozart's variations begin: melody in the right hand over a slow, sustained bass in the left. This is your **first two-hand piece**, and the left hand has been kept deliberately simple — one or two long notes per bar.\n\n**Hands-together strategy:** learn each hand alone first. The right hand is all quarter notes with a half note ending each phrase; the left hand holds whole and half notes underneath. When both are secure, play hands together at a *slower* tempo than either hand alone — the coordination is the new skill, not the notes. Aim the left-hand changes to land exactly on the beat with the right hand."
      },
      {
        type: "notation", title: "Theme with sustained bass",
        vexflowData: {
          grandStaff: true,
          treble: { clef: "treble", timeSignature: "4/4", notes: vexNotes(MOZART_MELODY) },
          bass: { clef: "bass", timeSignature: "4/4", notes: vexNotes(MOZART_BASS) },
        },
        contentRights: { workTitle: "Ah! vous dirai-je, maman (theme of Twelve Variations, K. 265)", composer: "Wolfgang Amadeus Mozart", status: "public-domain", copyrightHolder: null, licenseReference: null },
      },
      {
        type: "quiz", questions: [
          quiz("q26-1", "What did Mozart write on the tune Ah! vous dirai-je, maman?", ["An opera aria", "Twelve variations for piano (K. 265)", "A symphony finale", "Nothing — the attribution is a myth"], 1, "Mozart's Twelve Variations K. 265 take this simple French tune through increasingly brilliant transformations."),
          quiz("q26-2", "What is the recommended way to learn a two-hand piece?", ["Both hands together immediately, at full speed", "Right hand only — the left will follow", "Each hand alone first, then together at a slower tempo", "Left hand only, since the bass is harder"], 2, "Secure each hand separately, then rejoin them slowly — coordinating the hands is its own skill."),
        ]
      },
      midiSection("exercise-26", "Theme, hands together", "Right hand plays the melody in quarter notes; left hand holds long bass notes underneath (C3 for a whole bar, then F2 and C3, then G2 to C3 at the end). Make each left-hand note start exactly together with the right-hand note on its beat."),
    ],
    skillRewards: rewards({ note_reading: 3, technique: 3, timing: 3, rhythm: 2, sight_reading: 1 }),
  }),
  defineLesson({
    n: 27, title: "Minuet in G (Petzold)", level: "intermediate", branch: "repertoire",
    estimatedMinutes: 25,
    objectives: [
      "Play the four-bar minuet opening with even eighth-note runs between the quarter-note landings",
      "Count and feel three beats per bar, giving beat 1 a gentle emphasis",
      "Play F-sharp with the right hand reliably inside the G major run in bar 3",
    ],
    sections: [
      {
        type: "markdown", title: "A minuet from the Bach household",
        body: "This minuet comes from the **1725 Notebook for Anna Magdalena Bach**, the music album of Johann Sebastian Bach's wife. For two centuries it was published as Bach's own; scholars have since identified its real composer as **Christian Petzold**, a Dresden organist whose music the Bach family admired enough to copy out by hand. You'll learn its first four bars — the opening question of the tune.\n\nA **minuet** is an elegant courtly dance in **3/4 time**: three beats per bar, with a graceful lean on beat 1 — count **ONE-two-three, ONE-two-three**. Each phrase here starts with a confident quarter note, then runs up in light eighth notes.\n\nOne more thing: this piece is in **G major**, the one-sharp key you built in lesson 14 — so every F is **F-sharp**. It appears in the bar 3 run (C–D–E–F♯) on the way up to high G. Practice that run alone until the F♯ is automatic."
      },
      {
        type: "notation", title: "Minuet in G — opening four bars",
        vexflowData: { clef: "treble", timeSignature: "3/4", keySignature: "G", notes: vexNotes(MINUET_IN_G) },
        contentRights: { workTitle: "Minuet in G major, BWV Anh. 114", composer: "Christian Petzold", status: "public-domain", copyrightHolder: null, licenseReference: null },
      },
      {
        type: "quiz", questions: [
          quiz("q27-1", "Who is now credited with composing the Minuet in G from the Notebook for Anna Magdalena Bach?", ["Johann Sebastian Bach", "Anna Magdalena Bach", "Christian Petzold", "Ludwig van Beethoven"], 2, "Long attributed to J.S. Bach, the minuet is now credited to the Dresden organist Christian Petzold."),
          quiz("q27-2", "What does the 3/4 time signature mean?", ["Three beats per bar, each a quarter note", "Four beats per bar, each lasting a third", "Play it three-quarters as fast", "Three bars per phrase"], 0, "3/4 means three quarter-note beats in every bar — the lilting ONE-two-three of a minuet."),
        ]
      },
      midiSection("exercise-27", "Play the minuet opening", "Right hand only, three beats per bar. Each bar 1 and 3 pattern is a quarter note followed by four even eighths; bars 2 and 4 are three quarters. Keep the eighth-note runs light and even, and remember F-sharp in the bar 3 run."),
    ],
    skillRewards: rewards({ sight_reading: 2, note_reading: 3, rhythm: 3, timing: 2, technique: 2 }),
  }),
];
