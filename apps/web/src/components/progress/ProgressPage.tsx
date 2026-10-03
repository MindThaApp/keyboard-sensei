import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProgression, type Achievement, type AchievementCategory, type ProgressionResponse } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { useRewardsVersion } from "../../state/rewards";
import { addDays } from "../../utils/dates";
import { pathLabel, pathsInOrder } from "../../utils/paths";
import { songPracticeLink } from "../../utils/practiceLinks";
import PracticeHistory from "./PracticeHistory";
import { formatMinutes, GoalRing, LevelBar, StarRating } from "./ProgressBits";

type Tab = "overview" | "achievements" | "history";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "achievements", label: "Achievements" },
  { id: "history", label: "History" },
];
const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.id === value);

const CALENDAR_WEEKS = 10;
const LEVEL_NAME = { full: "Full", simplified: "Simplified", easy: "Easy", melody: "Melody" } as const;

function Calendar({ progression }: { progression: ProgressionResponse }) {
  const byDay = new Map(progression.calendar.map((entry) => [entry.day, entry]));
  const frozen = new Set(progression.frozenDays);
  const days = Array.from({ length: CALENDAR_WEEKS * 7 }, (_, index) => addDays(progression.today, index - (CALENDAR_WEEKS * 7 - 1)));
  return (
    <div>
      <ol className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: "minmax(0, 14px)" }} aria-label={`Practice over the last ${CALENDAR_WEEKS} weeks`}>
        {days.map((day) => {
          const entry = byDay.get(day);
          const state = entry?.goalMet ? "met" : frozen.has(day) ? "frozen" : entry && entry.minutes > 0 ? "practised" : "none";
          const label = `${day}: ${
            state === "met" ? `goal met (${Math.round(entry!.minutes)} min)` : state === "frozen" ? "missed, covered by a streak freeze" : state === "practised" ? `${Math.round(entry!.minutes)} min, goal not met` : "no practice"
          }`;
          return (
            <li
              key={day}
              title={label}
              aria-label={label}
              className={`aspect-square rounded-sm ${
                state === "met"
                  ? "bg-brass-500"
                  : state === "frozen"
                    ? "bg-sky-400 dark:bg-sky-500"
                    : state === "practised"
                      ? "bg-felt-300 dark:bg-felt-700"
                      : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700 dark:text-slate-300">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-brass-500" /> Goal met</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-felt-300 dark:bg-felt-700" /> Practised</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-sky-400 dark:bg-sky-500" /> Streak freeze</li>
      </ul>
    </div>
  );
}

function Skills({ progression }: { progression: ProgressionResponse }) {
  const strongest = Math.max(1, ...progression.skills.map((skill) => skill.points));
  return (
    <ul className="space-y-2.5">
      {progression.skills.map((skill) => (
        <li key={skill.id}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-slate-800 dark:text-slate-200">{skill.label}</span>
            <span className="tabular-nums text-xs text-slate-600 dark:text-slate-300" data-testid={`skill-${skill.id}`}>
              {skill.points} pts
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-felt-600 dark:bg-felt-500" style={{ width: `${Math.round((skill.points / strongest) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Overview({ progression }: { progression: ProgressionResponse }) {
  const lessons = useProgressStore((s) => s.lessons);
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);
  useEffect(() => {
    if (!loaded) void loadAll();
  }, [loaded, loadAll]);

  const starredSongs = Object.entries(progression.songStars)
    .filter(([, stars]) => stars.best > 0)
    .sort(([, a], [, b]) => b.best - a.best);
  const totalSongStars = starredSongs.reduce((sum, [, stars]) => sum + stars.best, 0);
  const { minutesToday, goalMinutes } = progression.dailyGoal;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-4 p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Level</h2>
        <LevelBar level={progression.level} />
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Total XP", progression.level.totalXp.toLocaleString()],
            ["Practice", formatMinutes(progression.practiceMinutes)],
            ["Achievements", `${progression.achievements.filter((a) => a.unlocked).length}/${progression.achievements.length}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-ivory-100 px-2 py-2 dark:bg-slate-800">
              <dt className="text-xs text-slate-600 dark:text-slate-300">{label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</dd>
            </div>
          ))}
        </dl>
        {progression.recentXp.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-700 dark:text-slate-300">Recent XP</summary>
            <ul className="mt-2 space-y-1">
              {progression.recentXp.map((entry, index) => (
                <li key={index} className="flex justify-between gap-3 text-slate-700 dark:text-slate-300">
                  <span className="truncate">{entry.reason}</span>
                  <span className="shrink-0 tabular-nums font-medium text-brass-700 dark:text-brass-300">+{entry.amount}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <GoalRing minutes={minutesToday} goal={goalMinutes} size={64} stroke={7} />
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Goal streak: {progression.streak.current} days</h2>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Best {progression.streak.longest} · {progression.streak.freezesAvailable} freeze{progression.streak.freezesAvailable === 1 ? "" : "s"} banked · goal {goalMinutes} min a day
            </p>
          </div>
        </div>
        <Calendar progression={progression} />
      </section>

      <section className="card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Skills</h2>
        <Skills progression={progression} />
        <p className="text-xs text-slate-600 dark:text-slate-300">Earned from completed lessons (more for more stars) and from song stars.</p>
      </section>

      <section className="card space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Stars</h2>
        <ul className="space-y-2">
          {pathsInOrder(lessons).map((path) => {
            const pathLessons = lessons.filter((lesson) => lesson.path === path);
            const earned = pathLessons.reduce((sum, lesson) => sum + (progression.lessonStars[lesson.id] ?? 0), 0);
            return (
              <li key={path} className="flex items-center justify-between gap-3 text-sm">
                <Link to="/learn" className="text-slate-800 hover:underline dark:text-slate-200">{pathLabel(path)}</Link>
                <span className="tabular-nums text-slate-700 dark:text-slate-300">
                  <span className="text-brass-700 dark:text-brass-300" aria-hidden>★ </span>
                  {earned} / {pathLessons.length * 3}
                </span>
              </li>
            );
          })}
        </ul>
        <h3 className="pt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Songs · <span className="tabular-nums">{totalSongStars}</span> stars
        </h3>
        {starredSongs.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Play a song to the end at 70% accuracy for your first star.</p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {starredSongs.map(([songId, stars]) => (
              <li key={songId} className="flex items-center justify-between gap-3 text-sm">
                <Link to={songPracticeLink(songId)} className="min-w-0 truncate text-slate-800 hover:underline dark:text-slate-200">
                  {progression.songTitles[songId] ?? songId}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {Object.keys(stars.byLevel).some((level) => level !== "full") && (
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      {Object.entries(stars.byLevel)
                        .map(([level, count]) => `${LEVEL_NAME[level as keyof typeof LEVEL_NAME]} ${count}★`)
                        .join(" · ")}
                    </span>
                  )}
                  <StarRating stars={stars.best} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: Achievement }) {
  const { current, target } = achievement.progress;
  return (
    <li
      className={`flex flex-col gap-1 rounded-lg border p-3 ${
        achievement.unlocked
          ? "border-brass-300/80 bg-brass-100/50 dark:border-brass-600/40 dark:bg-brass-700/10"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
      data-testid={`achievement-${achievement.key}`}
      data-unlocked={achievement.unlocked}
    >
      <p className={`flex items-center gap-1.5 text-sm font-semibold ${achievement.unlocked ? "text-brass-700 dark:text-brass-300" : "text-slate-800 dark:text-slate-200"}`}>
        <span aria-hidden>{achievement.unlocked ? "🏅" : "🔒"}</span>
        {achievement.title}
        {!achievement.unlocked && <span className="sr-only"> (locked)</span>}
      </p>
      <p className="text-xs text-slate-700 dark:text-slate-300">{achievement.description}</p>
      {achievement.unlocked ? (
        achievement.unlockedAt && <p className="text-xs text-slate-600 dark:text-slate-300">Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}</p>
      ) : (
        target > 1 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-felt-600 dark:bg-felt-500" style={{ width: `${Math.round((current / target) * 100)}%` }} />
            </div>
            <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">
              {current}/{target}
            </span>
          </div>
        )
      )}
    </li>
  );
}

function Achievements({ progression }: { progression: ProgressionResponse }) {
  const groups = useMemo(() => {
    const map = new Map<AchievementCategory, Achievement[]>();
    for (const achievement of progression.achievements) {
      map.set(achievement.category, [...(map.get(achievement.category) ?? []), achievement]);
    }
    return [...map.entries()];
  }, [progression.achievements]);
  return (
    <div className="space-y-6">
      {groups.map(([category, achievements]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-2 flex items-baseline gap-2 font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            {progression.categories[category]}
            <span className="text-xs font-normal tabular-nums text-slate-600 dark:text-slate-300">
              {achievements.filter((a) => a.unlocked).length}/{achievements.length}
            </span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((achievement) => (
              <AchievementTile key={achievement.key} achievement={achievement} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** XP and level, streak, skills, stars, achievements and the full history, in one place. */
export default function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const [progression, setProgression] = useState<ProgressionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRewardsVersion();

  useEffect(() => {
    let cancelled = false;
    getProgression()
      .then((response) => {
        if (!cancelled) setProgression(response);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load progress");
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100">Progress</h1>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Progress sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setParams(item.id === "overview" ? {} : { tab: item.id })}
            className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
              tab === item.id
                ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "history" ? (
        <PracticeHistory />
      ) : error ? (
        <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>
      ) : !progression ? (
        <p className="text-slate-600 dark:text-slate-300">Loading progress…</p>
      ) : tab === "achievements" ? (
        <Achievements progression={progression} />
      ) : (
        <Overview progression={progression} />
      )}
    </div>
  );
}
