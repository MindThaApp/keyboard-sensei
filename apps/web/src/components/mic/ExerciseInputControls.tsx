import { SegmentedControl } from "../ui";
import { t } from "../../i18n";
import MicInputPanel, { MicStatusPill } from "./MicInputPanel";
import type { ExerciseInputState } from "./useExerciseInput";
import type { ExerciseInputMode } from "./exerciseInput";

const OPTIONS: { value: ExerciseInputMode; label: string }[] = [
  { value: "midi", get label() { return t("mic.mode.keyboard"); } },
  { value: "mic", get label() { return t("mic.mode.microphone"); } },
];

/**
 * "Play with: Keyboard / Microphone" for exercises that allow both (piano single
 * lines on an acoustic piano), the mic explanation and permission states, and the
 * listening pill. Renders nothing for a MIDI-only exercise.
 */
export default function ExerciseInputControls({ input, locked }: { input: ExerciseInputState; locked: boolean }) {
  const { eligibility, mode, setMode, mic } = input;
  if (!eligibility.mic) return null;
  const canChoose = eligibility.midi && eligibility.mic;
  return (
    <div className="space-y-2" data-testid="exercise-input">
      <div className="flex flex-wrap items-center gap-2">
        {canChoose && (
          <SegmentedControl
            aria-label={t("mic.mode.playWith")}
            options={OPTIONS}
            value={mode}
            onChange={(value: ExerciseInputMode) => { if (!locked) setMode(value) }}
          />
        )}
        {mode === "mic" && <MicStatusPill mic={mic} />}
      </div>
      {mode === "mic" && <MicInputPanel mic={mic} onUseKeyboard={eligibility.midi ? () => setMode("midi") : undefined} />}
      {mode === "mic" && canChoose && mic.status === "on" && (
        <p className="text-xs text-slate-500">{t("mic.mode.acousticHint")}</p>
      )}
    </div>
  );
}
