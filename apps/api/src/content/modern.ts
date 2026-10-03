import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { drill } from "./build.js";
import { defineLesson, midiSection, quiz, rewards } from "./helpers.js";

// Modern Chords path: playing from chord symbols, the way pop and jazz players read a
// lead sheet. Chord symbols → left-hand patterns (block → broken → Alberti → arpeggiated →
// 1-5-8 → syncopated) → inversions for smooth voice leading → the common progressions
// (I–V–vi–IV, ii–V–I, 12-bar blues) → a melody over chords. Everything is original except
// the Jingle Bells chorus (James Lord Pierpont, 1857, public domain).
//
// The staff shows the notes; chord symbols are given in each exercise's instructions.

const PATH = "modern-chords" as const;

const ex = {
  // Chord symbols: C, F, G
  majorBlocks: drill({ id: "chords-c-f-g-blocks", tempo: 72, level: "elementary", notes: "[C4 E4 G4]:4 | [F4 A4 C5]:4 | [G4 B4 D5]:4 | [C4 E4 G4]:4" }),
  majorRead: drill({ id: "chords-c-f-g-read", tempo: 76, level: "elementary", notes: "[C4 E4 G4]:2 [F4 A4 C5]:2 | [C4 E4 G4]:2 [G4 B4 D5]:2 | [C4 E4 G4]:2 [F4 A4 C5]:2 | [G4 B4 D5]:2 [C4 E4 G4]:2" }),
  majorWithRoot: drill({
    id: "chords-c-f-g-with-root",
    tempo: 72,
    level: "elementary",
    notes: [
      { id: "rh", notes: "[C4 E4 G4]:4 | [F4 A4 C5]:4 | [G4 B4 D5]:4 | [C4 E4 G4]:4" },
      { id: "lh", notes: "C3:4 | F2:4 | G2:4 | C3:4" },
    ],
  }),
  // Minor chord symbols
  minorBlocks: drill({ id: "chords-am-dm-em-blocks", tempo: 72, level: "elementary", notes: "[A3 C4 E4]:4 | [D4 F4 A4]:4 | [E4 G4 B4]:4 | [A3 C4 E4]:4" }),
  majorMinorMix: drill({ id: "chords-major-minor-mix", tempo: 76, level: "elementary", notes: "[C4 E4 G4]:2 [A3 C4 E4]:2 | [D4 F4 A4]:2 [G3 B3 D4]:2 | [C4 E4 G4]:2 [E4 G4 B4]:2 | [F4 A4 C5]:2 [G4 B4 D5]:2" }),
  minorWithRoot: drill({
    id: "chords-minor-with-root",
    tempo: 72,
    level: "elementary",
    notes: [
      { id: "rh", hand: "right", notes: "[A3 C4 E4]:4 | [D4 F4 A4]:4 | [E4 G4 B4]:4 | [A3 C4 E4]:4" },
      { id: "lh", notes: "A2:4 | D3:4 | E3:4 | A2:4" },
    ],
  }),
  // Sevenths and sus chords
  sevenths: drill({ id: "chords-sevenths", tempo: 66, level: "elementary", notes: "[C4 E4 G4 B4]:4 | [A3 C4 E4 G4]:4 | [D4 F4 A4 C5]:4 | [G3 B3 D4 F4]:4" }),
  susResolve: drill({ id: "chords-sus-resolve", tempo: 66, level: "elementary", notes: "[C4 F4 G4]:2 [C4 E4 G4]:2 | [C4 D4 G4]:2 [C4 E4 G4]:2 | [G3 C4 D4]:2 [G3 B3 D4]:2 | [C4 E4 G4]:4" }),
  seventhsVoiceLeading: drill({ id: "chords-sevenths-voice-leading", tempo: 66, level: "elementary", notes: "[A3 C4 E4 G4]:4 | [A3 C4 D4 F4]:4 | [G3 B3 D4 F4]:4 | [G3 B3 C4 E4]:4" }),
  // Left hand: block and broken
  lhBlock: drill({ id: "lh-block-chords", tempo: 72, level: "elementary", notes: "[C3 E3 G3]:4 | [G2 B2 D3]:4 | [A2 C3 E3]:4 | [F2 A2 C3]:4" }),
  lhBroken: drill({ id: "lh-broken-chords", tempo: 76, level: "elementary", notes: "C3 E3 G3 E3 | G2 B2 D3 B2 | A2 C3 E3 C3 | F2 A2 C3 A2" }),
  lhBlockMelody: drill({
    id: "lh-block-under-melody",
    tempo: 66,
    level: "elementary",
    notes: [
      { id: "rh", notes: "G4:2 E4:2 | D4:4 | E4:2 C4:2 | C4:4" },
      { id: "lh", notes: "[C3 E3 G3]:4 | [G2 B2 D3]:4 | [A2 C3 E3]:4 | [F2 A2 C3]:4" },
    ],
  }),
  // Alberti and arpeggiated
  alberti: drill({
    id: "lh-alberti",
    tempo: 72,
    level: "intermediate",
    notes: "C3:0.5 G3:0.5 E3:0.5 G3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 | B2:0.5 G3:0.5 D3:0.5 G3:0.5 B2:0.5 G3:0.5 D3:0.5 G3:0.5 | C3:0.5 G3:0.5 E3:0.5 G3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 | C3:4",
  }),
  arpeggiated: drill({ id: "lh-arpeggiated", tempo: 80, level: "intermediate", notes: "C3 E3 G3 C4 | G2 B2 D3 G3 | A2 C3 E3 A3 | F2 A2 C3 F3" }),
  albertiMelody: drill({
    id: "alberti-under-melody",
    tempo: 63,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "E4:2 F4 E4 | D4:4 | E4:2 G4:2 | C4:4" },
      {
        id: "lh",
        notes: "C3:0.5 G3:0.5 E3:0.5 G3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 | B2:0.5 G3:0.5 D3:0.5 G3:0.5 B2:0.5 G3:0.5 D3:0.5 G3:0.5 | C3:0.5 G3:0.5 E3:0.5 G3:0.5 C3:0.5 G3:0.5 E3:0.5 G3:0.5 | C3:4",
      },
    ],
  }),
  // Pop patterns
  lh158: drill({ id: "lh-1-5-8", tempo: 80, level: "intermediate", notes: "C3 G3 C4:2 | G2 D3 G3:2 | A2 E3 A3:2 | F2 C3 F3:2" }),
  lhSyncopated: drill({ id: "lh-syncopated-1-5-8", tempo: 76, level: "intermediate", notes: "C3:1.5 G3:0.5 C4:2 | G2:1.5 D3:0.5 G3:2 | A2:1.5 E3:0.5 A3:2 | F2:1.5 C3:0.5 F3:2" }),
  rhSyncopatedComping: drill({
    id: "rh-syncopated-comping",
    tempo: 72,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[E4 G4 C5]:1.5 [E4 G4 C5]:1 [E4 G4 C5]:1.5 | [D4 G4 B4]:1.5 [D4 G4 B4]:1 [D4 G4 B4]:1.5 | [E4 A4 C5]:1.5 [E4 A4 C5]:1 [E4 A4 C5]:1.5 | [F4 A4 C5]:1.5 [F4 A4 C5]:1 [F4 A4 C5]:1.5" },
      { id: "lh", notes: "C3:4 | G2:4 | A2:4 | F2:4" },
    ],
  }),
  // Inversions for voice leading
  vlMajor: drill({ id: "vl-c-f-g-c", tempo: 72, level: "intermediate", notes: "[C4 E4 G4]:4 | [C4 F4 A4]:4 | [B3 D4 G4]:4 | [C4 E4 G4]:4" }),
  vlMinor: drill({ id: "vl-am-dm-e-am", tempo: 72, level: "intermediate", notes: "[A3 C4 E4]:4 | [A3 D4 F4]:4 | [G#3 B3 E4]:4 | [A3 C4 E4]:4" }),
  vlWithBass: drill({
    id: "vl-pop-with-bass",
    tempo: 72,
    level: "intermediate",
    notes: [
      { id: "rh", hand: "right", notes: "[C4 E4 G4]:2 [B3 D4 G4]:2 | [C4 E4 A4]:2 [C4 F4 A4]:2 | [C4 E4 G4]:2 [B3 D4 G4]:2 | [C4 E4 G4]:4" },
      { id: "lh", notes: "C3:2 B2:2 | A2:2 F2:2 | C3:2 G2:2 | C3:4" },
    ],
  }),
  // Progressions
  popC: drill({
    id: "prog-pop-c",
    tempo: 80,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[E4 G4 C5]:4 | [D4 G4 B4]:4 | [E4 A4 C5]:4 | [F4 A4 C5]:4" },
      { id: "lh", notes: "C3:4 | G2:4 | A2:4 | F2:4" },
    ],
  }),
  popG: drill({
    id: "prog-pop-g",
    tempo: 80,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[D4 G4 B4]:4 | [D4 F#4 A4]:4 | [E4 G4 B4]:4 | [E4 G4 C5]:4" },
      { id: "lh", notes: "G2:4 | D3:4 | E3:4 | C3:4" },
    ],
  }),
  twoFiveOneC: drill({
    id: "prog-ii-v-i-c",
    tempo: 72,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[F4 A4 C5]:4 | [F4 G4 B4]:4 | [E4 G4 B4]:4 | [E4 G4 C5]:4" },
      { id: "lh", notes: "D3:4 | G2:4 | C3:4 | C3:4" },
    ],
  }),
  twoFiveOneF: drill({
    id: "prog-ii-v-i-f",
    tempo: 72,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[F4 Bb4 D5]:4 | [E4 Bb4 C5]:4 | [E4 A4 C5]:4 | [F4 A4 C5]:4" },
      { id: "lh", notes: "G2:4 | C3:4 | F2:4 | F2:4" },
    ],
  }),
  // 12-bar blues
  bluesWalk: drill({ id: "blues-lh-walk", tempo: 84, level: "intermediate", keySignature: { fifths: 0, mode: "major" }, notes: "C3 E3 G3 A3 | Bb3 A3 G3 E3 | F2 A2 C3 D3 | Eb3 D3 C3 A2" }),
  bluesRoots: drill({ id: "blues-roots", tempo: 96, level: "intermediate", notes: "C3:4 | C3:4 | C3:4 | C3:4 | F2:4 | F2:4 | C3:4 | C3:4 | G2:4 | F2:4 | C3:4 | G2:4" }),
  bluesChords: drill({
    id: "blues-chords",
    tempo: 88,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "[E4 G4 Bb4]:4 | [E4 G4 Bb4]:4 | [E4 G4 Bb4]:4 | [E4 G4 Bb4]:4 | [Eb4 F4 A4]:4 | [Eb4 F4 A4]:4 | [E4 G4 Bb4]:4 | [E4 G4 Bb4]:4 | [F4 G4 B4]:4 | [Eb4 F4 A4]:4 | [E4 G4 Bb4]:4 | [F4 G4 B4]:4" },
      { id: "lh", notes: "C3:4 | C3:4 | C3:4 | C3:4 | F2:4 | F2:4 | C3:4 | C3:4 | G2:4 | F2:4 | C3:4 | G2:4" },
    ],
  }),
  // Lead sheet
  leadChords: drill({
    id: "lead-sheet-chords",
    tempo: 92,
    level: "intermediate",
    notes: "[C3 E3 G3]:4 | [C3 E3 G3]:4 | [C3 E3 G3]:4 | [C3 E3 G3]:4 | [F2 A2 C3]:4 | [C3 E3 G3]:4 | [G2 B2 D3]:4 | [G2 B2 D3 F3]:4",
  }),
  leadMelody: drill({
    id: "lead-sheet-melody",
    tempo: 100,
    level: "intermediate",
    notes: "E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2",
  }),
  leadTogether: drill({
    id: "lead-sheet-together",
    tempo: 88,
    level: "intermediate",
    notes: [
      { id: "rh", notes: "E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2" },
      { id: "lh", notes: "C3:4 | C3:4 | C3:4 | C3:4 | F2:4 | C3:4 | G2:4 | G2:4" },
    ],
  }),
} satisfies Record<string, MidiExercise>;

export const modernExercises: MidiExercise[] = Object.values(ex);

export const modernLessons: Lesson[] = [
  defineLesson({
    id: "lesson-chords-major-symbols", path: PATH, title: "Chord symbols: C, F and G", level: "elementary", branch: "theory",
    objectives: [
      "Turn the chord symbols C, F and G into root-position triads without reading notes",
      "Change between the three chords on the beat",
    ],
    sections: [
      { type: "theory-card", title: "Reading a chord symbol", body: "Pop, rock and jazz musicians read chord symbols: a letter above the melody that names the harmony. A capital letter alone means a major triad: C means C-E-G, F means F-A-C, G means G-B-D. To play one, put your thumb on the named note and fingers 3 and 5 on the notes a third and a fifth above. These three chords, the I, IV and V of C major, accompany thousands of songs." },
      { type: "quiz", questions: [
        quiz("q-chords-major-1", "Which notes does the chord symbol F stand for?", ["F-A-C", "F-A♭-C", "F-G-C", "F-B-D"], 0, "A capital letter alone is a major triad: F, its major third A, and its fifth C."),
      ] },
      midiSection(ex.majorBlocks.exerciseId, "C – F – G – C", "One chord per bar, right hand, root position: C, F, G, C. Keep the 1-3-5 shape and move the whole hand."),
      midiSection(ex.majorRead.exerciseId, "Two chords per bar", "C F | C G | C F | G C, half notes. Move to the next chord during the last beat of the one you're holding."),
      midiSection(ex.majorWithRoot.exerciseId, "Challenge: add the root in the left hand", "Left hand plays each chord's name note low (C3, F2, G2, C3) while the right hand plays the chord."),
    ],
    skillRewards: rewards({ chords: 3, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-minor-symbols", path: PATH, title: "Minor chord symbols: Am, Dm, Em", level: "elementary", branch: "theory",
    objectives: [
      "Read a lowercase m as a minor triad and play Am, Dm and Em",
      "Mix major and minor chords in a four-bar progression",
    ],
    sections: [
      { type: "theory-card", title: "The small m", body: "A small m after the letter means minor: Am is A-C-E, Dm is D-F-A, Em is E-G-B. In C major these three minor chords sit on the 6th, 2nd and 3rd notes of the scale, so they use only white keys, just like C, F and G. With six chords (C, Dm, Em, F, G, Am) you can play most songs written in C." },
      { type: "quiz", questions: [
        quiz("q-chords-minor-1", "What does Dm mean?", ["D-F♯-A", "D-F-A", "D-F-A♭", "D-G-A"], 1, "The small m makes it minor: the third is F, a minor third above D."),
      ] },
      midiSection(ex.minorBlocks.exerciseId, "Am – Dm – Em – Am", "One minor chord per bar, right hand in root position."),
      midiSection(ex.majorMinorMix.exerciseId, "Major and minor mixed", "C Am | Dm G | C Em | F G, two chords per bar."),
      midiSection(ex.minorWithRoot.exerciseId, "Challenge: minor chords with roots", "Left hand plays A2, D3, E3, A2 under the right-hand chords."),
    ],
    skillRewards: rewards({ chords: 3, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-sevenths-sus", path: PATH, title: "Sevenths and sus chords", level: "elementary", branch: "theory",
    objectives: [
      "Play Cmaj7, Am7, Dm7 and G7 from their symbols",
      "Resolve Csus4, Csus2 and Gsus4 to their plain triads",
    ],
    sections: [
      { type: "theory-card", title: "Four-note chords and suspended chords", body: "A 7 adds a fourth note a seventh above the root. G7 (G-B-D-F) and the minor sevenths Am7 (A-C-E-G) and Dm7 (D-F-A-C) add the note a whole step below the octave. Cmaj7 (C-E-G-B) adds the note a half step below it, a softer, dreamier colour. 'Sus' replaces the third: Csus4 is C-F-G and Csus2 is C-D-G. With no third the chord is neither major nor minor, and it usually resolves back to the plain triad." },
      { type: "quiz", questions: [
        quiz("q-chords-sus-1", "Which note does Csus4 use instead of E?", ["D", "F", "G", "B♭"], 1, "Sus4 replaces the third with the fourth: C-F-G."),
        quiz("q-chords-sevenths-1", "Which chord is Cmaj7?", ["C-E-G-B♭", "C-E-G-B", "C-E♭-G-B♭", "C-F-G-B"], 1, "maj7 adds the major seventh, B, a half step below the octave."),
      ] },
      midiSection(ex.sevenths.exerciseId, "Cmaj7 – Am7 – Dm7 – G7", "Four-note chords, one per bar. Use fingers 1-2-3-5."),
      midiSection(ex.susResolve.exerciseId, "Sus chords resolving", "Csus4 → C, Csus2 → C, Gsus4 → G, then C. Only one finger moves in each resolution."),
      midiSection(ex.seventhsVoiceLeading.exerciseId, "Challenge: Am7 – Dm7 – G7 – Cmaj7", "Voiced to stay close together: each change moves as few fingers as possible."),
    ],
    skillRewards: rewards({ chords: 4, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-lh-block-broken", path: PATH, title: "Left hand: block and broken chords", level: "elementary", branch: "technique",
    objectives: [
      "Play C, G, Am and F as left-hand block chords",
      "Break each chord into a root–third–fifth–third pattern",
      "Hold a left-hand chord under a simple right-hand melody",
    ],
    sections: [
      { type: "theory-card", title: "The accompaniment hand", body: "In most pop playing the left hand supplies the harmony and the right hand plays the melody or a second layer of chords. The simplest left-hand pattern is a block chord held for the whole bar. The next step is a broken chord: the same notes one at a time, root–third–fifth–third, which keeps the sound moving. The progression here, C – G – Am – F, is one of the most common in pop music." },
      midiSection(ex.lhBlock.exerciseId, "Block chords", "Left hand: C, G, Am, F, one block chord per bar. Fingers 5-3-1."),
      midiSection(ex.lhBroken.exerciseId, "Broken chords", "The same chords, broken root–third–fifth–third in quarter notes."),
      midiSection(ex.lhBlockMelody.exerciseId, "Challenge: under a melody", "Left hand holds each block chord while the right hand plays half notes on top."),
    ],
    skillRewards: rewards({ chords: 3, technique: 3 }),
  }),
  defineLesson({
    id: "lesson-chords-alberti-arpeggio", path: PATH, title: "Alberti and arpeggiated accompaniment", level: "intermediate", branch: "technique",
    objectives: [
      "Play an Alberti bass (low–high–middle–high) in even eighth notes",
      "Play arpeggiated root–third–fifth–octave patterns",
      "Keep an Alberti bass even under a right-hand melody",
    ],
    sections: [
      { type: "theory-card", title: "Patterns that keep moving", body: "An Alberti bass plays the chord low–high–middle–high (C-G-E-G) in eighth notes. It is named after Domenico Alberti and drives countless classical sonatas, but it works just as well under a ballad. An arpeggiated pattern climbs through the chord: root, third, fifth, octave (C-E-G-C). The second Alberti bar uses G major with B in the bass, so the hand barely moves between chords." },
      midiSection(ex.alberti.exerciseId, "Alberti bass", "C, then G with B in the bass, then C: low–high–middle–high in eighth notes. Fingers 5-1-3-1."),
      midiSection(ex.arpeggiated.exerciseId, "Arpeggiated chords", "C, G, Am, F, each climbing root–third–fifth–octave in quarter notes."),
      midiSection(ex.albertiMelody.exerciseId, "Challenge: Alberti under a melody", "The right hand plays a slow melody over the Alberti bass. Keep the eighths even even when the right hand moves."),
    ],
    skillRewards: rewards({ technique: 3, chords: 2, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-pop-patterns", path: PATH, title: "Pop patterns: 1-5-8 and syncopation", level: "intermediate", branch: "technique",
    objectives: [
      "Play the 1-5-8 left-hand pattern through C – G – Am – F",
      "Play a dotted 1-5-8 rhythm",
      "Play syncopated right-hand chords (3 + 3 + 2) over held roots",
    ],
    sections: [
      { type: "theory-card", title: "The pop piano left hand", body: "The 1-5-8 pattern plays the root, the fifth, and the octave: C-G-C for C major. It leaves out the third, so it sounds open and strong, and it works under major and minor chords alike. Add a dotted rhythm (long–short–long) and it starts to groove. Many pop songs push the right-hand chords off the beat: three eighths + three eighths + two eighths, counted 1-2-3 1-2-3 1-2." },
      midiSection(ex.lh158.exerciseId, "1-5-8", "Left hand: root, fifth, octave held for two beats. C, G, Am, F."),
      midiSection(ex.lhSyncopated.exerciseId, "Dotted 1-5-8", "Dotted quarter root, eighth fifth, half-note octave in every bar."),
      midiSection(ex.rhSyncopatedComping.exerciseId, "Challenge: 3 + 3 + 2 chords", "Right-hand chords on beat 1, the 'and' of 2, and beat 4, over left-hand roots held for the whole bar. Count eighths aloud."),
    ],
    skillRewards: rewards({ rhythm: 3, chords: 3, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-voice-leading", path: PATH, title: "Inversions for smooth chord changes", level: "intermediate", branch: "theory",
    objectives: [
      "Use inversions to move between chords with the fewest finger changes",
      "Play I – IV – V – I in C and i – iv – V – i in A minor with smooth voicings",
    ],
    sections: [
      { type: "theory-card", title: "Move as little as possible", body: "Jumping the whole hand from C (C-E-G) to F (F-A-C) to G (G-B-D) is clumsy. Instead, keep the notes chords share and move the others to the nearest chord tone: C-E-G → C-F-A → B-D-G → C-E-G. Each chord is now an inversion, but the hand hardly moves and the harmony flows. Written as symbols, an inversion with a particular bass note uses a slash: G/B means G major with B in the bass." },
      { type: "quiz", questions: [
        quiz("q-chords-voice-leading-1", "Going from C (C-E-G) to F, which voicing moves the fewest notes?", ["F-A-C", "C-F-A", "A-C-F", "F-C-A"], 1, "C-F-A keeps C and moves E up to F and G up to A, a step each."),
      ] },
      midiSection(ex.vlMajor.exerciseId, "C – F – G – C, voiced close", "C, F (C-F-A), G (B-D-G), C. Feel how little the hand moves."),
      midiSection(ex.vlMinor.exerciseId, "Am – Dm – E – Am", "The same idea in A minor, with G♯ in the E chord."),
      midiSection(ex.vlWithBass.exerciseId, "Challenge: C – G/B – Am – F with a bass line", "Right hand voiced close; the left hand walks C, B, A, F, then C, G, C."),
    ],
    skillRewards: rewards({ chords: 4, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-progressions", path: PATH, title: "Progressions: I–V–vi–IV and ii–V–I", level: "intermediate", branch: "repertoire",
    objectives: [
      "Play I – V – vi – IV in C and in G with both hands",
      "Play ii – V – I in C and F with rootless seventh-chord voicings",
    ],
    sections: [
      { type: "theory-card", title: "Two progressions to know by heart", body: "Roman numerals name chords by their place in the key, so a progression works in any key. I – V – vi – IV is C – G – Am – F in C and G – D – Em – C in G: it underpins a huge share of pop songs. ii – V – I is the backbone of jazz: Dm7 – G7 – Cmaj7 in C, Gm7 – C7 – Fmaj7 in F. Here the right hand plays seventh chords without their roots; the left hand supplies the roots." },
      { type: "quiz", questions: [
        quiz("q-chords-progressions-1", "In G major, what is vi?", ["Am", "Em", "D", "Bm"], 1, "Count up the G-major scale: G A B C D E — the sixth note is E, and its chord is E minor."),
      ] },
      midiSection(ex.popC.exerciseId, "I – V – vi – IV in C", "C – G – Am – F. Right-hand voicings stay close; left hand plays roots."),
      midiSection(ex.popG.exerciseId, "I – V – vi – IV in G", "G – D – Em – C, with F♯ in the D chord."),
      midiSection(ex.twoFiveOneC.exerciseId, "ii – V – I in C", "Dm7 – G7 – Cmaj7 – C. The right hand moves one finger at a time."),
      midiSection(ex.twoFiveOneF.exerciseId, "Challenge: ii – V – I in F", "Gm7 – C7 – Fmaj7 – F, with B♭ in the first two chords."),
    ],
    skillRewards: rewards({ chords: 4, theory: 2, technique: 1 }),
  }),
  defineLesson({
    id: "lesson-chords-twelve-bar-blues", path: PATH, title: "The 12-bar blues", level: "intermediate", branch: "repertoire",
    objectives: [
      "Play the 12-bar blues form in C from memory: four bars of I, two of IV, two of I, then V – IV – I – V",
      "Play C7, F7 and G7 over their roots through the whole form",
    ],
    sections: [
      { type: "theory-card", title: "Twelve bars, three chords", body: "The 12-bar blues uses only I, IV and V, usually as dominant seventh chords (C7, F7, G7 in C). The form is: C7 for four bars, F7 for two, C7 for two, then G7, F7, C7, and G7 to turn around to the top. A bluesy left hand walks up the chord and back: C-E-G-A-B♭-A-G-E. Learn the form until you can feel where you are without counting bars." },
      { type: "quiz", questions: [
        quiz("q-chords-blues-1", "In the 12-bar blues in C, which chord comes in bars 5 and 6?", ["C7", "F7", "G7", "Am"], 1, "Bars 5–6 move to IV, which is F7 in C."),
      ] },
      midiSection(ex.bluesWalk.exerciseId, "Warm-up: walking blues bass", "Left hand walks up and down C7 for two bars, then F7 for two (with E♭)."),
      midiSection(ex.bluesRoots.exerciseId, "The form in roots", "Left hand only: the root of each bar's chord, one whole note per bar, all twelve bars."),
      midiSection(ex.bluesChords.exerciseId, "Challenge: the whole form, hands together", "Right hand plays C7 (E-G-B♭), F7 (E♭-F-A) and G7 (F-G-B) over the left-hand roots, twelve bars without stopping."),
    ],
    skillRewards: rewards({ chords: 3, rhythm: 2, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-chords-lead-sheet", path: PATH, title: "Melody over chords: a lead sheet", level: "intermediate", branch: "repertoire",
    objectives: [
      "Play a lead sheet's chords alone, then its melody alone",
      "Put the melody over left-hand roots, changing bass notes where the chord symbols change",
    ],
    sections: [
      { type: "markdown", title: "Reading a lead sheet", body: "A **lead sheet** gives only the melody and the chord symbols above it; the accompaniment is up to you. This one is the chorus of **Jingle Bells** (James Lord Pierpont, 1857, public domain). The chords, one per bar:\n\n- Bars 1–4: **C**\n- Bar 5: **F**\n- Bar 6: **C**\n- Bar 7: **G**\n- Bar 8: **G7**\n\nLearn it in layers: the chords alone, the melody alone, then the melody with the simplest left hand of all, one root per bar. Once that is steady, any pattern from this path (broken, 1-5-8, Alberti) can replace the roots." },
      midiSection(ex.leadChords.exerciseId, "The chords alone", "Left-hand block chords: C for four bars, F, C, G, G7."),
      midiSection(ex.leadMelody.exerciseId, "The melody alone", "Right hand, Jingle Bells chorus. Watch the dotted rhythms in bars 3 and 5."),
      midiSection(ex.leadTogether.exerciseId, "Challenge: melody and bass", "Melody in the right hand, one root per bar in the left (C C C C F C G G)."),
    ],
    skillRewards: rewards({ chords: 3, sight_reading: 2, technique: 2 }),
  }),
];
