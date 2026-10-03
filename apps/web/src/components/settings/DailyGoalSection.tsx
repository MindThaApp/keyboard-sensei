import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { updateDailyGoal, type DailyGoalMinutes } from "../../services/api";
import DailyGoalPicker from "./DailyGoalPicker";

/** Settings → Account: the daily practice goal. Saves on pick. */
export default function DailyGoalSection() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (minutes: DailyGoalMinutes) => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      setUser(await updateDailyGoal(minutes));
      setStatus(`Daily goal set to ${minutes} minutes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your goal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card space-y-3 p-5" aria-labelledby="daily-goal-heading">
      <div>
        <h2 id="daily-goal-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          Daily practice goal
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Your streak counts the days you meet it. Changing it applies from today; days already met stay met.
        </p>
      </div>
      <DailyGoalPicker value={user?.daily_goal_minutes ?? 10} onChange={(minutes) => void choose(minutes)} disabled={saving || !user} />
      <p aria-live="polite" className="text-sm">
        {status && <span className="text-emerald-700 dark:text-emerald-300">{status}</span>}
        {error && <span className="text-rose-700 dark:text-rose-300">{error}</span>}
      </p>
    </section>
  );
}
