import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { defineLesson, midiSection, quiz, rewards } from "./helpers.js";
import { BOTH_PATTERNS, fingerboardData, violinDrill, violinNotation } from "./violin-helpers.js";

/**
 * Violin, tiers 0-2 (first steps to the second finger pattern). Everything here is original
 * writing: the explanations, the exercises and the little tunes. Ids are permanent, like every
 * lesson id; they say nothing about position.
 *
 * Every exercise is a single line graded by the microphone (`input: "mic-mono"`). Intonation
 * tolerance tightens by tier: 40 cents on open strings, 30 for the first pattern, 25 once the
 * low second finger arrives. Fingerings and bowings are hints for the notation and the
 * fingerboard, not part of the grade.
 */

const D_MAJOR = { fifths: 2, mode: "major" } as const;
const A_MAJOR = { fifths: 3, mode: "major" } as const;
const G_MAJOR = { fifths: 1, mode: "major" } as const;

const note = (text: string) => ({ type: "markdown" as const, ...splitTitle(text) });
function splitTitle(text: string): { title: string; body: string } {
  const [title, ...rest] = text.split("\n");
  return { title: title!, body: rest.join("\n").trim() };
}
const card = (text: string) => ({ type: "theory-card" as const, ...splitTitle(text) });
const staff = (title: string, exercise: MidiExercise, options?: Parameters<typeof violinNotation>[1]) => ({
  type: "notation" as const,
  title,
  vexflowData: violinNotation(exercise, options),
  contentRights: { workTitle: title, composer: "Music Portal", status: "original" as const, copyrightHolder: null, licenseReference: null },
});
const board = (title: string, data: Record<string, unknown>) => ({
  type: "notation" as const,
  title,
  vexflowData: data,
  contentRights: { workTitle: title, composer: "Music Portal", status: "original" as const, copyrightHolder: null, licenseReference: null },
});

// ───────────────────────── Tier 0: first steps ─────────────────────────

const openStrings = violinDrill({
  id: "violin-open-strings-gdae", tempo: 54, level: "beginner", toleranceCents: 40, notes: "G3:2 D4:2 | A4:2 E5:2 | E5:2 A4:2 | D4:2 G3:2",
});
const openA = violinDrill({
  id: "violin-open-a-lengths", tempo: 60, level: "beginner", toleranceCents: 40, notes: "A4:4 | A4:2 A4:2 | A4:1 A4:1 A4:1 A4:1 | A4:4",
});
const openCrossing = violinDrill({
  id: "violin-open-d-a-crossing", tempo: 60, level: "beginner", toleranceCents: 40, notes: "D4:2 A4:2 | D4:1 D4:1 A4:1 A4:1 | A4:2 D4:2 | D4:4",
});
const openFour = violinDrill({
  id: "violin-open-four-strings", tempo: 66, level: "beginner", toleranceCents: 40, notes: "G3 D4 A4 E5 | E5 A4 D4 G3 | G3:2 A4:2 | D4:2 E5:2 | G3:4",
});

const openAE = violinDrill({
  id: "violin-open-a-and-e", tempo: 60, level: "beginner", toleranceCents: 40, notes: "A4:2 E5:2 | E5:2 A4:2 | A4:1 E5:1 A4:1 E5:1 | A4:4",
});
const openGD = violinDrill({
  id: "violin-open-g-and-d", tempo: 60, level: "beginner", toleranceCents: 40, notes: "G3:2 D4:2 | D4:2 G3:2 | G3:1 D4:1 G3:1 D4:1 | G3:4",
});

export const violinTier0Exercises: MidiExercise[] = [openStrings, openA, openCrossing, openFour, openAE, openGD];

const firstSteps: Lesson = defineLesson({
  id: "violin-first-steps",
  title: "Meet your violin: holding it and the open strings",
  level: "foundation",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Hold the violin and bow in a relaxed, balanced way",
    "Name the four open strings from lowest to highest: G, D, A, E",
    "Tune each string with the fine tuner, with the pegs only as a last resort",
    "Play each open string once with a clear start and a steady pitch",
  ],
  skillRewards: rewards({ technique: 8, theory: 4 }),
  sections: [
    note(`Holding the violin
Rest the violin on your left collarbone and let your jaw settle on the chin rest. The scroll points a little to the left of your nose and slightly above the body, so the strings slope gently down towards your right hand. Your left hand supports the neck lightly between thumb and the base of your first finger: if you could lift the thumb away, the violin should stay where it is. Keep your shoulders low and your elbow in front of the ribs rather than out to the side.`),
    note(`Holding the bow
Make the bow hold soft and round. The thumb is bent and rests on the stick against the frog, the middle fingers drape over the stick, and the little finger sits curved on top. Nothing is squeezed. Tilt the stick slightly towards the scroll so only the flat of the hair touches the string. A new bow needs rosin: a few light strokes along the hair are plenty, and too much makes the sound scratchy.`),
    card(`The four open strings
From lowest to highest the strings are G, D, A and E. The lowest, G, is the one on your left as you look down at the violin; the highest, E, is on your right. In music the strings are also written with Roman numerals: I is E, II is A, III is D and IV is G. In this course the numeral appears above a note when you change string.`),
    board("The four open strings", { fingerboard: { strings: ["G", "D", "A", "E"], marks: ["G", "D", "A", "E"].map((string) => ({ string, finger: 0, offset: 0 })) } }),
    note(`Tuning
Use the tuner before every practice session. Turn the fine tuner (the small screw at the tailpiece) a little at a time, and watch the needle rather than guessing. Only use the pegs when a string is far out, push them in gently as you turn, and make small movements: a peg that slips or an over-tightened string can snap. If you are unsure, ask a teacher to do the first tuning for you. Tune the A first, then D, G and E.`),
    staff("Open strings, G D A E", openStrings),
    midiSection("violin-open-strings-gdae", "Play the four open strings", "Bow each open string as one long note, down-bow then up-bow. Listen for a clear start and a steady, quiet-to-full tone, and let the note ring until the next one begins."),
    midiSection("violin-open-four-strings", "Up, down and skip", "Play the four open strings upwards, back down, then jump between strings. Move the bow arm from the elbow, not the wrist, so the bow arrives on the new string already straight."),
    midiSection("violin-open-a-and-e", "The two high strings", "Play A and E, the two highest strings, with a light, quick bow. Check that only one string sounds at a time."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-strings", "Which is the lowest-sounding string?", ["E", "A", "D", "G"], 3, "The strings rise G, D, A, E. G is the thickest and lowest."),
        quiz("violin-q-numeral", "In violin music, which string does the numeral II mean?", ["E", "A", "D", "G"], 1, "I is E, II is A, III is D and IV is G."),
        quiz("violin-q-tuning", "What do you use for small tuning changes?", ["The pegs", "The fine tuner", "The bridge", "The chin rest"], 1, "Fine tuners move the pitch in small, safe steps. Pegs are for big changes and need care."),
      ],
    },
  ],
});

const openStringBowing: Lesson = defineLesson({
  id: "violin-open-string-bowing",
  title: "Open-string bowing: down-bow, up-bow and crossings",
  level: "foundation",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Read the down-bow and up-bow signs and bow in the right direction",
    "Play whole, half and quarter notes on an open string with a steady pulse",
    "Cross from one string to the next without a bump in the sound",
  ],
  skillRewards: rewards({ technique: 8, rhythm: 6 }),
  sections: [
    card(`Bowing signs
A square bracket above a note, like a table with no legs, is a down-bow: the bow moves from the frog (the end you hold) towards the tip. A V is an up-bow: from the tip back towards the frog. Down and up alternate, so the notes in a bar usually go down, up, down, up. The first beat of a bar is usually a down-bow.`),
    staff("Down-bow and up-bow on the open D string and the A string", openCrossing),
    note(`Crossing strings
To change string, change the height of your right elbow, not the angle of your wrist. Bring the elbow up for the E and A strings and lower it for the D and G. Prepare the move during the last part of the previous note, so the bow lands on the new string already in place.`),
    midiSection("violin-open-a-lengths", "Note lengths on the A string", "Count the beats out loud: one long bow for the whole note, half the bow for each half note, a short bow for each quarter note. Use the whole bow only for the long note."),
    midiSection("violin-open-d-a-crossing", "Crossing between D and A", "Move the elbow, not the wrist, between the two strings. If you hear the neighbouring string, tilt the stick a little more towards the one you are playing."),
    midiSection("violin-open-g-and-d", "The two low strings", "Play G and D, the two lowest strings, with a slower, heavier bow. The bow arm stays quiet; only the elbow height changes."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-downbow", "Which bow direction is marked with a V?", ["Down-bow", "Up-bow", "Either", "No bow"], 1, "A V is an up-bow, from the tip back towards the frog."),
        quiz("violin-q-elbow", "What changes the string you play on?", ["The angle of the wrist", "The height of the right elbow", "The length of the bow", "The tightness of the hair"], 1, "The elbow height sets the bow's angle to the strings. Keep the wrist quiet."),
      ],
    },
  ],
});

// ───────────────────────── Tier 1: first finger pattern ─────────────────────────

const aString0123 = violinDrill({
  id: "violin-a-string-0123", tempo: 56, level: "beginner", toleranceCents: 30, keySignature: D_MAJOR,
  notes: "A4 B4 C#5 D5 | D5 C#5 B4 A4 | A4:2 C#5:2 | D5:4",
});
const dString0123 = violinDrill({
  id: "violin-d-string-0123", tempo: 56, level: "beginner", toleranceCents: 30, keySignature: D_MAJOR,
  notes: "D4 E4 F#4 G4 | G4 F#4 E4 D4 | D4:2 F#4:2 | G4:4",
});
const dMajorScale = violinDrill({
  id: "violin-d-major-scale", tempo: 56, level: "beginner", toleranceCents: 30, keySignature: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4",
});
const morningWalk = violinDrill({
  id: "violin-tune-morning-walk", tempo: 72, level: "beginner", toleranceCents: 30, keySignature: D_MAJOR,
  notes: "D4 D4 E4 F#4 | G4:2 F#4:2 | E4 E4 F#4 G4 | A4:4 | G4 F#4 E4 D4 | D4:4",
});
const littleBridge = violinDrill({
  id: "violin-tune-little-bridge", tempo: 72, level: "beginner", toleranceCents: 30, keySignature: A_MAJOR, beatsPerBar: 3,
  notes: "A4 B4 C#5 | D5:2 C#5 | B4 A4 B4 | A4:3 | C#5 D5 E5 | E5:2 D5 | C#5 B4 A4 | A4:3",
});
const twoStringsDance = violinDrill({
  id: "violin-tune-two-strings", tempo: 76, level: "beginner", toleranceCents: 30, keySignature: D_MAJOR,
  notes: "D4 F#4 A4 F#4 | D4 F#4 A4:2 | B4 A4 G4 F#4 | E4:2 D4:2",
});

export const violinTier1Exercises: MidiExercise[] = [aString0123, dString0123, dMajorScale, morningWalk, littleBridge, twoStringsDance];

const firstFingerPattern: Lesson = defineLesson({
  id: "violin-first-finger-pattern",
  title: "The first finger pattern: 0-1-2-3 on A and D",
  level: "foundation",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Place fingers 1, 2 and 3 on the A string to play A B C-sharp D",
    "Hear and feel the pattern whole step, whole step, half step",
    "Play the same shape on the D string and join both strings into a D major scale",
    "Keep each finger within 30 cents of the note",
  ],
  skillRewards: rewards({ technique: 10, note_reading: 4 }),
  sections: [
    note(`One shape, four notes
Put your first, second and third fingers on the A string so they sit close together, with the second finger a step away from the first and touching the third. The notes you get are A (open), B, C-sharp and D. The gaps are a whole step (A to B), a whole step (B to C-sharp) and a half step (C-sharp to D). Violinists call this the high-2 pattern, because the second finger is placed up, close to the third.`),
    board("The high-2 pattern on the A string", fingerboardData("high2", ["A"])),
    note(`Finger tapes
Many teachers put small tapes on the fingerboard to show where the fingers go. The tapes are only a guide: your ear decides. Play the note, listen, and slide the finger a little if it sounds sharp (too high) or flat (too low). The app tells you which way you missed.`),
    staff("A, B, C-sharp, D with finger numbers", aString0123),
    midiSection("violin-a-string-0123", "Fingers on the A string", "Keep your fingers curved and just behind the tape. Play A B C-sharp D and back. The first finger stays down when you move up, so you can hear the gaps."),
    midiSection("violin-d-string-0123", "The same shape on the D string", "The shape is identical: D E F-sharp G. The strings are a fifth apart, so each string has its own set of four notes."),
    midiSection("violin-d-major-scale", "D major scale, one octave", "Go up the D string and on to the A string, the way the scale is written. Lift each finger just before the next one lands and keep the bow moving smoothly through the string change."),
    staff("D major scale, one octave", dMajorScale),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-pattern", "What are the steps in the high-2 pattern, from the open string?", ["Whole, whole, half", "Whole, half, whole", "Half, whole, whole", "Whole, whole, whole"], 0, "A to B and B to C-sharp are whole steps; C-sharp to D is a half step."),
        quiz("violin-q-sharp", "The note you play sounds higher than the tape. What is it?", ["Sharp", "Flat", "In tune", "A rest"], 0, "Higher than the target pitch is sharp; lower is flat."),
        quiz("violin-q-scale", "Which two strings does the one-octave D major scale use?", ["G and D", "D and A", "A and E", "G and E"], 1, "The scale starts on open D and moves to the A string after G."),
      ],
    },
  ],
});

const simpleTunes: Lesson = defineLesson({
  id: "violin-simple-tunes-d-a",
  title: "Simple tunes in D and A major",
  level: "foundation",
  branch: "repertoire",
  path: "violin-foundations",
  objectives: [
    "Play short tunes in D major and A major in first position",
    "Move from string to string within a phrase",
    "Count a bar of three beats and a bar of four beats",
    "Keep every note of a tune within 30 cents",
  ],
  skillRewards: rewards({ technique: 8, sight_reading: 4 }),
  sections: [
    note(`From scales to tunes
A scale teaches the shape; a tune teaches you to listen. These tunes are written for this course and use only the notes you know. Read the finger numbers, play the first bar slowly, and sing the pitch in your head before you play it.`),
    staff("Morning Walk (D major, four beats in a bar)", morningWalk),
    midiSection("violin-tune-morning-walk", "Morning Walk", "Steady quarter-note walking steps with one long note at the top. Use a down-bow on beat one of each bar."),
    staff("Little Bridge (A major, three beats in a bar)", littleBridge),
    midiSection("violin-tune-little-bridge", "Little Bridge", "A major has three sharps (F-sharp, C-sharp and G-sharp). This tune uses C-sharp and reaches the open E string at the top. Count one-two-three in each bar."),
    staff("Two Strings Dance (D major)", twoStringsDance),
    midiSection("violin-tune-two-strings", "Two Strings Dance", "The tune hops between the D string and the A string. Play the first note of each new string with the elbow already in position."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-three", "How many beats are in each bar of Little Bridge?", ["2", "3", "4", "6"], 1, "The time signature 3/4 means three quarter-note beats per bar."),
        quiz("violin-q-asharps", "How many sharps are in the key signature of A major?", ["1", "2", "3", "4"], 2, "A major has F-sharp, C-sharp and G-sharp."),
      ],
    },
  ],
});

// ───────────────────────── Tier 2: the second finger pattern ─────────────────────────

const aLow2 = violinDrill({
  id: "violin-a-string-low2", tempo: 56, level: "beginner", toleranceCents: 25, patterns: BOTH_PATTERNS,
  notes: "A4 B4 C5 D5 | D5 C5 B4 A4 | A4:2 C5:2 | A4:4",
});
const dLow2 = violinDrill({
  id: "violin-d-string-low2", tempo: 56, level: "beginner", toleranceCents: 25, patterns: BOTH_PATTERNS,
  notes: "D4 E4 F4 G4 | G4 F4 E4 D4 | D4:2 F4:2 | G4:4",
});
const cMajorScale = violinDrill({
  id: "violin-c-major-scale", tempo: 56, level: "beginner", toleranceCents: 25, patterns: BOTH_PATTERNS,
  notes: "C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4",
});
const gString0123 = violinDrill({
  id: "violin-g-string-0123", tempo: 56, level: "beginner", toleranceCents: 25, keySignature: G_MAJOR,
  notes: "G3 A3 B3 C4 | C4 B3 A3 G3 | G3:2 B3:2 | C4:4",
});
const gMajorScale = violinDrill({
  id: "violin-g-major-scale", tempo: 56, level: "beginner", toleranceCents: 25, keySignature: G_MAJOR,
  notes: "G3 A3 B3 C4 | D4 E4 F#4 G4 | G4 F#4 E4 D4 | C4 B3 A3 G3",
});
const hilltop = violinDrill({
  id: "violin-tune-hilltop", tempo: 72, level: "beginner", toleranceCents: 25, keySignature: G_MAJOR, patterns: BOTH_PATTERNS,
  notes: "G4 B4 D5 B4 | E5 D5 B4 G4 | A4 B4 C5 D5 | G4:4",
});
const eString = violinDrill({
  id: "violin-e-string-notes", tempo: 56, level: "beginner", toleranceCents: 25, keySignature: G_MAJOR, patterns: BOTH_PATTERNS,
  notes: "E5 F#5 G5 F#5 | E5:2 D5:2 | B4 D5 E5 D5 | B4:2 G4:2",
});
const eStringSong = violinDrill({
  id: "violin-tune-high-window", tempo: 72, level: "beginner", toleranceCents: 25, keySignature: A_MAJOR,
  notes: "E5 F#5 G#5 A5 | G#5 F#5 E5:2 | A4 C#5 E5 C#5 | A4:4",
});
const eStringHigh = violinDrill({
  id: "violin-e-string-0123", tempo: 56, level: "beginner", toleranceCents: 25, keySignature: A_MAJOR,
  notes: "E5 F#5 G#5 A5 | A5 G#5 F#5 E5 | E5:2 G#5:2 | A5:4",
});

export const violinTier2Exercises: MidiExercise[] = [aLow2, dLow2, cMajorScale, gString0123, gMajorScale, hilltop, eString, eStringSong, eStringHigh];

const lowSecondFinger: Lesson = defineLesson({
  id: "violin-low-second-finger",
  title: "The second pattern: the low second finger and C major",
  level: "elementary",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Place the second finger low, next to the first, to play C and F natural",
    "Tell the high-2 pattern from the low-2 pattern by ear and by sight",
    "Play a one-octave C major scale across three strings",
    "Keep every note within 25 cents",
  ],
  skillRewards: rewards({ technique: 10, theory: 4 }),
  sections: [
    note(`Two places for the second finger
In the first pattern the second finger sits next to the third (high 2) and plays notes like C-sharp. When the music has a natural sign, a flat, or no sharp, the second finger often moves down to touch the first (low 2). On the A string the notes are A, B, C natural and D; on the D string they are D, E, F natural and G. The first and third fingers do not move: only the second finger shifts, about the width of a half step.`),
    board("The low-2 pattern on the A string", fingerboardData("low2", ["A"])),
    staff("A string, low second finger", aLow2),
    midiSection("violin-a-string-low2", "A string with a low 2", "The second finger is close to the first. If the C sounds like C-sharp, your finger is too high: slide it toward the nut until the pitch drops."),
    midiSection("violin-d-string-low2", "D string with a low 2", "Same move on the D string: D E F G. F natural is a half step above E."),
    midiSection("violin-c-major-scale", "C major scale", "Start on the third finger of the G string, then up through the D and A strings. This scale has no sharps and no flats."),
    staff("C major scale, one octave", cMajorScale),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-low2", "Where does the second finger go in the low-2 pattern?", ["Next to the third finger", "Next to the first finger", "Beside the nut", "Behind the bridge"], 1, "Low 2 touches the first finger, so the gap from 1 to 2 is a half step."),
        quiz("violin-q-cnat", "Which pattern gives C natural on the A string?", ["High 2", "Low 2", "Either", "Neither"], 1, "C natural is a half step above B, which is the first finger, so the second finger is low."),
      ],
    },
  ],
});

const gStringAndGMajor: Lesson = defineLesson({
  id: "violin-g-string-g-major",
  title: "The G string and G major",
  level: "elementary",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Read notes below the staff's bottom line: G A B on ledger lines",
    "Play the high-2 pattern on the G string",
    "Play a one-octave G major scale on the G and D strings",
    "Keep every note within 25 cents",
  ],
  skillRewards: rewards({ technique: 10, note_reading: 6 }),
  sections: [
    note(`The deep string
The G string is the lowest and richest string of the violin, tuned to the G below middle C. Its open G is written on the second ledger line below the staff, and the notes A and B sit on the first ledger line and just below the staff. The shapes are the same as on the other strings: G A B C with the high-2 pattern.`),
    board("The high-2 pattern on the G string", fingerboardData("high2", ["G"])),
    staff("G string, 0-1-2-3", gString0123),
    midiSection("violin-g-string-0123", "Fingers on the G string", "Use a little more arm weight on the thick string and a slightly slower bow. Keep the fingers curved so they do not touch the neighbouring string."),
    midiSection("violin-g-major-scale", "G major scale", "Cross from G to D at the C-D move. F is F-sharp in this key, with the second finger high."),
    staff("G major scale", gMajorScale),
    midiSection("violin-tune-hilltop", "Hilltop", "A little tune across three strings: it lands on the open E string for the high peak, then comes home. Use the low second finger for C natural."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-gstr", "Which note is the open G string, written below the staff?", ["G3", "D4", "A4", "E5"], 0, "The G string sounds G3, the G below middle C."),
        quiz("violin-q-fsharp", "How many sharps are in the key of G major?", ["0", "1", "2", "3"], 1, "G major has one sharp: F-sharp."),
      ],
    },
  ],
});

const eStringHighNotes: Lesson = defineLesson({
  id: "violin-e-string-high-notes",
  title: "The E string and the high notes",
  level: "elementary",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Place fingers on the E string for E F-sharp G-sharp A in A major",
    "Use the low second finger on the E string for G natural",
    "Bow the E string without whistling or scratching",
  ],
  skillRewards: rewards({ technique: 10, theory: 4 }),
  sections: [
    note(`The singing string
The E string is the highest and thinnest string. It needs a lighter bow, a little more speed and a slightly steeper tilt of the stick. The finger patterns are the same: the A major tetrachord E, F-sharp, G-sharp, A uses the high-2 pattern, and the G major tune below uses the low second finger for G natural.`),
    board("The high-2 pattern on the E string", fingerboardData("high2", ["E"])),
    staff("E string, 0-1-2-3 in A major", eStringHigh),
    midiSection("violin-e-string-0123", "Fingers on the E string", "Keep the fingers close to the tapes. On the high string a small movement is a big change in pitch, so listen closely."),
    midiSection("violin-e-string-notes", "A tune on the E string", "A short tune in G major with F-sharp on the E string and a low second finger for G natural."),
    midiSection("violin-tune-high-window", "High Window", "A tune in A major that starts on the open E string, climbs to the top note and comes back down across two strings."),
    staff("A tune on the E string", eString),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-estr", "How should the bow feel on the E string?", ["Lighter and faster", "Heavier and slower", "The same as on G", "Resting on the string"], 0, "The thin string needs less weight and more speed to sound free."),
      ],
    },
  ],
});

// ───────────────────────── Tier 2: rhythm and bowing ─────────────────────────

const slurPairs = violinDrill({
  id: "violin-slur-pairs", tempo: 60, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4",
  slurs: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15]],
});
const slurFours = violinDrill({
  id: "violin-slur-fours", tempo: 60, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | D5 C#5 B4 A4 | G4 F#4 E4 D4",
  slurs: [[0, 3], [4, 7], [8, 11], [12, 15]],
});
const detache = violinDrill({
  id: "violin-detache-fifths", tempo: 72, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR,
  notes: "D4:0.5 D4:0.5 A4:0.5 A4:0.5 D4:0.5 D4:0.5 A4:0.5 A4:0.5 | F#4:0.5 F#4:0.5 A4:0.5 A4:0.5 D5:2",
});
const staccato = violinDrill({
  id: "violin-staccato-notes", tempo: 66, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR,
  notes: "D4:0.5 r:0.5 D4:0.5 r:0.5 A4:0.5 r:0.5 A4:0.5 r:0.5 | D5:0.5 r:0.5 A4:0.5 r:0.5 F#4:0.5 r:0.5 D4:0.5 r:0.5",
});
const dottedD = violinDrill({
  id: "violin-dotted-rhythm", tempo: 66, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR,
  notes: "D4:1.5 E4:0.5 F#4:1.5 G4:0.5 | A4:1.5 G4:0.5 F#4:1.5 E4:0.5 | D4:1.5 F#4:0.5 A4:1.5 F#4:0.5 | D4:4",
});
const dottedMarch = violinDrill({
  id: "violin-dotted-march", tempo: 66, level: "beginner", toleranceCents: 25, keySignature: A_MAJOR,
  notes: "A4:1.5 B4:0.5 C#5:1.5 D5:0.5 | E5:1.5 D5:0.5 C#5:1.5 B4:0.5 | A4:1.5 C#5:0.5 E5:1.5 C#5:0.5 | A4:4",
});
const dottedWaltz = violinDrill({
  id: "violin-dotted-waltz", tempo: 76, level: "beginner", toleranceCents: 25, keySignature: D_MAJOR, beatsPerBar: 3,
  notes: "D4:2 F#4 | A4:2 F#4 | G4:1.5 F#4:0.5 E4 | D4:3",
});

export const violinRhythmExercises: MidiExercise[] = [slurPairs, slurFours, detache, staccato, dottedD, dottedWaltz, dottedMarch];

const slursAndStrokes: Lesson = defineLesson({
  id: "violin-slurs-and-strokes",
  title: "Slurs, détaché and staccato",
  level: "elementary",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Play two or four notes on one bow with a slur",
    "Play separate bows in a smooth, even détaché",
    "Play short, separated staccato notes with a stopped bow",
    "Keep the pulse and the pitch steady through all three strokes",
  ],
  skillRewards: rewards({ technique: 10, rhythm: 8 }),
  sections: [
    card(`Three ways to use the bow
Détaché means "detached": each note has its own bow, and the bow changes direction smoothly between notes. A slur is a curved line over notes of different pitches: play them all in one bow, changing finger but not bow. Staccato means short and separated: the bow stops on the string after each note, and a rest follows.`),
    staff("A slur over two notes at a time", slurPairs),
    note(`Slurs
In a slur only the first note gets a bow mark, because the others share it. Divide the bow into equal parts for the notes under the slur, and change fingers at the same moment as you reach the next part of the bow. The app hears each new pitch as a new note, so a clean finger change is graded as a clean note.`),
    midiSection("violin-slur-pairs", "Slurs of two notes", "Two notes on each bow. Use about half the bow for each pair and keep the sound even."),
    midiSection("violin-slur-fours", "Slurs of four notes", "Four notes to the bow: split the bow into four equal parts. Check that the last note is as strong as the first."),
    midiSection("violin-detache-fifths", "Détaché eighth notes", "Short separate bows near the middle of the bow, with the arm relaxed. Keep the bow on the string."),
    midiSection("violin-staccato-notes", "Staccato", "Start each note with a small pinch of the bow and stop it on the string. Stay relaxed in the hand: the rests are part of the rhythm."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-slur", "What does a slur over several notes tell the bow arm?", ["Play each note with a new bow", "Play all the notes in one bow", "Skip the notes", "Play louder"], 1, "A slur joins notes of different pitches into a single bow stroke."),
        quiz("violin-q-staccato", "What is staccato?", ["Short, separated notes", "Long, joined notes", "A very quiet note", "Plucked notes"], 0, "Staccato notes are short and separated, with a stopped bow."),
      ],
    },
  ],
});

const dottedRhythms: Lesson = defineLesson({
  id: "violin-dotted-rhythms",
  title: "Dotted rhythms with the bow",
  level: "elementary",
  branch: "technique",
  path: "violin-foundations",
  objectives: [
    "Count a dotted quarter note followed by an eighth note",
    "Divide the bow so the long note uses more bow than the short one",
    "Play a dotted rhythm in four-beat and three-beat bars",
  ],
  skillRewards: rewards({ technique: 8, rhythm: 10 }),
  sections: [
    card(`The dot
A dot after a note makes it half as long again. A dotted quarter note lasts one and a half beats, so it is followed by an eighth note (half a beat) to fill two beats. Count the pattern "one-and-a, two" and keep the dotted note long, the short one quick.`),
    staff("Dotted quarter and eighth", dottedD),
    midiSection("violin-dotted-rhythm", "Dotted rhythm in D major", "Long-short, long-short: use more bow for the dotted note and a small, quick bow for the eighth. The first of each pair takes a down-bow or an up-bow alternately, as marked."),
    midiSection("violin-dotted-waltz", "A dotted waltz", "Three beats to the bar. The dotted quarter lasts one and a half beats, then comes the short note."),
    midiSection("violin-dotted-march", "A dotted march in A major", "Long-short through a whole tune, then the dotted pattern broken into leaps. Keep the beat steady and let the short note come quickly."),
    {
      type: "quiz",
      questions: [
        quiz("violin-q-dot", "How many beats does a dotted quarter note last?", ["1", "1.5", "2", "3"], 1, "A dot adds half the note's value: 1 + 0.5 = 1.5 beats."),
      ],
    },
  ],
});

export const violinLessons: Lesson[] = [
  firstSteps,
  openStringBowing,
  firstFingerPattern,
  simpleTunes,
  lowSecondFinger,
  gStringAndGMajor,
  eStringHighNotes,
  slursAndStrokes,
  dottedRhythms,
].map((lesson) => ({ ...lesson, instrument: "violin" as const }));

export const violinExercises: MidiExercise[] = [
  ...violinTier0Exercises,
  ...violinTier1Exercises,
  ...violinTier2Exercises,
  ...violinRhythmExercises,
];

/** Tier and skill assignment for every violin lesson (see content/tiers.ts). */
export const VIOLIN_LESSON_TIERS = {
  "violin-first-steps": { tier: 0, skills: ["technique", "ear"] },
  "violin-open-string-bowing": { tier: 0, skills: ["technique", "rhythm"] },
  "violin-first-finger-pattern": { tier: 1, skills: ["technique", "scales"] },
  "violin-simple-tunes-d-a": { tier: 1, skills: ["repertoire", "reading-treble"] },
  "violin-low-second-finger": { tier: 2, skills: ["technique", "scales"] },
  "violin-g-string-g-major": { tier: 2, skills: ["technique", "reading-treble"] },
  "violin-e-string-high-notes": { tier: 2, skills: ["technique", "ear"] },
  "violin-slurs-and-strokes": { tier: 2, skills: ["technique", "rhythm"] },
  "violin-dotted-rhythms": { tier: 2, skills: ["technique", "rhythm"] },
} as const;
