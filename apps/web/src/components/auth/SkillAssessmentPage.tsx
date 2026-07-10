import { useState } from "react";
import type { MidiExercise as MidiExerciseDef, ScoringResult } from "@keyboard-sensei/shared-types";
import MidiExercise from "../midi/MidiExercise";
import MidiStatusBar from "../midi/MidiStatusBar";

const base = {
  tempoBpm: 60,
  difficulty: "beginner" as const,
  simultaneityWindowMs: 120,
  timingToleranceMs: 500,
  durationTolerancePercent: 60,
};

const prompts: { title: string; instructions: string; exercise: MidiExerciseDef }[] = [
  {
    title: "1. Play middle C",
    instructions: "Play middle C once and hold it for about one beat.",
    exercise: {
      ...base,
      exerciseId: "assessment-middle-c",
      expected: [
        { id: "c4", note: 60, startBeat: 0, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: "melody" },
      ],
    },
  },
  {
    title: "2. Play a C major triad",
    instructions: "Play C, E, and G together.",
    exercise: {
      ...base,
      exerciseId: "assessment-c-triad",
      expected: [60, 64, 67].map((note, i) => ({
        id: `triad-${i}`,
        note,
        startBeat: 0,
        durationBeats: 1,
        hand: "right" as const,
        finger: null,
        chordGroupId: "c-major",
        voice: "chord" as const,
      })),
    },
  },
  {
    title: "3. Play a short five-note pattern",
    instructions: "Play C, D, E, F, G evenly, one note per beat.",
    exercise: {
      ...base,
      exerciseId: "assessment-five-note",
      expected: [60, 62, 64, 65, 67].map((note, i) => ({
        id: `scale-${i}`,
        note,
        startBeat: i,
        durationBeats: 1,
        hand: "right" as const,
        finger: null,
        chordGroupId: null,
        voice: "melody" as const,
      })),
    },
  },
];

/** "Prompt N of 3" plus three dots: brass = done, felt = current, slate = still to come. */
function StepIndicator({ index, currentDone }: { index: number; currentDone: boolean }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
      <span className="tabular-nums">
        Prompt {index + 1} of {prompts.length}
      </span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        {prompts.map((_, i) => {
          const done = i < index || (i === index && currentDone);
          const current = i === index && !currentDone;
          return (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                done ? "bg-brass-500" : current ? "bg-felt-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
          );
        })}
      </span>
    </div>
  );
}

export default function SkillAssessmentPage({
  onFinish,
  onSkip,
}: {
  onFinish(scores: number[]): void;
  onSkip(): void;
}) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [result, setResult] = useState<ScoringResult | null>(null);

  const prompt = prompts[index]!;

  const completed = (scored: ScoringResult) => {
    setResult(scored);
    setScores((current) => [...current.slice(0, index), scored.score]);
  };

  const next = () => {
    if (index === prompts.length - 1) {
      onFinish(scores);
    } else {
      setIndex((value) => value + 1);
      setResult(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-felt-600 dark:text-felt-400">
          Optional skill assessment
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold">Find your starting point</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Three MIDI prompts. Strong, consistent results unlock the first four lessons; otherwise you start at
          lesson 1.
        </p>
        <div className="mt-3">
          <StepIndicator index={index} currentDone={result !== null} />
        </div>
      </div>
      <MidiStatusBar />
      <MidiExercise
        key={prompt.exercise.exerciseId}
        exerciseId={prompt.exercise.exerciseId}
        title={prompt.title}
        instructions={prompt.instructions}
        exercise={prompt.exercise}
        onCompleted={completed}
      />
      {result && (
        <button className="primary-button" onClick={next}>
          {index === prompts.length - 1 ? "See placement" : "Next prompt"}
        </button>
      )}
      <button className="secondary-button" onClick={onSkip}>
        Skip — I’m new to piano
      </button>
    </main>
  );
}
