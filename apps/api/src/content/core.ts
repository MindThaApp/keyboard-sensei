import type { Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { quiz, midiSection, note, ex, intermediateEx, rewards, lesson } from "./helpers.js";

export const coreExercises: MidiExercise[] = [
  {...ex("exercise-01",[note("c3",48,0,1,"left"),note("c4",60,1),note("c5",72,2)]), scoring: "untimed" as const},
  ex("exercise-05",[60,62,64,65,67].map((n,i)=>note(`rh-${i}`,n,i,1,"right",i+1))),
  ex("exercise-06",[48,47,45,43,41].map((n,i)=>note(`lh-${i}`,n,i,1,"left",i+1,"", "bass")).map(n=>({...n,chordGroupId:null}))),
  ex("exercise-07",[note("l-c",48,0,1,"left",5,null,"bass"),note("r-c",60,1,1,"right",1),note("l-g",43,2,1,"left",5,null,"bass"),note("r-g",67,3,1,"right",5)]),
  ex("exercise-08",[60,62,64,65,67,65,64,62,60].map((n,i)=>note(`pattern-${i}`,n,i,1,"right",[1,2,3,4,5,4,3,2,1][i]!))),
  ex("exercise-09",[note("third-c",60,0,2,"right",1,"third","chord"),note("third-e",64,0,2,"right",3,"third","chord"),note("fifth-c",60,3,2,"left",5,"fifth","chord"),note("fifth-g",67,3,2,"right",5,"fifth","chord")],true),
  ex("exercise-10",[note("cmaj-c",60,0,2,"right",1,"c-major","chord"),note("cmaj-e",64,0,2,"right",3,"c-major","chord"),note("cmaj-g",67,0,2,"right",5,"c-major","chord"),note("amin-a",57,3,2,"left",5,"a-minor","chord"),note("amin-c",60,3,2,"right",1,"a-minor","chord"),note("amin-e",64,3,2,"right",3,"a-minor","chord")],true),
  ex("exercise-11",[note("sr1",60,0),note("sr2",62,1),note("sr3",64,2,2),note("sr4",62,4),note("sr5",60,5,2)],true),
  ex("exercise-12",[note("a1",60,0),note("a2",62,1),note("int-c",60,2,2,"left",5,"assessment-interval","chord"),note("int-e",64,2,2,"right",3,"assessment-interval","chord"),note("a3",67,5),note("triad-c",60,6,2,"left",5,"assessment-triad","chord"),note("triad-e",64,6,2,"right",3,"assessment-triad","chord"),note("triad-g",67,6,2,"right",5,"assessment-triad","chord")],true),
  intermediateEx("exercise-13",[60,61,62,63,64,65,66,67,68,69,70,71,72].map((pitch,i)=>note(`chromatic-${i}`,pitch,i*0.5,0.5,"right",[1,3,1,3,1,2,3,1,3,1,3,1,2][i]!)),60),
  intermediateEx("exercise-14",[67,69,71,72,74,76,78,79,62,64,66,67,69,71,73,74].map((pitch,i)=>note(`major-${i}`,pitch,i<8?i:i+1,1,"right",null)),72),
  intermediateEx("exercise-15",[67,69,71,72,74,76,78,79,74,76,78,79,81,83,85,86].map((pitch,i)=>note(`fifths-${i}`,pitch,i<8?i:i+1,1,"right",null)),76),
  intermediateEx("exercise-16",[64,66,67,69,71,72,74,76,62,64,65,67,69,70,72,74].map((pitch,i)=>note(`minor-${i}`,pitch,i<8?i:i+1,1,"right",null)),72),
  intermediateEx("exercise-17",[note("g7-g",55,0,3,"left",5,"g7","chord"),note("g7-b",59,0,3,"right",1,"g7","chord"),note("g7-d",62,0,3,"right",3,"g7","chord"),note("g7-f",65,0,3,"right",5,"g7","chord"),note("resolve-c",60,4,3,"left",5,"c-resolution","chord"),note("resolve-e",64,4,3,"right",1,"c-resolution","chord"),note("resolve-g",67,4,3,"right",3,"c-resolution","chord")],66),
  intermediateEx("exercise-18",[note("c1-e",64,0,2,"right",1,"c-first","chord"),note("c1-g",67,0,2,"right",3,"c-first","chord"),note("c1-c",72,0,2,"right",5,"c-first","chord"),note("c2-g",67,3,2,"right",1,"c-second","chord"),note("c2-c",72,3,2,"right",3,"c-second","chord"),note("c2-e",76,3,2,"right",5,"c-second","chord")],66),
  intermediateEx("exercise-19",[note("sync-c",60,0,1.5,"right",1),note("sync-d",62,1.5,0.5,"right",2),note("sync-e",64,2,1,"right",3),note("sync-g",67,3,1.5,"right",5),note("sync-e2",64,4.5,0.5,"right",3),note("sync-d2",62,5,1,"right",2),note("sync-c2",60,6,2,"right",1)],64),
  intermediateEx("exercise-20",[48,50,52,53,55].flatMap((leftPitch,i)=>[note(`contrary-l-${i}`,leftPitch,i,1,"left",[5,4,3,2,1][i]!,`contrary-${i}`,"bass"),note(`contrary-r-${i}`,[72,71,69,67,65][i]!,i,1,"right",[5,4,3,2,1][i]!,`contrary-${i}`,"melody")]),60),
  intermediateEx("exercise-21",[note("pedal-c",60,0,2,"right",1,"pedal-c","chord"),note("pedal-e",64,0,2,"right",3,"pedal-c","chord"),note("pedal-g",67,0,2,"right",5,"pedal-c","chord"),note("pedal-f",65,3,2,"right",1,"pedal-f","chord"),note("pedal-a",69,3,2,"right",3,"pedal-f","chord"),note("pedal-c2",72,3,2,"right",5,"pedal-f","chord"),note("pedal-g-root",67,6,2,"right",1,"pedal-g","chord"),note("pedal-b",71,6,2,"right",3,"pedal-g","chord"),note("pedal-d",74,6,2,"right",5,"pedal-g","chord")],60),
  intermediateEx("exercise-22",[note("arp-c-chord-c",60,0,1,"right",1,"arp-c-chord","chord"),note("arp-c-chord-e",64,0,1,"right",2,"arp-c-chord","chord"),note("arp-c-chord-g",67,0,1,"right",3,"arp-c-chord","chord"),...[60,64,67,72,67,64,60].map((pitch,i)=>note(`arp-c-${i}`,pitch,2+i*0.5,0.5,"right",null)),note("arp-g-chord-g",67,7,1,"right",1,"arp-g-chord","chord"),note("arp-g-chord-b",71,7,1,"right",2,"arp-g-chord","chord"),note("arp-g-chord-d",74,7,1,"right",3,"arp-g-chord","chord"),...[67,71,74,79,74,71,67].map((pitch,i)=>note(`arp-g-${i}`,pitch,9+i*0.5,0.5,"right",null))],66),
  intermediateEx("exercise-23",[60,62,64,67,65,64,62,64,65,69,67,64,62,59,60].map((pitch,i)=>note(`sight-${i}`,pitch,[0,1,2,3,4.5,5,6,7,8,9,10.5,11,12,13,14][i]!,[1,1,1,1.5,0.5,1,1,1,1,1.5,0.5,1,1,1,2][i]!)),72),
  intermediateEx("exercise-24",[62,64,66,67,69,71,73,74].map((pitch,i)=>note(`assess-scale-${i}`,pitch,i,1,"right",null)).concat([note("assess-g7-g",55,9,2,"left",5,"assess-g7","chord"),note("assess-g7-b",59,9,2,"right",1,"assess-g7","chord"),note("assess-g7-d",62,9,2,"right",3,"assess-g7","chord"),note("assess-g7-f",65,9,2,"right",5,"assess-g7","chord"),note("assess-inv-e",64,12,1.5,"right",1,"assess-inversion","chord"),note("assess-inv-g",67,12,1.5,"right",3,"assess-inversion","chord"),note("assess-inv-c",72,12,1.5,"right",5,"assess-inversion","chord"),note("assess-rhythm-d",62,14,1.5,"right",2),note("assess-rhythm-c",60,15.5,0.5,"right",1)]),64)
];

export const coreLessons: Lesson[] = [
  lesson("lesson-01",1,"Finding notes on the keyboard","theory",[
    {type:"theory-card",title:"The repeating keyboard map",body:"The keyboard repeats in groups of twelve notes. Find each C immediately to the left of a group of two black keys. Moving to the next C changes the octave but keeps the note name."},
    midiSection("exercise-01","Find three Cs","Play C3, C4, and C5 in order. Use the two-black-key pattern rather than counting every key.")
  ],rewards({keyboard_layout:2,note_reading:1})),
  lesson("lesson-02",2,"Finger numbers and hand position","technique",[
    {type:"theory-card",title:"Five fingers, five numbers",body:"Both hands number the thumb 1 and the little finger 5. Keep curved fingers, a relaxed wrist, and the knuckles gently raised. Press with the finger pad without collapsing the last joint."},
    {type:"quiz",questions:[quiz("q2-1","Which number names the thumb in either hand?",["1","2","5","It changes by hand"],0,"The thumb is finger 1 in both hands."),quiz("q2-2","Which position supports controlled playing?",["Locked wrist and flat fingers","Relaxed wrist and curved fingers","Raised shoulders","Straight, rigid elbows"],1,"A relaxed wrist and naturally curved fingers allow controlled movement.")]}
  ],rewards({technique:2,theory:1})),
  lesson("lesson-03",3,"Middle C and the grand staff","theory",[
    {type:"notation",title:"Middle C between the staves",vexflowData:{grandStaff:true,treble:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"w"}]},bass:{clef:"bass",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"w"}]}}},
    {type:"quiz",questions:[quiz("q3-1","Where is middle C written on the grand staff?",["Top line of treble clef","On a ledger line between the staves","Bottom line of bass clef","Only in treble clef"],1,"Middle C uses a ledger line centered between the two staves.")]}
  ],rewards({note_reading:2,theory:1})),
  lesson("lesson-04",4,"Rhythm: quarter, half, whole notes","theory",[
    {type:"markdown",title:"Counting note values",body:"In 4/4 time, a quarter note lasts one beat, a half note lasts two beats, and a whole note fills all four beats. Count a steady **1 2 3 4**; note values describe how long sound continues, not how hard a key is pressed."},
    {type:"quiz",questions:[quiz("q4-1","How many beats does a half note receive in 4/4?",["One","Two","Three","Four"],1,"A half note lasts two quarter-note beats."),quiz("q4-2","Which note fills one 4/4 measure?",["Quarter note","Half note","Whole note","Eighth note"],2,"A whole note lasts four beats in 4/4.")]}
  ],rewards({rhythm:3,timing:1})),
  lesson("lesson-05",5,"Treble clef C-D-E-F-G","repertoire",[
    {type:"notation",title:"Right-hand five-note ascent",vexflowData:{clef:"treble",timeSignature:"5/4",notes:["c/4","d/4","e/4","f/4","g/4"].map(keys=>({keys:[keys],duration:"q"}))}},
    midiSection("exercise-05","C to G","Play C4-D4-E4-F4-G4 with right-hand fingers 1-2-3-4-5, keeping one steady beat per note.")
  ],rewards({note_reading:2,technique:2,timing:1})),
  lesson("lesson-06",6,"Bass clef C-B-A-G-F","repertoire",[
    {type:"notation",title:"Left-hand descent",vexflowData:{clef:"bass",timeSignature:"5/4",notes:["c/3","b/2","a/2","g/2","f/2"].map(keys=>({keys:[keys],duration:"q"}))}},
    midiSection("exercise-06","Bass C down to F","Play C3-B2-A2-G2-F2 with the left hand, listening for an even descent.")
  ],rewards({note_reading:2,technique:2,timing:1})),
  lesson("lesson-07",7,"Playing with both hands","technique",[
    midiSection("exercise-07","Alternating hands","Play left C3, right C4, left G2, then right G4. These notes alternate; do not play them as chords.")
  ],rewards({technique:3,timing:2})),
  lesson("lesson-08",8,"C major five-finger pattern","technique",[
    midiSection("exercise-08","Up and down in C","With the right hand, play C4-D4-E4-F4-G4 and return to C4. Use fingers 1-2-3-4-5-4-3-2-1 without tucking the thumb.")
  ],rewards({technique:3,timing:2})),
  lesson("lesson-09",9,"Intervals: steps, skips, thirds, fifths","theory",[
    {type:"theory-card",title:"Measuring between notes",body:"An interval counts both its starting and ending note. C to D is a second or step; C to E is a third or skip; C to G is a fifth. When two interval notes are stacked, play them together."},
    {type:"quiz",questions:[quiz("q9-1","What interval is C to E?",["Second","Third","Fourth","Fifth"],1,"Count C-D-E: three letter names make a third.")]},
    midiSection("exercise-09","Third and fifth","Play C4 and E4 together, then C4 and G4 together. Make each pair sound as one attack.")
  ],rewards({theory:2,chords:2,timing:1})),
  lesson("lesson-10",10,"Major and minor triads","theory",[
    {type:"theory-card",title:"Two contrasting triads",body:"A triad combines a root, third, and fifth. C major uses C-E-G and has a major third above its root. A minor uses A-C-E and has a minor third above its root. Play all three tones together and balance their volume."},
    midiSection("exercise-10","C major and A minor","Play C4-E4-G4 together, then A3-C4-E4 together. Hold each triad for two beats.")
  ],rewards({theory:2,chords:3,timing:1})),
  lesson("lesson-11",11,"First sight-reading drill","repertoire",[
    {type:"notation",title:"Original five-note reading study",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"q"},{keys:["d/4"],duration:"q"},{keys:["e/4"],duration:"h"},{keys:["d/4"],duration:"q"},{keys:["c/4"],duration:"h"}],original:true}},
    midiSection("exercise-11","Read before playing","Look for direction and repeated notes first. Then play C4-D4-E4-D4-C4 without stopping; hold E4 and the final C4 for two beats.")
  ],rewards({sight_reading:3,note_reading:2,rhythm:1})),
  lesson("lesson-12",12,"First MIDI accuracy assessment","technique",[
    midiSection("exercise-12","Foundation assessment","Play the single notes C4 and D4, the C4-E4 third, G4, and finally the C-major triad. Keep the pulse steady and chord tones simultaneous.")
  ],rewards({note_reading:2,rhythm:2,technique:2,chords:2,timing:2})),
  lesson("lesson-13",13,"Sharps, flats, and the chromatic scale","theory",[
    {type:"markdown",title:"Twelve equal steps",body:"A **sharp (♯)** raises a note by one semitone; a **flat (♭)** lowers it by one semitone. On the keyboard, a semitone is the nearest key in either direction, whether black or white. That is why E–F and B–C are semitones even though no black key lies between them. Enharmonic names describe the same key in different contexts: C♯ and D♭ sound at the same pitch on the piano."},
    {type:"notation",title:"C chromatic scale ascending",vexflowData:{clef:"treble",timeSignature:"4/4",notes:["c/4","c#/4","d/4","d#/4","e/4","f/4","f#/4","g/4","g#/4","a/4","a#/4","b/4","c/5"].map(keys=>({keys:[keys],duration:"8"}))}},
    {type:"quiz",questions:[quiz("q13-1","What does a flat do to a written note?",["Raises it one semitone","Lowers it one semitone","Lowers it one whole tone","Makes it shorter"],1,"A flat lowers its note by the distance to the nearest key: one semitone."),quiz("q13-2","Which pair is enharmonic on the piano?",["C♯ and D♭","C and D","E and F♯","B♭ and B"],0,"C-sharp and D-flat name the same piano key in different musical contexts.")]},
    midiSection("exercise-13","Ascending C chromatic scale","Play every key from C4 to C5 in order as even eighth notes. Use 1-3 on each two-key white/black unit, adjusting at E-F and B-C as shown.")
  ],rewards({keyboard_layout:2,note_reading:2,theory:3,technique:1}),18),
  lesson("lesson-14",14,"G major and D major scales","technique",[
    {type:"theory-card",title:"Major scales with sharps",body:"G major needs F♯ so its semitone pattern remains whole–whole–half–whole–whole–whole–half: G-A-B-C-D-E-F♯-G. D major adds C♯: D-E-F♯-G-A-B-C♯-D. For the right hand ascending, use 1-2-3, tuck the thumb under to 1, then 2-3-4-5. Keep the wrist level while the thumb travels."},
    {type:"notation",title:"G major and D major",vexflowData:{clef:"treble",timeSignature:"4/4",notes:["g/4","a/4","b/4","c/5","d/5","e/5","f#/5","g/5","d/4","e/4","f#/4","g/4","a/4","b/4","c#/5","d/5"].map(keys=>({keys:[keys],duration:"8"}))}},
    {type:"quiz",questions:[quiz("q14-1","Which sharps belong to D major?",["F♯ only","F♯ and C♯","C♯ and G♯","B♭ and E♭"],1,"D major has two sharps: F-sharp and C-sharp.")]},
    midiSection("exercise-14","One octave in G and D","Play G4–G5, pause one beat, then D4–D5. Use the correct sharps and an even pulse.")
  ],rewards({technique:3,theory:2,keyboard_layout:1,timing:2}),20),
  lesson("lesson-15",15,"Circle of fifths: the sharp-key side","theory",[
    {type:"markdown",title:"Moving clockwise by fifths",body:"Starting at C, each clockwise step rises a perfect fifth and adds one sharp: **C → G → D → A → E**. New sharps appear in a fixed order: **F♯, C♯, G♯, D♯**. A useful rule is that the newest sharp lies one semitone below the major key-note: D major's newest sharp is C♯. This lesson stays on the first four sharp keys; flat keys come later."},
    {type:"quiz",questions:[quiz("q15-1","Which key follows D major clockwise on the circle of fifths?",["F major","A major","B♭ major","E minor"],1,"A is a perfect fifth above D, so A major follows D major."),quiz("q15-2","What is the order of the first three sharps?",["C♯, F♯, G♯","F♯, C♯, G♯","F♯, G♯, C♯","G♯, D♯, A♯"],1,"Sharp key signatures add F-sharp, then C-sharp, then G-sharp.")]},
    midiSection("exercise-15","Hear the fifths connection","Play the G-major scale, pause, then the D-major scale. Notice that D is the fifth degree of G and that D major adds C♯.")
  ],rewards({theory:4,keyboard_layout:1,note_reading:1}),17),
  lesson("lesson-16",16,"Natural minor scales: E minor and D minor","theory",[
    {type:"theory-card",title:"Natural minor beyond A",body:"The natural-minor pattern is whole–half–whole–whole–half–whole–whole. E natural minor uses E-F♯-G-A-B-C-D-E and shares G major's one-sharp key signature. D natural minor uses D-E-F-G-A-B♭-C-D and introduces B♭. Keep the seventh degree unraised here; raised sevenths belong to harmonic minor."},
    {type:"notation",title:"E natural minor and D natural minor",vexflowData:{clef:"treble",timeSignature:"4/4",notes:["e/4","f#/4","g/4","a/4","b/4","c/5","d/5","e/5","d/4","e/4","f/4","g/4","a/4","bb/4","c/5","d/5"].map(keys=>({keys:[keys],duration:"8"}))}},
    {type:"quiz",questions:[quiz("q16-1","Which altered note appears in E natural minor?",["C♯","F♯","G♯","B♭"],1,"E natural minor shares one sharp, F-sharp, with its relative major G."),quiz("q16-2","Which note is flat in D natural minor?",["E♭","A♭","B♭","D♭"],2,"D natural minor contains B-flat.")]},
    midiSection("exercise-16","Two natural-minor scales","Play E4–E5, pause, then D4–D5. Listen for the darker minor third from E to G and D to F.")
  ],rewards({theory:3,note_reading:2,technique:2,timing:1}),20),
  lesson("lesson-17",17,"The dominant seventh chord","theory",[
    {type:"markdown",title:"Tension that points home",body:"A dominant seventh chord adds a minor seventh above the dominant triad. In C major, scale degree 5 is G, so **G7 = G-B-D-F**. The B and F form a tense tritone: B tends upward to C while F tends downward to E. Resolve G7 to C major and listen for instability becoming rest."},
    {type:"notation",title:"G7 resolving to C",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["g/3","b/3","d/4","f/4"],duration:"h"},{keys:["c/4","e/4","g/4"],duration:"h"}]}},
    {type:"quiz",questions:[quiz("q17-1","Which notes spell G7?",["G-B-D-F","G-B-D-F♯","G-B♭-D-F","C-E-G-B"],0,"G7 combines the G-major triad G-B-D with the minor seventh F."),quiz("q17-2","Where does the F in G7 normally resolve in C major?",["Up to G","Down to E","Down to C","It must stay on F"],1,"F commonly resolves down by semitone to E.")]},
    midiSection("exercise-17","G7 to C major","Play G3-B3-D4-F4 together, then resolve to C4-E4-G4. Make each chord a single coordinated attack.")
  ],rewards({chords:4,theory:3,timing:2}),20),
  lesson("lesson-18",18,"First and second inversions of triads","theory",[
    {type:"theory-card",title:"The bass note names the position",body:"A root-position C-major triad is C-E-G. Move C above the chord and E becomes the lowest note: **E-G-C**, first inversion. Move E above and G becomes lowest: **G-C-E**, second inversion. The chord remains C major because its pitch classes are still C, E, and G; inversion changes spacing, bass, and sound."},
    {type:"notation",title:"C major in two inversions",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["e/4","g/4","c/5"],duration:"h"},{keys:["g/4","c/5","e/5"],duration:"h"}]}},
    {type:"quiz",questions:[quiz("q18-1","Which spelling is C major in first inversion?",["C-E-G","E-G-C","G-C-E","E-G-B"],1,"First inversion places the third, E, in the bass."),quiz("q18-2","What is the lowest note of a second-inversion C-major triad?",["C","D","E","G"],3,"Second inversion places the fifth, G, in the bass.")]},
    midiSection("exercise-18","C-major inversions","Play E4-G4-C5 together, then G4-C5-E5 together. Use 1-3-5 and release cleanly between positions.")
  ],rewards({chords:4,theory:3,technique:1,timing:1}),18),
  lesson("lesson-19",19,"Syncopation and dotted rhythms","theory",[
    {type:"markdown",title:"Notes across the usual accents",body:"A dot adds half of a note's original value, so a dotted quarter lasts one and a half beats. Count eighth-note subdivisions aloud: **1-and-2-and-3-and-4-and**. Syncopation emphasizes a weak subdivision or sustains a sound across a strong beat. Keep the underlying pulse steady; the accent moves, not the beat."},
    {type:"notation",title:"Dotted and off-beat rhythm",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"qd"},{keys:["d/4"],duration:"8"},{keys:["e/4"],duration:"q"},{keys:["g/4"],duration:"qd"},{keys:["e/4"],duration:"8"},{keys:["d/4"],duration:"q"},{keys:["c/4"],duration:"h"}]}},
    {type:"quiz",questions:[quiz("q19-1","How long is a dotted quarter note?",["Half a beat","One beat","One and a half beats","Three beats"],2,"The dot adds half of the quarter note's one-beat value."),quiz("q19-2","What should remain steady during syncopation?",["The underlying pulse","Every note length","Only the loud notes","The hand position"],0,"Syncopation shifts emphasis while the pulse continues steadily.")]},
    midiSection("exercise-19","Count the off-beats","Count eighth-note subdivisions and play the written pattern. Hold each dotted quarter through its following 'and' before the short eighth note.")
  ],rewards({rhythm:4,timing:3,note_reading:1}),20),
  lesson("lesson-20",20,"Two-hand independence in contrary motion","technique",[
    {type:"theory-card",title:"Different directions, one pulse",body:"In contrary motion the hands travel in opposite physical directions at the same time. Start with the left hand on C3 and right hand on C5. As the left ascends C-D-E-F-G, the right descends C-B-A-G-F. Prepare both notes before each beat, keep both wrists relaxed, and listen for exactly two simultaneous attacks."},
    {type:"notation",title:"Contrary-motion five-note study",vexflowData:{grandStaff:true,treble:{clef:"treble",timeSignature:"5/4",notes:["c/5","b/4","a/4","g/4","f/4"].map(keys=>({keys:[keys],duration:"q"}))},bass:{clef:"bass",timeSignature:"5/4",notes:["c/3","d/3","e/3","f/3","g/3"].map(keys=>({keys:[keys],duration:"q"}))}}},
    midiSection("exercise-20","Opposite directions together","Play both hands together for five beats: left C3-D3-E3-F3-G3 while right C5-B4-A4-G4-F4. Slow down rather than letting one hand lead.")
  ],rewards({technique:4,timing:3,note_reading:1}),20),
  lesson("lesson-21",21,"Sustain pedal basics","technique",[
    {type:"markdown",title:"Clear changes with the damper pedal",body:"The right pedal lifts the dampers so notes continue after the keys are released. Sit so the heel rests on the floor and the ball of the foot controls the pedal. For legato harmony, play the new chord first, then quickly release and depress the pedal: **keys, lift, press**. This delayed change prevents gaps without mixing two harmonies. The exercise scores hand playing only; listen and manage the pedal yourself because pedal input is not captured."},
    {type:"quiz",questions:[quiz("q21-1","For a clean delayed pedal change, what happens first?",["Lift the pedal before playing","Play the new harmony","Press the pedal harder","Release every key early"],1,"Play the new chord first, then clear and reapply the pedal immediately."),quiz("q21-2","What usually causes blurred harmony?",["Changing the pedal just after the new chord","Keeping the heel supported","Holding the pedal through a harmony change","Using curved fingers"],2,"An unchanged pedal lets the old and new harmonies ring together.")]},
    midiSection("exercise-21","Chord changes with optional pedal","Play C major, F major, and G major with balanced 1-3-5 fingers. If you have a pedal, change it just after each new chord; scoring evaluates only the notes and timing.")
  ],rewards({technique:4,chords:2,timing:2}),17),
  lesson("lesson-22",22,"One-octave C-major and G-major arpeggios","technique",[
    {type:"theory-card",title:"A chord unfolded",body:"An arpeggio plays chord tones one after another. Ascending and descending C major is C-E-G-C-G-E-C; G major is G-B-D-G-D-B-G. Keep the line connected by shifting the hand smoothly rather than stretching rigidly. In the right hand, use 1-2-3-5 ascending, then 5-3-2-1 descending."},
    {type:"notation",title:"C and G major arpeggios",vexflowData:{clef:"treble",timeSignature:"4/4",notes:["c/4","e/4","g/4","c/5","g/4","e/4","c/4","g/4","b/4","d/5","g/5","d/5","b/4","g/4"].map(keys=>({keys:[keys],duration:"8"}))}},
    {type:"quiz",questions:[quiz("q22-1","Which pitches form a C-major arpeggio?",["C-D-E","C-E-G","C-F-G","C-E-A"],1,"An arpeggio unfolds the triad tones C, E, and G."),quiz("q22-2","Which notes form G major?",["G-B-D","G-B♭-D","G-C-D","G-A-D"],0,"G-B-D is the G-major triad.")]},
    midiSection("exercise-22","Blocked, then broken triads","Play C4-E4-G4 together, then unfold C4-E4-G4-C5-G4-E4-C4. Repeat the pattern with G4-B4-D5 together, then G4-B4-D5-G5-D5-B4-G4. The blocked chords establish each harmony; every arpeggio tone then has its own attack.")
  ],rewards({technique:4,chords:3,timing:2}),20),
  lesson("lesson-23",23,"Sight-reading drill 2","repertoire",[
    {type:"markdown",title:"Scan before you begin",body:"Before playing, identify the 4/4 meter, starting note C4, highest note A4, and the dotted-quarter/eighth pairs. Read by contour and interval: most notes move by step, with occasional skips. Choose a tempo that lets you continue without restarting."},
    {type:"notation",title:"Original intermediate reading study",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"q"},{keys:["d/4"],duration:"q"},{keys:["e/4"],duration:"q"},{keys:["g/4"],duration:"qd"},{keys:["f/4"],duration:"8"},{keys:["e/4"],duration:"q"},{keys:["d/4"],duration:"q"},{keys:["e/4"],duration:"q"},{keys:["f/4"],duration:"q"},{keys:["a/4"],duration:"qd"},{keys:["g/4"],duration:"8"},{keys:["e/4"],duration:"q"},{keys:["d/4"],duration:"q"},{keys:["b/3"],duration:"q"},{keys:["c/4"],duration:"h"}],original:true}},
    midiSection("exercise-23","Read the whole phrase","Preview silently, then play from C4 through the final C4 without stopping. Preserve the dotted rhythms and let the melody's stepwise direction guide you.")
  ],rewards({sight_reading:4,note_reading:3,rhythm:2,timing:2}),22),
  lesson("lesson-24",24,"Intermediate technique assessment","technique",[
    {type:"markdown",title:"Four-part checkpoint",body:"This assessment combines the batch's core work. First play one octave of D major with F♯ and C♯. After a one-beat pause, play G7 as one coordinated chord. Then play C major in first inversion, E-G-C. Finish with a dotted-quarter D followed by an eighth-note C. Scan each part before beginning and keep one pulse throughout."},
    {type:"quiz",questions:[quiz("q24-1","Which sequence correctly summarizes the assessment?",["C chromatic, A minor, root-position C, whole note","D major, G7, first-inversion C, dotted rhythm","G major, D7, second-inversion C, triplets","D minor, G major, root-position C, syncopated rests"],1,"The checkpoint combines D major, G7, first-inversion C major, and a dotted rhythm.")]},
    midiSection("exercise-24","Intermediate checkpoint","Play D4-E4-F♯4-G4-A4-B4-C♯5-D5, pause, play G3-B3-D4-F4 together, then E4-G4-C5 together, and finish with dotted-quarter D4 and eighth-note C4.")
  ],rewards({note_reading:3,rhythm:3,technique:3,theory:2,chords:3,timing:3}),25)
];
