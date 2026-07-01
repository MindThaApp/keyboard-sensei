import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, RawMidiEvent, ScoringResult } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents } from "@keyboard-sensei/midi-engine";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "./MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import NotationRenderer from "../notation/NotationRenderer";
import { useProgressStore } from "../../state/progressStore";

interface Props { exerciseId: string; title: string; instructions: string; lessonId?: string | null; exercise?: MidiExerciseDef; onCompleted?: (result: ScoringResult) => void }
const vexKey = (note: number) => { const names = ["c","c#","d","d#","e","f","f#","g","g#","a","a#","b"]; return `${names[note % 12]}/${Math.floor(note / 12) - 1}`; };
const duration = (beats: number) => beats >= 4 ? "w" : beats >= 2 ? "h" : "q";
function notationFor(exercise: MidiExerciseDef) {
  const groups = new Map<number, typeof exercise.expected>();
  for (const event of exercise.expected) groups.set(event.startBeat, [...(groups.get(event.startBeat) ?? []), event]);
  const clef = exercise.expected.some(event => event.hand === "left" && event.note < 60) ? "bass" : "treble";
  return { clef, timeSignature: "4/4", notes: [...groups.values()].map(events => ({ keys: events.map(event => vexKey(event.note)), duration: duration(Math.max(...events.map(event => event.durationBeats))) })) };
}
export default function MidiExercise({ exerciseId, title, instructions, lessonId = null, exercise, onCompleted }: Props) {
  const { subscribe } = useMidiContext(); const submitExercise = useProgressStore(s=>s.submitExercise); const submitPractice = useProgressStore(s=>s.submitPracticeGym);
  const [capturing,setCapturing]=useState(false); const [submitting,setSubmitting]=useState(false); const [result,setResult]=useState<ScoringResult|null>(null); const [error,setError]=useState<string|null>(null); const [played,setPlayed]=useState(false);
  const raw=useRef<RawMidiEvent[]>([]); const start=useRef(0); const active=useRef(false);
  useEffect(()=>subscribe(event=>{ if(!active.current)return; raw.current.push({...event,timestampMs:event.timestampMs-start.current}); if(event.type==="noteon")setPlayed(true); }),[subscribe]);
  const notation = useMemo(()=>exercise ? notationFor(exercise) : null,[exercise]);
  if(!exercise)return <section className="rounded-lg border p-4 text-sm">Loading exercise…</section>;
  const notes=[...new Set(exercise.expected.map(n=>n.note))]; const min=Math.max(36,Math.min(...notes)-3); const max=Math.min(84,Math.max(...notes)+3);
  const begin=()=>{raw.current=[];start.current=performance.now();active.current=true;setCapturing(true);setPlayed(false);setResult(null);setError(null)};
  const submit=async()=>{active.current=false;setCapturing(false);setSubmitting(true);try{const performedNotes=pairRawMidiEvents(raw.current);const scored=lessonId ? await submitExercise(exerciseId,{performedNotes}) : await submitPractice(exercise,{performedNotes});setResult(scored);onCompleted?.(scored)}catch(e){setError(e instanceof Error?e.message:"Unable to score attempt")}finally{setSubmitting(false)}};
  const feedback:Record<number,"incorrect">={}; result?.mistakes.forEach(m=>{if(m.expectedNote!==null)feedback[m.expectedNote]="incorrect";if(m.performedNote!==null)feedback[m.performedNote]="incorrect"});
  return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div><h2 className="font-semibold">{title}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{instructions}</p></div>
    {notation && <NotationRenderer data={notation} title="Read and play" />}
    <div className="flex flex-wrap gap-2">{[...new Map(exercise.expected.map(e=>[e.startBeat,exercise.expected.filter(n=>n.startBeat===e.startBeat)])).values()].map((group,i)=><span key={i} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-100">{group.map(n=>midiNoteToName(n.note)).join(" + ")}</span>)}</div>
    <VirtualPiano lowestNote={min} highestNote={max} expectedNotes={capturing||!result?notes:[]} feedbackByNote={feedback}/>
    {!capturing&&!result&&<button className="primary-button" onClick={begin}>Start Exercise</button>}{capturing&&<div className="flex items-center gap-3"><span className="text-sm text-emerald-600">Recording — play, then submit.</span><button className="primary-button" disabled={!played||submitting} onClick={()=>void submit()}>Submit Attempt</button></div>}{result&&<button className="secondary-button" onClick={begin}>Try Again</button>}{error&&<p className="text-sm text-rose-600">{error}</p>}
    {result&&<div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800"><p className="text-2xl font-semibold">{result.score}</p><p className="text-sm">Notes {result.noteAccuracy} · Timing {result.timingAccuracy} · Rhythm {result.rhythmAccuracy} · Chords {result.chordAccuracy}</p><ul className="mt-2 text-sm">{result.feedback.map((line,i)=><li key={i}>• {line}</li>)}</ul></div>}
  </section>;
}
