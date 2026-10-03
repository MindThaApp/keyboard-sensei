import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { defineLesson, intermediateEx, midiSection, note, quiz, rewards } from "./helpers.js";

// Technique II batch — lessons 31–34: A major, F major, A harmonic minor, broken-chord accompaniment.
// Every notation key string below is spelled against real theory and matches its exercise's MIDI
// numbers 1:1 (A4 = 69 ↔ "a/4", C♯5 = 73 ↔ "c#/5", B♭4 = 70 ↔ "bb/4", G♯5 = 80 ↔ "g#/5",
// C3 = 48 ↔ "c/3", G2 = 43 ↔ "g/2").

export const technique2Exercises: MidiExercise[] = [
  // A major, one octave ascending: A4 B4 C♯5 D5 E5 F♯5 G♯5 A5 — W W H W W W H.
  intermediateEx("exercise-31",
    [69, 71, 73, 74, 76, 78, 80, 81].map((pitch, i) =>
      note(`amaj-${i}`, pitch, i, 1, "right", [1, 2, 3, 1, 2, 3, 4, 5][i]!)),
    80),
  // F major, one octave ascending: F4 G4 A4 B♭4 C5 D5 E5 F5 — W W H W W W H.
  intermediateEx("exercise-32",
    [65, 67, 69, 70, 72, 74, 76, 77].map((pitch, i) =>
      note(`fmaj-${i}`, pitch, i, 1, "right", [1, 2, 3, 4, 1, 2, 3, 4][i]!)),
    76),
  // A harmonic minor, one octave ascending: A4 B4 C5 D5 E5 F5 G♯5 A5 — natural minor with a raised 7th.
  intermediateEx("exercise-33",
    [69, 71, 72, 74, 76, 77, 80, 81].map((pitch, i) =>
      note(`aharm-${i}`, pitch, i, 1, "right", [1, 2, 3, 1, 2, 3, 4, 5][i]!)),
    72),
  // Broken-chord accompaniment, left hand: two bars of C major (C3 G3 E3 G3) then
  // two bars of G major (G2 D3 B2 D3), root–fifth–third–fifth in quarters.
  intermediateEx("exercise-34",
    [48, 55, 52, 55, 48, 55, 52, 55, 43, 50, 47, 50, 43, 50, 47, 50].map((pitch, i) =>
      note(`broken-${i}`, pitch, i, 1, "left", [5, 1, 3, 1][i % 4]!, null, "bass")),
    69),
];

export const technique2Lessons: Lesson[] = [
  defineLesson({
    id: "lesson-31", title: "A major scale", level: "intermediate", branch: "technique", estimatedMinutes: 18,
    objectives: [
      "Spell A major with its three sharps: F♯, C♯, and G♯",
      "Play one octave of A major with right-hand fingering 1-2-3-1-2-3-4-5",
      "Pass the thumb under after finger 3 without lifting the wrist",
    ],
    sections: [
      { type: "theory-card", title: "Three sharps, one familiar pattern", body: "A major is the next stop past D on the sharp side of the circle of fifths, so it carries three sharps: F♯, C♯, and G♯. Check the spelling against the major-scale pattern whole–whole–half–whole–whole–whole–half: A-B is whole, B-C♯ whole, C♯-D half, D-E whole, E-F♯ whole, F♯-G♯ whole, and G♯-A closes the half step home. The ascending right hand uses 1-2-3-1-2-3-4-5: after finger 3 plays C♯, the thumb passes under to D while the wrist stays level and quiet." },
      { type: "notation", title: "A major, one octave ascending", vexflowData: { clef: "treble", timeSignature: "4/4", notes: ["a/4", "b/4", "c#/5", "d/5", "e/5", "f#/5", "g#/5", "a/5"].map(keys => ({ keys: [keys], duration: "8" })) } },
      { type: "quiz", questions: [
        quiz("q31-1", "Which sharps belong to A major?", ["F♯ only", "F♯ and C♯", "F♯, C♯, and G♯", "C♯, G♯, and D♯"], 2, "A major sits three steps clockwise on the circle of fifths, so it carries the first three sharps: F♯, C♯, and G♯."),
        quiz("q31-2", "In the ascending right hand, after which finger does the thumb pass under?", ["Finger 2", "Finger 3", "Finger 4", "Finger 5"], 1, "The fingering is 1-2-3-1-2-3-4-5: after finger 3 plays C♯, the thumb tucks under to reach D."),
      ] },
      midiSection("exercise-31", "One octave of A major", "Play A4 up to A5 with fingers 1-2-3-1-2-3-4-5, one steady beat per note. Keep every sharp — F♯, C♯, and G♯ — and let the thumb pass under after finger 3 without a bump in the sound."),
    ],
    skillRewards: rewards({ technique: 3, theory: 2, keyboard_layout: 1, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-32", title: "F major and the first flat", level: "intermediate", branch: "theory", estimatedMinutes: 18,
    objectives: [
      "Explain why F major needs B♭ to keep the whole–half pattern",
      "Locate F major one step counterclockwise from C on the circle of fifths",
      "Play one octave of F major with the special 1-2-3-4-1-2-3-4 fingering",
    ],
    sections: [
      { type: "markdown", title: "Crossing to the flat side", body: "So far every key signature has added sharps by moving **clockwise** around the circle of fifths (lesson 15). Move one step **counterclockwise** from C — down a perfect fifth — and you reach F major, the first flat key.\n\nBuild the scale from F with the major pattern whole–whole–half–whole–whole–whole–half: F-G whole, G-A whole, then the third step must be a *half* step. A natural B is a whole step above A, so the note is lowered to **B♭**: A-B♭ half, B♭-C whole, C-D whole, D-E whole, E-F half. One flat, B♭, is all F major needs.\n\nThat black key also changes the fingering. The right hand avoids putting the thumb on B♭, so instead of the usual 1-2-3 thumb-under, F major ascends **1-2-3-4** and passes the thumb under *after finger 4*: 1-2-3-4-1-2-3-4 lands finger 4 on B♭ and the thumb comfortably on the white key C." },
      { type: "notation", title: "F major, one octave ascending", vexflowData: { clef: "treble", timeSignature: "4/4", notes: ["f/4", "g/4", "a/4", "bb/4", "c/5", "d/5", "e/5", "f/5"].map(keys => ({ keys: [keys], duration: "8" })) } },
      { type: "quiz", questions: [
        quiz("q32-1", "Which note is flat in F major?", ["E♭", "A♭", "B♭", "D♭"], 2, "The whole–half pattern demands a half step from A to the fourth degree, so B is lowered to B♭ — F major's only flat."),
        quiz("q32-2", "Why does the right-hand F-major fingering use 1-2-3-4 before the thumb passes under?", ["F major has more notes than other scales", "It keeps the thumb off the black key B♭", "The fourth finger is the strongest", "The scale descends instead of ascending"], 1, "Passing the thumb under after finger 4 puts finger 4 on B♭ and the thumb on white-key C, keeping the thumb off the black key."),
      ] },
      midiSection("exercise-32", "One octave of F major", "Play F4 up to F5 with fingers 1-2-3-4-1-2-3-4. Let finger 4 take B♭ and pass the thumb under to C. Keep the pulse even through the thumb crossing."),
    ],
    skillRewards: rewards({ theory: 3, note_reading: 2, technique: 2, timing: 1 }),
  }),
  defineLesson({
    id: "lesson-33", title: "A harmonic minor", level: "intermediate", branch: "theory", estimatedMinutes: 18,
    objectives: [
      "Raise the 7th degree of A natural minor from G to G♯",
      "Identify the augmented second between F and G♯",
      "Play one octave of A harmonic minor and hear the leading tone pull to A",
    ],
    sections: [
      { type: "theory-card", title: "One raised note, a new color", body: "Lesson 16 introduced the natural minor scale, whose seventh degree sits a whole step below the tonic. Harmonic minor raises that seventh degree by a semitone: in A minor, G becomes G♯. The scale is A-B-C-D-E-F-G♯-A. The raised note creates a leading tone that pulls strongly upward to A — the same magnetic half step that major keys enjoy. It also opens an unusually wide gap between the sixth and seventh degrees: F to G♯ is an augmented second, three semitones, which gives harmonic minor its distinctive, slightly exotic color. Keep the fingering identical to the natural-minor octave: 1-2-3-1-2-3-4-5 ascending." },
      { type: "notation", title: "A harmonic minor, one octave ascending", vexflowData: { clef: "treble", timeSignature: "4/4", notes: ["a/4", "b/4", "c/5", "d/5", "e/5", "f/5", "g#/5", "a/5"].map(keys => ({ keys: [keys], duration: "8" })) } },
      { type: "quiz", questions: [
        quiz("q33-1", "Which scale degree does harmonic minor raise compared with natural minor?", ["The 3rd", "The 5th", "The 6th", "The 7th"], 3, "Harmonic minor raises the seventh degree — G becomes G♯ in A minor — creating a leading tone that pulls to the tonic."),
        quiz("q33-2", "What interval separates F from G♯ in A harmonic minor?", ["A minor second", "A major second", "An augmented second", "A minor third"], 2, "F to G♯ spans three semitones but only one letter step, making it an augmented second — the scale's signature gap."),
      ] },
      midiSection("exercise-33", "One octave of A harmonic minor", "Play A4 up to A5 with fingers 1-2-3-1-2-3-4-5. Everything matches natural minor until the seventh note: reach up to G♯5, feel the wide stretch from F5, and let it lead into the final A."),
    ],
    skillRewards: rewards({ theory: 3, technique: 2, note_reading: 1, timing: 1 }),
  }),
  defineLesson({
    id: "lesson-34", title: "Broken-chord accompaniment", level: "intermediate", branch: "technique", estimatedMinutes: 20,
    objectives: [
      "Turn a block chord into the root–fifth–third–fifth broken pattern",
      "Keep a left-hand accompaniment light and even for four bars",
      "Change harmony from C major to G major without breaking the pulse",
    ],
    sections: [
      { type: "theory-card", title: "From block chords to accompaniment", body: "A block chord states a harmony all at once; an accompaniment keeps it alive across the bar. The classic left-hand recipe plays the chord one tone at a time in the order root–fifth–third–fifth: for C major, C-G-E-G. This broken pattern is the ancestor of the Alberti bass that powers countless classical pieces. Two habits make it musical: keep the left hand light — it supports a melody, it never competes with one — and keep every quarter note exactly even. Finger 5 anchors the root, the thumb takes the fifth, and finger 3 reaches the third in between." },
      { type: "notation", title: "The C-major broken pattern", vexflowData: { clef: "bass", timeSignature: "4/4", notes: ["c/3", "g/3", "e/3", "g/3", "c/3", "g/3", "e/3", "g/3"].map(keys => ({ keys: [keys], duration: "q" })) } },
      { type: "quiz", questions: [
        quiz("q34-1", "In what order does the broken-chord pattern play the chord tones?", ["Root, third, fifth, third", "Root, fifth, third, fifth", "Fifth, third, root, third", "Root, root, third, fifth"], 1, "The pattern is root–fifth–third–fifth: C-G-E-G for C major, the shape behind the Alberti bass."),
      ] },
      midiSection("exercise-34", "Four bars of broken chords", "With the left hand, play two bars of the C-major pattern C3-G3-E3-G3, then shift down for two bars of the G-major pattern G2-D3-B2-D3. Use fingers 5-1-3-1 throughout, keep every quarter note even, and stay light — this is accompaniment, not melody."),
    ],
    skillRewards: rewards({ technique: 3, chords: 3, rhythm: 2, timing: 2 }),
  }),
];
