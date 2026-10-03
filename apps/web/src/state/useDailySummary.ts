import { useEffect, useState } from "react";
import { getDailySummary, type DailySummary } from "../services/api";
import { useRewardsVersion } from "./rewards";

/** Today's goal, streak and level; refreshed whenever a saved attempt brings rewards. */
export function useDailySummary(): DailySummary | null {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const version = useRewardsVersion();

  useEffect(() => {
    let cancelled = false;
    getDailySummary()
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [version]);

  return summary;
}
