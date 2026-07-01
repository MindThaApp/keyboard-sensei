import { useState } from "react";
import type { MidiExercise as MidiExerciseDef, ScoringResult } from "@keyboard-sensei/shared-types";
import MidiExercise from "../midi/MidiExercise";
import MidiStatusBar from "../midi/MidiStatusBar";

const base={tempoBpm:60,difficulty:"beginner" as const,simultaneityWindowMs:120,timingToleranceMs:500,durationTolerancePercent:60};
const prompts:{title:string;instructions:string;exercise:MidiExerciseDef}[]=[
  {title:"1. Play middle C",instructions:"Play middle C once and hold it for about one beat.",exercise:{...base,exerciseId:"assessment-middle-c",expected:[{id:"c4",note:60,startBeat:0,durationBeats:1,hand:"right",finger:null,chordGroupId:null,voice:"melody"}]}},
  {title:"2. Play a C major triad",instructions:"Play C, E, and G together.",exercise:{...base,exerciseId:"assessment-c-triad",expected:[60,64,67].map((note,i)=>({id:`triad-${i}`,note,startBeat:0,durationBeats:1,hand:"right" as const,finger:null,chordGroupId:"c-major",voice:"chord" as const}))}},
  {title:"3. Play a short five-note pattern",instructions:"Play C, D, E, F, G evenly, one note per beat.",exercise:{...base,exerciseId:"assessment-five-note",expected:[60,62,64,65,67].map((note,i)=>({id:`scale-${i}`,note,startBeat:i,durationBeats:1,hand:"right" as const,finger:null,chordGroupId:null,voice:"melody" as const}))}},
];

export default function SkillAssessmentPage({onFinish,onSkip}:{onFinish(scores:number[]):void;onSkip():void}){
  const [index,setIndex]=useState(0); const [scores,setScores]=useState<number[]>([]); const [result,setResult]=useState<ScoringResult|null>(null);
  const prompt=prompts[index]!; const completed=(scored:ScoringResult)=>{setResult(scored);setScores(current=>[...current.slice(0,index),scored.score])};
  const next=()=>{if(index===prompts.length-1)onFinish(scores);else{setIndex(value=>value+1);setResult(null)}};
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8"><div><p className="text-sm font-medium text-sky-700 dark:text-sky-300">Optional skill assessment</p><h1 className="text-2xl font-semibold">Find your starting point</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Three MIDI prompts. Strong, consistent results unlock the first four lessons; otherwise you start at lesson 1.</p></div><MidiStatusBar/><MidiExercise key={prompt.exercise.exerciseId} exerciseId={prompt.exercise.exerciseId} title={prompt.title} instructions={prompt.instructions} exercise={prompt.exercise} onCompleted={completed}/>{result&&<button className="primary-button" onClick={next}>{index===prompts.length-1?"See placement":"Next prompt"}</button>}<button className="secondary-button" onClick={onSkip}>Skip — I’m new to piano</button></main>;
}
