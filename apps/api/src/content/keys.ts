import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { drill } from "./build.js";
import { defineLesson, midiSection, quiz, rewards } from "./helpers.js";

// Key coverage: scales and arpeggios out to four sharps (E major) and four flats (A♭
// major), plus E and D harmonic minor. Continues the classical path after lesson 34.

const ex = {
  // E major
  eTetrachords: drill({ id: "e-major-tetrachords", tempo: 72, level: "intermediate", notes: "E4 F#4 G#4 A4 | G#4 F#4 E4:2 | B4 C#5 D#5 E5 | D#5 C#5 B4:2" }),
  eArpeggio: drill({ id: "e-major-arpeggio", tempo: 72, level: "intermediate", notes: "E4 G#4 B4 E5 | B4 G#4 E4:2" }),
  eLh: drill({ id: "e-major-lh", tempo: 66, level: "intermediate", notes: "E2 F#2 G#2 A2 | B2 C#3 D#3 E3 | D#3 C#3 B2 A2 | G#2 F#2 E2:2" }),
  eHandsTogether: drill({
    id: "e-major-hands-together",
    tempo: 60,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "E4 F#4 G#4 A4 | B4 C#5 D#5 E5 | D#5 C#5 B4 A4 | G#4 F#4 E4:2" },
      { id: "lh", notes: "E3 F#3 G#3 A3 | B3 C#4 D#4 E4 | D#4 C#4 B3 A3 | G#3 F#3 E3:2", hand: "left" },
    ],
  }),
  // B♭ and E♭ major
  bbScale: drill({ id: "bb-major-up-down", tempo: 72, level: "intermediate", notes: "Bb4 C5 D5 Eb5 | F5 G5 A5 Bb5 | A5 G5 F5 Eb5 | D5 C5 Bb4:2" }),
  bbArpeggio: drill({ id: "bb-major-arpeggio", tempo: 72, level: "intermediate", notes: "Bb4 D5 F5 Bb5 | F5 D5 Bb4:2" }),
  ebScale: drill({ id: "eb-major-up-down", tempo: 72, level: "intermediate", notes: "Eb4 F4 G4 Ab4 | Bb4 C5 D5 Eb5 | D5 C5 Bb4 Ab4 | G4 F4 Eb4:2" }),
  ebArpeggio: drill({ id: "eb-major-arpeggio", tempo: 72, level: "intermediate", notes: "Eb4 G4 Bb4 Eb5 | Bb4 G4 Eb4:2" }),
  // A♭ major
  abTetrachords: drill({ id: "ab-major-tetrachords", tempo: 72, level: "intermediate", notes: "Ab4 Bb4 C5 Db5 | C5 Bb4 Ab4:2 | Eb5 F5 G5 Ab5 | G5 F5 Eb5:2" }),
  abScale: drill({ id: "ab-major-up-down", tempo: 72, level: "intermediate", notes: "Ab4 Bb4 C5 Db5 | Eb5 F5 G5 Ab5 | G5 F5 Eb5 Db5 | C5 Bb4 Ab4:2" }),
  abArpeggio: drill({ id: "ab-major-arpeggio", tempo: 72, level: "intermediate", notes: "Ab4 C5 Eb5 Ab5 | Eb5 C5 Ab4:2" }),
  abLh: drill({ id: "ab-major-lh", tempo: 66, level: "intermediate", notes: "Ab2 Bb2 C3 Db3 | Eb3 F3 G3 Ab3 | G3 F3 Eb3 Db3 | C3 Bb2 Ab2:2" }),
  // E and D harmonic minor
  eHarmonic: drill({ id: "e-harmonic-minor-up-down", tempo: 72, level: "intermediate", notes: "E4 F#4 G4 A4 | B4 C5 D#5 E5 | D#5 C5 B4 A4 | G4 F#4 E4:2" }),
  eCadence: drill({ id: "e-minor-cadence", tempo: 66, level: "intermediate", notes: "E4 G4 B4 E5 | B4 G4 E4:2 | [D#4 F#4 B4]:2 [E4 G4 B4]:2 | [D#4 F#4 A4 B4]:2 [E4 G4 B4]:2" }),
  dHarmonic: drill({ id: "d-harmonic-minor-up-down", tempo: 72, level: "intermediate", notes: "D4 E4 F4 G4 | A4 Bb4 C#5 D5 | C#5 Bb4 A4 G4 | F4 E4 D4:2" }),
  dCadence: drill({ id: "d-minor-cadence", tempo: 66, level: "intermediate", notes: "D4 F4 A4 D5 | A4 F4 D4:2 | [C#4 E4 A4]:2 [D4 F4 A4]:2 | [C#4 E4 G4 A4]:2 [D4 F4 A4]:2" }),
} satisfies Record<string, MidiExercise>;

export const keyExercises: MidiExercise[] = Object.values(ex);

export const keyLessons: Lesson[] = [
  defineLesson({
    id: "lesson-e-major", title: "E major: four sharps", level: "intermediate", branch: "technique",
    objectives: [
      "Spell E major with its four sharps: F♯, C♯, G♯ and D♯",
      "Play one octave of E major in each hand and hands together",
      "Play the E-major arpeggio with fingers 1-2-3-5",
    ],
    sections: [
      { type: "theory-card", title: "One more step around the circle", body: "E major is a fifth above A, so it keeps A major's three sharps and adds the next one in the order: D♯. The scale is E-F♯-G♯-A-B-C♯-D♯-E. Fingering is the same as C, G, D and A: right hand 1-2-3-1-2-3-4-5 up, left hand 5-4-3-2-1-3-2-1 up. Because the fingerings match, E is a good key to start playing scales hands together: both thumbs pass at different moments, so listen for one even line." },
      { type: "quiz", questions: [
        quiz("q-e-major-1", "Which sharp does E major add to A major's three?", ["B♯", "D♯", "E♯", "A♯"], 1, "Sharps are added in the order F, C, G, D: the fourth sharp is D♯."),
      ] },
      midiSection(ex.eTetrachords.exerciseId, "Warm-up: E major in two halves", "E-F♯-G♯-A, then B-C♯-D♯-E, each up and back."),
      midiSection(ex.eArpeggio.exerciseId, "E major arpeggio", "E-G♯-B-E and back, fingers 1-2-3-5."),
      midiSection(ex.eLh.exerciseId, "Left hand", "E2 up to E3 and back: 5-4-3-2-1-3-2-1."),
      midiSection(ex.eHandsTogether.exerciseId, "Challenge: hands together", "Both hands, an octave apart, up and back. Go slowly: the thumbs cross at different moments in each hand."),
    ],
    skillRewards: rewards({ technique: 3, theory: 2, keyboard_layout: 1 }),
  }),
  defineLesson({
    id: "lesson-bb-eb-major", title: "B♭ and E♭ major", level: "intermediate", branch: "technique",
    objectives: [
      "Spell B♭ major (B♭, E♭) and E♭ major (B♭, E♭, A♭)",
      "Play both scales one octave with flat-key fingerings that keep the thumb on white keys",
      "Play both arpeggios",
    ],
    sections: [
      { type: "theory-card", title: "The flat keys keep the thumb on white keys", body: "Moving counterclockwise from F adds flats in the order B♭, E♭, A♭. B♭ major has two flats (B♭, E♭); E♭ major has three (B♭, E♭, A♭). In these keys the thumb plays only white keys. B♭ major in the right hand starts with finger 4 on B♭: 4-1-2-3-1-2-3-4. E♭ major starts with finger 3: 3-1-2-3-4-1-2-3. The arpeggios use 1-2-3-5 or 2-1-2-4; play them with whatever keeps the thumb off the black keys." },
      { type: "quiz", questions: [
        quiz("q-bb-eb-1", "Which flats does E♭ major have?", ["B♭ and E♭", "B♭, E♭ and A♭", "E♭ and A♭", "B♭, E♭, A♭ and D♭"], 1, "Three flats, in order: B♭, E♭, A♭."),
      ] },
      midiSection(ex.bbScale.exerciseId, "B♭ major up and down", "B♭4 to B♭5 and back. Right hand 4-1-2-3-1-2-3-4."),
      midiSection(ex.bbArpeggio.exerciseId, "B♭ major arpeggio", "B♭-D-F-B♭ and back."),
      midiSection(ex.ebScale.exerciseId, "E♭ major up and down", "E♭4 to E♭5 and back. Right hand 3-1-2-3-4-1-2-3."),
      midiSection(ex.ebArpeggio.exerciseId, "Challenge: E♭ major arpeggio", "E♭-G-B♭-E♭ and back. Keep the thumb on G."),
    ],
    skillRewards: rewards({ technique: 3, theory: 2, keyboard_layout: 1 }),
  }),
  defineLesson({
    id: "lesson-ab-major", title: "A♭ major: four flats", level: "intermediate", branch: "technique",
    objectives: [
      "Spell A♭ major with its four flats: B♭, E♭, A♭ and D♭",
      "Play one octave of A♭ major in each hand",
      "Play the A♭-major arpeggio",
    ],
    sections: [
      { type: "theory-card", title: "Four flats", body: "A♭ major adds D♭ to E♭ major's three flats: A♭-B♭-C-D♭-E♭-F-G-A♭. Four of its eight notes are black keys. Right hand fingering is 3-4-1-2-3-1-2-3 going up; the left hand plays 3-2-1-4-3-2-1-3. As with every flat key, the thumbs land only on white keys (C and F for the right hand)." },
      { type: "quiz", questions: [
        quiz("q-ab-major-1", "Which is the fourth flat, added in A♭ major?", ["G♭", "D♭", "C♭", "F♭"], 1, "Flats are added B♭, E♭, A♭, D♭."),
      ] },
      midiSection(ex.abTetrachords.exerciseId, "Warm-up: A♭ major in two halves", "A♭-B♭-C-D♭, then E♭-F-G-A♭, each up and back."),
      midiSection(ex.abScale.exerciseId, "A♭ major up and down", "One octave, right hand 3-4-1-2-3-1-2-3."),
      midiSection(ex.abArpeggio.exerciseId, "A♭ major arpeggio", "A♭-C-E♭-A♭ and back."),
      midiSection(ex.abLh.exerciseId, "Challenge: left hand", "A♭2 up to A♭3 and back, fingers 3-2-1-4-3-2-1-3."),
    ],
    skillRewards: rewards({ technique: 3, theory: 2, keyboard_layout: 1 }),
  }),
  defineLesson({
    id: "lesson-e-d-harmonic-minor", title: "E and D harmonic minor", level: "intermediate", branch: "theory",
    objectives: [
      "Raise the seventh degree: D♯ in E minor, C♯ in D minor",
      "Play both harmonic minor scales one octave up and back",
      "Play the V – i cadence in each key and hear the leading tone resolve",
    ],
    sections: [
      { type: "theory-card", title: "The same raised seventh in new keys", body: "Lesson 33 raised A minor's seventh degree from G to G♯. Do the same in E minor and D minor: E harmonic minor is E-F♯-G-A-B-C-D♯-E, and D harmonic minor is D-E-F-G-A-B♭-C♯-D. The raised note is the leading tone, and it belongs to the dominant chord: B major (B-D♯-F♯) in E minor, A major (A-C♯-E) in D minor. That is why minor-key cadences sound so final: the leading tone rises a half step to the tonic." },
      { type: "quiz", questions: [
        quiz("q-e-d-harmonic-1", "Which note is raised in D harmonic minor?", ["B♭ to B", "C to C♯", "F to F♯", "A to A♯"], 1, "The seventh degree, C, is raised to C♯."),
      ] },
      midiSection(ex.eHarmonic.exerciseId, "E harmonic minor up and down", "One octave with F♯ and D♯. Fingers 1-2-3-1-2-3-4-5."),
      midiSection(ex.eCadence.exerciseId, "E minor: arpeggio and cadence", "The E-minor arpeggio, then B → Em and B7 → Em. Listen for D♯ rising to E."),
      midiSection(ex.dHarmonic.exerciseId, "D harmonic minor up and down", "One octave with B♭ and C♯: the step from B♭ to C♯ is the wide augmented second."),
      midiSection(ex.dCadence.exerciseId, "Challenge: D minor arpeggio and cadence", "The D-minor arpeggio, then A → Dm and A7 → Dm, with C♯ rising to D."),
    ],
    skillRewards: rewards({ theory: 3, technique: 2, chords: 1 }),
  }),
];
