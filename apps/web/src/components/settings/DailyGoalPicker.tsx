import { t, useT } from "../../i18n";
import { DAILY_GOAL_OPTIONS, type DailyGoalMinutes } from "../../services/api";


/** The four daily-goal choices as a radio group of cards. */
export default function DailyGoalPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange(minutes: DailyGoalMinutes): void;
  disabled?: boolean;
}) {
  useT();
  return (
    <div role="radiogroup" aria-label={t("settings.dailyGoal")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {DAILY_GOAL_OPTIONS.map((minutes) => {
        const selected = value === minutes;
        return (
          <button
            key={minutes}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(minutes)}
            className={`rounded-lg border px-3 py-3 text-left transition-colors disabled:opacity-60 ${
              selected
                ? "border-felt-500 bg-felt-50 ring-1 ring-felt-500 dark:bg-felt-900/40"
                : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <span className="block text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{t("settings.goalMin", { minutes })}</span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">{t("settings.goalADay", { label: t(`settings.goal.${minutes}`) })}</span>
          </button>
        );
      })}
    </div>
  );
}
