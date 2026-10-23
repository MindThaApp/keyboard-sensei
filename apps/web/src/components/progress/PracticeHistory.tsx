import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AttemptSummary, LessonListItem } from "@keyboard-sensei/shared-types";
import { getAttempts, getMyPlayAlongAttempts, type PlayAlongAttemptSummary } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { practiceGymDrills } from "../../data/practiceGymDrills";
import { Button, Card, EmptyState, ErrorState, ListGroup, ListRow, SegmentedControl, Skeleton } from "../ui";

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
    <Card padding="md">
      <p className="text-footnote font-semibold uppercase tracking-wide text-label-2a">{label}</p>
      <p className="mt-1 text-title2 tabular-nums text-label">{value}</p>
    </Card>
  );
}

function ScoreBadge({ score, passThreshold = 70 }: { score: number; passThreshold?: number }) {
  const passing = score >= passThreshold;
  return (
    <span
      className={`rounded-pill px-2.5 py-0.5 text-footnote font-semibold tabular-nums ${passing ? "bg-tint/15 text-tint" : "bg-fill text-label-2"}`}
      aria-label={`Score ${score}${passing ? ", passed" : ""}`}
    >
      {score}
    </span>
  );
}

/** Wait-for-me runs are saved unscored (practice time only): a pill instead of a 0. */
function WaitBadge() {
  return (
    <span
      className="rounded-pill bg-fill px-2.5 py-0.5 text-footnote font-semibold text-label-2"
      aria-label="Wait for me, practice time, not scored"
    >
      Wait for me
    </span>
  );
}

/**
 * Headline numbers for the Play-along tab. Wait-for-me runs are unscored, so they
 * count as runs but never feed the best score or the accuracy average.
 */
export function playAlongStats(recent: readonly Pick<PlayAlongAttemptSummary, "score" | "accuracy" | "wait_mode">[]) {
  const scored = recent.filter((run) => !run.wait_mode);
  return {
    runs: recent.length,
    best: scored.length > 0 ? Math.round(scored.reduce((max, run) => Math.max(max, run.score), 0)) : null,
    averageAccuracy: scored.length > 0 ? Math.round(scored.reduce((sum, run) => sum + run.accuracy, 0) / scored.length) : null,
  };
}

function HistorySkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <Skeleton height={72} radius={16} />
      <Skeleton height={160} radius={16} />
    </div>
  );
}

function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <ErrorState
      title={`Couldn't load your ${what}`}
      message="Check your connection and try again."
      action={<Button variant="filled" onClick={onRetry}>Try again</Button>}
    />
  );
}

function ExerciseHistory() {
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const lessons = useProgressStore((s) => s.lessons);
  const lessonsLoaded = useProgressStore((s) => s.loaded);
  const loadLessons = useProgressStore((s) => s.loadAll);
  const titles = useMemo(() => exerciseTitles(lessons), [lessons]);

  useEffect(() => {
    if (!lessonsLoaded) void loadLessons();
  }, [lessonsLoaded, loadLessons]);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getAttempts()
      .then((response) => { if (!cancelled) setAttempts(response.attempts); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [retry]);

  if (error) return <LoadError what="practice history" onRetry={() => setRetry((n) => n + 1)} />;
  if (!attempts) return <HistorySkeleton label="Loading practice history" />;
  if (attempts.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No practice yet"
          message="Your exercise attempts will show up here. Start a lesson to log your first one."
          action={<Link to="/learn" className="ks-btn ks-btn--filled">Browse lessons</Link>}
        />
      </Card>
    );
  }

  const total = attempts.length;
  const averageScore = Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / total);
  const bestScore = attempts.reduce((best, a) => Math.max(best, a.score), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Attempts" value={String(total)} />
        <StatTile label="Average" value={String(averageScore)} />
        <StatTile label="Best" value={String(bestScore)} />
      </div>
      <ListGroup aria-label="Exercise attempts">
        {attempts.map((attempt) => (
          <ListRow
            key={attempt.id}
            as={Link}
            to={`/lessons/${attempt.lessonId}`}
            title={attempt.lessonTitle}
            // Never the raw id ("exercise-01"): if the title is unknown, say only when.
            subtitle={[titles.get(attempt.exerciseId), new Date(attempt.createdAt).toLocaleString()].filter(Boolean).join(" · ")}
            accessory={<ScoreBadge score={attempt.score} />}
          />
        ))}
      </ListGroup>
    </div>
  );
}

function PlayAlongHistory() {
  const [recent, setRecent] = useState<PlayAlongAttemptSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getMyPlayAlongAttempts()
      .then((response) => { if (!cancelled) setRecent(response.recent); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [retry]);

  if (error) return <LoadError what="play-along history" onRetry={() => setRetry((n) => n + 1)} />;
  if (!recent) return <HistorySkeleton label="Loading play-along history" />;
  if (recent.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No play-along runs yet"
          message="Pick a song and play along with the falling notes. Your scores land here."
          action={<Link to="/practice" className="ks-btn ks-btn--filled">Browse songs</Link>}
        />
      </Card>
    );
  }

  const stats = playAlongStats(recent);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Runs" value={String(stats.runs)} />
        <StatTile label="Best" value={stats.best === null ? "–" : String(stats.best)} />
        <StatTile label="Notes hit" value={stats.averageAccuracy === null ? "–" : `${stats.averageAccuracy}%`} />
      </div>
      <ListGroup aria-label="Play-along runs">
        {recent.map((attempt) => (
          <ListRow
            key={attempt.id}
            as={Link}
            to={`/play/${attempt.song_id}`}
            title={attempt.title}
            subtitle={[
              attempt.artist,
              attempt.tempo_bpm ? `Speed ${Math.round(attempt.tempo_bpm)}` : `${Math.round(attempt.tempo_pct)}% tempo`,
              attempt.wait_mode ? null : `accuracy ${Math.round(attempt.accuracy)}%`,
              new Date(attempt.created_at).toLocaleString(),
            ].filter(Boolean).join(" · ")}
            accessory={attempt.wait_mode ? <WaitBadge /> : <ScoreBadge score={Math.round(attempt.score)} />}
          />
        ))}
      </ListGroup>
    </div>
  );
}

/** Every saved attempt, newest first: lesson exercises or play-along runs. Shown on Progress. */
export default function PracticeHistory() {
  const [tab, setTab] = useState<"exercises" | "playalong">("exercises");

  return (
    <div className="space-y-4">
      <SegmentedControl
        aria-label="History type"
        value={tab}
        onChange={setTab}
        options={[
          { value: "exercises", label: "Exercises" },
          { value: "playalong", label: "Play-along" },
        ]}
      />
      {tab === "exercises" ? <ExerciseHistory /> : <PlayAlongHistory />}
    </div>
  );
}
