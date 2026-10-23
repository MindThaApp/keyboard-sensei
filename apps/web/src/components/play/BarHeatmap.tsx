import { useRef, useState, type PointerEvent } from "react";
import type { LoopRange } from "@keyboard-sensei/playalong-core";
import { barTone, type BarResult } from "./practiceSession";

interface Props {
  results: readonly BarResult[];
  /** A bar was tapped, or several dragged across: song bars, 0-based and inclusive. */
  onSelect: (range: LoopRange) => void;
}

const TONE_TEXT: Record<ReturnType<typeof barTone>, string> = {
  good: "went well",
  fair: "some missed",
  poor: "tricky",
  empty: "no notes",
};

/**
 * One cell per bar of the run, coloured from the per-note judgements (≥ 90% green,
 * 60–89% amber, under 60% red with a hatch so it never relies on colour alone, grey
 * for a bar with no notes). Tap a bar, or drag across several, to loop them.
 */
export default function BarHeatmap({ results, onSelect }: Props) {
  const anchorRef = useRef<number | null>(null);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);

  const indexAt = (event: PointerEvent): number | null => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const cell = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-bar-cell]") : null;
    return cell ? Number(cell.dataset.barCell) : null;
  };

  const finish = () => {
    if (preview) {
      const from = Math.min(preview.from, preview.to);
      const to = Math.max(preview.from, preview.to);
      onSelect({ startBar: results[from]!.barIndex, endBar: results[to]!.barIndex });
    }
    anchorRef.current = null;
    setPreview(null);
  };

  const selected = (i: number) => preview !== null && i >= Math.min(preview.from, preview.to) && i <= Math.max(preview.from, preview.to);

  return (
    <div
      className="ks-heatmap"
      role="group"
      aria-label="How each bar went. Choose a bar to loop it."
      onPointerMove={(event) => {
        if (anchorRef.current === null) return;
        const index = indexAt(event);
        if (index !== null) setPreview({ from: anchorRef.current, to: index });
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        anchorRef.current = null;
        setPreview(null);
      }}
    >
      {results.map((bar, i) => {
        const tone = barTone(bar);
        const label =
          bar.total === 0
            ? `Bar ${bar.barIndex + 1}: no notes`
            : `Bar ${bar.barIndex + 1}: ${bar.played} of ${bar.total} notes, ${TONE_TEXT[tone]}`;
        return (
          <button
            key={bar.barIndex}
            type="button"
            className="ks-heatmap__cell"
            data-bar-cell={i}
            data-tone={tone}
            data-selected={selected(i) || undefined}
            aria-label={label}
            title={label}
            onPointerDown={(event) => {
              // Let the drag continue over the other cells.
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              anchorRef.current = i;
              setPreview({ from: i, to: i });
            }}
            onClick={(event) => {
              // Keyboard activation (pointer taps are handled on pointer up).
              if (event.detail === 0) onSelect({ startBar: bar.barIndex, endBar: bar.barIndex });
            }}
          >
            <span aria-hidden="true">{bar.barIndex + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
