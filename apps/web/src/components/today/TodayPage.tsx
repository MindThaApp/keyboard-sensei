import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getToday, type TodayResponse } from "../../services/api";
import { useRewardsVersion } from "../../state/rewards";
import { useAuth } from "../../contexts/AuthContext";
import { pathLabel } from "../../utils/paths";
import { drillLink, lessonExerciseLink, songPracticeLink } from "../../utils/practiceLinks";
import { warmupFor } from "../../utils/warmup";
import { GoalRing, LevelBar, StarRating } from "../progress/ProgressBits";

const HANDS_LABEL = { both: "both hands", right: "right hand", left: "left hand" } as const;
const LEVEL_LABEL = { full: "Full", simplified: "Simplified", easy: "Easy", melody: "Melody" } as const;

function Card({ eyebrow, title, children, action }: { eyebrow: string; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-widest text-felt-700 dark:text-felt-300">{eyebrow}</p>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      {children && <div className="text-sm text-slate-700 dark:text-slate-300">{children}</div>}
      {action && <div className="mt-auto flex flex-wrap gap-2 pt-1">{action}</div>}
    </section>
  );
}

function GoalCard({ today }: { today: TodayResponse }) {
  const { minutesToday, goalMinutes, met } = today.dailyGoal;
  const { streak } = today;
  return (
    <section className="card relative overflow-hidden p-4 sm:p-5" aria-label="Daily goal">
      <div className="felt-strip absolute inset-x-0 top-0" />
      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <GoalRing minutes={minutesToday} goal={goalMinutes} size={104} stroke={10}>
          <span className="text-center leading-tight">
            <span className="block text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100" data-testid="goal-minutes">
              {Math.floor(minutesToday)}
            </span>
            <span className="block text-xs text-slate-600 dark:text-slate-300">of {goalMinutes} min</span>
          </span>
        </GoalRing>
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {met ? "Goal met today — nice work." : minutesToday > 0 ? `${Math.max(1, Math.ceil(goalMinutes - minutesToday))} more minutes to today's goal` : "Ready for today's practice?"}
          </h1>
          <p className="text-sm text-slate-700 dark:text-slate-300" data-testid="streak-line">
            <span aria-hidden>🔥 </span>
            {streak.current > 0 ? `${streak.current}-day goal streak` : "Meet your goal to start a streak"}
            {streak.longest > streak.current && ` · best ${streak.longest}`}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {streak.freezesAvailable > 0
              ? `${streak.freezesAvailable} streak freeze${streak.freezesAvailable > 1 ? "s" : ""} banked — a missed day won't break your streak.`
              : `Meet your goal ${streak.daysToNextFreeze} more day${streak.daysToNextFreeze === 1 ? "" : "s"} in a row to earn a streak freeze.`}
          </p>
        </div>
        <LevelBar level={today.level} className="w-full sm:w-64" />
      </div>
    </section>
  );
}

export default function TodayPage() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRewardsVersion();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    getToday()
      .then((response) => {
        if (!cancelled) setToday(response);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load today's plan");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (error) return <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>;
  if (!today) return <p className="text-slate-600 dark:text-slate-300">Loading today…</p>;

  const warmup = warmupFor(today.level.level, today.today);
  const { review, song } = today;
  const next = today.continue;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {user?.display_name ? `Hello, ${user.display_name}.` : "Hello."} Here's today's practice.
      </p>
      <GoalCard today={today} />

      <div className="grid gap-4 md:grid-cols-2">
        {next ? (
          <Card
            eyebrow={next.started ? "Continue" : "Up next"}
            title={next.lessonTitle}
            action={
              <Link to={lessonExerciseLink(next.lessonId, next.exerciseId)} className="primary-button">
                {next.started ? "Continue lesson" : "Start lesson"}
              </Link>
            }
          >
            <p>
              {pathLabel(next.path)} · {next.exercisesPassed} of {next.exercisesTotal} exercises passed
            </p>
            {next.exerciseTitle && <p className="mt-1">Next: {next.exerciseTitle}</p>}
          </Card>
        ) : (
          <Card eyebrow="Course" title="Every lesson complete" action={<Link to="/learn" className="secondary-button">Browse lessons</Link>}>
            <p>Polish your stars, or pick a song below.</p>
          </Card>
        )}

        <Card
          eyebrow="Warm-up · 2 min"
          title={warmup.label}
          action={
            <Link to={drillLink(warmup.id)} className="secondary-button">
              Warm up
            </Link>
          }
        >
          <p>{warmup.description}</p>
        </Card>

        {review ? (
          <Card
            eyebrow="Review"
            title={review.exerciseTitle}
            action={
              <Link to={lessonExerciseLink(review.lessonId, review.exerciseId)} className="secondary-button">
                Review it
              </Link>
            }
          >
            <p data-testid="review-detail">
              From “{review.lessonTitle}”. Last time you scored {Math.round(review.lastScore)}
              {review.mistakeCount > 0 && `, with ${review.mistakeCount} note${review.mistakeCount === 1 ? "" : "s"} to fix`} —{" "}
              {review.daysSince === 1 ? "yesterday" : `${review.daysSince} days ago`}.
            </p>
            {review.hint && <p className="mt-1 text-slate-600 dark:text-slate-300">Tip: {review.hint}</p>}
          </Card>
        ) : (
          <Card eyebrow="Review" title="Nothing due for review">
            <p>Exercises you score under 85 come back here a day later, then after 3 and 7 days, until they stick.</p>
          </Card>
        )}

        {song && (
          <Card
            eyebrow={today.readyForYou.some((ready) => ready.songId === song.songId) ? "Ready for you" : "Song of the day"}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {song.title}
                <StarRating stars={song.stars} className="text-base" />
              </span>
            }
            action={
              <Link to={songPracticeLink(song.songId, { hands: song.hands, level: song.level })} className="primary-button" data-testid="song-deep-link">
                Play it
              </Link>
            }
          >
            <p>{song.reason}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              Starts with the {HANDS_LABEL[song.hands]}, {LEVEL_LABEL[song.level]} level.
            </p>
          </Card>
        )}
      </div>

      {today.readyForYou.length > 1 && (
        <section className="space-y-2" aria-labelledby="ready-heading">
          <h2 id="ready-heading" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Ready for you
          </h2>
          <ul className="flex flex-wrap gap-2">
            {today.readyForYou.map((ready) => (
              <li key={ready.songId}>
                <Link to={songPracticeLink(ready.songId)} className="card flex items-center gap-2 px-3 py-2 text-sm hover:border-felt-500">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{ready.title}</span>
                  <StarRating stars={ready.stars} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4 sm:p-5" aria-labelledby="recent-achievements">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recent-achievements" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent achievements
          </h2>
          <Link to="/progress?tab=achievements" className="text-sm text-felt-700 underline dark:text-felt-300">
            All achievements
          </Link>
        </div>
        {today.recentAchievements.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Finish your first lesson to earn one.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {today.recentAchievements.map((achievement) => (
              <li key={achievement.key} className="rounded-lg border border-brass-300/70 bg-brass-100/50 px-3 py-2 dark:border-brass-600/40 dark:bg-brass-700/10">
                <p className="text-sm font-semibold text-brass-700 dark:text-brass-300">🏅 {achievement.title}</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">{achievement.description}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
