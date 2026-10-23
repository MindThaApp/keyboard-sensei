import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { MidiExercise as MidiExerciseDef, ScoringResult } from "@keyboard-sensei/shared-types";
import { useExperience } from "../../contexts/ExperienceContext";
import MidiExercise from "../midi/MidiExercise";
import MidiStatusBar from "../midi/MidiStatusBar";
import { Button, Card } from "../ui";
import { experienceFor, parseSourceParam, type OnboardingDevice, type PlayedBefore } from "./onboardingParams";

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

type Stage = "played" | "device" | "intro" | "tasks";

interface Choice<T extends string> {
  value: T;
  title: string;
  hint: string;
}

const PLAYED_CHOICES: Choice<PlayedBefore>[] = [
  { value: "never", title: "Never, or just a little", hint: "We'll start with a few guided steps." },
  { value: "yes", title: "Yes, I can already play", hint: "We'll check where to start you." },
];

const DEVICE_CHOICES: Choice<OnboardingDevice>[] = [
  { value: "screen", title: "The on-screen keyboard", hint: "Tap or click the keys." },
  { value: "plugged", title: "A keyboard plugged in", hint: "A digital piano or keyboard on a USB cable." },
  { value: "bluetooth", title: "A keyboard over Bluetooth", hint: "Paired wirelessly." },
];

/** One question with big tappable answers. */
function Question<T extends string>({
  id,
  heading,
  choices,
  onPick,
}: {
  id: string;
  heading: string;
  choices: Choice<T>[];
  onPick(value: T): void;
}) {
  return (
    <section aria-labelledby={id} className="mx-auto max-w-xl space-y-4 py-4">
      <h1 id={id} className="font-display text-2xl font-semibold">
        {heading}
      </h1>
      <div role="group" aria-labelledby={id} className="grid gap-3">
        {choices.map((choice) => (
          <Card key={choice.value} as="button" interactive className="w-full text-left" onClick={() => onPick(choice.value)}>
            <span className="block text-base font-semibold">{choice.title}</span>
            <span className="mt-0.5 block text-sm text-slate-600 dark:text-slate-300">{choice.hint}</span>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** "Prompt N of 3" plus three dots: brass = done, felt = current, slate = still to come. */
function StepIndicator({ index, currentDone }: { index: number; currentDone: boolean }) {
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
      <span className="tabular-nums">
        Task {index + 1} of {prompts.length}
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

/**
 * The first screens after sign-up or "Try it without an account": two questions that set
 * Simple or Advanced and route the learner. New players go to the guided first steps;
 * players who say they can already play get the optional three-task check.
 */
export default function SkillAssessmentPage({
  onFinish,
  onSkip,
}: {
  onFinish(scores: number[]): void;
  onSkip(): void;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const source = parseSourceParam(params.get("from"));
  const { setExperience } = useExperience();
  const [stage, setStage] = useState<Stage>("played");
  const [played, setPlayed] = useState<PlayedBefore>("never");
  const [device, setDevice] = useState<OnboardingDevice>("screen");

  const goToFirstSteps = (chosen: OnboardingDevice) =>
    navigate(`/welcome/first-steps?from=${source}&device=${chosen}`, { replace: true });

  const answerPlayed = (answer: PlayedBefore) => {
    setPlayed(answer);
    setExperience(experienceFor(answer));
    setStage("device");
  };

  const answerDevice = (answer: OnboardingDevice) => {
    setDevice(answer);
    if (played === "never") goToFirstSteps(answer);
    else setStage("intro");
  };

  if (stage === "played") {
    return <Question id="q-played" heading="Have you played piano before?" choices={PLAYED_CHOICES} onPick={answerPlayed} />;
  }
  if (stage === "device") {
    return <Question id="q-device" heading="What will you play on?" choices={DEVICE_CHOICES} onPick={answerDevice} />;
  }
  if (stage === "intro") {
    return (
      <section className="mx-auto max-w-xl space-y-4 py-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-felt-600 dark:text-felt-400">
            Quick check (optional)
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold">Find your starting point</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            3 short tasks. Strong, consistent results unlock the first four lessons; otherwise you start at lesson 1.
          </p>
        </div>
        <Button variant="filled" size="lg" onClick={() => setStage("tasks")}>
          Start
        </Button>
        <button
          type="button"
          className="block min-h-[44px] w-full text-center text-sm text-felt-700 underline dark:text-felt-300"
          onClick={() => {
            setExperience("simple");
            goToFirstSteps(device);
          }}
        >
          I'm new — skip this
        </button>
      </section>
    );
  }
  return <AssessmentTasks onFinish={onFinish} onSkip={onSkip} />;
}

function AssessmentTasks({ onFinish, onSkip }: { onFinish(scores: number[]): void; onSkip(): void }) {
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-xs font-medium uppercase tracking-widest text-felt-600 dark:text-felt-400">
              Quick check (optional)
            </p>
            <StepIndicator index={index} currentDone={result !== null} />
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold">Find your starting point</h1>
        </div>
        <button
          type="button"
          className="min-h-[44px] shrink-0 text-sm text-felt-700 underline dark:text-felt-300"
          onClick={onSkip}
        >
          Skip the check
        </button>
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
        <Button variant="filled" onClick={next}>
          {index === prompts.length - 1 ? "See placement" : "Next task"}
        </Button>
      )}
    </div>
  );
}
