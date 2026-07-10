import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AttemptSummary } from "@keyboard-sensei/shared-types";
import { getAttempts } from "../../services/api";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const passing = score >= 70;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
        passing
          ? "bg-brass-100 text-brass-700 dark:bg-brass-700/20 dark:text-brass-300"
          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      {score}
    </span>
  );
}

function AttemptRow({ attempt }: { attempt: AttemptSummary }) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <Link
          to={`/lessons/${attempt.lessonId}`}
          className="truncate font-medium text-slate-900 hover:text-felt-700 dark:text-slate-100 dark:hover:text-felt-300"
        >
          {attempt.lessonTitle}
        </Link>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{attempt.exerciseId}</p>
      </div>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(attempt.createdAt).toLocaleString()}</span>
      <ScoreBadge score={attempt.score} />
    </li>
  );
}

export default function PracticeHistoryPage() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAttempts()
      .then((response) => { if (!cancelled) setAttempts(response.attempts); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load practice history"); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>;
  }

  if (!attempts) {
    return <p className="text-slate-500 dark:text-slate-300">Loading practice history…</p>;
  }

  if (attempts.length === 0) {
    return (
      <section className="card p-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">No practice yet</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Your exercise attempts will show up here. Start a lesson to log your first one.
        </p>
        <Link to="/" className="primary-button mt-4 inline-block">Browse lessons</Link>
      </section>
    );
  }

  const total = attempts.length;
  const averageScore = Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / total);
  const bestScore = attempts.reduce((best, a) => Math.max(best, a.score), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Practice history</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total attempts" value={String(total)} />
        <StatTile label="Average score" value={String(averageScore)} />
        <StatTile label="Best score" value={String(bestScore)} />
      </div>
      <ol className="space-y-2">
        {attempts.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} />
        ))}
      </ol>
    </div>
  );
}
