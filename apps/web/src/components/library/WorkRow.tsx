import { Link } from "react-router-dom";
import type { CatalogueTier, WorkSummary, WorkVersion } from "../../services/api";
import { Chip } from "../ui";
import {
  composerShort,
  defaultVersion,
  formatDuration,
  levelChipText,
  versionLabel,
  workBestScore,
  workStars,
  workSubtitle,
} from "../../utils/songLibrary";

interface ProgressMaps {
  stars: Record<string, { best: number }>;
  bests: Record<string, { score: number }>;
}

/** "Verified" when the file was checked against its source; a muted "Unrated" when it was never graded. */
export function TierChip({ tier }: { tier: CatalogueTier }) {
  if (tier === "verified") {
    return (
      <Chip tone="success" icon="✓">
        Verified
      </Chip>
    );
  }
  if (tier === "unrated") return <Chip>Unrated</Chip>;
  return null;
}

/** Earned stars are filled and gold; the rest are outlines, so an unplayed song never looks mastered. */
function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span role="img" aria-label={`${count} of ${max} stars`} className="inline-flex shrink-0 gap-px text-callout leading-none">
      {Array.from({ length: max }, (_, index) => (
        <span key={index} aria-hidden="true" className={index < count ? "text-warning" : "text-label-3"}>
          {index < count ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

const LEVEL_ORDER = ["beginner", "intermediate", "full"];
/** Chips read Beginner, Intermediate, Full whatever order the API ranks them in. */
const byLevel = (a: WorkVersion, b: WorkVersion) =>
  LEVEL_ORDER.indexOf(a.arrangement_level ?? "") - LEVEL_ORDER.indexOf(b.arrangement_level ?? "") || a.difficulty - b.difficulty;

/** A stable hue from the title, so each cover keeps its colour between visits. */
function coverHue(seed: string): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export interface ShelfCardProps {
  to: string;
  title: string;
  subtitle: string;
  durationSec: number;
  stars: number;
  tier?: CatalogueTier;
}

/** Shelf tile: a coloured cover, then title, composer, length and your stars. */
export function ShelfCard({ to, title, subtitle, durationSec, stars, tier }: ShelfCardProps) {
  const hue = coverHue(title);
  return (
    <Link
      to={to}
      className="group flex w-full flex-col gap-1 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tint"
    >
      <span
        aria-hidden="true"
        className="relative flex aspect-[4/3] w-full items-end justify-end overflow-hidden rounded-card p-2 text-title2 text-white transition-transform group-active:scale-[0.98]"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 62% 42%), hsl(${(hue + 40) % 360} 60% 58%))`,
        }}
      >
        ♪
        {tier === "verified" && (
          <span className="absolute left-2 top-2 rounded-pill bg-black/35 px-2 text-caption font-semibold text-white">✓ Verified</span>
        )}
      </span>
      <span className="mt-1 line-clamp-2 text-subhead font-semibold text-label">{title}</span>
      <span className="truncate text-footnote text-label-2a">
        {subtitle}
        {subtitle ? " · " : ""}
        {formatDuration(durationSec)}
      </span>
      <Stars count={stars} />
    </Link>
  );
}

/** A catalogue Work as a shelf tile; it opens the version `defaultVersion` picks. */
export function WorkCard({ work, stars }: { work: WorkSummary; stars: ProgressMaps["stars"] }) {
  const version = defaultVersion(work);
  if (!version) return null;
  return (
    <ShelfCard
      to={`/play/${version.id}`}
      title={work.title}
      subtitle={composerShort(work.composer)}
      durationSec={version.duration_sec}
      stars={workStars(work, stars)}
      tier={work.best_tier}
    />
  );
}

/**
 * One piece, one row: title, composer and catalogue number, a Verified badge, its level, and a chip
 * for each version (Beginner, Intermediate, Full) with its length. Tapping the row opens the easiest
 * version in the best tier; the chips open the others. Every target is at least 44px tall.
 */
export function WorkRow({ work, stars, bests }: { work: WorkSummary } & ProgressMaps) {
  const version = defaultVersion(work);
  if (!version) return null;
  const starCount = workStars(work, stars);
  const best = workBestScore(work, bests);
  const subtitle = workSubtitle(work);

  return (
    <li className="ks-row" data-testid="work-row">
      <Link to={`/play/${version.id}`} className="ks-row__main items-start" aria-label={`${work.title}${subtitle ? `, ${subtitle}` : ""}`}>
        <span className="ks-row__text">
          <span className="ks-row__title font-medium">{work.title}</span>
          <span className="ks-row__subtitle truncate">
            {subtitle || "Traditional"}
            {work.matched_alias && <span> · also “{work.matched_alias}”</span>}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TierChip tier={work.best_tier} />
            <Chip tone="tint">{levelChipText(work)}</Chip>
            {work.versions.length === 1 && <Chip>{formatDuration(version.duration_sec)}</Chip>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <Stars count={starCount} />
          {best !== undefined && (
            <span className="text-footnote tabular-nums text-label-2a" title="Your best play-along score">
              <span className="sr-only">Your best score </span>
              {Math.round(best)}
            </span>
          )}
        </span>
      </Link>
      {work.versions.length > 1 && (
        <nav aria-label={`Versions of ${work.title}`} className="flex flex-wrap items-center gap-x-1 px-[var(--ui-row-pad-x)] pb-1">
          {[...work.versions].sort(byLevel).map((item) => (
            <Link
              key={item.id}
              to={`/play/${item.id}`}
              className="inline-flex min-h-[44px] items-center rounded-pill focus-visible:outline focus-visible:outline-2 focus-visible:outline-tint"
              aria-label={`${versionLabel(item)} version, ${formatDuration(item.duration_sec)}${item.quality_tier === "verified" ? ", verified" : ""}`}
            >
              <Chip tone={item.id === version.id ? "tint" : "neutral"} className="h-[30px] px-2.5">
                {versionLabel(item)} {formatDuration(item.duration_sec)}
              </Chip>
            </Link>
          ))}
        </nav>
      )}
    </li>
  );
}
