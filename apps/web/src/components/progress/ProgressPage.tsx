import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getProgression, type Achievement, type AchievementCategory, type ProgressionResponse } from "../../services/api";
import { useProgressStore } from "../../state/progressStore";
import { useRewardsVersion } from "../../state/rewards";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { pathLabel, pathsInOrder } from "../../utils/paths";
import { songPracticeLink } from "../../utils/practiceLinks";
import { LEVEL_LABELS } from "../play/practiceSession";
import { levelTitle } from "../ui/glossary";
import { Button, Card, EmptyState, ErrorState, ProgressRing, SegmentedControl, Skeleton } from "../ui";
import PracticeHistory from "./PracticeHistory";
import { buildWeek, formatMinutes, StarRating, WeekDots } from "./ProgressBits";

type Tab = "overview" | "achievements" | "history";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "achievements", label: "Achievements" },
  { value: "history", label: "History" },
];
const isTab = (value: string | null): value is Tab => TABS.some((tab) => tab.value === value);

const MEDALS_SHOWN = 6;

/**
 * The achievement count the learner sees. The API only returns achievements whose content
 * exists in this library (a genre with no Essentials piece is hidden), so the total is
 * "available here", not a fixed catalogue size.
 */
const achievementCount = (achievements: Achievement[]) => ({
  unlocked: achievements.filter((a) => a.unlocked).length,
  total: achievements.length,
});

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card padding="md">
      <p className="text-footnote font-semibold uppercase tracking-wide text-label-2a">{label}</p>
      <p className="mt-1 text-title1 tabular-nums text-label">{value}</p>
      {hint && <p className="text-footnote text-label-2a">{hint}</p>}
    </Card>
  );
}

function LevelCard({ progression }: { progression: ProgressionResponse }) {
  const { level } = progression;
  return (
    <Card as="section" aria-label="Level">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={level.xpForNextLevel > 0 ? level.xpIntoLevel / level.xpForNextLevel : 0}
          size={88}
          stroke={9}
          label={level.level}
          sublabel="level"
          aria-label={`Level ${level.level}, ${level.xpIntoLevel} of ${level.xpForNextLevel} points to the next level`}
        />
        <div className="min-w-0">
          <h2 className="text-title3 text-label">{levelTitle(level.level, level.tier)}</h2>
          <p className="text-subhead text-label-2a">
            {level.xpIntoLevel} / {level.xpForNextLevel} points to level {level.level + 1}
          </p>
        </div>
      </div>
    </Card>
  );
}

function WeekCard({ progression }: { progression: ProgressionResponse }) {
  const week = useMemo(
    () => buildWeek(progression.today, progression.calendar, progression.frozenDays),
    [progression.today, progression.calendar, progression.frozenDays],
  );
  const metDays = week.filter((day) => day.state === "met").length;
  return (
    <Card as="section" aria-label="This week">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-headline text-label">This week</h2>
        <p className="text-footnote text-label-2a">
          {metDays} of 7 days met · goal {progression.dailyGoal.goalMinutes} min a day
        </p>
      </div>
      <WeekDots days={week} />
    </Card>
  );
}

function Skills({ progression }: { progression: ProgressionResponse }) {
  const strongest = Math.max(1, ...progression.skills.map((skill) => skill.points));
  if (progression.skills.every((skill) => skill.points === 0)) {
    return <p className="text-subhead text-label-2a">Skill points start counting once you finish a lesson.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {progression.skills.map((skill) => (
        <li key={skill.id}>
          <div className="flex items-baseline justify-between text-subhead">
            <span className="text-label">{skill.label}</span>
            <span className="tabular-nums text-footnote text-label-2a" data-testid={`skill-${skill.id}`}>
              {skill.points} pts
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-pill bg-fill">
            <div className="h-full rounded-pill bg-tint-fill" style={{ width: `${Math.round((skill.points / strongest) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Medals({ achievements }: { achievements: Achievement[] }) {
  const { unlocked, total } = achievementCount(achievements);
  const earned = achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))
    .slice(0, MEDALS_SHOWN);
  return (
    <section aria-labelledby="medals-heading">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h2 id="medals-heading" className="text-headline text-label">
          Achievements <span className="text-subhead font-normal tabular-nums text-label-2a">{unlocked} of {total}</span>
        </h2>
        <Link to="/progress?tab=achievements" className="inline-flex min-h-hit items-center text-subhead text-tint">See all</Link>
      </div>
      {earned.length === 0 ? (
        <Card>
          <EmptyState title="No medals yet" message="Finish your first lesson to earn one." />
        </Card>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {earned.map((achievement) => (
            <li key={achievement.key} className="flex flex-col items-center gap-1 rounded-card bg-cell p-3 text-center shadow-[var(--shadow-1)]">
              <span className="text-title2" aria-hidden>🏅</span>
              <span className="text-footnote font-semibold text-label">{achievement.title}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StarsCard({ progression }: { progression: ProgressionResponse }) {
  const lessons = useProgressStore((s) => s.lessons);
  const starredSongs = Object.entries(progression.songStars)
    .filter(([, stars]) => stars.best > 0)
    .sort(([, a], [, b]) => b.best - a.best);
  const totalSongStars = starredSongs.reduce((sum, [, stars]) => sum + stars.best, 0);
  const totalLessonStars = Object.values(progression.lessonStars).reduce((sum, stars) => sum + stars, 0);

  if (totalLessonStars === 0 && starredSongs.length === 0) {
    return (
      <Card as="section" aria-label="Stars">
        <EmptyState title="No stars yet" message="Pass an exercise to earn stars on a lesson, or play a song to the end, hitting 70% of the notes." />
      </Card>
    );
  }
  return (
    <Card as="section" aria-label="Stars">
      <h2 className="text-headline text-label">Stars</h2>
      {totalLessonStars > 0 && (
        <ul className="mt-2 space-y-2">
          {pathsInOrder(lessons).map((path) => {
            const pathLessons = lessons.filter((lesson) => lesson.path === path);
            const earned = pathLessons.reduce((sum, lesson) => sum + (progression.lessonStars[lesson.id] ?? 0), 0);
            if (earned === 0) return null;
            return (
              <li key={path} className="flex items-center justify-between gap-3 text-subhead">
                <Link to="/learn" className="inline-flex min-h-hit items-center text-label">{pathLabel(path)}</Link>
                <span className="tabular-nums text-label-2">
                  <span className="text-warning" aria-hidden>★ </span>
                  {earned} / {pathLessons.length * 3}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {starredSongs.length > 0 && (
        <>
          <h3 className="mt-4 text-subhead font-semibold text-label">
            Songs · <span className="tabular-nums">{totalSongStars}</span> stars
          </h3>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {starredSongs.map(([songId, stars]) => (
              <li key={songId} className="flex items-center justify-between gap-3 text-subhead">
                <Link to={songPracticeLink(songId)} className="min-w-0 truncate text-label">
                  {progression.songTitles[songId] ?? songId}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {Object.keys(stars.byLevel).some((level) => level !== "full") && (
                    <span className="text-footnote text-label-2a">
                      {Object.entries(stars.byLevel)
                        .map(([level, count]) => `${LEVEL_LABELS[level as keyof typeof LEVEL_LABELS]} ${count}★`)
                        .join(" · ")}
                    </span>
                  )}
                  <StarRating stars={stars.best} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Overview({ progression }: { progression: ProgressionResponse }) {
  const { device } = useDeviceClass();
  const loaded = useProgressStore((s) => s.loaded);
  const loadAll = useProgressStore((s) => s.loadAll);
  useEffect(() => {
    if (!loaded) void loadAll();
  }, [loaded, loadAll]);

  const { streak } = progression;
  return (
    <div className="space-y-4">
      <div className={device === "phone" ? "space-y-4" : "grid grid-cols-2 items-start gap-4"}>
        <div className="space-y-4">
          <LevelCard progression={progression} />
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Practice" value={formatMinutes(progression.practiceMinutes)} hint={`${progression.level.totalXp.toLocaleString()} points total`} />
            <StatCard
              label="Streak"
              value={`${streak.current} day${streak.current === 1 ? "" : "s"}`}
              hint={streak.longest > 0 ? `Best ${streak.longest}` : "Meet your goal to start one"}
            />
          </div>
          <WeekCard progression={progression} />
        </div>
        <div className="space-y-4">
          <Medals achievements={progression.achievements} />
          <StarsCard progression={progression} />
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card as="section" aria-label="Skills">
          <h2 className="mb-3 text-headline text-label">Skills</h2>
          <Skills progression={progression} />
          <p className="mt-3 text-footnote text-label-2a">Earned from completed lessons (more for more stars) and from song stars.</p>
        </Card>
        {progression.recentXp.length > 0 && (
          <Card as="section" aria-label="Recent points">
            <h2 className="mb-2 text-headline text-label">Recent points</h2>
            <ul className="space-y-1.5">
              {progression.recentXp.map((entry, index) => (
                <li key={index} className="flex justify-between gap-3 text-subhead text-label-2">
                  <span className="truncate">{entry.reason}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-tint">+{entry.amount}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function AchievementTile({ achievement }: { achievement: Achievement }) {
  const { current, target } = achievement.progress;
  return (
    <li
      className="flex flex-col gap-1 rounded-card bg-cell p-3 shadow-[var(--shadow-1)]"
      data-testid={`achievement-${achievement.key}`}
      data-unlocked={achievement.unlocked}
    >
      <p className="flex items-center gap-1.5 text-subhead font-semibold text-label">
        <span aria-hidden>{achievement.unlocked ? "🏅" : "🔒"}</span>
        {achievement.title}
        {!achievement.unlocked && <span className="sr-only"> (locked)</span>}
      </p>
      <p className="text-footnote text-label-2a">{achievement.description}</p>
      {achievement.unlocked ? (
        achievement.unlockedAt && <p className="text-footnote text-label-2a">Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}</p>
      ) : (
        target > 1 && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fill">
              <div className="h-full rounded-pill bg-tint-fill" style={{ width: `${Math.round((current / target) * 100)}%` }} />
            </div>
            <span className="tabular-nums text-footnote text-label-2a">
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
  const { unlocked, total } = achievementCount(progression.achievements);
  return (
    <div className="space-y-6">
      <p className="text-subhead text-label-2a" data-testid="achievement-total">
        {unlocked} of {total} unlocked
      </p>
      {groups.map(([category, achievements]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="mb-2 flex items-baseline gap-2 px-1 text-headline text-label">
            {progression.categories[category]}
            <span className="text-footnote font-normal tabular-nums text-label-2a">
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

function ProgressSkeleton(): ReactNode {
  return (
    <div className="space-y-4" role="status" aria-label="Loading progress">
      <Skeleton height={112} radius={20} />
      <Skeleton height={96} radius={20} />
      <Skeleton height={120} radius={20} />
    </div>
  );
}

/** Level, streak, week, stars and achievements, with the full history on its own tab. */
export default function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const [progression, setProgression] = useState<ProgressionResponse | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = useRewardsVersion();

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getProgression()
      .then((response) => {
        if (!cancelled) setProgression(response);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [version, attempt]);

  return (
    <div className="space-y-5">
      <h1 className="text-large-title text-label">Progress</h1>
      <SegmentedControl
        aria-label="Progress sections"
        options={TABS}
        value={tab}
        onChange={(value) => setParams(value === "overview" ? {} : { tab: value })}
      />
      {tab === "history" ? (
        <PracticeHistory />
      ) : error && !progression ? (
        <ErrorState
          title="Couldn't load your progress"
          message="Check your connection and try again."
          action={<Button variant="filled" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
        />
      ) : !progression ? (
        <ProgressSkeleton />
      ) : tab === "achievements" ? (
        <Achievements progression={progression} />
      ) : (
        <Overview progression={progression} />
      )}
    </div>
  );
}
