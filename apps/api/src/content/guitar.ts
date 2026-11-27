import type { Lesson, LessonSection, MidiExercise } from "@keyboard-sensei/shared-types";
import { midiSection, quiz, rewards } from "./helpers.js";
import { chordDiagramsSection, fretboardSection, guitarLesson, guitarNotationSection, strumDrill, tabDrill } from "./guitar-helpers.js";

/**
 * Guitar course, tiers 0-2 (first steps, first notes and chords, chord changes and bass notes).
 * Everything here is original: the tunes are short exercises written for this course, and the chord
 * progressions are the common-property building blocks of folk and pop music.
 *
 * Lesson ids are permanent (README rule): explicit `guitar-` literals, never derived from position.
 */

const exercises: MidiExercise[] = [];
const notationFor = (_id: string, title: string, drill: ReturnType<typeof tabDrill>): LessonSection => {
  exercises.push(drill.exercise);
  return guitarNotationSection(title, drill.notation);
};
/** A tab drill: registers the exercise and returns [notation section, exercise section]. */
const tab = (id: string, title: string, instructions: string, notes: string, tempo = 60, extra: Partial<Parameters<typeof tabDrill>[0]> & { original?: boolean } = {}): LessonSection[] => {
  const { original: isOriginal, ...drillOptions } = extra;
  const drill = tabDrill({ id, tempo, notes, ...drillOptions });
  const notation = notationFor(id, title, drill);
  return [isOriginal && notation.type === "notation" ? { ...notation, contentRights: original } : notation, midiSection(id, title, instructions)];
};
/** A strum drill: registers the exercise and returns [chord boxes + notation, exercise section]. */
const strum = (id: string, title: string, instructions: string, chords: string, tempo = 60, extra: Partial<Parameters<typeof strumDrill>[0]> = {}): LessonSection[] => {
  const drill = strumDrill({ id, tempo, chords, ...extra });
  exercises.push(drill.exercise);
  return [guitarNotationSection(title, drill.notation), midiSection(id, title, instructions)];
};
const md = (title: string, body: string): LessonSection => ({ type: "markdown", title, body });
const card = (title: string, body: string): LessonSection => ({ type: "theory-card", title, body });
const original = { workTitle: "Course exercise", composer: "Music Portal", status: "original", copyrightHolder: null, licenseReference: null } as const;

const FOUNDATIONS = "guitar-foundations" as const;
const CHORDS = "guitar-chords-rhythm" as const;

// ---------------------------------------------------------------- tier 0

const meetYourGuitar = guitarLesson({
  id: "guitar-meet-your-guitar", path: FOUNDATIONS, title: "Meet your guitar", level: "foundation", branch: "technique",
  objectives: ["Name the six strings from low to high: E A D G B E", "Hold the guitar and your pick so you can play without tension", "Play each open string cleanly, one at a time"],
  sections: [
    md("Sitting and holding", "Sit on the front half of a chair with your back straight. Rest the guitar's waist on your right thigh (left thigh for left-handed players) and keep the neck angled slightly upward. Hold the pick between the pad of your thumb and the side of your index finger, with only a few millimetres showing. Your picking arm should hang relaxed from the elbow, not clamped to the body."),
    card("The six strings", "Strings are numbered from the thinnest: string 1 is the high E, string 6 is the thick low E. Reading from low to high the names are **E A D G B E**. A phrase helps: **E**very **A**nimal **D**oes **G**et **B**ig **E**ars. When we talk about the *open* strings, we mean the strings played with no finger on the fretboard."),
    fretboardSection("The open strings", [1, 2, 3, 4, 5, 6].map((string) => ({ string, fret: 0 })), 4),
    ...tab("guitar-open-strings-up", "Open strings, low to high", "Pick each open string once, from the thick low E up to the thin high E. Let each note ring for a beat.", "6/0 5/0 4/0 3/0 | 2/0 1/0 r:2"),
    ...tab("guitar-open-strings-down", "Open strings, high to low", "Now come back down from the high E to the low E. Keep the beat steady.", "1/0 2/0 3/0 4/0 | 5/0 6/0 r:2"),
    { type: "quiz", questions: [
      quiz("guitar-q-string-1", "Which string is string 1?", ["The thickest string, low E", "The thinnest string, high E", "The A string"], 1, "Strings are numbered from the thinnest (1) to the thickest (6)."),
      quiz("guitar-q-string-names", "Which order lists the open strings from the thickest to the thinnest?", ["E A D G B E", "E B G D A E", "A D G B E E"], 0, "Low to high: E A D G B E."),
    ] },
  ],
  skillRewards: rewards({ technique: 10, note_reading: 5 }),
});

const tuningUp = guitarLesson({
  id: "guitar-tuning-up", path: FOUNDATIONS, title: "Tuning up", level: "foundation", branch: "technique",
  objectives: ["Tune all six strings with the tuner", "Hear when a string is flat or sharp", "Check your tuning before every practice"],
  sections: [
    md("Why tuning comes first", "A guitar slips out of tune as strings stretch and temperatures change, so tune at the start of every session. Open the **Tuner** from the menu, pluck one string, and turn its tuning peg until the needle sits in the middle. If the needle leans left, the string is *flat* (too low): tighten it. If it leans right, the string is *sharp* (too high): loosen it a little. Always bring a string **up** to the note from slightly below; it holds better."),
    card("Standard tuning", "Low to high the strings are **E2, A2, D3, G3, B3, E4**. The two E strings sound two octaves apart. The tuner shows the note name and how far off you are in *cents*: 100 cents is one semitone, and anything within a few cents sounds in tune."),
    ...tab("guitar-tuning-check", "Ring each string in tune", "After tuning, play each string and let it ring for two beats. The app listens for the right pitch, so a string that is still out of tune will not pass.", "6/0:2 5/0:2 | 4/0:2 3/0:2 | 2/0:2 1/0:2", 56),
    ...tab("guitar-tuning-two-es", "The two E strings", "Play the low E, then the high E, twice. They are two octaves apart: if both are in tune they sound like one note in two sizes.", "6/0:2 1/0:2 | 6/0:2 1/0:2", 56),
    { type: "quiz", questions: [
      quiz("guitar-q-flat", "The needle leans to the left, so the string is flat. What do you do?", ["Tighten the string a little", "Loosen the string a little", "Leave it"], 0, "Flat means too low; tightening raises the pitch."),
    ] },
  ],
  skillRewards: rewards({ technique: 10, theory: 5 }),
});

const readingTab = guitarLesson({
  id: "guitar-reading-tab", path: FOUNDATIONS, title: "Reading tab", level: "foundation", branch: "technique",
  objectives: ["Read the six lines of a tab as your six strings", "Read a fret number as where to put your finger", "Match a tab note to the same note on the staff"],
  sections: [
    md("Tab in one minute", "Tablature, or *tab*, draws your six strings as six lines. The top line is the thinnest string (string 1), the bottom line the thickest. A **number** on a line is the fret to press: **0** means play the string open, **1** means press just behind the first fret. Tab tells you *where* to play; the staff above it tells you the *note* and the rhythm. This course shows both together."),
    card("Which finger?", "Number your fretting-hand fingers 1 to 4 from the index to the little finger. Place the fingertip just behind the fret wire, close to it, and press until the note rings clearly without a buzz. The thumb stays behind the neck."),
    ...tab("guitar-tab-high-e-first-fret", "Open and first fret", "Play the open high E string, then the first fret with your index finger. These two notes are E and F.", "1/0 1/1 1/0 1/1 | 1/0 1/1 1/1 1/0", 60),
    ...tab("guitar-tab-low-strings-open", "Tab on different strings", "Each number sits on its own line. Find the string first, then the fret: open B, open G, open D.", "2/0 3/0 4/0 3/0 | 2/0 3/0 4/0:2", 60),
    { type: "quiz", questions: [
      quiz("guitar-q-tab-top-line", "In tab, which string is the top line?", ["The thickest string", "The thinnest string"], 1, "The top line is string 1, the thin high E."),
      quiz("guitar-q-tab-zero", "What does a 0 mean in tab?", ["Do not play", "Play the string open", "Mute the string"], 1, "0 is the open string."),
    ] },
  ],
  skillRewards: rewards({ note_reading: 10, technique: 5 }),
});

const openStringRhythm = guitarLesson({
  id: "guitar-open-string-rhythm", path: FOUNDATIONS, title: "Open strings and steady rhythm", level: "foundation", branch: "technique",
  objectives: ["Pick quarter notes on the beat with a metronome", "Pick eighth notes with down-up alternate picking", "Keep the pulse steady while the picked note changes"],
  sections: [
    md("Down and up", "A downstroke moves the pick toward the floor, an upstroke back toward the ceiling. For steady eighth notes use **alternate picking**: down on the beat, up on the *and*. Keep the picking hand moving in an even down-up motion even when you do not strike a string. This habit is the engine of every strum later on."),
    card("Counting", "Count quarter notes **1 2 3 4**. Count eighth notes **1 & 2 & 3 & 4 &**. Each number is a downstroke and each & an upstroke. Turn the metronome on and tap your foot on the numbers."),
    ...tab("guitar-quarters-open-b", "Quarter notes on the B string", "Pick the open B string on every beat. Listen to the click and play right on it.", "2/0 2/0 2/0 2/0 | 2/0 2/0 2/0:2", 66),
    ...tab("guitar-eighths-open-g", "Eighth notes on the G string", "Eighth notes, down-up-down-up, on the open G string. Slow and even beats fast and uneven.", "3/0:0.5 3/0:0.5 3/0:0.5 3/0:0.5 3/0 3/0 | 3/0:0.5 3/0:0.5 3/0:0.5 3/0:0.5 3/0:2", 60),
    ...tab("guitar-moving-strings", "Changing strings", "Quarter notes that jump between strings. Keep the pick close to the strings so the move is small.", "4/0 3/0 2/0 1/0 | 2/0 3/0 4/0:2", 66),
  ],
  skillRewards: rewards({ rhythm: 10, technique: 5, timing: 5 }),
});

// ---------------------------------------------------------------- tier 1: notes

const firstNotesHighE = guitarLesson({
  id: "guitar-first-notes-high-e", path: FOUNDATIONS, title: "First notes on the high E string", level: "foundation", branch: "technique",
  objectives: ["Play E, F and G on the high E string", "Use finger 1 for fret 1 and finger 3 for fret 3", "Read E F G in tab and on the staff"],
  sections: [
    md("Three notes", "On the high E string the open string is **E**, the first fret is **F** and the third fret is **G**. Use your index finger (1) for the first fret and your ring finger (3) for the third. Keep the unused fingers hovering over the strings, ready, rather than flying away."),
    fretboardSection("E, F and G", [{ string: 1, fret: 0 }, { string: 1, fret: 1 }, { string: 1, fret: 3 }], 4),
    ...tab("guitar-e-f-g-ladder", "Up and down E F G", "Play E, F, G and back. Let the notes ring into each other without buzzing.", "1/0 1/1 1/3 1/1 | 1/0 1/1 1/3:2", 60),
    ...tab("guitar-e-f-g-rhythm", "E F G with rests", "The same three notes, now with a rest. Silence counts: stay in time through the rest.", "1/3 1/1 1/0 r | 1/0 1/1 1/3:2 | r:2 1/1 1/0 | 1/0:4", 60),
  ],
  skillRewards: rewards({ note_reading: 10, technique: 10 }),
});

const firstNotesBG = guitarLesson({
  id: "guitar-first-notes-b-g", path: FOUNDATIONS, title: "Notes on the B and G strings", level: "foundation", branch: "technique",
  objectives: ["Play B, C and D on the B string and G and A on the G string", "Move between strings 1, 2 and 3 in time", "Read the same notes on the staff"],
  sections: [
    md("Two more strings", "The open B string is **B**; fret 1 is **C**; fret 3 is **D**. The open G string is **G**; fret 2 is **A**. With the high E string you now have **E F G A B C D**: a full seven-note run, almost a major scale. Press close behind the fret and keep the thumb behind the neck."),
    fretboardSection("Strings 1 to 3", [{ string: 2, fret: 0 }, { string: 2, fret: 1 }, { string: 2, fret: 3 }, { string: 3, fret: 0 }, { string: 3, fret: 2 }], 4),
    ...tab("guitar-b-c-d", "B C D", "Play B, C, D and back down.", "2/0 2/1 2/3 2/1 | 2/0 2/1 2/3:2", 60),
    ...tab("guitar-g-a-b", "G A B", "G and A on the G string, then the open B string.", "3/0 3/2 2/0 3/2 | 3/0:2 2/0:2", 60),
    ...tab("guitar-three-strings", "Across three strings", "A line that climbs from G up to G one string at a time. Watch which string each number sits on.", "3/0 3/2 2/0 2/1 | 2/3 1/0 1/1 1/3", 60),
  ],
  skillRewards: rewards({ note_reading: 10, technique: 10 }),
});

const firstMelodies = guitarLesson({
  id: "guitar-first-melodies", path: FOUNDATIONS, title: "Your first melodies", level: "foundation", branch: "repertoire",
  objectives: ["Play a short melody from tab and staff", "Keep a steady pulse across rests and long notes", "Prepare each fretting finger before the note arrives"],
  sections: [
    md("Two little tunes", "Here are two short melodies written for this course. Read the tab for where to play and the staff for the rhythm. Look one bar ahead and plan which finger you need next. Slow down until every note rings; you can speed up later with the tempo slider."),
    ...tab("guitar-melody-lantern-walk", "Lantern Walk", "Play the tune from the first bar to the last. Quarter notes in pairs, then a held note.", "1/0 1/0 1/3 1/3 | 1/1 1/1 1/0:2 | 2/3 2/3 2/1 2/1 | 2/0:4", 72, { original: true }),
    ...tab("guitar-melody-morning-steps", "Morning Steps", "A tune that climbs across three strings. Keep your fingers close to the fretboard between notes.", "3/0 3/2 2/0 2/1 | 2/3:2 2/1:2 | 3/2 2/0 2/1 2/3 | 1/0:4", 72, { original: true }),
  ],
  skillRewards: rewards({ note_reading: 10, rhythm: 5, technique: 5 }),
});

// ---------------------------------------------------------------- tier 1: chords

const chordsEmAm = guitarLesson({
  id: "guitar-chords-em-am", path: CHORDS, title: "Your first chords: Em and Am", level: "foundation", branch: "technique",
  objectives: ["Fret E minor and A minor cleanly", "Strum all the strings of a chord together", "Read a chord box"],
  sections: [
    md("Reading a chord box", "A chord box shows the neck as you see it when you look down at your guitar: the thick low E string on the left, the thin high E on the right. A **dot** is where a finger goes, with its finger number inside. An **o** above a string means play it open, an **x** means do not play it. Strum from the lowest string you are meant to play down to the thin string."),
    chordDiagramsSection("Em and Am", ["Em", "Am"]),
    card("Why start with these two", "E minor needs only two fingers, on the A and D strings, and every string rings. A minor has the same finger shape moved over one string (plus a finger on the B string). They sound moody and are used in countless songs. If a string buzzes, press closer to the fret wire with the tip of the finger, not the pad."),
    ...strum("guitar-strum-em", "Strum Em", "Strum Em once on every two beats. Let the chord ring and listen for six clear strings.", "Em:2 Em:2 | Em:2 Em:2", 66),
    ...strum("guitar-strum-am", "Strum Am", "Strum Am once on every two beats. Skip the thick low E string and start on the A string.", "Am:2 Am:2 | Am:2 Am:2", 66),
    { type: "quiz", questions: [quiz("guitar-q-chord-x", "What does an x above a string in a chord box mean?", ["Play the string open", "Do not play that string", "Press the first fret"], 1, "x marks a string that should be silent.")] },
  ],
  skillRewards: rewards({ chords: 10, technique: 10 }),
});

const chordsEAD = guitarLesson({
  id: "guitar-chords-e-a-d", path: CHORDS, title: "Chords E, A and D", level: "foundation", branch: "technique",
  objectives: ["Fret E, A and D major", "Hear the difference between a major and a minor chord", "Strum each chord with a steady pulse"],
  sections: [
    md("Three bright chords", "**E**, **A** and **D** are the sunny chords of the open position. E major is E minor plus one finger on the G string; compare the two and listen to how the mood brightens. A major packs three fingers on the D, G and B strings in a row. D major is a small triangle on the top three strings, and you play only the top four strings."),
    chordDiagramsSection("E, A and D", ["E", "A", "D"]),
    ...strum("guitar-strum-e", "Strum E", "Strum E on every two beats. All six strings sound.", "E:2 E:2 | E:2 E:2", 66),
    ...strum("guitar-strum-a", "Strum A", "Strum A from the open A string down: five strings.", "A:2 A:2 | A:2 A:2", 66),
    ...strum("guitar-strum-d", "Strum D", "Strum D from the open D string: four strings. Keep the pick away from the thick strings.", "D:2 D:2 | D:2 D:2", 66),
  ],
  skillRewards: rewards({ chords: 10, technique: 10 }),
});

const firstChanges = guitarLesson({
  id: "guitar-first-changes", path: CHORDS, title: "Your first chord changes", level: "foundation", branch: "technique",
  objectives: ["Change between two chords without stopping the pulse", "Move all fingers together to the next shape", "Use a common finger as an anchor"],
  sections: [
    md("Change early, change together", "A chord change is a small journey: lift all fingers at once, move them as one shape, and land on the beat. Look ahead and start the change just before the new bar. Try it slowly, even one chord every four beats, and speed up only when every string rings. Expect the change to feel clumsy for a week or two; that is normal and it improves fast."),
    card("Shortcuts", "**Em to Am**: the two fingers keep their shape and slide over one string. **A to D**: both shapes live on the D, G and B strings, so the fingers stay close together. **E to A**: slide the same two fingers down one string and lift the third."),
    ...strum("guitar-change-em-am", "Em to Am", "Four beats of each chord. Change on the first beat of the bar.", "Em:4 Am:4 | Em:4 Am:4", 56),
    ...strum("guitar-change-a-d", "A to D", "Switch between A and D every bar.", "A:4 D:4 | A:4 D:4", 56),
    ...strum("guitar-change-e-a", "E to A", "Switch between E and A every bar.", "E:4 A:4 | E:4 A:4", 56),
  ],
  skillRewards: rewards({ chords: 15, timing: 10 }),
});

// ---------------------------------------------------------------- tier 2

const bassNotes = guitarLesson({
  id: "guitar-bass-notes", path: FOUNDATIONS, title: "Notes on the low strings", level: "elementary", branch: "technique",
  objectives: ["Play notes on the E, A and D strings", "Read the low notes in tab and on the staff (written an octave above the sound)", "Use the thick strings for bass lines"],
  sections: [
    md("The bass side", "The three thick strings carry the bass. On the low E string the open note is **E**, fret 1 is **F** and fret 3 is **G**. On the A string: open **A**, fret 2 **B**, fret 3 **C**. On the D string: open **D**, fret 2 **E**, fret 3 **F**. Guitar music is written an octave higher than it sounds; that is why the clef has a small 8 below it."),
    fretboardSection("Low strings", [{ string: 6, fret: 0 }, { string: 6, fret: 1 }, { string: 6, fret: 3 }, { string: 5, fret: 0 }, { string: 5, fret: 2 }, { string: 5, fret: 3 }, { string: 4, fret: 0 }, { string: 4, fret: 2 }, { string: 4, fret: 3 }], 4),
    ...tab("guitar-low-e-string", "Low E string", "E, F and G on the thickest string. Pick a little harder than on the thin strings.", "6/0 6/1 6/3 6/1 | 6/0 6/1 6/3:2", 60, { level: "elementary" }),
    ...tab("guitar-a-string-notes", "A string", "A, B and C on the A string.", "5/0 5/2 5/3 5/2 | 5/0 5/2 5/3:2", 60, { level: "elementary" }),
    ...tab("guitar-d-string-notes", "D string", "D, E and F on the D string.", "4/0 4/2 4/3 4/2 | 4/0 4/2 4/3:2", 60, { level: "elementary" }),
  ],
  skillRewards: rewards({ note_reading: 10, technique: 10 }),
});

const chordsGC = guitarLesson({
  id: "guitar-chords-g-c", path: CHORDS, title: "Chords G and C", level: "elementary", branch: "technique",
  objectives: ["Fret G major and C major", "Change between G and C", "Strum all six strings of G"],
  sections: [
    md("Two bigger shapes", "**G** and **C** use three fingers spread over more strings. G uses a stretch from the low E string to the high E string; C is a staircase on the A, D and B strings. Press with the fingertips so the open strings next to them can ring. These two chords with D and Em play thousands of songs."),
    chordDiagramsSection("G and C", ["G", "C"]),
    ...strum("guitar-strum-g", "Strum G", "Strum G on every two beats. All six strings sound.", "G:2 G:2 | G:2 G:2", 66, { level: "elementary" }),
    ...strum("guitar-strum-c", "Strum C", "Strum C from the A string down; the thick low E is muted.", "C:2 C:2 | C:2 C:2", 66, { level: "elementary" }),
    ...strum("guitar-change-g-c", "G to C", "One bar of each. Lift and place all fingers together.", "G:4 C:4 | G:4 C:4", 60, { level: "elementary" }),
  ],
  skillRewards: rewards({ chords: 15, technique: 10 }),
});

const sevenths = guitarLesson({
  id: "guitar-sevenths-d7-a7", path: CHORDS, title: "Seventh chords: D7 and A7", level: "elementary", branch: "theory",
  objectives: ["Fret D7 and A7", "Hear the extra tension a seventh adds", "Resolve a seventh chord to the chord it leads to"],
  sections: [
    md("A little spice", "A seventh chord adds one more note on top of a triad. The sound is bluesy and unfinished, like a question that wants an answer. **D7** pulls toward **G**, and **A7** pulls toward **D**. D7 is the D chord with the shape flipped; A7 is A with one finger lifted."),
    chordDiagramsSection("D7 and A7", ["D7", "A7"]),
    ...strum("guitar-strum-d7-g", "D7 to G", "Play D7 for a bar and let it resolve to G for the next bar. Listen to the tension release.", "D7:4 G:4 | D7:4 G:4", 60, { level: "elementary" }),
    ...strum("guitar-strum-a7-d", "A7 to D", "A7 then D. The same pull, a step lower.", "A7:4 D:4 | A7:4 D:4", 60, { level: "elementary" }),
    { type: "quiz", questions: [quiz("guitar-q-seventh", "A seventh chord adds...", ["One more note to a triad", "A capo", "Two more strings"], 0, "A seventh chord is a triad plus the seventh note, which gives the tense colour.")] },
  ],
  skillRewards: rewards({ chords: 15, theory: 10 }),
});

const oneFourFive = guitarLesson({
  id: "guitar-one-four-five", path: CHORDS, title: "Three chords, one song: I, IV and V", level: "elementary", branch: "theory",
  objectives: ["Name the I, IV and V chords in G, D and C", "Play a four-bar progression of three chords", "Hear how I, IV and V relate"],
  sections: [
    md("The three-chord trick", "Pick a key; its **I** chord is the home chord, the **IV** chord is the chord on the fourth note of the scale, and the **V** chord is the one on the fifth. A huge amount of folk, blues and rock is just these three chords in different orders. In **G** they are **G, C, D**. In **D** they are **D, G, A**. In **C** they are **C, F, G**; the full F chord needs a barre, so for now we use the easy **Fmaj7** in its place."),
    chordDiagramsSection("Chords for three keys", ["G", "C", "D", "A", "Fmaj7"]),
    ...strum("guitar-progression-g", "I-IV-V-I in G", "Play G, C, D and back to G, one bar each.", "G:4 C:4 | D:4 G:4", 60, { level: "elementary" }),
    ...strum("guitar-progression-d", "I-IV-V-I in D", "Play D, G, A and back to D.", "D:4 G:4 | A:4 D:4", 60, { level: "elementary" }),
    ...strum("guitar-progression-c", "I-IV-V-I in C", "Play C, Fmaj7, G and back to C.", "C:4 Fmaj7:4 | G:4 C:4", 60, { level: "elementary" }),
  ],
  skillRewards: rewards({ chords: 15, theory: 10, timing: 5 }),
});

const strumPatterns = guitarLesson({
  id: "guitar-strum-patterns", path: CHORDS, title: "Strumming patterns", level: "elementary", branch: "technique",
  objectives: ["Strum a steady down on every beat", "Add up-strums between the beats without losing the pulse", "Change chords on the bar line while strumming"],
  sections: [
    md("Down on the beat", "A strumming pattern is a picture of your strumming hand's motion. The motion never stops: **down** on the numbers, **up** on the *ands*. Some of those strokes touch the strings and some just miss; the arm keeps swinging either way. Start with a down on every beat, then add the up-strokes between. The app grades the downstrokes on the beat; the up-strokes in between are yours to add for feel."),
    card("Pattern 1 and 2", "Pattern 1: **D D D D** (down on every beat). Pattern 2: **D  D U  U D U** (the classic folk strum). Counting: 1 2 & & 4 &. Start slowly: the same chord for four bars, then change on bar lines."),
    ...strum("guitar-pattern-down-beats", "Down on every beat", "A downstroke on each of the four beats, changing from G to C in the next bar.", "G:1 G:1 G:1 G:1 | C:1 C:1 C:1 C:1", 72, { level: "elementary" }),
    ...strum("guitar-pattern-two-bar", "Four beats, then change", "Same strum, now three chords. Make the change on the first beat of each bar without a gap.", "Am:1 Am:1 Am:1 Am:1 | G:1 G:1 G:1 G:1 | C:1 C:1 C:1 C:1", 72, { level: "elementary" }),
    ...strum("guitar-pattern-long-short", "Long and short", "A long first strum, then two short ones. Think: one-two, three, four.", "Em:2 Em:1 Em:1 | D:2 D:1 D:1", 72, { level: "elementary" }),
  ],
  skillRewards: rewards({ rhythm: 15, chords: 10, timing: 10 }),
});

const alternatingBass = guitarLesson({
  id: "guitar-alternating-bass", path: CHORDS, title: "Alternating bass and strum", level: "elementary", branch: "technique",
  objectives: ["Play the root and the fifth of a chord as bass notes", "Alternate bass note and strum, the country pattern", "Keep your hand steady between a single note and a strum"],
  sections: [
    md("Boom-chick", "Instead of strumming the whole chord every time, pluck the chord's **bass note** on beats 1 and 3 and **strum** on beats 2 and 4. The bass note is the root (the chord's name note) on beat 1 and the fifth on beat 3. For **Am** the root is the open A string and the fifth is the E on the D string, second fret. For **Em** the root is the low E and the fifth is the B on the A string, second fret. This sounds like a small band: bass, chord, bass, chord."),
    fretboardSection("Bass notes for Am and Em", [{ string: 5, fret: 0 }, { string: 4, fret: 2 }, { string: 6, fret: 0 }, { string: 5, fret: 2 }], 4),
    ...tab("guitar-bass-root-fifth", "Root and fifth", "Play only the bass notes first: A, E, A, E, then E, B, E, B.", "5/0 4/2 5/0 4/2 | 6/0 5/2 6/0 5/2", 60, { level: "elementary" }),
    ...strum("guitar-strum-on-two-four", "Strums on beats 2 and 4", "Now only the strums, on beats 2 and 4. Rest on 1 and 3 and think of the bass note in your head.", "r:1 Am:1 r:1 Am:1 | r:1 Em:1 r:1 Em:1", 60, { level: "elementary" }),
  ],
  skillRewards: rewards({ technique: 15, rhythm: 10, chords: 10 }),
});

const foundations: Lesson[] = [meetYourGuitar, tuningUp, readingTab, openStringRhythm, firstNotesHighE, firstNotesBG, firstMelodies, bassNotes];
const chords: Lesson[] = [chordsEmAm, chordsEAD, firstChanges, chordsGC, sevenths, oneFourFive, strumPatterns, alternatingBass];

export const guitarFoundationsLessons = foundations;
export const guitarChordsLessons = chords;
export const guitarExercises: MidiExercise[] = exercises;
