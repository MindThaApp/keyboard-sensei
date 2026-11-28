import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { t, getLocale, useT } from "../../i18n";
import { getToday, type TodayResponse } from "../../services/api";
import { useRewardsVersion } from "../../state/rewards";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { practiceGymDrills, type PracticeGymDrill } from "../../data/practiceGymDrills";
import { pathLabel } from "../../utils/paths";
import { drillLink, lessonExerciseLink, songPracticeLink } from "../../utils/practiceLinks";
import { warmupFor } from "../../utils/warmup";
import { Button, Card, Chip, EmptyState, ErrorState, ListGroup, ListRow, ProgressRing, Skeleton } from "../ui";
import { StarRating } from "../progress/ProgressBits";
import DailyChallengeRow, { useChallengeToday } from "../challenge/DailyChallengeRow";

const handsLabel = (hands: "both" | "right" | "left") => t(`today.hands.${hands}`);
const levelLabel = (level: "full" | "simplified" | "easy" | "melody") => t(`today.level.${level}`);

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
  if (met) return t("today.goalMet");
  if (minutesToday > 0) {
    const left = Math.max(1, Math.ceil(goalMinutes - minutesToday));
    return t("today.minutesLeft", { n: left });
  }
  return t("today.ready");
}

function GoalCard({ today }: { today: TodayResponse }) {
  useT();
  const { minutesToday, goalMinutes, met } = today.dailyGoal;
  const { streak } = today;
  const hasMetGoal = streak.longest > 0 || streak.freezesAvailable > 0 || streak.frozenDays.length > 0;
  const whole = Math.floor(minutesToday);
  return (
    <Card as="section" aria-label={t("today.dailyGoal")}>
      <div className="flex items-center gap-4">
      <ProgressRing
        value={goalMinutes > 0 ? minutesToday / goalMinutes : 0}
        size={104}
        stroke={10}
        label={<span data-testid="goal-minutes">{whole}</span>}
        sublabel={t("today.minutesOfGoal", { goal: goalMinutes })}
        aria-label={t("today.minutesTodayAria", { done: whole, goal: goalMinutes })}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-title3 text-label">{goalHeadline(minutesToday, goalMinutes, met)}</h2>
        <p className="text-subhead text-label-2a" data-testid="streak-line">
          {streak.current > 0
            ? t("today.streakKeep")
            : t("today.streakStart")}
        </p>
        {streak.current > 0 && (
          <Chip tone="tint" icon="🔥">
            {t("today.streakDays", { n: streak.current })}
            {streak.longest > streak.current && t("today.streakBest", { n: streak.longest })}
          </Chip>
        )}
        {streak.frozenDays.length > 0 && (
          <p className="text-footnote text-label-2a" data-testid="freeze-used">
            <span aria-hidden>❄️ </span>{streak.frozenDays.length === 1 ? t("today.frozenOne") : t("today.frozenMany", { n: streak.frozenDays.length })}
          </p>
        )}
        {hasMetGoal && (
          <p className="text-footnote text-label-2a">
            {streak.freezesAvailable > 0
              ? t("today.freezesSaved", { n: streak.freezesAvailable })
              : t("today.freezeNext", { n: streak.daysToNextFreeze })}
          </p>
        )}
      </div>
      </div>
    </Card>
  );
}

function UpNextCard({ next }: { next: NonNullable<TodayResponse["continue"]> }) {
  useT();
  const percent = next.exercisesTotal > 0 ? Math.round((next.exercisesPassed / next.exercisesTotal) * 100) : 0;
  return (
    <Card as="section" aria-label={t("today.upNext")} padding="lg">
      <div className="flex flex-col gap-3">
      <div className="space-y-1">
        <p className="text-footnote font-semibold uppercase tracking-wide text-tint">{next.started ? t("today.continueLabel") : t("today.upNext")}</p>
        <h2 className="text-title2 text-label">{next.lessonTitle}</h2>
        <p className="text-subhead text-label-2a">{pathLabel(next.path)}</p>
      </div>
      {next.started && (
        <div>
          <div
            className="h-2 overflow-hidden rounded-pill bg-fill"
            role="progressbar"
            aria-label={t("today.exercisesPassedAria")}
            aria-valuemin={0}
            aria-valuemax={next.exercisesTotal}
            aria-valuenow={next.exercisesPassed}
          >
            <div className="h-full rounded-pill bg-tint-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-footnote text-label-2a">
            {t("today.exercisesPassed", { passed: next.exercisesPassed, total: next.exercisesTotal })}
          </p>
        </div>
      )}
      {next.exerciseTitle && <p className="text-subhead text-label-2">{t("today.nextExercise", { title: next.exerciseTitle })}</p>}
      <Link to={lessonExerciseLink(next.lessonId, next.exerciseId)} className="ks-btn ks-btn--filled ks-btn--lg mt-1">
        {next.started ? t("today.continueLesson") : t("today.startLesson")}
      </Link>
      </div>
    </Card>
  );
}

function AlsoToday({ today, warmup }: { today: TodayResponse; warmup: PracticeGymDrill | null }) {
  useT();
  const { review, song } = today;
  const challenge = useChallengeToday();
  return (
    <ListGroup header={t("today.alsoToday")} aria-label={t("today.alsoToday")}>
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
          subtitle={t("today.songReason", { reason: song.reason, hands: handsLabel(song.hands), level: levelLabel(song.level) })}
          accessory="chevron"
        />
      )}
      {review && (
        <ListRow
          as={Link}
          to={lessonExerciseLink(review.lessonId, review.exerciseId)}
          icon="↻"
          iconColor="rgb(88 86 214)"
          title={t("today.quickReview")}
          subtitle={
            <span data-testid="review-detail">
              {t("today.reviewDetail", { exercise: review.exerciseTitle, lesson: review.lessonTitle, score: Math.round(review.lastScore), mistakes: review.mistakeCount })}
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
          title={t("today.warmUp")}
          subtitle={t("today.warmUpSub", { label: warmup.label })}
          accessory="chevron"
        />
      )}
      <ListRow
        as={Link}
        to="/practice/notes"
        icon="♯"
        iconColor="rgb(255 45 85)"
        title={t("today.noteReading")}
        subtitle={t("today.noteReadingSub")}
        accessory="chevron"
      />
      <DailyChallengeRow today={challenge} />
      <ListRow
        as={Link}
        to="/import"
        icon="+"
        iconColor="var(--tint)"
        title={t("today.addSong")}
        subtitle={t("today.addSongSub")}
        accessory="chevron"
      />
    </ListGroup>
  );
}

function TodaySkeleton() {
  useT();
  return (
    <div className="space-y-4" role="status" aria-label={t("today.loading")}>
      <Skeleton height={136} radius={20} />
      <Skeleton height={200} radius={20} />
    </div>
  );
}

export default function TodayPage() {
  useT();
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

  const dateLabel = new Date(`${today?.today ?? new Date().toISOString().slice(0, 10)}T12:00:00`).toLocaleDateString(getLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-footnote font-semibold uppercase tracking-wide text-label-2a">{dateLabel}</p>
        <h1 className="text-large-title text-label">{t("today.title")}</h1>
      </header>

      {error && !today ? (
        <ErrorState
          title={t("today.loadError")}
          message={t("common.checkConnection")}
          action={<Button variant="filled" onClick={() => setAttempt((n) => n + 1)}>{t("common.tryAgain")}</Button>}
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
  useT();
  const warmup = warmupForLearner(today);
  const next = today.continue;
  const hero = next ? (
    <UpNextCard next={next} />
  ) : (
    <Card as="section" padding="lg">
      <EmptyState
        title={t("today.allDone")}
        message={t("today.allDoneMsg")}
        action={<Link to="/learn" className="ks-btn ks-btn--tinted">{t("today.browseLessons")}</Link>}
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
        <>
          <section aria-labelledby="recent-achievements" className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-achievements" className="text-headline text-label">{t("today.recentAchievements")}</h2>
              <Link to="/progress?tab=achievements" className="text-subhead text-tint">{t("today.allAchievements")}</Link>
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
        </>
      )}
    </div>
  );
}
