import { useEffect, useState } from "react";
import { getSongStars, type PracticeLevel, type SongStars as SongStarsData } from "../../services/api";
import { useRewardsVersion } from "../../state/rewards";
import { LEVEL_LABELS } from "../play/practiceSession";
import { StarRating } from "./ProgressBits";

const LEVEL_CAP: Record<PracticeLevel, number> = { full: 3, simplified: 2, easy: 1, melody: 1 };

/**
 * The learner's mastery stars on one song, per practice level. Self-contained: give it
 * a song id and it loads (and, after every saved run, reloads) its own data.
 *
 * Pass `level` to also say what the current setting can earn (Full = 3★,
 * Simplified = 2★, Easy/Melody = 1★; one hand caps at 2★; loops earn none).
 */
export default function SongStars({ songId, level, className = "" }: { songId: string; level?: PracticeLevel; className?: string }) {
  const [data, setData] = useState<SongStarsData | null>(null);
  const version = useRewardsVersion();

  useEffect(() => {
    let cancelled = false;
    getSongStars(songId)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [songId, version]);

  if (!data) return null;
  const levels = (Object.keys(data.byLevel) as PracticeLevel[]).filter((key) => (data.byLevel[key] ?? 0) > 0);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700 dark:text-slate-300 ${className}`} data-testid="song-stars">
      <span className="flex items-center gap-1.5">
        <StarRating stars={data.best} className="text-base" />
        <span className="sr-only">Your best on this song</span>
      </span>
      {levels.length > 1 && (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {levels.map((key) => `${LEVEL_LABELS[key]} ${data.byLevel[key]}★`).join(" · ")}
        </span>
      )}
      {level && level !== "full" && (
        <span className="text-xs text-slate-600 dark:text-slate-300">{LEVEL_LABELS[level]} earns up to {LEVEL_CAP[level]}★</span>
      )}
    </div>
  );
}
