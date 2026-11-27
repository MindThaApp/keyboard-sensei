import { useId } from "react";

/** The Portal: a ring with an eighth note stepping through it, one red light on the rim. Source of truth: brand/music-portal-icon.svg. */
const RING_PATH = "M23,54 a31,31 0 1 0 62,0 a31,31 0 1 0 -62,0 Z M29.5,54 a24.5,24.5 0 1 0 49,0 a24.5,24.5 0 1 0 -49,0 Z";
const NOTE_PATH = "M42.92,67.3 a7.2,5.2 -22 1 1 13.36,-5.4 a7.2,5.2 -22 1 1 -13.36,5.4 Z M53.4,64 V37 H57.4 V64 Z M57.4,37 C57.4,43.5 67.6,45.6 67.6,54.2 C67.6,57.4 66.6,60 65.2,61.8 C66,55.6 62.4,51.6 57.4,50.6 Z";
const SMALL_NOTE_PATH = "M12.5,21 a2.7,2 -22 1 1 5,-2 a2.7,2 -22 1 1 -5,2 Z M16.1,20.4 V10.4 H17.9 V20.4 Z M17.9,10.4 C17.9,12.6 21.2,13.4 21.2,16.4 C21.2,17.5 20.9,18.4 20.4,19 C20.6,16.9 19.6,15.6 17.9,15.2 Z";

/** Below this size the gradients and glow are lost, so the mark uses the flat favicon drawing. */
const SIMPLE_BELOW_PX = 40;

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  const common = { width: size, height: size, className, "aria-hidden": true, focusable: false } as const;

  if (size < SIMPLE_BELOW_PX) {
    return (
      <svg viewBox="0 0 32 32" {...common}>
        <rect width="32" height="32" rx="7" fill="#17171A" />
        <circle cx="16" cy="16" r="10.4" fill="none" stroke="#F4F1EA" strokeWidth="2.6" />
        <path fill="#F4F1EA" d={SMALL_NOTE_PATH} />
        <circle cx="21.3" cy="7" r="3.2" fill="#D9475A" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 108 108" {...common}>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26262A" />
          <stop offset="1" stopColor="#0B0B0D" />
        </linearGradient>
        <linearGradient id={`${id}ivory`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#DAD7CF" />
        </linearGradient>
        <linearGradient id={`${id}red`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E35A6A" />
          <stop offset="1" stopColor="#9A2A35" />
        </linearGradient>
      </defs>
      <rect width="108" height="108" rx="24" fill={`url(#${id}bg)`} />
      <path fill={`url(#${id}ivory)`} fillRule="evenodd" d={RING_PATH} />
      <path fill={`url(#${id}ivory)`} d={NOTE_PATH} />
      <circle cx="67.88" cy="29.97" r="5.2" fill={`url(#${id}red)`} />
    </svg>
  );
}

/** The symbol and the name. The name is always spelled "Music Portal"; "Portal" is set in a lighter weight. */
export default function Wordmark({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const large = size === "lg";
  return (
    <span className={`inline-flex items-center ${large ? "gap-3" : "gap-2"} ${className}`}>
      <BrandMark size={large ? 44 : 28} className="shrink-0" />
      <span
        className={`font-display font-extrabold tracking-tighter whitespace-nowrap ${large ? "text-3xl" : "text-lg"}`}
        style={{ fontWeight: 800, letterSpacing: "-0.04em" }}
      >
        Music <span style={{ fontWeight: 500 }}>Portal</span>
      </span>
    </span>
  );
}
