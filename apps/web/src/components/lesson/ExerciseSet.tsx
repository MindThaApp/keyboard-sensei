import { useState } from "react";
import type { MidiExercise as MidiExerciseDef, MidiExerciseSection } from "@keyboard-sensei/shared-types";
import MidiExercise, { PASS_SCORE } from "../midi/MidiExercise";
import { firstUnpassedIndex } from "./exerciseRuns";

interface Props {
  lessonId: string;
  sections: MidiExerciseSection[];
  exercises: MidiExerciseDef[] | undefined;
  /** Best score per exercise id, as the API reported it when the lesson loaded. */
  initialBests: Record<string, number>;
  /** Open on this exercise (a deep link), when it is part of this set. */
  focusExerciseId?: string | null;
}

/**
 * A lesson's run of exercises (warm-up → core → challenge) as one stepper: a row of
 * tabs with each exercise's best score, and only the selected exercise mounted, so
 * the page holds one keyboard and one MIDI listener at a time. The lesson is passed
 * once every exercise here reaches the pass score.
 */
export default function ExerciseSet({ lessonId, sections, exercises, initialBests, focusExerciseId }: Props) {
  const [bests, setBests] = useState<Record<string, number>>(initialBests);
  const [selected, setSelected] = useState(() => {
    const focused = sections.findIndex((item) => item.exerciseId === focusExerciseId);
    return focused >= 0 ? focused : firstUnpassedIndex(sections, initialBests, PASS_SCORE);
  });
  const section = sections[selected]!;
  const passedCount = sections.filter((item) => (bests[item.exerciseId] ?? 0) >= PASS_SCORE).length;

  return (
    <section className="space-y-3" aria-label="Exercises">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Exercises</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="exercise-set-progress">
          {passedCount} of {sections.length} passed · pass every exercise ({PASS_SCORE}+) to complete the lesson
        </p>
      </div>
      <ol className="flex flex-wrap gap-2" role="tablist">
        {sections.map((item, index) => {
          const best = bests[item.exerciseId];
          const passed = (best ?? 0) >= PASS_SCORE;
          const active = index === selected;
          return (
            <li key={item.exerciseId}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(index)}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                  active
                    ? "border-felt-500 bg-felt-50 text-felt-800 dark:border-felt-500 dark:bg-felt-900/40 dark:text-felt-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                }`}
              >
                <span className="font-medium tabular-nums">{index + 1}</span>
                <span className="max-w-[14rem] truncate">{item.title}</span>
                {best !== undefined && (
                  <span
                    className={`rounded-full px-1.5 tabular-nums ${
                      passed ? "bg-brass-100 text-brass-700 dark:bg-brass-700/20 dark:text-brass-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {passed ? "✓ " : ""}
                    {best}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <MidiExercise
        key={section.exerciseId}
        exerciseId={section.exerciseId}
        title={section.title}
        instructions={section.instructions}
        lessonId={lessonId}
        exercise={exercises?.find((item) => item.exerciseId === section.exerciseId)}
        notationKey={exercises?.find((item) => item.exerciseId === section.exerciseId)?.keySignature}
        onCompleted={(result) =>
          setBests((current) => ({
            ...current,
            [section.exerciseId]: Math.max(current[section.exerciseId] ?? 0, result.score),
          }))
        }
      />
      {selected + 1 < sections.length && (bests[section.exerciseId] ?? 0) >= PASS_SCORE && (
        <div className="flex justify-end">
          <button type="button" className="primary-button" onClick={() => setSelected(selected + 1)}>
            Next exercise: {sections[selected + 1]!.title} →
          </button>
        </div>
      )}
    </section>
  );
}
