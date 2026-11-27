import { useEffect, useMemo, useState } from "react";
import type { MidiExercise } from "@keyboard-sensei/shared-types";
import { useMicInput, type MicInput } from "../../audio/mic/useMicInput";
import type { MicNoteSource } from "../../audio/mic/micNoteSource";
import { micEligibility, type ExerciseInputMode, type MicEligibility } from "./exerciseInput";

export interface ExerciseInputState {
  eligibility: MicEligibility;
  mode: ExerciseInputMode;
  setMode: (mode: ExerciseInputMode) => void;
  mic: MicInput;
  /** Non-null while grading from the mic. */
  micSource: MicNoteSource | null;
  /** Start must wait: the mic is chosen but not listening yet. */
  blocked: boolean;
}

const FALLBACK: MidiExercise = { exerciseId: "", tempoBpm: 100, difficulty: "beginner", simultaneityWindowMs: 100, timingToleranceMs: 250, durationTolerancePercent: 35, expected: [] };

/** Picks the exercise's input (2.2): MIDI by default for piano, the mic for guitar/violin or when chosen. */
export function useExerciseInput(exercise: MidiExercise | undefined): ExerciseInputState {
  const eligibility = useMemo(() => micEligibility(exercise ?? FALLBACK), [exercise]);
  const [mode, setModeState] = useState<ExerciseInputMode>(eligibility.preferred);
  const mic = useMicInput(eligibility.profile);
  const { start, stop } = mic;

  useEffect(() => { setModeState(eligibility.preferred) }, [eligibility.preferred]);
  // The mic is asked for only once the learner is on a mic exercise (4.7), and let go when they leave it.
  useEffect(() => {
    if (mode === "mic" && eligibility.mic) start();
    else stop();
  }, [mode, eligibility.mic, start, stop]);

  const micSource = mode === "mic" && mic.status === "on" ? mic.source : null;
  return {
    eligibility,
    mode,
    setMode: setModeState,
    mic,
    micSource,
    blocked: mode === "mic" && micSource === null,
  };
}
