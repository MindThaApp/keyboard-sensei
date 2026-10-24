import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MidiExercise as MidiExerciseDef, MidiExerciseSection } from "@keyboard-sensei/shared-types";
import MidiExercise, { PASS_SCORE } from "../midi/MidiExercise";
import { firstUnpassedIndex } from "./exerciseRuns";
import type { FocusModeApi } from "../../hooks/useFocusMode";

interface Props {
  lessonId: string;
  sections: MidiExerciseSection[];
  exercises: MidiExerciseDef[] | undefined;
  /** Best score per exercise id, as the API reported it when the lesson loaded. */
  initialBests: Record<string, number>;
  /** Open on this exercise (a deep link), when it is part of this set. */
  focusExerciseId?: string | null;
  /** Where "Next" leads after the last exercise is passed (the next lesson), when there is one. */
  afterLast?: { label: string; to: string } | null;
  /** Focus mode state shared with the page, so the exercise can offer it and the page can hide its chrome. */
  focus?: FocusModeApi;
}

/**
 * A lesson's run of exercises (warm-up → core → challenge) as one stepper: a row of
 * tabs with each exercise's best score, and only the selected exercise mounted, so
 * the page holds one keyboard and one MIDI listener at a time. The lesson is passed
 * once every exercise here reaches the pass score.
 */
export default function ExerciseSet({ lessonId, sections, exercises, initialBests, focusExerciseId, afterLast, focus }: Props) {
  const navigate = useNavigate();
  const [bests, setBests] = useState<Record<string, number>>(initialBests);
  const [selected, setSelected] = useState(() => {
    const focused = sections.findIndex((item) => item.exerciseId === focusExerciseId);
    return focused >= 0 ? focused : firstUnpassedIndex(sections, initialBests, PASS_SCORE);
  });
  const section = sections[selected]!;
  const passedCount = sections.filter((item) => (bests[item.exerciseId] ?? 0) >= PASS_SCORE).length;

  const exercise = exercises?.find((item) => item.exerciseId === section.exerciseId);
  const isLast = selected + 1 >= sections.length;
  const nextAction = isLast
    ? afterLast
      ? { label: afterLast.label, onClick: () => navigate(afterLast.to) }
      : undefined
    : { label: `Next: ${sections[selected + 1]!.title}`, onClick: () => setSelected(selected + 1) };

  return (
    <section className="space-y-4" aria-label="Exercises">
      {!focus?.active && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-lg font-semibold">
              Step {selected + 1} of {sections.length}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="exercise-set-progress">
              {passedCount} of {sections.length} done
            </p>
          </div>
          <ol className="flex gap-2" aria-label="Steps">
            {sections.map((item, index) => {
              const best = bests[item.exerciseId];
              const passed = (best ?? 0) >= PASS_SCORE;
              const active = index === selected;
              return (
                <li key={item.exerciseId} className="flex-1">
                  <button
                    type="button"
                    aria-current={active ? "step" : undefined}
                    aria-label={`Step ${index + 1}: ${item.title}${passed ? ", passed" : ""}`}
                    title={item.title}
                    onClick={() => setSelected(index)}
                    className="group flex min-h-11 w-full items-center"
                  >
                    <span
                      className={`h-1.5 w-full rounded-full transition-colors ${
                        passed || active ? "bg-felt-600 dark:bg-felt-400" : "bg-slate-300 dark:bg-slate-600"
                      } ${active && !passed ? "opacity-60" : ""} group-focus-visible:ring-2 group-focus-visible:ring-felt-500`}
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <MidiExercise
        key={section.exerciseId}
        exerciseId={section.exerciseId}
        title={section.title}
        instructions={section.instructions}
        lessonId={lessonId}
        exercise={exercise}
        notationKey={exercise?.keySignature}
        nextAction={nextAction}
        focus={focus}
        onCompleted={(result) =>
          setBests((current) => ({
            ...current,
            [section.exerciseId]: Math.max(current[section.exerciseId] ?? 0, result.score),
          }))
        }
      />
    </section>
  );
}
