import { useId } from "react";

/** The Ring: twelve keys around a glass hub, one lit red. Source of truth: brand/midivory-icon.svg. */
const KEY_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const LIT_KEY_ANGLE = 30;

/** Below this size twelve keys blur into a spinner, so the mark drops to a ring and one red dot. */
const SIMPLE_BELOW_PX = 40;

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  const common = { width: size, height: size, className, "aria-hidden": true, focusable: false } as const;

  if (size < SIMPLE_BELOW_PX) {
    return (
      <svg viewBox="0 0 32 32" {...common}>
        <rect width="32" height="32" rx="7" fill="#17171A" />
        <circle cx="16" cy="16" r="8.6" fill="none" stroke="#F4F1EA" strokeWidth="3.6" />
        <circle cx="21.3" cy="8.4" r="3.4" fill="#D9475A" />
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
        <linearGradient id={`${id}glass`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity=".06" />
        </linearGradient>
      </defs>
      <rect width="108" height="108" rx="24" fill={`url(#${id}bg)`} />
      {KEY_ANGLES.map((angle) => (
        <rect
          key={angle}
          x="50.2"
          y="19"
          width="7.6"
          height="16"
          rx="2.4"
          fill={`url(#${id}${angle === LIT_KEY_ANGLE ? "red" : "ivory"})`}
          transform={`rotate(${angle} 54 54)`}
        />
      ))}
      <circle cx="54" cy="54" r="13" fill={`url(#${id}glass)`} stroke="#fff" strokeOpacity=".55" strokeWidth=".8" />
      <circle cx="54" cy="54" r="4.2" fill="#B4323E" />
    </svg>
  );
}

/** The symbol and the name. The name is always spelled "Midivory"; "ivory" is set in a lighter weight. */
export default function Wordmark({ size = "md", className = "" }: { size?: "md" | "lg"; className?: string }) {
  const large = size === "lg";
  return (
    <span className={`inline-flex items-center ${large ? "gap-3" : "gap-2"} ${className}`}>
      <BrandMark size={large ? 44 : 28} className="shrink-0" />
      <span
        className={`font-display font-extrabold tracking-tighter ${large ? "text-3xl" : "text-lg"}`}
        style={{ fontWeight: 800, letterSpacing: "-0.04em" }}
      >
        Mid<span style={{ fontWeight: 500 }}>ivory</span>
      </span>
    </span>
  );
}
