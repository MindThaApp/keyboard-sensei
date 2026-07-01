import type { ExpectedNoteEvent, Lesson, LessonSection, MidiExercise, QuizQuestion } from "@keyboard-sensei/shared-types";
import { BEGINNER_CONFIG, ELEMENTARY_CONFIG } from "@keyboard-sensei/midi-engine";

const quiz = (id:string,prompt:string,options:string[],correctIndex:number,explanation:string): QuizQuestion => ({id,prompt,options,correctIndex,explanation});
const midiSection = (exerciseId:string,title:string,instructions:string): LessonSection => ({type:"midi-exercise",exerciseId,title,instructions});
const note = (id:string,pitch:number,startBeat:number,durationBeats=1,hand:"left"|"right"|"both"="right",finger:number|null=null,chordGroupId:string|null=null,voice:ExpectedNoteEvent["voice"]="melody"): ExpectedNoteEvent => ({id,note:pitch,startBeat,durationBeats,hand,finger,chordGroupId,voice});
const ex = (exerciseId:string,expected:ExpectedNoteEvent[],elementary=false): MidiExercise => ({exerciseId,tempoBpm:80,difficulty:"beginner",...(elementary?ELEMENTARY_CONFIG:BEGINNER_CONFIG),expected});
const rewards = (values:Partial<Record<"note_reading"|"rhythm"|"technique"|"theory"|"keyboard_layout"|"sight_reading"|"chords"|"timing",number>>) => values as Record<string,number>;
const lesson = (n:number,title:string,branch:Lesson["branch"],sections:LessonSection[],skillRewards:Record<string,number>):Lesson => ({id:`lesson-${String(n).padStart(2,"0")}`,path:"classical-technical",level:n<=6?"foundation":"elementary",branch,title,estimatedMinutes:n<5?8:12,objectives:[`Understand ${title.toLowerCase()}`,"Apply the concept accurately at the keyboard"],sections,unlockCriteria:{requiresLessonIds:n===1?[]:[`lesson-${String(n-1).padStart(2,"0")}`],minScore:70},skillRewards});

export const exercises: MidiExercise[] = [
  ex("exercise-01",[note("c3",48,0,1,"left"),note("c4",60,1),note("c5",72,2)]),
  ex("exercise-05",[60,62,64,65,67].map((n,i)=>note(`rh-${i}`,n,i,1,"right",i+1))),
  ex("exercise-06",[48,47,45,43,41].map((n,i)=>note(`lh-${i}`,n,i,1,"left",i+1,"", "bass")).map(n=>({...n,chordGroupId:null}))),
  ex("exercise-07",[note("l-c",48,0,1,"left",5,null,"bass"),note("r-c",60,1,1,"right",1),note("l-g",43,2,1,"left",5,null,"bass"),note("r-g",67,3,1,"right",5)]),
  ex("exercise-08",[60,62,64,65,67,65,64,62,60].map((n,i)=>note(`pattern-${i}`,n,i,1,"right",[1,2,3,4,5,4,3,2,1][i]!))),
  ex("exercise-09",[note("third-c",60,0,2,"right",1,"third","chord"),note("third-e",64,0,2,"right",3,"third","chord"),note("fifth-c",60,3,2,"left",5,"fifth","chord"),note("fifth-g",67,3,2,"right",5,"fifth","chord")],true),
  ex("exercise-10",[note("cmaj-c",60,0,2,"right",1,"c-major","chord"),note("cmaj-e",64,0,2,"right",3,"c-major","chord"),note("cmaj-g",67,0,2,"right",5,"c-major","chord"),note("amin-a",57,3,2,"left",5,"a-minor","chord"),note("amin-c",60,3,2,"right",1,"a-minor","chord"),note("amin-e",64,3,2,"right",3,"a-minor","chord")],true),
  ex("exercise-11",[note("sr1",60,0),note("sr2",62,1),note("sr3",64,2,2),note("sr4",62,4),note("sr5",60,5,2)],true),
  ex("exercise-12",[note("a1",60,0),note("a2",62,1),note("int-c",60,2,2,"left",5,"assessment-interval","chord"),note("int-e",64,2,2,"right",3,"assessment-interval","chord"),note("a3",67,5),note("triad-c",60,6,2,"left",5,"assessment-triad","chord"),note("triad-e",64,6,2,"right",3,"assessment-triad","chord"),note("triad-g",67,6,2,"right",5,"assessment-triad","chord")],true)
];

export const lessons: Lesson[] = [
  lesson(1,"Finding notes on the keyboard","theory",[
    {type:"theory-card",title:"The repeating keyboard map",body:"The keyboard repeats in groups of twelve notes. Find each C immediately to the left of a group of two black keys. Moving to the next C changes the octave but keeps the note name."},
    midiSection("exercise-01","Find three Cs","Play C3, C4, and C5 in order. Use the two-black-key pattern rather than counting every key.")
  ],rewards({keyboard_layout:2,note_reading:1})),
  lesson(2,"Finger numbers and hand position","technique",[
    {type:"theory-card",title:"Five fingers, five numbers",body:"Both hands number the thumb 1 and the little finger 5. Keep curved fingers, a relaxed wrist, and the knuckles gently raised. Press with the finger pad without collapsing the last joint."},
    {type:"quiz",questions:[quiz("q2-1","Which number names the thumb in either hand?",["1","2","5","It changes by hand"],0,"The thumb is finger 1 in both hands."),quiz("q2-2","Which position supports controlled playing?",["Locked wrist and flat fingers","Relaxed wrist and curved fingers","Raised shoulders","Straight, rigid elbows"],1,"A relaxed wrist and naturally curved fingers allow controlled movement.")]}
  ],rewards({technique:2,theory:1})),
  lesson(3,"Middle C and the grand staff","theory",[
    {type:"notation",title:"Middle C between the staves",vexflowData:{grandStaff:true,treble:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"w"}]},bass:{clef:"bass",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"w"}]}}},
    {type:"quiz",questions:[quiz("q3-1","Where is middle C written on the grand staff?",["Top line of treble clef","On a ledger line between the staves","Bottom line of bass clef","Only in treble clef"],1,"Middle C uses a ledger line centered between the two staves.")]}
  ],rewards({note_reading:2,theory:1})),
  lesson(4,"Rhythm: quarter, half, whole notes","theory",[
    {type:"markdown",title:"Counting note values",body:"In 4/4 time, a quarter note lasts one beat, a half note lasts two beats, and a whole note fills all four beats. Count a steady **1 2 3 4**; note values describe how long sound continues, not how hard a key is pressed."},
    {type:"quiz",questions:[quiz("q4-1","How many beats does a half note receive in 4/4?",["One","Two","Three","Four"],1,"A half note lasts two quarter-note beats."),quiz("q4-2","Which note fills one 4/4 measure?",["Quarter note","Half note","Whole note","Eighth note"],2,"A whole note lasts four beats in 4/4.")]}
  ],rewards({rhythm:3,timing:1})),
  lesson(5,"Treble clef C-D-E-F-G","repertoire",[
    {type:"notation",title:"Right-hand five-note ascent",vexflowData:{clef:"treble",timeSignature:"5/4",notes:["c/4","d/4","e/4","f/4","g/4"].map(keys=>({keys:[keys],duration:"q"}))}},
    midiSection("exercise-05","C to G","Play C4-D4-E4-F4-G4 with right-hand fingers 1-2-3-4-5, keeping one steady beat per note.")
  ],rewards({note_reading:2,technique:2,timing:1})),
  lesson(6,"Bass clef C-B-A-G-F","repertoire",[
    {type:"notation",title:"Left-hand descent",vexflowData:{clef:"bass",timeSignature:"5/4",notes:["c/3","b/2","a/2","g/2","f/2"].map(keys=>({keys:[keys],duration:"q"}))}},
    midiSection("exercise-06","Bass C down to F","Play C3-B2-A2-G2-F2 with the left hand, listening for an even descent.")
  ],rewards({note_reading:2,technique:2,timing:1})),
  lesson(7,"Playing with both hands","technique",[
    midiSection("exercise-07","Alternating hands","Play left C3, right C4, left G2, then right G4. These notes alternate; do not play them as chords.")
  ],rewards({technique:3,timing:2})),
  lesson(8,"C major five-finger pattern","technique",[
    midiSection("exercise-08","Up and down in C","With the right hand, play C4-D4-E4-F4-G4 and return to C4. Use fingers 1-2-3-4-5-4-3-2-1 without tucking the thumb.")
  ],rewards({technique:3,timing:2})),
  lesson(9,"Intervals: steps, skips, thirds, fifths","theory",[
    {type:"theory-card",title:"Measuring between notes",body:"An interval counts both its starting and ending note. C to D is a second or step; C to E is a third or skip; C to G is a fifth. When two interval notes are stacked, play them together."},
    {type:"quiz",questions:[quiz("q9-1","What interval is C to E?",["Second","Third","Fourth","Fifth"],1,"Count C-D-E: three letter names make a third.")]},
    midiSection("exercise-09","Third and fifth","Play C4 and E4 together, then C4 and G4 together. Make each pair sound as one attack.")
  ],rewards({theory:2,chords:2,timing:1})),
  lesson(10,"Major and minor triads","theory",[
    {type:"theory-card",title:"Two contrasting triads",body:"A triad combines a root, third, and fifth. C major uses C-E-G and has a major third above its root. A minor uses A-C-E and has a minor third above its root. Play all three tones together and balance their volume."},
    midiSection("exercise-10","C major and A minor","Play C4-E4-G4 together, then A3-C4-E4 together. Hold each triad for two beats.")
  ],rewards({theory:2,chords:3,timing:1})),
  lesson(11,"First sight-reading drill","repertoire",[
    {type:"notation",title:"Original five-note reading study",vexflowData:{clef:"treble",timeSignature:"4/4",notes:[{keys:["c/4"],duration:"q"},{keys:["d/4"],duration:"q"},{keys:["e/4"],duration:"h"},{keys:["d/4"],duration:"q"},{keys:["c/4"],duration:"h"}],original:true}},
    midiSection("exercise-11","Read before playing","Look for direction and repeated notes first. Then play C4-D4-E4-D4-C4 without stopping; hold E4 and the final C4 for two beats.")
  ],rewards({sight_reading:3,note_reading:2,rhythm:1})),
  lesson(12,"First MIDI accuracy assessment","technique",[
    midiSection("exercise-12","Foundation assessment","Play the single notes C4 and D4, the C4-E4 third, G4, and finally the C-major triad. Keep the pulse steady and chord tones simultaneous.")
  ],rewards({note_reading:2,rhythm:2,technique:2,chords:2,timing:2}))
];
