import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useFocusMode } from "../../hooks/useFocusMode";
import { dismissRewards, usePendingRewards } from "../../state/rewards";
import type { Rewards } from "../../services/api";
import { StarRating } from "../progress/ProgressBits";
import { useToast } from "../ui/Toast";
import "./shell.css";

const MAX_ACHIEVEMENTS_SHOWN = 3;
const LEVEL_NAME: Record<string, string> = { full: "Full", simplified: "Simplified", easy: "Easy", melody: "Melody" };

/** Whether a reward has anything worth interrupting the learner for. */
const worthShowing = (rewards: Rewards): boolean =>
  rewards.xpGained > 0 ||
  rewards.newAchievements.length > 0 ||
  rewards.unlockedSongs.length > 0 ||
  rewards.dailyGoal.justMet;

function rewardTitle(rewards: Rewards): string {
  if (rewards.xpGained > 0) {
    return rewards.leveledUp ? `+${rewards.xpGained} XP, level up!` : `+${rewards.xpGained} XP`;
  }
  if (rewards.newAchievements.length > 0) return "Achievement unlocked";
  if (rewards.unlockedSongs.length > 0) return "New song unlocked";
  return "Daily goal met";
}

function RewardBody({ rewards }: { rewards: Rewards }) {
  return (
    <span className="ks-reward-lines" data-testid="reward-toast">
      {rewards.leveledUp && <span>You are now {rewards.level.title}</span>}
      {rewards.dailyGoal.justMet && (
        <span>
          Daily goal met: {rewards.dailyGoal.goalMinutes} minutes today. Streak: {rewards.streak.current} days
        </span>
      )}
      {rewards.newStars.map((star) => (
        <span key={`${star.kind}-${star.id}-${star.level ?? ""}`}>
          <StarRating stars={star.stars} /> {star.title}
          {star.kind === "song" && star.level && star.level !== "full" ? ` (${LEVEL_NAME[star.level]})` : ""}
        </span>
      ))}
      {rewards.newAchievements.slice(0, MAX_ACHIEVEMENTS_SHOWN).map((achievement) => (
        <span key={achievement.key}>
          {rewards.xpGained > 0 ? "Achievement: " : ""}
          {achievement.title}, {achievement.description}
        </span>
      ))}
      {rewards.newAchievements.length > MAX_ACHIEVEMENTS_SHOWN && (
        <Link to="/progress?tab=achievements">
          and {rewards.newAchievements.length - MAX_ACHIEVEMENTS_SHOWN} more achievements
        </Link>
      )}
      {rewards.unlockedSongs.map((song) => (
        <Link key={song.id} to={`/play/${song.id}`}>
          New song: {song.title}
        </Link>
      ))}
    </span>
  );
}

/**
 * XP, stars, achievements and unlocked songs, announced as they are earned. Each reward
 * is handed to the shared toast stack (above the tab bar). During focus mode nothing is
 * shown and rewards stay queued in the store until the learner leaves it.
 */
export default function RewardToasts() {
  const pending = usePendingRewards();
  const toast = useToast();
  const { active: focused } = useFocusMode();

  useEffect(() => {
    if (focused) return;
    for (const entry of pending) {
      dismissRewards(entry.id);
      if (!worthShowing(entry.rewards)) continue;
      const { rewards } = entry;
      const big = rewards.newAchievements.length > 0 || rewards.unlockedSongs.length > 0 || rewards.leveledUp;
      toast.show({
        tone: "reward",
        title: rewardTitle(rewards),
        body: <RewardBody rewards={rewards} />,
        duration: big ? 9000 : 5000,
      });
    }
  }, [pending, focused, toast]);

  return null;
}
