import { useRef } from "react";
import type { LoopRange } from "@keyboard-sensei/playalong-core";

interface Props {
  barCount: number;
  /** 0-based, inclusive. */
  range: LoopRange;
  onChange: (range: LoopRange) => void;
  disabled?: boolean;
}

const fieldClass =
  "w-16 rounded-md border border-slate-300 bg-transparent px-1.5 py-0.5 text-xs tabular-nums disabled:opacity-50 dark:border-slate-600";

/**
 * Pick the bars to loop: drag across the strip (one cell per bar, scaled to fit),
 * or set the first and last bar with the steppers. Bars are shown 1-based.
 */
export default function LoopBarStrip({ barCount, range, onChange, disabled = false }: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<number | null>(null);
  const last = Math.max(0, barCount - 1);

  const barAt = (clientX: number): number => {
    const rect = stripRef.current!.getBoundingClientRect();
    const fraction = (clientX - rect.left) / Math.max(1, rect.width);
    return Math.max(0, Math.min(last, Math.floor(fraction * barCount)));
  };

  const set = (startBar: number, endBar: number) => {
    const start = Math.max(0, Math.min(last, startBar));
    onChange({ startBar: start, endBar: Math.max(start, Math.min(last, endBar)) });
  };

  const left = (range.startBar / Math.max(1, barCount)) * 100;
  const width = ((range.endBar - range.startBar + 1) / Math.max(1, barCount)) * 100;
  // A label every few bars, so a long song's strip doesn't become a smear of numbers.
  const labelEvery = barCount <= 16 ? 1 : barCount <= 48 ? 4 : barCount <= 128 ? 8 : 16;

  return (
    <div className="space-y-1.5">
      <div
        ref={stripRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Bars to loop: drag across the bars"
        aria-valuemin={1}
        aria-valuemax={barCount}
        aria-valuenow={range.startBar + 1}
        aria-valuetext={`Bars ${range.startBar + 1} to ${range.endBar + 1} of ${barCount}`}
        aria-disabled={disabled}
        className={`relative h-8 touch-none select-none overflow-hidden rounded-md border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800 ${
          disabled ? "opacity-50" : "cursor-pointer"
        }`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const bar = barAt(e.clientX);
          anchorRef.current = bar;
          set(bar, bar);
        }}
        onPointerMove={(e) => {
          if (disabled || anchorRef.current === null) return;
          const bar = barAt(e.clientX);
          set(Math.min(anchorRef.current, bar), Math.max(anchorRef.current, bar));
        }}
        onPointerUp={() => {
          anchorRef.current = null;
        }}
        onPointerCancel={() => {
          anchorRef.current = null;
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          const length = range.endBar - range.startBar;
          if (e.key === "ArrowRight" && range.endBar < last) set(range.startBar + 1, range.startBar + 1 + length);
          else if (e.key === "ArrowLeft" && range.startBar > 0) set(range.startBar - 1, range.startBar - 1 + length);
          else return;
          e.preventDefault();
        }}
      >
        {Array.from({ length: barCount }, (_, bar) =>
          bar % labelEvery === 0 ? (
            <span
              key={bar}
              className="pointer-events-none absolute top-0 h-full border-l border-slate-300 pl-0.5 text-[10px] leading-8 text-slate-500 dark:border-slate-600"
              style={{ left: `${(bar / barCount) * 100}%` }}
            >
              {bar + 1}
            </span>
          ) : null,
        )}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-sm border-2 border-felt-600 bg-felt-500/25 dark:border-felt-400"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
        <label className="flex items-center gap-1">
          From bar
          <input
            type="number"
            className={fieldClass}
            min={1}
            max={barCount}
            value={range.startBar + 1}
            disabled={disabled}
            onChange={(e) => {
              const start = Number(e.target.value) - 1;
              if (Number.isFinite(start)) set(start, Math.max(start, range.endBar));
            }}
          />
        </label>
        <label className="flex items-center gap-1">
          to
          <input
            type="number"
            className={fieldClass}
            min={range.startBar + 1}
            max={barCount}
            value={range.endBar + 1}
            disabled={disabled}
            onChange={(e) => {
              const end = Number(e.target.value) - 1;
              if (Number.isFinite(end)) set(Math.min(range.startBar, end), end);
            }}
          />
        </label>
        <span className="text-slate-500">of {barCount}</span>
      </div>
    </div>
  );
}
