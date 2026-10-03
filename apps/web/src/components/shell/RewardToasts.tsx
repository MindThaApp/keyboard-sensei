import { useEffect } from "react";
import { Link } from "react-router-dom";
import { dismissRewards, usePendingRewards } from "../../state/rewards";
import type { Rewards } from "../../services/api";
import { StarRating } from "../progress/ProgressBits";

const LEVEL_NAME: Record<string, string> = { full: "Full", simplified: "Simplified", easy: "Easy", melody: "Melody" };

/** Whether a reward has anything worth interrupting the learner for. */
const worthShowing = (rewards: Rewards): boolean =>
  rewards.xpGained > 0 ||
  rewards.newAchievements.length > 0 ||
  rewards.unlockedSongs.length > 0 ||
  rewards.dailyGoal.justMet;

function RewardCard({ id, rewards }: { id: number; rewards: Rewards }) {
  const big = rewards.newAchievements.length > 0 || rewards.unlockedSongs.length > 0 || rewards.leveledUp;

  useEffect(() => {
    const timer = window.setTimeout(() => dismissRewards(id), big ? 9000 : 5000);
    return () => window.clearTimeout(timer);
  }, [id, big]);

  return (
    <div
      role="status"
      className="pointer-events-auto w-full overflow-hidden rounded-lg border border-brass-400/70 bg-white text-sm text-slate-800 shadow-lg dark:border-brass-600/60 dark:bg-slate-900 dark:text-slate-100"
      data-testid="reward-toast"
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1 space-y-1.5">
          {rewards.xpGained > 0 && (
            <p className="font-semibold">
              <span className="text-brass-700 dark:text-brass-300">+{rewards.xpGained} XP</span>
              {rewards.leveledUp && <span> · Level up! You're now {rewards.level.title}</span>}
            </p>
          )}
          {rewards.dailyGoal.justMet && <p>Daily goal met: {rewards.dailyGoal.goalMinutes} minutes today. Streak: {rewards.streak.current} days</p>}
          {rewards.newStars.map((star) => (
            <p key={`${star.kind}-${star.id}-${star.level ?? ""}`} className="flex items-center gap-2">
              <StarRating stars={star.stars} />
              <span className="truncate">
                {star.title}
                {star.kind === "song" && star.level && star.level !== "full" ? ` (${LEVEL_NAME[star.level]})` : ""}
              </span>
            </p>
          ))}
          {rewards.newAchievements.map((achievement) => (
            <p key={achievement.key}>
              <span aria-hidden>🏅 </span>
              <span className="font-semibold">Achievement unlocked: {achievement.title}</span>
              <span className="block text-xs text-slate-600 dark:text-slate-300">{achievement.description}</span>
            </p>
          ))}
          {rewards.unlockedSongs.map((song) => (
            <p key={song.id}>
              <span aria-hidden>🎵 </span>
              New song unlocked:{" "}
              <Link to={`/play/${song.id}`} className="font-semibold text-felt-700 underline dark:text-felt-300" onClick={() => dismissRewards(id)}>
                {song.title}
              </Link>
            </p>
          ))}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          className="-mr-1 rounded px-1.5 text-lg leading-none text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
          onClick={() => dismissRewards(id)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** XP, stars, achievements and unlocked songs, announced as they are earned. */
export default function RewardToasts() {
  const pending = usePendingRewards();
  const visible = pending.filter((entry) => worthShowing(entry.rewards)).slice(-3);

  // Nothing to say (e.g. a fully farmed repeat): drop it straight away.
  useEffect(() => {
    for (const entry of pending) if (!worthShowing(entry.rewards)) dismissRewards(entry.id);
  }, [pending]);

  if (visible.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {visible.map((entry) => (
        <RewardCard key={entry.id} id={entry.id} rewards={entry.rewards} />
      ))}
    </div>
  );
}
