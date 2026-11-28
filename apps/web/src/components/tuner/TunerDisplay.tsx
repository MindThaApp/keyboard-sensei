import { useEffect, useRef } from "react";
import { t } from "../../i18n";

const NEEDLE_RANGE = 50;

function clampCents(cents: number): number {
  return Math.max(-NEEDLE_RANGE, Math.min(NEEDLE_RANGE, cents));
}

/** ±50-cent needle with a green zone (spec 5.1). */
export function TunerNeedle({ cents, greenZone, active }: { cents: number | null; greenZone: number; active: boolean }) {
  const shown = cents === null ? 0 : clampCents(cents);
  const angle = (shown / NEEDLE_RANGE) * 60;
  const inZone = cents !== null && Math.abs(cents) <= greenZone;
  const zoneAngle = (Math.min(greenZone, NEEDLE_RANGE) / NEEDLE_RANGE) * 60;
  const arc = (deg: number) => {
    const r = (deg - 90) * (Math.PI / 180);
    return `${100 + 80 * Math.cos(r)} ${100 + 80 * Math.sin(r)}`;
  };
  return (
    <svg
      viewBox="0 0 200 110"
      className="mx-auto w-full max-w-sm"
      role="meter"
      aria-label={t("tuner.needle")}
      aria-valuemin={-NEEDLE_RANGE}
      aria-valuemax={NEEDLE_RANGE}
      aria-valuenow={cents === null ? undefined : Math.round(cents * 10) / 10}
      aria-valuetext={cents === null ? t("tuner.noNote") : inZone ? t("tuner.inTune") : cents < 0 ? t("tuner.centsFlat", { cents: Math.abs(cents).toFixed(1) }) : t("tuner.centsSharp", { cents: cents.toFixed(1) })}
      data-in-tune={inZone ? "true" : "false"}
    >
      <path d={`M ${arc(-60)} A 80 80 0 0 1 ${arc(60)}`} fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth={10} />
      <path d={`M ${arc(-zoneAngle)} A 80 80 0 0 1 ${arc(zoneAngle)}`} fill="none" className="text-emerald-500" stroke="currentColor" strokeWidth={10} />
      {[-50, -25, 0, 25, 50].map(t => {
        const r = ((t / NEEDLE_RANGE) * 60 - 90) * (Math.PI / 180);
        return (
          <line key={t} x1={100 + 68 * Math.cos(r)} y1={100 + 68 * Math.sin(r)} x2={100 + 74 * Math.cos(r)} y2={100 + 74 * Math.sin(r)} stroke="currentColor" strokeOpacity={0.5} />
        );
      })}
      <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px", transition: "transform 60ms linear" }}>
        <line x1={100} y1={100} x2={100} y2={26} strokeWidth={3} strokeLinecap="round" stroke="currentColor" className={!active ? "opacity-30" : inZone ? "text-emerald-600" : "text-rose-500"} />
      </g>
      <circle cx={100} cy={100} r={5} fill="currentColor" />
    </svg>
  );
}

/**
 * Strobe-style band: stripes drift left when flat and right when sharp, at a
 * speed proportional to the error, and stand still when in tune.
 */
export function StrobeBand({ cents }: { cents: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const centsRef = useRef(cents);
  centsRef.current = cents;
  useEffect(() => {
    let offset = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const c = centsRef.current;
      if (c !== null) offset = (offset + c * 4 * dt) % 40;
      if (ref.current) ref.current.style.backgroundPosition = `${offset}px 0`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="h-6 w-full rounded-md opacity-70"
      style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 20px, transparent 20px 40px)" }}
    />
  );
}

/** Drift trace over the last few seconds (useful for pegs that slip). */
export function DriftTrace({ history, now, greenZone }: { history: { time: number; cents: number }[]; now: number; greenZone: number }) {
  const width = 300;
  const height = 60;
  const span = 8;
  const y = (c: number) => height / 2 - (clampCents(c) / NEEDLE_RANGE) * (height / 2);
  const points = history.map(h => `${(width * (1 - (now - h.time) / span)).toFixed(1)},${y(h.cents).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img" aria-label={t("tuner.driftTrace")}>
      <rect x={0} y={y(greenZone)} width={width} height={Math.max(1, y(-greenZone) - y(greenZone))} className="text-emerald-500" fill="currentColor" fillOpacity={0.15} />
      <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" strokeOpacity={0.3} />
      {history.length > 1 && <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />}
    </svg>
  );
}
