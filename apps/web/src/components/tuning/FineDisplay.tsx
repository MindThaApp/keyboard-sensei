/**
 * Strobe-like fine display: a band of stripes that drifts right when the note is
 * sharp and left when flat, faster the further off it is, and stands still in
 * tune; plus the reading to 0.1 cent and a +/-10 cent scale with the tolerance zone.
 */
export default function FineDisplay({ cents, toleranceCents }: { cents: number | null; toleranceCents: number }) {
  const inTune = cents !== null && Math.abs(cents) <= toleranceCents;
  const clamped = cents === null ? 0 : Math.max(-10, Math.min(10, cents));
  const speed = cents === null ? 0 : Math.min(8, Math.abs(cents));
  const duration = speed > 0.05 ? `${(4 / speed).toFixed(2)}s` : "0s";
  const label =
    cents === null ? "Waiting for the note" : inTune ? "In tune" : cents > 0 ? "Sharp: lower it a little" : "Flat: raise it a little";
  return (
    <div className="space-y-2" aria-live="polite">
      <div
        className="relative h-10 overflow-hidden rounded-md border"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 18px)",
          opacity: cents === null ? 0.3 : 1,
          animation: speed > 0.05 ? `mp-strobe-${cents! > 0 ? "right" : "left"} ${duration} linear infinite` : "none",
        }}
        data-testid="strobe"
      />
      <style>{`
        @keyframes mp-strobe-right { from { background-position: 0 0 } to { background-position: 18px 0 } }
        @keyframes mp-strobe-left { from { background-position: 18px 0 } to { background-position: 0 0 } }
        @media (prefers-reduced-motion: reduce) { [data-testid="strobe"] { animation: none !important } }
      `}</style>
      <div className="relative h-3 rounded bg-black/10 dark:bg-white/10">
        <div
          className="absolute inset-y-0 rounded bg-green-500/40"
          style={{ left: `${50 - (toleranceCents / 10) * 50}%`, width: `${(toleranceCents / 10) * 100}%` }}
        />
        {cents !== null && (
          <div className="absolute inset-y-[-3px] w-1 rounded bg-current" style={{ left: `calc(${50 + (clamped / 10) * 50}% - 2px)` }} />
        )}
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="tabular-nums text-2xl font-semibold" data-testid="cents-reading">
          {cents === null ? "--" : `${cents > 0 ? "+" : ""}${cents.toFixed(1)} c`}
        </span>
        <span className={inTune ? "font-semibold text-green-600" : ""}>{label}</span>
      </div>
    </div>
  );
}
