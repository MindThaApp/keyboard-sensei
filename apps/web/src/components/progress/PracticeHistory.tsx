import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AttemptSummary, LessonListItem } from "@keyboard-sensei/shared-types";
import { getAttempts, getMyPlayAlongAttempts, type PlayAlongAttemptSummary } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { practiceGymDrills } from "../../data/practiceGymDrills";

/**
 * exerciseId -> the title a learner saw. Built from data the client already has: the
 * lesson list carries each exercise section's title, and Gym drills are bundled.
 */
function exerciseTitles(lessons: readonly LessonListItem[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const drill of practiceGymDrills) titles.set(drill.exercise.exerciseId, drill.label);
  for (const lesson of lessons) {
    for (const section of lesson.sections) {
      if (section.type === "midi-exercise") titles.set(section.exerciseId, section.title);
    }
  }
  return titles;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function ScoreBadge({ score, passThreshold = 70 }: { score: number; passThreshold?: number }) {
  const passing = score >= passThreshold;
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

function AttemptRow({ attempt, exerciseTitle }: { attempt: AttemptSummary; exerciseTitle: string | undefined }) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <Link
          to={`/lessons/${attempt.lessonId}`}
          className="truncate font-medium text-slate-900 hover:text-felt-700 dark:text-slate-100 dark:hover:text-felt-300"
        >
          {attempt.lessonTitle}
        </Link>
        {/* Never the raw id ("exercise-01") — if the title is unknown, say nothing. */}
        {exerciseTitle && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{exerciseTitle}</p>}
      </div>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(attempt.createdAt).toLocaleString()}</span>
      <ScoreBadge score={attempt.score} />
    </li>
  );
}

function PlayAlongRow({ attempt }: { attempt: PlayAlongAttemptSummary }) {
  return (
    <li className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="min-w-0 flex-1">
        <Link
          to={`/play/${attempt.song_id}`}
          className="truncate font-medium text-slate-900 hover:text-felt-700 dark:text-slate-100 dark:hover:text-felt-300"
        >
          {attempt.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {attempt.artist} · {attempt.tempo_bpm ? `${Math.round(attempt.tempo_bpm)} BPM` : `${Math.round(attempt.tempo_pct)}% tempo`} · {attempt.lookahead_s}s visibility · accuracy {Math.round(attempt.accuracy)}%
        </p>
      </div>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{new Date(attempt.created_at).toLocaleString()}</span>
      <ScoreBadge score={Math.round(attempt.score)} />
    </li>
  );
}

function ExerciseHistory() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lessons = useProgressStore((s) => s.lessons);
  const lessonsLoaded = useProgressStore((s) => s.loaded);
  const loadLessons = useProgressStore((s) => s.loadAll);
  const titles = useMemo(() => exerciseTitles(lessons), [lessons]);

  useEffect(() => {
    if (!lessonsLoaded) void loadLessons();
  }, [lessonsLoaded, loadLessons]);

  useEffect(() => {
    let cancelled = false;
    getAttempts()
      .then((response) => { if (!cancelled) setAttempts(response.attempts); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load practice history"); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>;
  if (!attempts) return <p className="text-slate-500 dark:text-slate-300">Loading practice history…</p>;
  if (attempts.length === 0) {
    return (
      <section className="card p-6 text-center">
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">No practice yet</h2>
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Total attempts" value={String(total)} />
        <StatTile label="Average score" value={String(averageScore)} />
        <StatTile label="Best score" value={String(bestScore)} />
      </div>
      <ol className="space-y-2">
        {attempts.map((attempt) => (
          <AttemptRow key={attempt.id} attempt={attempt} exerciseTitle={titles.get(attempt.exerciseId)} />
        ))}
      </ol>
    </div>
  );
}

function PlayAlongHistory() {
  const [recent, setRecent] = useState<PlayAlongAttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyPlayAlongAttempts()
      .then((response) => { if (!cancelled) setRecent(response.recent); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load play-along history"); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>;
  if (!recent) return <p className="text-slate-500 dark:text-slate-300">Loading play-along history…</p>;
  if (recent.length === 0) {
    return (
      <section className="card p-6 text-center">
        <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">No play-along runs yet</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Pick a song and play along with the falling notes — your scores land here.
        </p>
        <Link to="/play" className="primary-button mt-4 inline-block">Browse songs</Link>
      </section>
    );
  }

  const total = recent.length;
  const best = Math.round(recent.reduce((max, a) => Math.max(max, a.score), 0));
  const averageAccuracy = Math.round(recent.reduce((sum, a) => sum + a.accuracy, 0) / total);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Recent runs" value={String(total)} />
        <StatTile label="Best score" value={String(best)} />
        <StatTile label="Average accuracy" value={`${averageAccuracy}%`} />
      </div>
      <ol className="space-y-2">
        {recent.map((attempt) => (
          <PlayAlongRow key={attempt.id} attempt={attempt} />
        ))}
      </ol>
    </div>
  );
}

export default function PracticeHistoryPage() {
  const [tab, setTab] = useState<"exercises" | "playalong">("exercises");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Practice history</h1>
        <div className="ml-auto flex gap-1 text-sm" role="tablist" aria-label="History type">
          {([["exercises", "Exercises"], ["playalong", "Play-along"]] as const).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                tab === value
                  ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === "exercises" ? <ExerciseHistory /> : <PlayAlongHistory />}
    </div>
  );
}
