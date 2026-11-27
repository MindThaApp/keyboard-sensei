import type { Band } from "@keyboard-sensei/piano-check";

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const COLORS: Record<Band | "none" | "current", string> = {
  green: "#34c759",
  amber: "#ff9f0a",
  red: "#ff3b30",
  none: "#e5e5ea",
  current: "#0a84ff",
};

export interface KeyboardMapProps {
  low: number;
  high: number;
  bands: Map<number, Band>;
  current?: number | null;
  onPick?: (midi: number) => void;
}

/** Keyboard graphic: the key to play is blue; measured keys are green, amber or red. */
export default function KeyboardMap({ low, high, bands, current, onPick }: KeyboardMapProps) {
  const keys: Array<{ midi: number; x: number; black: boolean }> = [];
  let whiteIndex = 0;
  for (let m = low; m <= high; m++) {
    const pc = m % 12;
    if (WHITE.includes(pc)) {
      keys.push({ midi: m, x: whiteIndex, black: false });
      whiteIndex++;
    } else {
      keys.push({ midi: m, x: whiteIndex - 0.31, black: true });
    }
  }
  const width = Math.max(1, whiteIndex);
  const fill = (m: number) => (m === current ? COLORS.current : bands.has(m) ? COLORS[bands.get(m)!] : COLORS.none);
  const label = (m: number) => `Key ${m}${bands.has(m) ? `, ${bands.get(m)}` : ""}`;
  return (
    <svg viewBox={`0 0 ${width} 5`} role="img" aria-label="Keyboard" style={{ width: "100%", height: "auto" }}>
      {keys.filter((k) => !k.black).map((k) => (
        <rect key={k.midi} x={k.x + 0.04} y={0} width={0.92} height={5} rx={0.12} fill={fill(k.midi)} stroke="#8e8e93" strokeWidth={0.03}
          onClick={() => onPick?.(k.midi)} aria-label={label(k.midi)} />
      ))}
      {keys.filter((k) => k.black).map((k) => (
        <rect key={k.midi} x={k.x} y={0} width={0.62} height={3.1} rx={0.1}
          fill={k.midi === current || bands.has(k.midi) ? fill(k.midi) : "#1c1c1e"} stroke="#1c1c1e" strokeWidth={0.03}
          onClick={() => onPick?.(k.midi)} aria-label={label(k.midi)} />
      ))}
    </svg>
  );
}
