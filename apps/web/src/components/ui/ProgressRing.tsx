import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { usePrefersReducedMotion } from "./hooks";
import "./ui.css";

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sublabel?: ReactNode;
  /** Spoken description, e.g. "6 of 10 minutes". Defaults to the percentage. */
  "aria-label"?: string;
  className?: string;
}

/** Circular progress. Animates once on mount (not at all under reduced motion). */
export function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  label,
  sublabel,
  className,
  "aria-label": ariaLabel,
}: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? clamped : 0);

  useEffect(() => {
    if (reduced) {
      setShown(clamped);
      return;
    }
    // One frame at zero, then the real value, so the transition has something to run from.
    const id = requestAnimationFrame(() => setShown(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped, reduced]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={ariaLabel ?? "Progress"}
      className={cx("ks-ring", className)}
      style={{ width: size, height: size, "--ring-size": `${size}px` } as CSSProperties}
    >
      <svg className="ks-ring__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ks-ring__track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="ks-ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown)}
        />
      </svg>
      <div className="ks-ring__center" aria-hidden="true">
        {label !== undefined && <span className="ks-ring__label">{label}</span>}
        {sublabel !== undefined && <span className="ks-ring__sublabel">{sublabel}</span>}
      </div>
    </div>
  );
}
