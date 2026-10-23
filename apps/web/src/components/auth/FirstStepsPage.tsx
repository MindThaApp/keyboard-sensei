import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { applyAssessmentPlacement } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useMidiContext } from "../midi/MidiContext";
import VirtualPiano from "../piano/VirtualPiano";
import { Button } from "../ui";
import { ODE_TO_JOY_PHRASE, parseDeviceParam, parseSourceParam } from "./onboardingParams";

const MIDDLE_C = 60;
/** C sharp and D sharp: the group of two black keys. */
const TWO_BLACK_KEYS = [61, 63];
/** Delay between finishing a step and showing the next, long enough to read "Nice". */
const ADVANCE_MS = 900;
const STEP_COUNT = 3;

type Step = 0 | 1 | 2 | "done";

/**
 * About three minutes, no notation: tap middle C, find the two black keys, then play the
 * start of Ode to Joy with the piano waiting for each note. Every step advances on its own.
 * It finishes with the same placement call a skipped assessment makes, then moves on to
 * the daily goal (or to saving the demo, as the assessment would have).
 */
export default function FirstStepsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const source = parseSourceParam(params.get("from"));
  const device = parseDeviceParam(params.get("device"));
  const resetProgress = useProgressStore((s) => s.reset);
  const { subscribe } = useMidiContext();

  const [step, setStep] = useState<Step>(0);
  const [blackPressed, setBlackPressed] = useState<number[]>([]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [nudge, setNudge] = useState(false);
  const [cheer, setCheer] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = device === "screen" ? "Tap" : "Press";

  const advance = useCallback((to: Step) => {
    setCheer(true);
    window.setTimeout(() => {
      setCheer(false);
      setNudge(false);
      setStep(to);
    }, ADVANCE_MS);
  }, []);

  useEffect(() => {
    if (step === "done" || cheer) return;
    return subscribe((event) => {
      if (event.type !== "noteon") return;
      if (step === 0) {
        if (event.note === MIDDLE_C) advance(1);
        else setNudge(true);
      } else if (step === 1) {
        if (!TWO_BLACK_KEYS.includes(event.note)) return setNudge(true);
        setNudge(false);
        const next = blackPressed.includes(event.note) ? blackPressed : [...blackPressed, event.note];
        setBlackPressed(next);
        if (next.length === TWO_BLACK_KEYS.length) advance(2);
      } else if (event.note === ODE_TO_JOY_PHRASE[phraseIndex]) {
        setNudge(false);
        if (phraseIndex === ODE_TO_JOY_PHRASE.length - 1) advance("done");
        else setPhraseIndex(phraseIndex + 1);
      } else {
        setNudge(true);
      }
    });
  }, [subscribe, step, cheer, blackPressed, phraseIndex, advance]);

  const next = async () => {
    setFinishing(true);
    setError(null);
    try {
      await applyAssessmentPlacement([]);
      resetProgress();
      navigate(source === "demo" ? "/welcome/save-progress" : "/welcome/goal", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setFinishing(false);
    }
  };

  const expectedNotes =
    step === 0
      ? [MIDDLE_C]
      : step === 1
        ? TWO_BLACK_KEYS.filter((note) => !blackPressed.includes(note))
        : step === 2
          ? [ODE_TO_JOY_PHRASE[phraseIndex]!]
          : [];

  let heading = "";
  let detail = "";
  if (step === 0) {
    heading = `${press} the glowing middle C`;
    detail = "It's the white key just left of the group of two black keys, near the middle.";
  } else if (step === 1) {
    heading = "Find the group of two black keys";
    detail = `${press} both of them. They glow until you do.`;
  } else if (step === 2) {
    heading = "Play the start of Ode to Joy";
    detail = `The piano waits for you. ${press} each glowing key (${midiNoteToName(ODE_TO_JOY_PHRASE[phraseIndex]!)} next).`;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4">
      {device !== "screen" && <MidiStatusBar />}

      {step === "done" ? (
        <section className="space-y-4 text-center" aria-live="polite">
          <h1 className="font-display text-3xl font-semibold">You played your first tune</h1>
          <p className="text-slate-600 dark:text-slate-300">
            That was the start of Ode to Joy. Next, choose how much to practise each day.
          </p>
          <Button variant="filled" size="lg" loading={finishing} onClick={() => void next()}>
            Continue
          </Button>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
              Step {Number(step) + 1} of {STEP_COUNT}
            </p>
            <span className="flex items-center gap-1.5" aria-hidden="true">
              {Array.from({ length: STEP_COUNT }, (_, i) => (
                <span
                  key={i}
                  className={`h-2 w-2 rounded-full ${
                    i < Number(step) || (i === step && cheer) ? "bg-brass-500" : i === step ? "bg-felt-500" : "bg-slate-300 dark:bg-slate-600"
                  }`}
                />
              ))}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{detail}</p>
          <p role="status" className="min-h-[1.5rem] text-sm font-medium text-felt-700 dark:text-felt-300">
            {cheer ? "Nice!" : nudge ? "Not that one. Look for the glowing key." : ""}
          </p>
        </section>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {step !== "done" && (
        <VirtualPiano
          lowestNote={MIDDLE_C}
          highestNote={MIDDLE_C + 12}
          expectedNotes={cheer ? [] : expectedNotes}
          showLabels
          showControls={false}
          showHint={false}
          scrollable={false}
        />
      )}

      {step !== "done" && (
        <button
          type="button"
          className="block min-h-[44px] w-full text-center text-sm text-felt-700 underline dark:text-felt-300"
          disabled={finishing}
          onClick={() => void next()}
        >
          Skip the first steps
        </button>
      )}
    </div>
  );
}
