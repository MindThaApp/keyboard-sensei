import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDashboard, type DashboardActivity, type DashboardActivityType, type DashboardAchievement, type DashboardResponse } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { isAchievementReachable, levelLabel, nextLessonFor } from "../../utils/levels";

const WEEKS_TO_SHOW = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < week) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ACTIVITY_ICON: Record<DashboardActivityType, string> = {
  lesson: "📘",
  gym: "🏋️",
  playalong: "🎹",
};

const ACTIVITY_LABEL: Record<DashboardActivityType, string> = {
  lesson: "Lesson",
  gym: "Practice Gym",
  playalong: "Play-along",
};

/**
 * A "best effort" activity calendar. The API only returns streak counters and a handful of
 * recent-activity timestamps — not a full history of active days — so this grid only marks the
 * days covered by `recentActivity` (most recent ~15 events). It is intentionally not presented as
 * a complete historical record.
 */
function ActivityCalendar({ recentActivity }: { recentActivity: DashboardActivity[] }) {
  const today = startOfDay(new Date());
  const totalDays = WEEKS_TO_SHOW * 7;
  const gridStart = new Date(today.getTime() - (totalDays - 1) * DAY_MS);

  const activeDayKeys = new Set(
    recentActivity.slice(0, 15).map((activity) => startOfDay(new Date(activity.at)).getTime()),
  );

  const days: { date: Date; active: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(gridStart.getTime() + i * DAY_MS);
    days.push({ date, active: activeDayKeys.has(date.getTime()) });
  }

  // Group into weeks (columns), Sunday-first.
  const weeks: { date: Date; active: boolean }[][] = [];
  let currentWeek: { date: Date; active: boolean }[] = [];
  days.forEach((day, i) => {
    currentWeek.push(day);
    if (day.date.getDay() === 6 || i === days.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {week.map((day, di) => (
              <div
                key={di}
                title={`${day.date.toLocaleDateString()}${day.active ? " — activity logged" : ""}`}
                className={`h-3 w-3 rounded-sm ${
                  day.active
                    ? "bg-brass-500 dark:bg-brass-400"
                    : "bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Filled squares are days you practised, taken from your 15 most recent sessions — older days may not show here.
      </p>
    </div>
  );
}

function StreakCard({ dashboard }: { dashboard: DashboardResponse }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Streak</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-xs">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">Current</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-felt-700 dark:text-felt-300">
            {dashboard.streak.current} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">day{dashboard.streak.current === 1 ? "" : "s"}</span>
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400">Longest</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {dashboard.streak.longest} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">day{dashboard.streak.longest === 1 ? "" : "s"}</span>
          </p>
        </div>
      </div>
      {dashboard.streak.lastActiveDate && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Last active {new Date(dashboard.streak.lastActiveDate).toLocaleDateString()}
        </p>
      )}
      <div className="mt-4">
        <ActivityCalendar recentActivity={dashboard.recentActivity} />
      </div>
    </section>
  );
}

function LevelProgressCard({ dashboard }: { dashboard: DashboardResponse }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Level progress</h2>
      {dashboard.levelProgress.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No level progress yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {dashboard.levelProgress.map((level) => {
            const pct = level.total > 0 ? Math.min(100, Math.round((level.completed / level.total) * 100)) : 0;
            return (
              <li key={level.level}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{levelLabel(level.level)}</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">
                    {level.completed}/{level.total}
                  </span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-felt-600 dark:bg-felt-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AchievementCard({ achievement }: { achievement: DashboardAchievement }) {
  return (
    <li
      className={`card flex flex-col gap-1 p-4 ${
        achievement.unlocked ? "" : "bg-slate-50 dark:bg-slate-900/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-2xl ${achievement.unlocked ? "" : "grayscale"}`} aria-hidden>
          {achievement.unlocked ? "🏅" : "🔒"}
        </span>
        {achievement.unlocked && achievement.unlockedAt && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {new Date(achievement.unlockedAt).toLocaleDateString()}
          </span>
        )}
      </div>
      <p
        className={`font-medium ${
          achievement.unlocked
            ? "text-brass-700 dark:text-brass-300"
            : "text-slate-600 dark:text-slate-400"
        }`}
      >
        {achievement.title}
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{achievement.description}</p>
    </li>
  );
}

function AchievementsSection({ dashboard }: { dashboard: DashboardResponse }) {
  const levelsWithLessons = new Set(dashboard.levelProgress.filter((level) => level.total > 0).map((level) => level.level));
  const achievements = dashboard.achievements.filter((achievement) => isAchievementReachable(achievement.key, levelsWithLessons));
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Achievements</h2>
      {achievements.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No achievements defined yet.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achievements.map((achievement) => (
            <AchievementCard key={achievement.key} achievement={achievement} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivitySection({ dashboard }: { dashboard: DashboardResponse }) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2>
      {dashboard.recentActivity.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No activity yet — start a lesson to get going.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {dashboard.recentActivity.map((activity, i) => (
            <li
              key={`${activity.type}-${activity.at}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <span className="text-xl" aria-hidden>{ACTIVITY_ICON[activity.type]}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{activity.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{ACTIVITY_LABEL[activity.type]}</p>
              </div>
              <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(activity.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lessons = useProgressStore((s) => s.lessons);
  const lessonsLoaded = useProgressStore((s) => s.loaded);
  const loadLessons = useProgressStore((s) => s.loadAll);
  const nextLesson = nextLessonFor(lessons);

  useEffect(() => {
    if (!lessonsLoaded) void loadLessons();
  }, [lessonsLoaded, loadLessons]);

  useEffect(() => {
    let cancelled = false;
    getDashboard()
      .then((response) => { if (!cancelled) setDashboard(response); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load dashboard"); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>;
  if (!dashboard) return <p className="text-slate-500 dark:text-slate-300">Loading dashboard…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>
        {nextLesson && (
          <Link to={`/lessons/${nextLesson.id}`} className="primary-button">
            Continue practising: {nextLesson.title} →
          </Link>
        )}
      </div>
      <StreakCard dashboard={dashboard} />
      <LevelProgressCard dashboard={dashboard} />
      <AchievementsSection dashboard={dashboard} />
      <RecentActivitySection dashboard={dashboard} />
    </div>
  );
}
