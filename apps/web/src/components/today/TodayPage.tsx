import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getToday, type TodayResponse } from "../../services/api";
import { useRewardsVersion } from "../../state/rewards";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { practiceGymDrills, type PracticeGymDrill } from "../../data/practiceGymDrills";
import { pathLabel } from "../../utils/paths";
import { drillLink, lessonExerciseLink, songPracticeLink } from "../../utils/practiceLinks";
import { warmupFor } from "../../utils/warmup";
import { Advanced, Button, Card, Chip, EmptyState, ErrorState, ListGroup, ListRow, ProgressRing, Skeleton } from "../ui";
import { StarRating } from "../progress/ProgressBits";
import DailyChallengeRow, { rowTier, useChallengeToday } from "../challenge/DailyChallengeRow";

const HANDS_LABEL = { both: "both hands", right: "right hand", left: "left hand" } as const;
const LEVEL_LABEL = { full: "Full", simplified: "Simplified", easy: "Easy", melody: "Melody" } as const;

/** Lessons a learner finishes before the Gym's fifth-and-chord drills make sense. */
const LESSONS_BEFORE_VARIED_WARMUPS = 4;

/**
 * A warm-up only from skills the learner has finished: none before the first lesson is
 * done, just the five-finger pattern for the first few, then the usual rotation.
 */
function warmupForLearner(today: TodayResponse): PracticeGymDrill | null {
  if (today.completedLessons < 1) return null;
  if (today.completedLessons < LESSONS_BEFORE_VARIED_WARMUPS) {
    return practiceGymDrills.find((drill) => drill.id === "gym-five-finger") ?? null;
  }
  return warmupFor(today.level.level, today.today);
}

function goalHeadline(minutesToday: number, goalMinutes: number, met: boolean): string {
  if (met) return "Goal met today. Nice work.";
  if (minutesToday > 0) {
    const left = Math.max(1, Math.ceil(goalMinutes - minutesToday));
    return `${left} more minute${left === 1 ? "" : "s"} today`;
  }
  return "Ready for today's practice?";
}

function GoalCard({ today }: { today: TodayResponse }) {
  const { minutesToday, goalMinutes, met } = today.dailyGoal;
  const { streak } = today;
  const hasMetGoal = streak.longest > 0 || streak.freezesAvailable > 0 || streak.frozenDays.length > 0;
  const whole = Math.floor(minutesToday);
  return (
    <Card as="section" aria-label="Daily goal">
      <div className="flex items-center gap-4">
      <ProgressRing
        value={goalMinutes > 0 ? minutesToday / goalMinutes : 0}
        size={104}
        stroke={10}
        label={<span data-testid="goal-minutes">{whole}</span>}
        sublabel={`of ${goalMinutes} min`}
        aria-label={`${whole} of ${goalMinutes} minutes today`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-title3 text-label">{goalHeadline(minutesToday, goalMinutes, met)}</h2>
        <p className="text-subhead text-label-2a" data-testid="streak-line">
          {streak.current > 0
            ? "Practise a little every day to build your streak."
            : "Meet your goal to start a streak."}
        </p>
        {streak.current > 0 && (
          <Chip tone="tint" icon="🔥">
            {streak.current}-day streak
            {streak.longest > streak.current && ` · best ${streak.longest}`}
          </Chip>
        )}
        {streak.frozenDays.length > 0 && (
          <p className="text-footnote text-label-2a" data-testid="freeze-used">
            <span aria-hidden>❄️ </span>A day-off pass covered {streak.frozenDays.length === 1 ? "a missed day" : `${streak.frozenDays.length} missed days`}.
          </p>
        )}
        {hasMetGoal && (
          <p className="text-footnote text-label-2a">
            {streak.freezesAvailable > 0
              ? `${streak.freezesAvailable} day-off pass${streak.freezesAvailable > 1 ? "es" : ""} saved. A missed day won't break your streak.`
              : `Meet your goal ${streak.daysToNextFreeze} more day${streak.daysToNextFreeze === 1 ? "" : "s"} in a row to earn a day-off pass.`}
          </p>
        )}
      </div>
      </div>
    </Card>
  );
}

function UpNextCard({ next }: { next: NonNullable<TodayResponse["continue"]> }) {
  const percent = next.exercisesTotal > 0 ? Math.round((next.exercisesPassed / next.exercisesTotal) * 100) : 0;
  return (
    <Card as="section" aria-label="Up next" padding="lg">
      <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <p className="text-footnote font-semibold uppercase tracking-wide text-tint">{next.started ? "Continue" : "Up next"}</p>
        <h2 className="text-title2 text-label">{next.lessonTitle}</h2>
        <p className="text-subhead text-label-2a">{pathLabel(next.path)}</p>
      </div>
      {next.started && (
        <div>
          <div
            className="h-2 overflow-hidden rounded-pill bg-fill"
            role="progressbar"
            aria-label="Exercises passed in this lesson"
            aria-valuemin={0}
            aria-valuemax={next.exercisesTotal}
            aria-valuenow={next.exercisesPassed}
          >
            <div className="h-full rounded-pill bg-tint-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-footnote text-label-2a">
            {next.exercisesPassed} of {next.exercisesTotal} exercises passed
          </p>
        </div>
      )}
      {next.exerciseTitle && <p className="text-subhead text-label-2">Next: {next.exerciseTitle}</p>}
      <Link to={lessonExerciseLink(next.lessonId, next.exerciseId)} className="ks-btn ks-btn--filled ks-btn--lg mt-1">
        {next.started ? "Continue lesson" : "Start lesson"}
      </Link>
      </div>
    </Card>
  );
}

/** Beginners (level 3 or below) get a note-reading nudge once a week, on Wednesdays. */
const showNoteReading = (today: TodayResponse): boolean =>
  today.level.level <= 3 && new Date(`${today.today}T00:00:00Z`).getUTCDay() === 3;

function AlsoToday({ today, warmup }: { today: TodayResponse; warmup: PracticeGymDrill | null }) {
  const { review, song } = today;
  // A new learner sees the ring and one "Up next" card, not an empty list.
  const noteReading = showNoteReading(today);
  const challenge = useChallengeToday();
  const hasChallenge = challenge !== null && rowTier(challenge) !== null;
  if (!song && !review && !warmup && !noteReading && !hasChallenge) return null;
  return (
    <ListGroup header="Also today" aria-label="Also today">
      {song && (
        <ListRow
          as={Link}
          to={songPracticeLink(song.songId, { hands: song.hands, level: song.level })}
          icon="♪"
          iconColor="rgb(255 149 0)"
          title={
            <span className="flex flex-wrap items-center gap-2" data-testid="song-deep-link">
              {song.title}
              {song.stars > 0 && <StarRating stars={song.stars} />}
            </span>
          }
          subtitle={`${song.reason} Starts with the ${HANDS_LABEL[song.hands]}, ${LEVEL_LABEL[song.level]} level.`}
          accessory="chevron"
        />
      )}
      {review && (
        <ListRow
          as={Link}
          to={lessonExerciseLink(review.lessonId, review.exerciseId)}
          icon="↻"
          iconColor="rgb(88 86 214)"
          title="Quick review"
          subtitle={
            <span data-testid="review-detail">
              {review.exerciseTitle} from “{review.lessonTitle}”. Last time you scored {Math.round(review.lastScore)}
              {review.mistakeCount > 0 && `, with ${review.mistakeCount} note${review.mistakeCount === 1 ? "" : "s"} to fix`}.
            </span>
          }
          accessory="chevron"
        />
      )}
      {warmup && (
        <ListRow
          as={Link}
          to={drillLink(warmup.id)}
          icon="♫"
          iconColor="rgb(52 199 89)"
          title="Warm up your fingers"
          subtitle={`${warmup.label} · 2 min`}
          accessory="chevron"
        />
      )}
      {noteReading && (
        <ListRow
          as={Link}
          to="/practice/notes"
          icon="♯"
          iconColor="rgb(255 45 85)"
          title="Note reading"
          subtitle="Name notes on the staff · 2 min"
          accessory="chevron"
        />
      )}
      <DailyChallengeRow today={challenge} />
    </ListGroup>
  );
}

function TodaySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading today">
      <Skeleton height={136} radius={20} />
      <Skeleton height={200} radius={20} />
    </div>
  );
}

export default function TodayPage() {
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const version = useRewardsVersion();
  const { device } = useDeviceClass();

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getToday()
      .then((response) => {
        if (!cancelled) setToday(response);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [version, attempt]);

  const dateLabel = new Date(`${today?.today ?? new Date().toISOString().slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-footnote font-semibold uppercase tracking-wide text-label-2a">{dateLabel}</p>
        <h1 className="text-large-title text-label">Today</h1>
      </header>

      {error && !today ? (
        <ErrorState
          title="Couldn't load today's plan"
          message="Check your connection and try again."
          action={<Button variant="filled" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
        />
      ) : !today ? (
        <TodaySkeleton />
      ) : (
        <TodayContent today={today} wide={device !== "phone"} />
      )}
    </div>
  );
}

function TodayContent({ today, wide }: { today: TodayResponse; wide: boolean }) {
  const warmup = warmupForLearner(today);
  const next = today.continue;
  const hero = next ? (
    <UpNextCard next={next} />
  ) : (
    <Card as="section" padding="lg">
      <EmptyState
        title="Every lesson complete"
        message="Polish your stars, or pick a song."
        action={<Link to="/learn" className="ks-btn ks-btn--tinted">Browse lessons</Link>}
      />
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className={wide ? "grid grid-cols-2 items-start gap-4" : "space-y-4"}>
        <GoalCard today={today} />
        {hero}
      </div>
      <AlsoToday today={today} warmup={warmup} />
      {today.recentAchievements.length > 0 && (
        <Advanced>
          <section aria-labelledby="recent-achievements" className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-achievements" className="text-headline text-label">Recent achievements</h2>
              <Link to="/progress?tab=achievements" className="text-subhead text-tint">All achievements</Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {today.recentAchievements.map((achievement) => (
                <li key={achievement.key} className="rounded-card bg-cell px-3 py-2.5 shadow-[var(--shadow-1)]">
                  <p className="text-subhead font-semibold text-label"><span aria-hidden>🏅 </span>{achievement.title}</p>
                  <p className="text-footnote text-label-2a">{achievement.description}</p>
                </li>
              ))}
            </ul>
          </section>
        </Advanced>
      )}
    </div>
  );
}
