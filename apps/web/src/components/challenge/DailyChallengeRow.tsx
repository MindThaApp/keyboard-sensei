import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useRewardsVersion } from "../../state/rewards";
import { StarRating } from "../progress/ProgressBits";
import { ListRow } from "../ui";
import { getChallengeToday, type ChallengeTierState, type ChallengeTodayResponse } from "./challengeApi";

/** The tier to offer: the hardest unlocked one not yet cleared today, else the hardest unlocked. */
export function rowTier(today: ChallengeTodayResponse): ChallengeTierState | null {
  const open = today.tiers.filter((tier) => tier.unlocked);
  if (open.length === 0) return null;
  return [...open].reverse().find((tier) => !tier.cleared && tier.attemptsLeft > 0) ?? open[open.length - 1]!;
}

function subtitle(tier: ChallengeTierState): string {
  if (tier.cleared) return `${tier.name} cleared today. Best ${Math.round(tier.best ?? 0)}.`;
  if (tier.attemptsLeft === 0) return `${tier.name} · no attempts left today`;
  return `${tier.name} · ${tier.key.name} · ${tier.attemptsLeft} of 3 attempts left`;
}

/** Today's challenge, or null while it loads (or if it can't). Refreshes after any reward. */
export function useChallengeToday(): ChallengeTodayResponse | null {
  const [today, setToday] = useState<ChallengeTodayResponse | null>(null);
  const version = useRewardsVersion();

  useEffect(() => {
    let cancelled = false;
    getChallengeToday()
      .then((response) => {
        if (!cancelled) setToday(response);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [version]);

  return today;
}

/**
 * Today's "Also today" row for the daily challenge. Renders nothing until
 * the challenge has loaded and a tier is open.
 */
export default function DailyChallengeRow({ today }: { today: ChallengeTodayResponse | null }) {
  const tier = today ? rowTier(today) : null;
  if (!tier) return null;
  return (
    <ListRow
      as={Link}
      to={`/challenge?tier=${tier.tier}`}
      icon="★"
      iconColor="rgb(175 82 222)"
      title={
        <span className="flex flex-wrap items-center gap-2" data-testid="daily-challenge-row">
          Daily challenge
          <StarRating stars={tier.stars} />
        </span>
      }
      subtitle={subtitle(tier)}
      accessory="chevron"
    />
  );
}
