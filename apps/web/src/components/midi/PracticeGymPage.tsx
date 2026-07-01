import { useState } from "react";
import MidiStatusBar from "./MidiStatusBar";
import MidiExercise from "./MidiExercise";
import { practiceGymDrills } from "../../data/practiceGymDrills";

export default function PracticeGymPage() {
  const [selectedDrillId, setSelectedDrillId] = useState<string | null>(null);
  const selectedDrill = practiceGymDrills.find((d) => d.id === selectedDrillId) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">MIDI Practice Gym</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Freeform drills — pick one and play. Not tied to lesson progress.</p>
      </div>

      <MidiStatusBar />

      <div className="grid gap-3 sm:grid-cols-2">
        {practiceGymDrills.map((drill) => {
          const isSelected = drill.id === selectedDrillId;
          return (
            <button
              key={drill.id}
              type="button"
              onClick={() => setSelectedDrillId(drill.id)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-slate-800 bg-slate-100 dark:border-sky-500 dark:bg-slate-800"
                  : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-500"
              }`}
            >
              <p className="font-medium text-slate-900 dark:text-slate-100">{drill.label}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{drill.description}</p>
            </button>
          );
        })}
      </div>

      {selectedDrill && (
        <MidiExercise
          key={selectedDrill.id}
          exerciseId={selectedDrill.exercise.exerciseId}
          title={selectedDrill.label}
          instructions={selectedDrill.description}
          lessonId={null}
          exercise={selectedDrill.exercise}
        />
      )}
    </div>
  );
}
