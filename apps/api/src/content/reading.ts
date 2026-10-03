import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { drill } from "./build.js";
import { defineLesson, midiSection, quiz, rewards } from "./helpers.js";

// Reading & Rhythm path: graded sight-reading studies interleaved with rhythm drills.
// Every study is original. Reading order: C position → G and F positions → reading by
// interval → hands together → ledger lines → key signatures (up to three sharps and three
// flats) → syncopation. The rhythm drills use one fixed key (middle C) because the scorer
// always checks pitch; with a single key, the only thing left to get wrong is the rhythm.

const ex = {
  // C position
  cRh1: drill({ id: "read-c-rh-1", tempo: 76, level: "elementary", notes: "C4 E4 D4 F4 | E4:2 G4:2 | F4 D4 E4 C4 | D4:2 C4:2" }),
  cLh1: drill({ id: "read-c-lh-1", tempo: 76, level: "elementary", notes: "G3 F3 E3:2 | D3 E3 F3 D3 | C3 D3 E3 F3 | G3:4" }),
  cRh2: drill({ id: "read-c-rh-2", tempo: 80, level: "elementary", notes: "E4:2 D4 C4 | D4 E4 F4:2 | G4 F4 E4 D4 | E4 D4 C4:2" }),
  cAlternate: drill({
    id: "read-c-alternating",
    tempo: 76,
    level: "elementary",
    notes: [
      { id: "rh", notes: "E4 F4 G4:2 | r:4 | D4 E4 F4:2 | r:4" },
      { id: "lh", notes: "r:4 | G3 F3 E3:2 | r:4 | E3 D3 C3:2" },
    ],
  }),
  // Rhythm: rests
  quarterRests: drill({ id: "rhythm-quarter-rests", tempo: 80, level: "elementary", notes: "C4 r C4 r | C4 C4 r C4 | C4 r C4 C4 | C4:2 r:2" }),
  halfRests: drill({ id: "rhythm-half-rests", tempo: 80, level: "elementary", notes: "C4:2 r:2 | C4 C4 r:2 | r:2 C4:2 | C4:4" }),
  restsChallenge: drill({ id: "rhythm-rests-challenge", tempo: 88, level: "elementary", notes: "C4 r C4:2 | r C4 C4 r | C4:2 r C4 | r C4 r C4 | C4:4" }),
  // G and F positions
  gRh: drill({ id: "read-g-rh", tempo: 76, level: "elementary", notes: "G4 A4 B4 C5 | D5:2 B4:2 | C5 A4 B4 G4 | A4:2 G4:2" }),
  gLh: drill({ id: "read-g-lh", tempo: 76, level: "elementary", notes: "D3 C3 B2 A2 | G2:2 B2:2 | A2 C3 B2 D3 | G2:4" }),
  fRh: drill({ id: "read-f-rh", tempo: 76, level: "elementary", notes: "F4 G4 A4 Bb4 | C5:2 A4:2 | Bb4 G4 A4 F4 | G4:2 F4:2" }),
  gfSwitch: drill({ id: "read-g-f-switch", tempo: 72, level: "elementary", notes: "G4 B4 A4 C5 | D5:2 G4:2 | F4 A4 G4 Bb4 | C5:2 F4:2" }),
  // Reading by interval
  secondsThirds: drill({ id: "read-intervals-seconds-thirds", tempo: 76, level: "elementary", notes: "C4 D4 F4 E4 | G4 E4 F4 D4 | E4 C4 D4 B3 | C4:4" }),
  fourthsFifths: drill({ id: "read-intervals-fourths-fifths", tempo: 72, level: "elementary", notes: "C4 F4 G4 C5 | G4 D4 E4 A4 | F4 C4 D4 G4 | C4:4" }),
  intervalsMixed: drill({ id: "read-intervals-mixed", tempo: 72, level: "elementary", notes: "E4 G4 C5 B4 | A4 F4 D4 G4 | E4 A4 G4 D4 | C4:4" }),
  // Rhythm: eighth notes
  eighthPairs: drill({ id: "rhythm-eighth-pairs", tempo: 72, level: "elementary", notes: "C4:0.5 C4:0.5 C4 C4:0.5 C4:0.5 C4 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:2" }),
  eighthsRests: drill({ id: "rhythm-eighths-and-rests", tempo: 72, level: "elementary", notes: "C4:0.5 C4:0.5 r C4:0.5 C4:0.5 r | C4 C4:0.5 C4:0.5 C4:2" }),
  eighthsChallenge: drill({
    id: "rhythm-eighths-challenge",
    tempo: 76,
    level: "elementary",
    notes: "C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4 C4 | C4:0.5 C4:0.5 C4 C4:0.5 C4:0.5 C4 | C4 r:0.5 C4:0.5 C4 C4 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:2",
  }),
  // Hands together
  ht1: drill({
    id: "read-ht-1",
    tempo: 66,
    level: "elementary",
    notes: [
      { id: "rh", notes: "C4 D4 E4 F4 | G4:4 | F4 E4 D4 E4 | C4:4" },
      { id: "lh", notes: "C3:4 | C3:4 | G2:4 | C3:4" },
    ],
  }),
  ht2: drill({
    id: "read-ht-2",
    tempo: 66,
    level: "elementary",
    notes: [
      { id: "rh", notes: "E4 E4 D4 C4 | D4 E4 D4:2 | E4 F4 G4 E4 | D4 D4 C4:2" },
      { id: "lh", notes: "C3:2 G2:2 | B2:2 G2:2 | C3:2 E3:2 | G2:2 C3:2" },
    ],
  }),
  ht3: drill({
    id: "read-ht-3",
    tempo: 63,
    level: "elementary",
    notes: [
      { id: "rh", notes: "B4 A4 G4 A4 | B4 B4 B4:2 | A4 A4 B4 A4 | G4:4" },
      { id: "lh", notes: "G2:2 D3:2 | G2:2 B2:2 | D3:2 F#3:2 | G2:4" },
    ],
  }),
  // Ledger lines
  ledgerHigh: drill({ id: "read-ledger-high", tempo: 66, level: "intermediate", notes: "G5 A5 B5 C6 | B5 A5 G5:2 | E5 G5 A5 C6 | B5 G5 A5:2" }),
  ledgerLow: drill({ id: "read-ledger-low", tempo: 66, level: "intermediate", notes: "C3 B2 A2 G2 | F2 E2 D2 C2 | D2 E2 F2 G2 | C2:4" }),
  ledgerMiddle: drill({ id: "read-ledger-middle-c", tempo: 66, level: "intermediate", notes: "A3 B3 C4 D4 | C4 B3 A3 G3 | B3 C4 D4 E4 | C4:4" }),
  // Rhythm: 3/4, dotted notes and ties
  threeFour: drill({ id: "rhythm-three-four", tempo: 88, level: "elementary", beatsPerBar: 3, notes: "C4 C4 C4 | C4:2 C4 | C4:3 | C4 C4:2 | C4:3" }),
  dottedQuarters: drill({ id: "rhythm-dotted-quarters", tempo: 72, level: "intermediate", notes: "C4:1.5 C4:0.5 C4:1.5 C4:0.5 | C4:1.5 C4:0.5 C4:2 | C4 C4:1.5 C4:0.5 C4 | C4:4" }),
  tiesAcross: drill({ id: "rhythm-ties-across", tempo: 72, level: "intermediate", notes: "C4 C4 C4 C4:2 C4 C4 C4 | C4:4" }),
  // Key signatures
  keyG: drill({ id: "read-key-g", tempo: 72, level: "intermediate", keySignature: { fifths: 1, mode: "major" }, notes: "G4 B4 A4 F#4 | G4 D5 C5 B4 | A4 F#4 G4 A4 | G4:4" }),
  keyD: drill({ id: "read-key-d", tempo: 72, level: "intermediate", keySignature: { fifths: 2, mode: "major" }, notes: "D4 F#4 E4 G4 | F#4 A4 B4 C#5 | D5 A4 F#4 E4 | D4:4" }),
  keyA: drill({ id: "read-key-a", tempo: 72, level: "intermediate", keySignature: { fifths: 3, mode: "major" }, notes: "A4 C#5 B4 G#4 | A4 E4 F#4 G#4 | A4 B4 C#5 E5 | A4:4" }),
  keyF: drill({ id: "read-key-f", tempo: 72, level: "intermediate", keySignature: { fifths: -1, mode: "major" }, notes: "F4 A4 G4 Bb4 | A4 C5 D5 C5 | Bb4 G4 E4 G4 | F4:4" }),
  keyBb: drill({ id: "read-key-bb", tempo: 72, level: "intermediate", keySignature: { fifths: -2, mode: "major" }, notes: "Bb4 D5 C5 Eb5 | D5 F5 G5 F5 | Eb5 C5 A4 C5 | Bb4:4" }),
  keyEb: drill({ id: "read-key-eb", tempo: 72, level: "intermediate", keySignature: { fifths: -3, mode: "major" }, notes: "Eb4 G4 F4 Ab4 | G4 Bb4 C5 Bb4 | Ab4 F4 D4 F4 | Eb4:4" }),
  // Syncopation
  sync1: drill({ id: "read-sync-1", tempo: 66, level: "intermediate", notes: "C4:0.5 D4 E4:0.5 F4 G4 | E4:0.5 F4 D4:0.5 C4:2" }),
  sync2: drill({ id: "read-sync-2", tempo: 66, level: "intermediate", notes: "G4 E4:0.5 F4 G4:0.5 E4 | D4:0.5 E4 F4:0.5 E4:2 | C4 D4:0.5 E4 G4:0.5 F4 | E4:0.5 D4 C4:2.5" }),
  sync3: drill({ id: "read-sync-3", tempo: 66, level: "intermediate", notes: "C4 E4 G4 A4:2 G4 E4 D4 | C4:4" }),
} satisfies Record<string, MidiExercise>;

export const readingExercises: MidiExercise[] = Object.values(ex);

const PATH = "sightreading-intensive" as const;

export const readingLessons: Lesson[] = [
  defineLesson({
    id: "lesson-reading-c-position", path: PATH, title: "Reading in C position", level: "elementary", branch: "repertoire",
    objectives: [
      "Read C4–G4 in the treble staff and C3–G3 in the bass staff without naming every note aloud",
      "Play a four-bar study through without stopping to correct",
    ],
    sections: [
      { type: "theory-card", title: "Read the shape, not just the names", body: "Fluent readers don't spell out every note. They find the first note, then follow the line: does it step to the next line or space, skip over one, or repeat? Before each study, take ten seconds to scan it: find the starting note, the highest and lowest notes, and any long notes. Then keep going at a slow, steady tempo even if a note goes wrong. Stopping to fix mistakes trains you to stop; reading through them trains you to read." },
      midiSection(ex.cRh1.exerciseId, "Right hand study", "C position, right hand (C = 1). Scan first, then play all four bars without stopping."),
      midiSection(ex.cLh1.exerciseId, "Left hand study", "C position, left hand (C3 = 5, G3 = 1). It starts on G3 at the top of the position and works down."),
      midiSection(ex.cRh2.exerciseId, "Right hand study 2", "Starts on a half-note E. Watch for the half notes at the end of bars 1 and 2."),
      midiSection(ex.cAlternate.exerciseId, "Challenge: hand to hand", "The hands take turns, one bar each. Keep counting through the bars where your hand rests, so the other hand comes in on time."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 2 }),
  }),
  defineLesson({
    id: "lesson-rhythm-rests", path: PATH, title: "Rhythm: quarter and half rests", level: "elementary", branch: "theory",
    objectives: [
      "Count through quarter and half rests without shortening them",
      "Release a note exactly where a rest begins",
    ],
    sections: [
      { type: "theory-card", title: "Silence that counts", body: "A rest is a beat of silence, and it is measured exactly like a note: a quarter rest lasts one beat, a half rest two. Lift your finger right on the rest's beat and keep counting through it; the next note comes in on its own count, not when the silence feels long enough. Every drill in this lesson uses middle C only, so all your attention can go to the rhythm." },
      midiSection(ex.quarterRests.exerciseId, "Quarter rests", "Middle C only. Count 1 2 3 4 aloud and lift on every rest."),
      midiSection(ex.halfRests.exerciseId, "Half rests", "Middle C only. Bar 3 starts with a half rest: wait two full counts before you play."),
      midiSection(ex.restsChallenge.exerciseId, "Challenge: rests on any beat", "Middle C only. Rests now fall on beat 1 as well as off it. Keep the count going out loud."),
    ],
    skillRewards: rewards({ rhythm: 3, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-reading-g-f-positions", path: PATH, title: "Reading in G and F positions", level: "elementary", branch: "repertoire",
    objectives: [
      "Read G4–D5 and G2–D3 in G position",
      "Read F4–C5 in F position, including B♭",
      "Move the hand to a new position between phrases without losing the beat",
    ],
    sections: [
      { type: "theory-card", title: "New positions, same skills", body: "Move the right hand so the thumb sits on G4 and you have G position: G-A-B-C-D under fingers 1 to 5. In the left hand, finger 5 on G2 gives G2 to D3. F position puts the right thumb on F4: F-G-A-B♭-C. Notice the B♭: in F position finger 4 plays the black key. Reading in a new position is the same skill as in C: find the first note, then follow steps and skips." },
      midiSection(ex.gRh.exerciseId, "G position, right hand", "Thumb on G4. Scan for the half notes, then play straight through."),
      midiSection(ex.gLh.exerciseId, "G position, left hand", "Little finger on G2, thumb on D3. It starts at the top on D3."),
      midiSection(ex.fRh.exerciseId, "F position, right hand", "Thumb on F4; finger 4 takes B♭ every time."),
      midiSection(ex.gfSwitch.exerciseId, "Challenge: switch positions", "Two bars in G position, then move down to F position for the last two. Make the move during the half note at the end of bar 2."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 3 }),
  }),
  defineLesson({
    id: "lesson-reading-intervals", path: PATH, title: "Reading by intervals", level: "elementary", branch: "theory",
    objectives: [
      "Recognise seconds, thirds, fourths and fifths on the staff by their shape",
      "Play an interval from its shape without naming the second note first",
    ],
    sections: [
      { type: "theory-card", title: "Intervals have shapes", body: "On the staff, a second moves from a line to the next space (or space to line). A third moves line to line or space to space. A fourth goes from a line to a space with one line skipped between, and a fifth from line to line (or space to space) with one line in between. Once these shapes are familiar you can read a melody as a chain of distances: start on the right note, then let each shape tell your hand how far to move." },
      { type: "quiz", questions: [
        quiz("q-reading-intervals-1", "Two notes are both on lines, with one line between them. What interval is it?", ["A second", "A third", "A fifth", "An octave"], 2, "Line, line, line: the notes are five letter names apart, a fifth."),
        quiz("q-reading-intervals-2", "A note on a line moves to the very next space. What interval is that?", ["A second", "A third", "A fourth", "A fifth"], 0, "Line to the neighbouring space is one letter name up or down: a second."),
      ] },
      midiSection(ex.secondsThirds.exerciseId, "Seconds and thirds", "Read each move as a step (second) or a skip (third). It dips to B3 below middle C in bar 3."),
      midiSection(ex.fourthsFifths.exerciseId, "Fourths and fifths", "Wider moves: let each shape set how far the hand opens."),
      midiSection(ex.intervalsMixed.exerciseId, "Challenge: every size", "Seconds through sixths mixed together. Scan for the biggest leaps first."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 2, theory: 1 }),
  }),
  defineLesson({
    id: "lesson-rhythm-eighths", path: PATH, title: "Rhythm: eighth notes", level: "elementary", branch: "theory",
    objectives: [
      "Count eighth notes as 1-and-2-and and keep them even",
      "Hold an eighth rest for exactly half a beat",
    ],
    sections: [
      { type: "theory-card", title: "Two notes per beat", body: "An eighth note lasts half a beat, so two fit in one beat. Count them 1-and-2-and-3-and-4-and: the number lands on the beat and the 'and' exactly halfway to the next one. Eighth notes are often beamed together in pairs or fours. An eighth rest is half a beat of silence. As before, every drill uses middle C only." },
      midiSection(ex.eighthPairs.exerciseId, "Eighth-note pairs", "Middle C only. Pairs of eighths between quarter notes, then a run of four."),
      midiSection(ex.eighthsRests.exerciseId, "Eighths and rests", "Middle C only. Each pair of eighths is followed by a quarter rest. Keep counting 'and' through the rests."),
      midiSection(ex.eighthsChallenge.exerciseId, "Challenge: four bars of eighths", "Middle C only. In bar 3, beat 2 starts with an eighth rest: stay silent on 2 and play on its 'and'."),
    ],
    skillRewards: rewards({ rhythm: 3, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-reading-hands-together", path: PATH, title: "Reading hands together", level: "elementary", branch: "repertoire",
    objectives: [
      "Read both staves at once with a simple left-hand part",
      "Keep both hands in time when one holds a long note",
    ],
    sections: [
      { type: "theory-card", title: "Read vertically", body: "With both hands, read the grand staff in columns: at each beat, look at what both staves do. The left hand here plays only long notes, so first find where it changes: those are the moments to watch. Between changes, your eyes can follow the right hand. Go slower than you think you need; a steady slow tempo beats a fast one with stops." },
      midiSection(ex.ht1.exerciseId, "Long bass notes", "The left hand holds one note per bar (C3, C3, G2, C3) under a stepwise melody."),
      midiSection(ex.ht2.exerciseId, "Bass in half notes", "The left hand now changes every two beats. Each change lines up with a right-hand note."),
      midiSection(ex.ht3.exerciseId, "Challenge: G position, both hands", "Right hand in G position, left hand on a bass line with F♯3 in bar 3."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 2, technique: 1 }),
  }),
  defineLesson({
    id: "lesson-reading-ledger-lines", path: PATH, title: "Reading ledger lines", level: "intermediate", branch: "theory",
    objectives: [
      "Read A5, B5 and C6 above the treble staff",
      "Read E2, D2 and C2 below the bass staff",
      "Read the notes around middle C in both clefs",
    ],
    sections: [
      { type: "theory-card", title: "Short lines, same pattern", body: "Ledger lines extend the staff with short lines for notes above or below it. They follow the same line-space pattern: above the treble staff, G5 sits on top of the staff, A5 on the first ledger line, B5 above it and C6 on the second ledger line. Below the bass staff, F2 is in the space under it, E2 on the first ledger line, D2 under that and C2 on the second ledger line. Count ledger lines from the staff outward and use the C's as landmarks: C6 and C2 each sit on two ledger lines." },
      { type: "quiz", questions: [
        quiz("q-reading-ledger-1", "Which note sits on the second ledger line above the treble staff?", ["A5", "B5", "C6", "D6"], 2, "A5 is on the first ledger line and C6 on the second."),
      ] },
      midiSection(ex.ledgerHigh.exerciseId, "Above the treble staff", "From G5 up to C6 and around. Use C6 on two ledger lines as your landmark."),
      midiSection(ex.ledgerLow.exerciseId, "Below the bass staff", "Left hand from C3 down to C2 and back. C2 sits on two ledger lines below the staff."),
      midiSection(ex.ledgerMiddle.exerciseId, "Challenge: around middle C", "The line passes back and forth between the bass and treble staves through middle C."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 3 }),
  }),
  defineLesson({
    id: "lesson-rhythm-dotted-and-ties", path: PATH, title: "Rhythm: 3/4, dots and ties", level: "intermediate", branch: "theory",
    alsoRequires: ["lesson-19"],
    objectives: [
      "Count three beats per bar and hold a dotted half for all three",
      "Hold a dotted quarter through the off-beat",
      "Hold a note across a barline without replaying it",
    ],
    sections: [
      { type: "theory-card", title: "Longer values", body: "In 3/4 time there are three beats per bar; a dotted half note fills the whole bar. A dot adds half the note's value, so a dotted quarter lasts one and a half beats and is usually followed by an eighth. A tie joins two notes of the same pitch into one long sound: play the first and hold through the second. A note that starts before a barline and continues past it is written as a tie. Middle C only again." },
      midiSection(ex.threeFour.exerciseId, "Three beats per bar", "Middle C only. Count 1 2 3; the dotted half notes in bars 3 and 5 last the whole bar."),
      midiSection(ex.dottedQuarters.exerciseId, "Dotted quarters", "Middle C only. Long-short, long-short: hold through the 'and' before each eighth."),
      midiSection(ex.tiesAcross.exerciseId, "Challenge: across the barline", "Middle C only. The fourth note starts on beat 4 and is held into the next bar. Don't replay it on the downbeat."),
    ],
    skillRewards: rewards({ rhythm: 4, timing: 2 }),
  }),
  defineLesson({
    id: "lesson-reading-sharp-keys", path: PATH, title: "Reading in G, D and A major", level: "intermediate", branch: "theory",
    alsoRequires: ["lesson-15"],
    objectives: [
      "Read a key signature of one, two or three sharps and apply it to every matching note",
      "Play studies in G, D and A major without the sharps written next to the notes",
    ],
    sections: [
      { type: "theory-card", title: "The key signature does the work", body: "A key signature lists the sharps once, at the start of every line, and they apply to every note of that letter name in every octave. One sharp (F♯) means G major; two (F♯, C♯) mean D major; three (F♯, C♯, G♯) mean A major. Before reading, say the sharps aloud: 'F and C are sharp.' Then, as you read, the notes on those letters are black keys even though nothing is written beside them." },
      { type: "quiz", questions: [
        quiz("q-reading-sharps-1", "A key signature has two sharps. Which notes are sharp?", ["F and C", "F and G", "C and G", "B and E"], 0, "Sharps are added in the order F, C, G, D: two sharps are F♯ and C♯ (D major)."),
      ] },
      midiSection(ex.keyG.exerciseId, "G major: one sharp", "Every F is F♯. Say it before you start."),
      midiSection(ex.keyD.exerciseId, "D major: two sharps", "Every F and every C is sharp."),
      midiSection(ex.keyA.exerciseId, "Challenge: A major, three sharps", "F♯, C♯ and G♯ throughout."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 2, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-reading-flat-keys", path: PATH, title: "Reading in F, B♭ and E♭ major", level: "intermediate", branch: "theory",
    alsoRequires: ["lesson-32"],
    objectives: [
      "Read a key signature of one, two or three flats",
      "Play studies in F, B♭ and E♭ major without the flats written next to the notes",
    ],
    sections: [
      { type: "theory-card", title: "Flats in order", body: "Flat key signatures add flats in the order B♭, E♭, A♭ (the order of sharps, backwards). One flat (B♭) is F major, two (B♭, E♭) are B♭ major, three (B♭, E♭, A♭) are E♭ major. A shortcut: with two or more flats, the second-to-last flat names the key. As with sharps, say the flats aloud before you start reading." },
      { type: "quiz", questions: [
        quiz("q-reading-flats-1", "Which major key has three flats?", ["F major", "B♭ major", "E♭ major", "A♭ major"], 2, "B♭, E♭, A♭: the second-to-last flat, E♭, names the key."),
      ] },
      midiSection(ex.keyF.exerciseId, "F major: one flat", "Every B is B♭."),
      midiSection(ex.keyBb.exerciseId, "B♭ major: two flats", "Every B and every E is flat. It starts on B♭4."),
      midiSection(ex.keyEb.exerciseId, "Challenge: E♭ major, three flats", "B♭, E♭ and A♭ throughout."),
    ],
    skillRewards: rewards({ sight_reading: 3, note_reading: 2, theory: 2 }),
  }),
  defineLesson({
    id: "lesson-reading-syncopation", path: PATH, title: "Reading syncopation", level: "intermediate", branch: "repertoire",
    objectives: [
      "Read eighth–quarter–eighth figures at sight",
      "Keep the beat steady while notes start between beats",
    ],
    sections: [
      { type: "theory-card", title: "Notes between the beats", body: "Syncopation puts a note on an off-beat and lets it ring through the next beat: an eighth, then a quarter starting on the 'and', then another eighth. Reading it is easier if you count eighths aloud the whole time (1-and-2-and) and place each note on its syllable. In the last study a note starts on beat 4 and is held across the barline." },
      midiSection(ex.sync1.exerciseId, "Two bars of syncopation", "Count eighths aloud and place each note on its syllable."),
      midiSection(ex.sync2.exerciseId, "A syncopated melody", "Four bars; the last note is held for two and a half beats."),
      midiSection(ex.sync3.exerciseId, "Challenge: across the barline", "A4 starts on beat 4 and is held into bar 2. Keep counting through it."),
    ],
    skillRewards: rewards({ sight_reading: 3, rhythm: 3, timing: 2 }),
  }),
];
