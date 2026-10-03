import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RegistrationForm } from "./AuthPage";
import { applyAssessmentPlacement } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { parseScoresParam } from "./onboardingParams";

/**
 * Shown after a demo user finishes (or skips) the skill assessment: offers to turn the
 * shared demo session into a real account. Lives at /welcome/save-progress so Back and
 * refresh behave; the placement scores ride along in the query string so a refreshed
 * page can still re-apply them to the newly registered account.
 */
export default function SaveProgressPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const scores = parseScoresParam(params.get("scores"));
  const resetProgress = useProgressStore((s) => s.reset);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-md items-center py-6">
      <section className="card w-full space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Save your progress</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Create your own account to save progress going forward. Demo progress is shared and will not be migrated.
          </p>
        </div>
        <RegistrationForm
          submitLabel="Create account and continue"
          onRegistered={() =>
            void applyAssessmentPlacement(scores)
              .then(() => {
                resetProgress();
                navigate("/welcome/goal", { replace: true });
              })
              .catch((e) => setError(e instanceof Error ? e.message : "Unable to apply placement"))
          }
        />
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          type="button"
          className="w-full text-sm text-felt-700 underline dark:text-felt-300"
          onClick={() => navigate("/", { replace: true })}
        >
          Skip, keep using demo
        </button>
      </section>
    </div>
  );
}
