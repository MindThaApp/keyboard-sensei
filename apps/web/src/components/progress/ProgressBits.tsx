import type { ReactNode } from "react";
import type { LevelInfo } from "../../services/api";

/** Small pieces of progression UI shared by Today, Progress, the header and song lists. */

export function GoalRing({
  minutes,
  goal,
  size = 40,
  stroke = 4,
  children,
}: {
  minutes: number;
  goal: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const fraction = goal > 0 ? Math.min(1, minutes / goal) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const met = fraction >= 1;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={`transition-[stroke-dashoffset] duration-700 ${met ? "stroke-brass-500" : "stroke-felt-600 dark:stroke-felt-400"}`}
          data-testid="goal-ring-progress"
          data-fraction={fraction.toFixed(3)}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

/** Three stars, filled up to `stars`. Readable by screen readers as "2 of 3 stars". */
export function StarRating({ stars, max = 3, className = "" }: { stars: number; max?: number; className?: string }) {
  return (
    <span role="img" aria-label={`${stars} of ${max} stars`} title={`${stars} of ${max} stars`} className={`inline-flex shrink-0 gap-px leading-none ${className}`}>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} aria-hidden className={index < stars ? "text-brass-700 dark:text-brass-300" : "text-slate-400 dark:text-slate-500"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function LevelBar({ level, className = "" }: { level: LevelInfo; className?: string }) {
  const pct = Math.round((level.xpIntoLevel / level.xpForNextLevel) * 100);
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{level.title}</span>
        <span className="tabular-nums text-xs text-slate-600 dark:text-slate-300">
          {level.xpIntoLevel} / {level.xpForNextLevel} XP to level {level.level + 1}
        </span>
      </div>
      <div
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-label="XP towards the next level"
        aria-valuemin={0}
        aria-valuemax={level.xpForNextLevel}
        aria-valuenow={level.xpIntoLevel}
      >
        <div className="h-full rounded-full bg-brass-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const formatMinutes = (minutes: number): string => {
  const whole = Math.floor(minutes);
  return whole >= 60 ? `${Math.floor(whole / 60)}h ${whole % 60}m` : `${whole} min`;
};
