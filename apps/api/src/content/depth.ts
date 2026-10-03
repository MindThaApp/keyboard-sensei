import type { Lesson, LessonSection, MidiExercise } from "@keyboard-sensei/shared-types";
import { drill } from "./build.js";
import { midiSection } from "./helpers.js";

/**
 * Graded practice for the original 34 lessons: each lesson's single exercise becomes the
 * "core" of a warm-up → core → challenge set, so the concept gets real repetition.
 *
 * The original exercise ids (exercise-NN) and sections are untouched; warm-ups are
 * inserted directly before the lesson's first exercise and the rest directly after its
 * last one. All material is original except where a lesson says otherwise (Mary Had a
 * Little Lamb, Hot Cross Buns and the Ode to Joy, Twinkle and Minuet in G passages are
 * all public domain).
 */

interface Practice {
  exercise: MidiExercise;
  title: string;
  instructions: string;
}

interface LessonPractice {
  warmups?: Practice[];
  more: Practice[];
}

/** Chromatic drills are spelled in C (no signature is drawn) so their accidentals are predictable. */
const C_MAJOR = { fifths: 0, mode: "major" } as const;

const practice = (exercise: MidiExercise, title: string, instructions: string): Practice => ({ exercise, title, instructions });

const PRACTICE: Record<string, LessonPractice> = {
  "lesson-01": {
    warmups: [
      practice(
        drill({ id: "find-c-warmup", tempo: 80, level: "beginner", untimed: true, notes: "C4 C5 C4" }),
        "Warm-up: middle C and the C above",
        "Find middle C (C4), the C one octave higher (C5), then middle C again. Look for the group of two black keys each time; C sits just left of it.",
      ),
    ],
    more: [
      practice(
        drill({ id: "find-c-every-octave", tempo: 80, level: "beginner", untimed: true, notes: "C2 C3 C4 C5 C6" }),
        "Every C from low to high",
        "Play C2, C3, C4, C5 and C6, climbing one octave at a time. Each jump skips seven white keys; let the two-black-key groups guide you instead of counting.",
      ),
      practice(
        drill({ id: "find-c-octave-jumps", tempo: 80, level: "beginner", untimed: true, notes: "C4 C2 C5 C3 C6 C4" }),
        "Challenge: octave jumps",
        "Jump around the keyboard: C4, C2, C5, C3, C6, then back to C4. Name each octave before you play it.",
      ),
    ],
  },
  "lesson-02": {
    more: [
      practice(
        drill({ id: "fingers-rh-warmup", tempo: 60, level: "beginner", notes: "C4:2 D4:2 | E4:2 F4:2 | G4:4" }),
        "Warm-up: right hand 1-2-3-4-5",
        "Thumb (1) on middle C, one finger per white key up to G (5). Hold each note for its full length and keep the fingers curved.",
      ),
      practice(
        drill({ id: "fingers-lh", tempo: 60, level: "beginner", notes: "C3:2 D3:2 | E3:2 F3:2 | G3:4" }),
        "Left hand 5-4-3-2-1",
        "Little finger (5) on C3, then 4-3-2-1 up to G3, so your left thumb ends nearest middle C. The left hand's numbers run the opposite way across the keys.",
      ),
      practice(
        drill({ id: "fingers-rh-pairs", tempo: 66, level: "beginner", notes: "C4 E4 D4 F4 | E4 G4 F4 D4 | C4:4" }),
        "Right hand finger pairs",
        "Fingers 1-3, 2-4, 3-5, 4-2, then 1: C-E, D-F, E-G, F-D, C. Keep the hand still over C to G; only the fingers move.",
      ),
      practice(
        drill({ id: "fingers-callout", tempo: 72, level: "beginner", notes: "C4 E4 G4 E4 | C4 D4 F4 D4 | C4 E4 D4 F4 | E4 G4 C4:2" }),
        "Challenge: finger-number sequence",
        "Fingers 1-3-5-3, 1-2-4-2, 1-3-2-4, 3-5-1. Say each finger number as you play it until the numbers come without thinking.",
      ),
    ],
  },
  "lesson-03": {
    more: [
      practice(
        drill({ id: "middle-c-warmup", tempo: 72, level: "beginner", notes: "C4:2 C4:2 | C4 C4 C4:2 | C4:4" }),
        "Warm-up: middle C in rhythm",
        "Play middle C only, holding each note for its written length: two half notes, two quarters and a half, then a whole note.",
      ),
      practice(
        drill({ id: "middle-c-neighbors", tempo: 72, level: "beginner", notes: "C4 D4 C4 B3 | C4 D4 E4 D4 | C4 B3 A3 B3 | C4:4" }),
        "Across the middle of the grand staff",
        "Move between the staves around middle C: D and E are written in the treble staff, B3 and A3 in the bass staff. Watch how one step on the keyboard crosses from one staff to the other.",
      ),
      practice(
        drill({ id: "grand-staff-crossing", tempo: 76, level: "beginner", notes: "G3 A3 B3 C4 | D4 E4 F4 G4 | F4 E4 D4 C4 | B3 A3 G3:2" }),
        "Challenge: one line through both staves",
        "Walk from G3 up to G4 and back. The left hand takes G3-A3-B3, the right hand C4 to G4. Read the line as one melody passing through middle C.",
      ),
    ],
  },
  "lesson-04": {
    more: [
      practice(
        drill({ id: "rhythm-quarters-warmup", tempo: 80, level: "beginner", notes: "C4 C4 C4 C4 | C4 C4 C4 C4" }),
        "Warm-up: steady quarter notes",
        "Play middle C on every beat for two bars, counting 1 2 3 4 aloud. Only the rhythm is new here: every note is the same key.",
      ),
      practice(
        drill({ id: "rhythm-halves", tempo: 80, level: "beginner", notes: "C4:2 C4 C4 | C4:2 C4:2 | C4 C4 C4:2 | C4:4" }),
        "Halves and quarters",
        "Middle C only. Hold each half note through two counts and the final whole note through four. Release exactly on the next count.",
      ),
      practice(
        drill({ id: "rhythm-whole-half-quarter", tempo: 80, level: "beginner", notes: "C4:4 | C4:2 C4:2 | C4 C4 C4 C4 | C4:2 C4 C4 | C4 C4 C4:2 | C4:4" }),
        "Wholes, halves and quarters",
        "Six bars on middle C mixing all three note values. Keep counting 1 2 3 4 through the long notes; the beat never stops while you hold.",
      ),
      practice(
        drill({ id: "rhythm-mixed-challenge", tempo: 88, level: "beginner", notes: "C4 C4:2 C4 | C4:2 C4 C4 | C4:4 | C4 C4 C4:2 | C4:2 C4:2 | C4 C4:2 C4 | C4:4" }),
        "Challenge: half notes off the beat",
        "Some half notes now start on beat 2, so they ring across the middle of the bar. Count out loud and hold each one for exactly two counts.",
      ),
    ],
  },
  "lesson-05": {
    warmups: [
      practice(
        drill({ id: "treble-cde-warmup", tempo: 80, level: "beginner", notes: "C4 D4 E4 D4 | C4 D4 E4:2 | E4 D4 C4:2" }),
        "Warm-up: C, D and E",
        "Fingers 1-2-3 on C, D and E. C sits on a ledger line below the staff, D just under the bottom line, E on the bottom line.",
      ),
    ],
    more: [
      practice(
        drill({ id: "treble-cdefg-skips", tempo: 80, level: "beginner", notes: "C4 E4 D4 F4 | E4 G4 F4 D4 | C4:4" }),
        "Skips in C position",
        "Read skips: a line to the next line, or a space to the next space. Fingers 1-3, 2-4, 3-5, 4-2, 1.",
      ),
      practice(
        drill({ id: "treble-mary", tempo: 88, level: "beginner", notes: "E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 | E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4" }),
        "Challenge: Mary Had a Little Lamb",
        "A traditional public-domain melody that uses only C, D, E and G. Stay in C position (C = 1, G = 5) and keep the half notes full length.",
      ),
    ],
  },
  "lesson-06": {
    warmups: [
      practice(
        drill({ id: "bass-warmup", tempo: 80, level: "beginner", notes: "C3 B2 A2 B2 | C3:4" }),
        "Warm-up: C, B and A in the bass",
        "Left-hand fingers 1-2-3 on C3, B2 and A2. C3 sits in the second space from the top of the bass staff.",
      ),
    ],
    more: [
      practice(
        drill({ id: "bass-up-and-down", tempo: 80, level: "beginner", notes: "F2 G2 A2 B2 | C3:4 | C3 B2 A2 G2 | F2:4" }),
        "Up and back down",
        "Start on F2 with finger 5 and climb to C3 with the thumb, then walk back down. The same five keys, read in both directions.",
      ),
      practice(
        drill({ id: "bass-skips", tempo: 76, level: "beginner", notes: "C3 A2 B2 G2 | A2 F2 G2 B2 | C3 A2 F2:2 | G2 B2 C3:2" }),
        "Challenge: skips in the bass",
        "Skips in the left hand: line to line or space to space. Keep one finger per key from F2 (5) to C3 (1).",
      ),
    ],
  },
  "lesson-07": {
    warmups: [
      practice(
        drill({ id: "hands-alternate-warmup", tempo: 72, level: "beginner", notes: "C3:2 C4:2 | C3:2 C4:2 | C3 C4 C3 C4 | C3:4" }),
        "Warm-up: hand to hand",
        "Left hand on C3, right hand on middle C. Take turns: first in half notes, then quarters, never letting a gap open between the hands.",
      ),
    ],
    more: [
      practice(
        drill({ id: "hands-echo", tempo: 76, level: "beginner", notes: "C4 D4 E4:2 | E3 D3 C3:2 | E4 F4 G4:2 | G3 F3 E3:2" }),
        "Question and answer",
        "The right hand plays a short phrase and the left hand answers it an octave lower. Left hand in C position (C3 = 5, G3 = 1). The answer starts right on the next beat.",
      ),
      practice(
        drill({ id: "hands-alternate-quarters", tempo: 72, level: "beginner", notes: "C4 G3 D4 F3 | E4 E3 F4 D3 | G4:2 C3:2" }),
        "Challenge: alternate every beat",
        "Right hand climbs C4 to G4 while the left hand walks down G3 to C3, one hand per beat. Keep both hands resting on their keys.",
      ),
    ],
  },
  "lesson-08": {
    warmups: [
      practice(
        drill({ id: "five-finger-warmup", tempo: 80, level: "beginner", notes: "C4 D4 E4 D4 | C4 D4 E4 F4 | G4 F4 E4 D4 | C4:4" }),
        "Warm-up: three, then five fingers",
        "Fingers 1-2-3-2, then the full 1-2-3-4-5-4-3-2 pattern, ending on C. Make every quarter note the same length.",
      ),
    ],
    more: [
      practice(
        drill({ id: "five-finger-lh", tempo: 80, level: "beginner", notes: "C3 D3 E3 F3 | G3 F3 E3 D3 | C3:4" }),
        "Left-hand five-finger pattern",
        "Left hand from C3 (finger 5) up to G3 (finger 1) and back. The same pattern as the right hand, with the finger numbers mirrored.",
      ),
      practice(
        drill({
          id: "five-finger-hands-together",
          tempo: 66,
          level: "elementary",
          notes: [
            { id: "rh", notes: "C4 D4 E4 F4 | G4 F4 E4 D4 | C4:4" },
            { id: "lh", notes: "C3 D3 E3 F3 | G3 F3 E3 D3 | C3:4" },
          ],
        }),
        "Challenge: both hands together",
        "Both hands play the pattern at once, an octave apart. Each pair of notes should sound as one; slow the tempo down if one hand starts to lead.",
      ),
    ],
  },
  "lesson-09": {
    warmups: [
      practice(
        drill({ id: "intervals-melodic-warmup", tempo: 76, level: "beginner", notes: "C4 D4 C4:2 | C4 E4 C4:2 | C4 G4 C4:2" }),
        "Warm-up: a second, a third, a fifth",
        "One note at a time from C: C-D is a second, C-E a third, C-G a fifth. Hear how each interval is wider than the last.",
      ),
    ],
    more: [
      practice(
        drill({ id: "harmonic-thirds", tempo: 72, level: "elementary", notes: "[C4 E4]:2 [D4 F4]:2 | [E4 G4]:2 [D4 F4]:2 | [C4 E4]:4" }),
        "Thirds together",
        "Two notes at once, a third apart: fingers 1-3, 2-4, 3-5, 2-4, 1-3. Both notes of each pair start together.",
      ),
      practice(
        drill({ id: "intervals-from-c-and-d", tempo: 72, level: "elementary", notes: "[C4 D4]:2 [C4 E4]:2 | [C4 F4]:2 [C4 G4]:2 | [D4 E4]:2 [D4 F4]:2 | [D4 G4]:2 [D4 A4]:2" }),
        "Challenge: second to fifth, from C and from D",
        "Build a second, third, fourth and fifth above C, then the same four above D. Name each interval before you play it.",
      ),
    ],
  },
  "lesson-10": {
    warmups: [
      practice(
        drill({ id: "triad-broken-warmup", tempo: 76, level: "beginner", notes: "C4 E4 G4 E4 | C4:2 [C4 E4 G4]:2" }),
        "Warm-up: C major, one note at a time",
        "Play C-E-G-E-C with fingers 1-3-5-3-1, then all three notes together as a chord.",
      ),
    ],
    more: [
      practice(
        drill({ id: "triads-white-keys", tempo: 72, level: "elementary", notes: "[C4 E4 G4]:2 [D4 F4 A4]:2 | [E4 G4 B4]:2 [F4 A4 C5]:2 | [G4 B4 D5]:2 [A4 C5 E5]:2 | [B4 D5 F5]:2 [C5 E5 G5]:2" }),
        "A triad on every white key",
        "Keep fingers 1-3-5 locked in shape and move the whole hand up one key at a time: C, Dm, Em, F, G, Am, B diminished, C.",
      ),
      practice(
        drill({ id: "major-minor-pairs", tempo: 66, level: "elementary", notes: "[C4 E4 G4]:2 [A3 C4 E4]:2 | [F3 A3 C4]:2 [D4 F4 A4]:2 | [G3 B3 D4]:2 [E4 G4 B4]:2 | [C4 E4 G4]:4" }),
        "Challenge: major and minor pairs",
        "Alternate each major triad with a minor one: C and Am, F and Dm, G and Em, then C. Listen for the change of colour as each minor chord arrives.",
      ),
    ],
  },
  "lesson-11": {
    warmups: [
      practice(
        drill({ id: "reading-1-warmup", tempo: 72, level: "elementary", notes: "C4 D4 E4 F4 | G4:4" }),
        "Warm-up: read the steps",
        "Five steps up from middle C. Say the note names before you play them.",
      ),
    ],
    more: [
      practice(
        drill({ id: "reading-1-study-b", tempo: 72, level: "elementary", notes: "E4 F4 G4:2 | F4 E4 D4:2 | E4 D4 C4 D4 | C4:4" }),
        "Reading study 1b",
        "Scan first: it starts on E, rises to G, then winds down to C. Play it through without stopping.",
      ),
      practice(
        drill({ id: "reading-1-study-c", tempo: 72, level: "elementary", notes: "G4 E4 F4 D4 | E4 C4 D4:2 | E4 G4 F4 E4 | D4 E4 C4:2" }),
        "Challenge: reading study 1c",
        "This study moves mostly by skips. Find the first note, then read each move as up or down, step or skip.",
      ),
    ],
  },
  "lesson-12": {
    warmups: [
      practice(
        drill({ id: "assessment-1-warmup-notes", tempo: 80, level: "elementary", notes: "C4 D4 E4 F4 | G4 F4 E4 D4 | C4:4" }),
        "Warm-up: the five-finger pattern",
        "Fingers 1 to 5 and back down to C, one steady beat per note.",
      ),
      practice(
        drill({ id: "assessment-1-warmup-chords", tempo: 72, level: "elementary", notes: "[C4 E4]:2 [C4 G4]:2 | [C4 E4 G4]:4" }),
        "Warm-up: interval to triad",
        "The third C-E, the fifth C-G, then the full C-major triad. All notes of each shape start together.",
      ),
    ],
    more: [
      practice(
        drill({
          id: "assessment-1-hands",
          tempo: 72,
          level: "elementary",
          notes: [
            { id: "rh", notes: "E4 D4 C4 D4 | E4 E4 E4:2 | [C4 E4 G4]:4" },
            { id: "lh", notes: "C3:4 | G2:4 | C3:4" },
          ],
        }),
        "Challenge: melody over a bass",
        "The right hand plays a short melody ending on a C-major chord while the left hand holds C3, G2 and C3, one per bar. Each left-hand note starts with the right hand's first note of the bar.",
      ),
    ],
  },
  "lesson-13": {
    warmups: [
      practice(
        drill({ id: "chromatic-warmup", tempo: 72, level: "intermediate", keySignature: C_MAJOR, notes: "C4 C#4 D4 D#4 | E4 D#4 D4 C#4 | C4:4" }),
        "Warm-up: C to E and back",
        "Every key from C to E, black and white, then back down. Use fingers 1 on white keys and 3 on black keys.",
      ),
    ],
    more: [
      practice(
        drill({ id: "chromatic-descending", tempo: 60, level: "intermediate", keySignature: C_MAJOR, notes: "C5:0.5 B4:0.5 Bb4:0.5 A4:0.5 Ab4:0.5 G4:0.5 Gb4:0.5 F4:0.5 | E4:0.5 Eb4:0.5 D4:0.5 Db4:0.5 C4:2" }),
        "Descending chromatic scale",
        "C5 down to C4 in even eighth notes. Each black key has two names (C♯ is D♭); the score uses one, the keyboard doesn't care which.",
      ),
      practice(
        drill({ id: "chromatic-round-trip", tempo: 60, level: "intermediate", keySignature: C_MAJOR, notes: "C4:0.5 C#4:0.5 D4:0.5 D#4:0.5 E4:0.5 F4:0.5 F#4:0.5 G4:0.5 | G#4:0.5 A4:0.5 A#4:0.5 B4:0.5 C5:2 | B4:0.5 Bb4:0.5 A4:0.5 Ab4:0.5 G4:0.5 Gb4:0.5 F4:0.5 E4:0.5 | Eb4:0.5 D4:0.5 Db4:1 C4:2" }),
        "Challenge: up and down in one breath",
        "The full octave up and back in eighth notes, resting on C5 for a half note at the top. Keep the 1-3 fingering and an even pulse in both directions.",
      ),
    ],
  },
  "lesson-14": {
    warmups: [
      practice(
        drill({ id: "g-major-tetrachords", tempo: 72, level: "intermediate", notes: "G4 A4 B4 C5 | B4 A4 G4:2 | D5 E5 F#5 G5 | F#5 E5 D5:2" }),
        "Warm-up: G major in two halves",
        "A major scale is two matching four-note groups. Play G-A-B-C, then D-E-F♯-G, each with fingers 1-2-3-4.",
      ),
    ],
    more: [
      practice(
        drill({ id: "d-major-up-down", tempo: 72, level: "intermediate", notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | C#5 B4 A4 G4 | F#4 E4 D4:2" }),
        "D major up and down",
        "One octave up and back. Fingering 1-2-3-1-2-3-4-5 going up; on the way down, cross finger 3 over the thumb after G.",
      ),
      practice(
        drill({ id: "d-major-arpeggio", tempo: 72, level: "intermediate", notes: "D4 F#4 A4 D5 | A4 F#4 D4:2" }),
        "D major arpeggio",
        "D-F♯-A-D and back with fingers 1-2-3-5.",
      ),
      practice(
        drill({ id: "g-major-lh", tempo: 66, level: "intermediate", notes: "G2 A2 B2 C3 | D3 E3 F#3 G3 | F#3 E3 D3 C3 | B2 A2 G2:2" }),
        "Challenge: G major, left hand",
        "Left hand fingering 5-4-3-2-1-3-2-1 going up: after the thumb plays D3, finger 3 crosses over to E3. Reverse it coming down.",
      ),
    ],
  },
  "lesson-15": {
    warmups: [
      practice(
        drill({ id: "fifths-tonic-triads", tempo: 66, level: "intermediate", notes: "[G3 B3 D4]:2 [D4 F#4 A4]:2 | [A3 C#4 E4]:2 [E4 G#4 B4]:2" }),
        "Warm-up: the home chords of G, D, A and E",
        "The tonic triad of each key clockwise around the circle from G. Each new chord brings in one more sharp: F♯ in D, C♯ in A, G♯ in E.",
      ),
    ],
    more: [
      practice(
        drill({ id: "sharps-in-order", tempo: 66, level: "intermediate", keySignature: { fifths: 4, mode: "major" }, notes: "F#4 C#5 G#4 D#5 | F#4:2 C#5:2 | G#4:2 D#5:2" }),
        "The order of sharps",
        "Play the first four sharps in the order a key signature adds them: F♯, C♯, G♯, D♯. Say the names aloud as you play.",
      ),
      practice(
        drill({ id: "e-major-up-down", tempo: 66, level: "intermediate", notes: "E4 F#4 G#4 A4 | B4 C#5 D#5 E5 | D#5 C#5 B4 A4 | G#4 F#4 E4:2" }),
        "Challenge: E major, four sharps",
        "One octave of E major up and back, with all four sharps: F♯, G♯, C♯ and D♯. Fingering 1-2-3-1-2-3-4-5.",
      ),
    ],
  },
  "lesson-16": {
    warmups: [
      practice(
        drill({ id: "e-minor-pentachord", tempo: 72, level: "intermediate", notes: "E4 F#4 G4 A4 | B4 A4 G4 F#4 | E4:4" }),
        "Warm-up: the first five notes of E minor",
        "E-F♯-G-A-B and back. The step from E up to G is a minor third: the sound of minor.",
      ),
    ],
    more: [
      practice(
        drill({ id: "e-natural-minor-up-down", tempo: 72, level: "intermediate", notes: "E4 F#4 G4 A4 | B4 C5 D5 E5 | D5 C5 B4 A4 | G4 F#4 E4:2" }),
        "E natural minor up and down",
        "One octave up and back with only one sharp, F♯. Fingering 1-2-3-1-2-3-4-5.",
      ),
      practice(
        drill({ id: "e-minor-arpeggio", tempo: 72, level: "intermediate", notes: "E4 G4 B4 E5 | B4 G4 E4:2" }),
        "E minor arpeggio",
        "The tonic chord of E minor, unfolded: E-G-B-E and back. Right-hand fingering 1-2-3-5.",
      ),
      practice(
        drill({ id: "d-minor-arpeggio", tempo: 72, level: "intermediate", notes: "D4 F4 A4 D5 | A4 F4 D4:2" }),
        "Challenge: D minor arpeggio",
        "D-F-A-D and back with fingers 1-2-3-5. Then play the E-minor arpeggio again and compare the two.",
      ),
    ],
  },
  "lesson-17": {
    warmups: [
      practice(
        drill({ id: "tritone-resolution", tempo: 66, level: "intermediate", notes: "[B3 F4]:2 [C4 E4]:2 | [B3 F4]:2 [C4 E4]:2" }),
        "Warm-up: the tritone resolves",
        "B and F together (the tense heart of G7), then C and E. B rises a half step to C while F falls a half step to E.",
      ),
    ],
    more: [
      practice(
        drill({ id: "broken-g7", tempo: 66, level: "intermediate", notes: "G3 B3 D4 F4 | E4:2 C4:2 | G3 B3 D4 F4 | [C4 E4 G4]:4" }),
        "G7 broken, then home",
        "Unfold G7 from the bottom up, let F fall to E, and finish on a C-major chord.",
      ),
      practice(
        drill({ id: "c-f-g7-c", tempo: 66, level: "intermediate", notes: "[C4 E4 G4]:2 [C4 F4 A4]:2 | [B3 D4 F4 G4]:2 [C4 E4 G4]:2 | [C4 F4 A4]:2 [B3 D4 F4 G4]:2 | [C4 E4 G4]:4" }),
        "Challenge: C – F – G7 – C",
        "A complete cadence with close voicings, so each hand moves as little as possible. Common tones stay down; only the moving notes change.",
      ),
    ],
  },
  "lesson-18": {
    warmups: [
      practice(
        drill({ id: "inversion-warmup", tempo: 66, level: "intermediate", notes: "[C4 E4 G4]:2 [E4 G4 C5]:2 | [C4 E4 G4]:4" }),
        "Warm-up: root position to first inversion",
        "C-E-G, then move the C to the top for E-G-C, then back down. Same chord, new bass note.",
      ),
    ],
    more: [
      practice(
        drill({ id: "inversions-up-down", tempo: 66, level: "intermediate", notes: "[C4 E4 G4]:2 [E4 G4 C5]:2 | [G4 C5 E5]:2 [C5 E5 G5]:2 | [G4 C5 E5]:2 [E4 G4 C5]:2 | [C4 E4 G4]:4" }),
        "Climb through every position",
        "Root position, first, second, root an octave higher, then back down. Keep fingers 1-3-5 (switch to 1-2-5 if a shape feels stretched).",
      ),
      practice(
        drill({ id: "f-g-inversions", tempo: 66, level: "intermediate", notes: "[F4 A4 C5]:2 [A4 C5 F5]:2 | [C5 F5 A5]:4 | [G4 B4 D5]:2 [B4 D5 G5]:2 | [D5 G5 B5]:4" }),
        "Challenge: F and G major inversions",
        "The same three positions for F major and G major. Name the bass note of each chord before you play it.",
      ),
    ],
  },
  "lesson-19": {
    warmups: [
      practice(
        drill({ id: "eighths-count", tempo: 72, level: "intermediate", notes: "C4 C4 C4:0.5 C4:0.5 C4 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 C4:2" }),
        "Warm-up: counting eighth notes",
        "Middle C only. Count 1-and-2-and-3-and-4-and; each eighth note gets one syllable.",
      ),
      practice(
        drill({ id: "dotted-quarter-drill", tempo: 72, level: "intermediate", notes: "C4:1.5 C4:0.5 C4 C4 | C4:1.5 C4:0.5 C4:2 | C4 C4:1.5 C4:0.5 C4 | C4:4" }),
        "Dotted quarter drill",
        "Middle C only. Hold each dotted quarter through the 'and' of its second beat, then play the eighth quickly before the next beat.",
      ),
    ],
    more: [
      practice(
        drill({ id: "syncopation-drill", tempo: 66, level: "intermediate", notes: "C4:0.5 C4 C4:0.5 C4 C4 | C4:0.5 C4 C4:0.5 C4:2 | C4 C4:0.5 C4 C4:0.5 C4 | C4:0.5 C4 C4:0.5 C4:2" }),
        "Challenge: eighth–quarter–eighth",
        "Middle C only. The quarter notes now start on an 'and', between the beats. Keep counting eighths aloud and let the beat stay steady under the off-beat notes.",
      ),
    ],
  },
  "lesson-20": {
    warmups: [
      practice(
        drill({
          id: "contrary-warmup",
          tempo: 66,
          level: "intermediate",
          notes: [
            { id: "rh", notes: "C5 B4 A4 B4 | C5:4" },
            { id: "lh", notes: "C3 D3 E3 D3 | C3:4" },
          ],
        }),
        "Warm-up: three notes apart and back",
        "Thumbs-out start: the right hand on C5, the left on C3. Move apart by three steps and back, both hands at once.",
      ),
    ],
    more: [
      practice(
        drill({
          id: "contrary-there-and-back",
          tempo: 66,
          level: "intermediate",
          notes: [
            { id: "rh", notes: "C5 B4 A4 G4 | F4 G4 A4 B4 | C5:4" },
            { id: "lh", notes: "C3 D3 E3 F3 | G3 F3 E3 D3 | C3:4" },
          ],
        }),
        "Five notes there and back",
        "The full five-note contrary motion, then reversed so the hands return to where they started.",
      ),
      practice(
        drill({
          id: "contrary-scale",
          tempo: 60,
          level: "intermediate",
          notes: [
            { id: "rh", notes: "C4 D4 E4 F4 | G4 A4 B4 C5 | B4 A4 G4 F4 | E4 D4 C4:2" },
            { id: "lh", notes: "C3 B2 A2 G2 | F2 E2 D2 C2 | D2 E2 F2 G2 | A2 B2 C3:2" },
          ],
        }),
        "Challenge: a contrary-motion C-major scale",
        "The right hand climbs C4 to C5 while the left descends C3 to C2, then both return. Both thumbs cross at the same moment: right hand 1-2-3-1-2-3-4-5, left hand 1-2-3-1-2-3-4-5.",
      ),
    ],
  },
  "lesson-21": {
    warmups: [
      practice(
        drill({ id: "pedal-warmup", tempo: 60, level: "intermediate", notes: "[C4 E4 G4]:4 | [B3 D4 G4]:4 | [C4 E4 G4]:4" }),
        "Warm-up: two chords, slowly",
        "C major, G major (with B in the bass), C major, one per bar. If you have a pedal, change it just after each new chord.",
      ),
    ],
    more: [
      practice(
        drill({ id: "pedal-c-am-f-g", tempo: 60, level: "intermediate", notes: "[C4 E4 G4]:4 | [C4 E4 A4]:4 | [C4 F4 A4]:4 | [B3 D4 G4]:4" }),
        "C – Am – F – G",
        "Four chords voiced so the hand barely moves. Hold each through the whole bar, then connect to the next with a clean pedal change.",
      ),
      practice(
        drill({
          id: "pedal-bass-and-chords",
          tempo: 60,
          level: "intermediate",
          notes: [
            { id: "rh", hand: "right", notes: "[C4 E4 G4]:4 | [C4 E4 A4]:4 | [C4 F4 A4]:4 | [B3 D4 G4]:4 | [C4 E4 G4]:4" },
            { id: "lh", notes: "C3:4 | A2:4 | F2:4 | G2:4 | C3:4" },
          ],
        }),
        "Challenge: add the bass",
        "The left hand plays each chord's root (C, A, F, G, C) under the right-hand chords. Both hands strike together; the pedal joins one bar to the next.",
      ),
    ],
  },
  "lesson-22": {
    warmups: [
      practice(
        drill({ id: "arpeggio-warmup", tempo: 66, level: "intermediate", notes: "C4 E4 G4 C5 | G4 E4 C4:2" }),
        "Warm-up: C arpeggio in quarters",
        "C-E-G-C up and back with fingers 1-2-3-5, slowly enough to feel the hand open and close.",
      ),
    ],
    more: [
      practice(
        drill({ id: "f-major-arpeggio", tempo: 66, level: "intermediate", notes: "F4:0.5 A4:0.5 C5:0.5 F5:0.5 C5:0.5 A4:0.5 F4 | [F4 A4 C5]:4" }),
        "F major arpeggio",
        "F-A-C-F up and back in eighth notes, then the F-major chord. Fingering 1-2-3-5.",
      ),
      practice(
        drill({ id: "two-octave-c-arpeggio", tempo: 60, level: "intermediate", notes: "C4:0.5 E4:0.5 G4:0.5 C5:0.5 E5:0.5 G5:0.5 C6 | G5:0.5 E5:0.5 C5:0.5 G4:0.5 E4:0.5 C4:1.5" }),
        "Challenge: two octaves",
        "C4 up to C6 and back. Fingering 1-2-3-1-2-3-5: the thumb passes under after G to start the second octave on C5.",
      ),
    ],
  },
  "lesson-23": {
    warmups: [
      practice(
        drill({ id: "reading-2-warmup", tempo: 72, level: "intermediate", notes: "C4 D4 E4:1.5 F4:0.5 | G4:2 E4:2 | F4:1.5 E4:0.5 D4 E4 | C4:4" }),
        "Warm-up: dotted quarters in a line",
        "Find each dotted quarter before you start: it is always followed by a quick eighth.",
      ),
    ],
    more: [
      practice(
        drill({ id: "reading-2-study-b", tempo: 72, level: "intermediate", notes: "E4 G4 F4:1.5 E4:0.5 | D4 F4 E4:2 | C4 E4 G4:1.5 A4:0.5 | G4 F4 E4:2" }),
        "Reading study 2b",
        "Scan the shape: two short rising phrases, each ending on a half note. Play it through without stopping.",
      ),
      practice(
        drill({ id: "reading-2-study-c", tempo: 72, level: "intermediate", notes: "G4:1.5 F4:0.5 E4 C4 | D4 B3 C4:2 | E4:1.5 F4:0.5 G4 A4 | G4:1.5 E4:0.5 D4 F4 | E4 D4 C4:2" }),
        "Challenge: reading study 2c",
        "Five bars, starting on G and dipping below middle C to B3 in bar 2. Keep going through every dotted rhythm.",
      ),
    ],
  },
  "lesson-24": {
    warmups: [
      practice(
        drill({ id: "assessment-2-warmup-scale", tempo: 72, level: "intermediate", notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | C#5 B4 A4 G4 | F#4 E4 D4:2" }),
        "Warm-up: D major up and down",
        "One octave up and back with F♯ and C♯.",
      ),
      practice(
        drill({ id: "assessment-2-warmup-chords", tempo: 64, level: "intermediate", notes: "[G3 B3 D4 F4]:2 [C4 E4 G4]:2 | [E4 G4 C5]:2 [G4 C5 E5]:2 | [C5 E5 G5]:4" }),
        "Warm-up: G7, C and its inversions",
        "G7 resolving to C, then C major climbing through first and second inversion to root position.",
      ),
    ],
    more: [
      practice(
        drill({ id: "assessment-2-challenge", tempo: 64, level: "intermediate", notes: "D4 F#4 A4 D5 | [D4 F#4 A4]:2 [C#4 E4 G4 A4]:2 | [D4 F#4 A4]:1.5 E4:0.5 D4:2" }),
        "Challenge: D major cadence",
        "A D-major arpeggio, the D chord, A7 (A-C♯-E-G), back to D with a dotted rhythm, ending on D.",
      ),
    ],
  },
  "lesson-25": {
    warmups: [
      practice(
        drill({ id: "ode-phrase-a", tempo: 76, level: "intermediate", notes: "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2" }),
        "Warm-up: phrase A (bars 1–4)",
        "The first half of the theme, ending on D as a question. C position, one finger per note.",
      ),
      practice(
        drill({ id: "ode-phrase-b", tempo: 76, level: "intermediate", notes: "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2" }),
        "Warm-up: phrase B (bars 5–8)",
        "The answer: the same as phrase A until the last bar, which settles on C.",
      ),
    ],
    more: [
      practice(
        drill({
          id: "ode-hands-together",
          tempo: 66,
          level: "elementary",
          notes: [
            { id: "rh", notes: "E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2" },
            { id: "lh", notes: "C3:4 | G2:4 | C3:4 | G2:4" },
          ],
        }),
        "Challenge: phrase A with a bass",
        "The left hand holds C3 and G2, one note per bar, under the melody. Each bass note starts exactly with the first melody note of its bar.",
      ),
    ],
  },
  "lesson-26": {
    warmups: [
      practice(
        drill({ id: "twinkle-rh", tempo: 72, level: "intermediate", notes: "C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2" }),
        "Warm-up: right hand alone",
        "The melody by itself. The jump from C up to G opens the hand; let it close again as the tune walks down.",
      ),
      practice(
        drill({ id: "twinkle-lh", tempo: 72, level: "intermediate", notes: "C3:4 | F2:2 C3:2 | F2:2 C3:2 | G2:2 C3:2" }),
        "Warm-up: left hand alone",
        "The bass line by itself: C3 for a whole bar, then two half notes per bar. Count four beats in every bar.",
      ),
    ],
    more: [
      practice(
        drill({ id: "twinkle-full-melody", tempo: 80, level: "intermediate", notes: "C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2" }),
        "Challenge: the whole melody",
        "All three phrases of the theme: the opening, a middle section that repeats a falling G-F-E-D line twice, and the opening again.",
      ),
    ],
  },
  "lesson-27": {
    warmups: [
      practice(
        drill({ id: "minuet-bars-1-2", tempo: 88, level: "intermediate", beatsPerBar: 3, notes: "D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4" }),
        "Warm-up: bars 1–2",
        "The opening gesture: D, a run of four eighths from G up to C, then D and two Gs. Three beats per bar.",
      ),
      practice(
        drill({ id: "minuet-bars-3-4", tempo: 88, level: "intermediate", beatsPerBar: 3, notes: "E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4" }),
        "Warm-up: bars 3–4",
        "The same shape a step higher, with F♯ in the run. Practise C-D-E-F♯ until the sharp is automatic.",
      ),
    ],
    more: [
      practice(
        drill({ id: "minuet-bars-5-8", tempo: 80, level: "intermediate", beatsPerBar: 3, notes: "C5 D5:0.5 C5:0.5 B4:0.5 A4:0.5 | B4 C5:0.5 B4:0.5 A4:0.5 G4:0.5 | F#4 G4:0.5 A4:0.5 B4:0.5 G4:0.5 | A4:3" }),
        "Challenge: bars 5–8",
        "The continuation: three bars of falling and rising eighth-note figures, landing on a dotted half A at the end of the phrase. F♯ again in bar 7.",
      ),
    ],
  },
  "lesson-28": {
    more: [
      practice(
        drill({ id: "ear-steps-down", tempo: 72, level: "elementary", notes: "E4 D4 C4" }),
        "Hear then play: three steps down",
        "Eyes off the keys. Press ▶ Listen: three notes falling by step, ending on C4. Sing them, then play them back.",
      ),
      practice(
        drill({ id: "ear-steps-and-skips", tempo: 72, level: "elementary", notes: "C4 E4 D4 F4 | E4:2" }),
        "Challenge: steps and skips mixed",
        "Press ▶ Listen two or three times. It starts on C4 and alternates skips up with steps down. Track each move as step or skip, then play it back.",
      ),
    ],
  },
  "lesson-29": {
    more: [
      practice(
        drill({ id: "ear-f-major-triad", tempo: 72, level: "elementary", notes: "[F4 A4 C5]:2" }),
        "Hear then play: another bright triad",
        "Press ▶ Listen: one chord, major quality, with F4 as its lowest note. Find the other two notes by ear and play all three together.",
      ),
      practice(
        drill({ id: "ear-d-minor-triad", tempo: 72, level: "elementary", notes: "[D4 F4 A4]:2" }),
        "Hear then play: another dark triad",
        "Press ▶ Listen: a minor chord with D4 at the bottom. Play it back as one attack.",
      ),
      practice(
        drill({ id: "ear-major-then-minor", tempo: 72, level: "elementary", notes: "[C4 E4 G4]:2 [A3 C4 E4]:2" }),
        "Challenge: two chords in a row",
        "Press ▶ Listen: a major chord, then a minor one. Decide which is which, then play both back in order.",
      ),
    ],
  },
  "lesson-30": {
    warmups: [
      practice(
        drill({ id: "ear-melody-warmup", tempo: 72, level: "elementary", notes: "C4 D4 E4 D4 | C4:4" }),
        "Warm-up: a four-note turn",
        "Eyes off the keys. Press ▶ Listen: it starts on C4, steps up and comes back. Sing it, then play it back.",
      ),
    ],
    more: [
      practice(
        drill({ id: "ear-hot-cross-buns", tempo: 80, level: "elementary", notes: "E4 D4 C4:2 | E4 D4 C4:2 | C4:0.5 C4:0.5 C4:0.5 C4:0.5 D4:0.5 D4:0.5 D4:0.5 D4:0.5 | E4 D4 C4:2" }),
        "By ear: a traditional tune",
        "Press ▶ Listen to this traditional public-domain tune (Hot Cross Buns). It uses only E, D and C. Catch the falling three-note figure first, then the quick repeated notes in the middle.",
      ),
      practice(
        drill({ id: "ear-melody-long", tempo: 72, level: "elementary", notes: "C4 E4 G4 E4 | F4 D4 C4:2" }),
        "Challenge: a melody with skips",
        "Press ▶ Listen at least three times. It starts on C4 and climbs by skips, then turns back down. Build it in two chunks of three or four notes.",
      ),
    ],
  },
  "lesson-31": {
    warmups: [
      practice(
        drill({ id: "a-major-tetrachords", tempo: 76, level: "intermediate", notes: "A4 B4 C#5 D5 | C#5 B4 A4:2 | E5 F#5 G#5 A5 | G#5 F#5 E5:2" }),
        "Warm-up: A major in two halves",
        "A-B-C♯-D, then E-F♯-G♯-A: two matching groups, each with one half step at the top.",
      ),
    ],
    more: [
      practice(
        drill({ id: "a-major-up-down", tempo: 76, level: "intermediate", notes: "A4 B4 C#5 D5 | E5 F#5 G#5 A5 | G#5 F#5 E5 D5 | C#5 B4 A4:2" }),
        "A major up and down",
        "One octave up and back. Coming down, finger 3 crosses over the thumb onto C♯.",
      ),
      practice(
        drill({ id: "a-major-arpeggio", tempo: 72, level: "intermediate", notes: "A4 C#5 E5 A5 | E5 C#5 A4:2" }),
        "A major arpeggio",
        "A-C♯-E-A and back with fingers 1-2-3-5.",
      ),
      practice(
        drill({ id: "a-major-lh", tempo: 66, level: "intermediate", notes: "A2 B2 C#3 D3 | E3 F#3 G#3 A3 | G#3 F#3 E3 D3 | C#3 B2 A2:2" }),
        "Challenge: A major, left hand",
        "Left hand 5-4-3-2-1-3-2-1 going up (finger 3 crosses over to F♯3), and the reverse coming down.",
      ),
    ],
  },
  "lesson-32": {
    warmups: [
      practice(
        drill({ id: "f-major-pentachord", tempo: 76, level: "intermediate", notes: "F4 G4 A4 Bb4 | C5 Bb4 A4 G4 | F4:4" }),
        "Warm-up: F to C with B♭",
        "The first five notes of F major and back. Finger 4 always takes B♭.",
      ),
    ],
    more: [
      practice(
        drill({ id: "f-major-up-down", tempo: 76, level: "intermediate", notes: "F4 G4 A4 Bb4 | C5 D5 E5 F5 | E5 D5 C5 Bb4 | A4 G4 F4:2" }),
        "F major up and down",
        "One octave up and back with fingers 1-2-3-4-1-2-3-4. Coming down, finger 4 crosses over the thumb onto B♭.",
      ),
      practice(
        drill({ id: "f-major-arpeggio-quarters", tempo: 72, level: "intermediate", notes: "F4 A4 C5 F5 | C5 A4 F4:2" }),
        "F major arpeggio",
        "F-A-C-F and back with fingers 1-2-3-5.",
      ),
      practice(
        drill({ id: "f-major-lh", tempo: 66, level: "intermediate", notes: "F2 G2 A2 Bb2 | C3 D3 E3 F3 | E3 D3 C3 Bb2 | A2 G2 F2:2" }),
        "Challenge: F major, left hand",
        "Left hand 5-4-3-2-1-3-2-1 going up: after the thumb plays C3, finger 3 crosses over to D3.",
      ),
    ],
  },
  "lesson-33": {
    warmups: [
      practice(
        drill({ id: "a-harmonic-upper", tempo: 72, level: "intermediate", keySignature: { fifths: 0, mode: "minor" }, notes: "E5 F5 G#5 A5 | G#5 F5 E5:2" }),
        "Warm-up: the top four notes",
        "E-F-G♯-A and back: the augmented second F to G♯ is the stretch to get used to.",
      ),
    ],
    more: [
      practice(
        drill({ id: "a-harmonic-up-down", tempo: 72, level: "intermediate", notes: "A4 B4 C5 D5 | E5 F5 G#5 A5 | G#5 F5 E5 D5 | C5 B4 A4:2" }),
        "A harmonic minor up and down",
        "One octave up and back. G♯ both ways: harmonic minor raises the seventh in both directions.",
      ),
      practice(
        drill({ id: "a-minor-cadence", tempo: 66, level: "intermediate", notes: "A4 C5 E5 A5 | E5 C5 A4:2 | [E4 G#4 B4]:2 [A4 C5 E5]:2 | [E4 G#4 B4 D5]:2 [A4 C5 E5]:2" }),
        "Challenge: arpeggio and cadence",
        "An A-minor arpeggio, then the raised seventh at work: E major to A minor, and E7 to A minor. G♯ pulls up to A each time.",
      ),
    ],
  },
  "lesson-34": {
    warmups: [
      practice(
        drill({ id: "broken-c-warmup", tempo: 69, level: "intermediate", notes: "C3 G3 E3 G3 | C3 G3 E3 G3 | C3:4" }),
        "Warm-up: one pattern, two bars",
        "The C-major pattern C-G-E-G with fingers 5-1-3-1, twice, then C3 held.",
      ),
    ],
    more: [
      practice(
        drill({ id: "broken-c-f-g-c", tempo: 69, level: "intermediate", notes: "C3 G3 E3 G3 | F2 C3 A2 C3 | G2 D3 B2 D3 | C3 G3 E3 G3 | C3:4" }),
        "C – F – G – C",
        "The same root-fifth-third-fifth pattern through three chords. Move the hand to each new root on the barline.",
      ),
      practice(
        drill({
          id: "melody-over-broken-chords",
          tempo: 63,
          level: "intermediate",
          notes: [
            { id: "rh", notes: "E4:2 G4:2 | F4:2 A4:2 | D4:2 F4:2 | E4:4" },
            { id: "lh", notes: "C3 G3 E3 G3 | F2 C3 A2 C3 | G2 D3 B2 D3 | C3 G3 E3 G3" },
          ],
        }),
        "Challenge: a melody on top",
        "The right hand plays half notes over the left hand's broken chords. Keep the left hand quieter and perfectly even under the melody.",
      ),
    ],
  },
};

/** Every exercise added by this file. */
export const depthExercises: MidiExercise[] = Object.values(PRACTICE).flatMap((entry) =>
  [...(entry.warmups ?? []), ...entry.more].map((item) => item.exercise),
);

const toSection = (item: Practice): LessonSection => midiSection(item.exercise.exerciseId, item.title, item.instructions);

/**
 * Insert each lesson's warm-ups before its first exercise and the remaining practice after
 * its last one. A lesson without an exercise gets its practice appended at the end.
 */
export function withPractice(lesson: Lesson): Lesson {
  const entry = PRACTICE[lesson.id];
  if (!entry) return lesson;
  const exerciseIndexes = lesson.sections.flatMap((section, index) => (section.type === "midi-exercise" ? [index] : []));
  const first = exerciseIndexes[0] ?? lesson.sections.length;
  const last = exerciseIndexes[exerciseIndexes.length - 1] ?? lesson.sections.length - 1;
  const warmups = (entry.warmups ?? []).map(toSection);
  const more = entry.more.map(toSection);
  return {
    ...lesson,
    sections: [
      ...lesson.sections.slice(0, first),
      ...warmups,
      ...lesson.sections.slice(first, last + 1),
      ...more,
      ...lesson.sections.slice(last + 1),
    ],
  };
}
