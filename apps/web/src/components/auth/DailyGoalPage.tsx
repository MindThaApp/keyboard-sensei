import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { updateDailyGoal, type DailyGoalMinutes } from "../../services/api";
import DailyGoalPicker from "../settings/DailyGoalPicker";

/** The last onboarding step: pick a daily practice goal, then land on Today. */
export default function DailyGoalPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [minutes, setMinutes] = useState<DailyGoalMinutes>((user?.daily_goal_minutes as DailyGoalMinutes | undefined) ?? 10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      setUser(await updateDailyGoal(minutes));
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your goal");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl py-6">
      <section className="card space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">How much practice a day?</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Meet your goal on consecutive days to build a streak. Lessons, songs and loops all count. You can change it any time in Settings.
          </p>
        </div>
        <DailyGoalPicker value={minutes} onChange={setMinutes} disabled={saving} />
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <button type="button" className="primary-button w-full" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Start practising"}
        </button>
      </section>
    </div>
  );
}
