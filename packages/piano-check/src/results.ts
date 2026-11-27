import { cents, DEFAULT_A4_HZ, etFrequency } from "./notes.js";
import { refitWithB, type NoteMeasurement } from "./inharmonicity.js";
import { derivedStretch, interpolate, railsbackStretch, type StretchCurve } from "./stretch.js";

export type Band = "green" | "amber" | "red";
export type Verdict = "good" | "tuning_helps" | "pitch_raise";
export type TargetKind = "stretch_derived" | "stretch_typical" | "equal_temperament";

export interface NoteResult {
  midi: number;
  f0: number;
  B: number | null;
  /** Cents from equal temperament at the chosen A4. */
  centsET: number;
  /** Cents from the stretch target (the default view). */
  centsStretch: number;
  /** Stretch target's own offset from ET, for display. */
  stretchTarget: number;
  band: Band;
  /** Unison may be out: split partials or a beating level. */
  unisonSuspect: boolean;
}

export interface CheckSummary {
  /** Median deviation vs the stretch target: the overall pitch level. */
  levelCents: number;
  verdict: Verdict;
  target: TargetKind;
  greenCount: number;
  amberCount: number;
  redCount: number;
  worst: Array<{ midi: number; centsStretch: number }>;
}

export interface CheckAnalysis {
  a4: number;
  notes: NoteResult[];
  summary: CheckSummary;
}

export const GREEN_CENTS = 5;
export const AMBER_CENTS = 15;
export const PITCH_RAISE_CENTS = 25;
/** Enough notes measured before a curve from the piano's own B values is trusted. */
export const MIN_NOTES_FOR_DERIVED = 8;

export function bandFor(cents: number): Band {
  const a = Math.abs(cents);
  return a <= GREEN_CENTS ? "green" : a <= AMBER_CENTS ? "amber" : "red";
}

function median(v: number[]): number {
  const s = v.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** B per key from notes whose B was properly fitted. */
function reliableB(ms: NoteMeasurement[]): Array<readonly [number, number]> {
  return ms.filter((m) => m.fitted && m.B !== null && m.B > 0).map((m) => [m.midi, m.B as number] as const);
}

export function analyseCheck(
  measurements: NoteMeasurement[],
  a4 = DEFAULT_A4_HZ,
  opts: { target?: "stretch" | "equal_temperament" } = {},
): CheckAnalysis {
  const pts = reliableB(measurements);
  // Notes with too few partials borrow B from their neighbours so f0 is not biased.
  const logPts = pts.map(([m, b]) => [m, Math.log(b)] as const).sort((x, y) => x[0] - y[0]);
  const ms = measurements.map((m) =>
    !m.fitted && logPts.length >= 2 ? refitWithB(m, Math.exp(interpolate(logPts, m.midi))) : m,
  );

  let curve: StretchCurve;
  let target: TargetKind;
  if (opts.target === "equal_temperament") {
    curve = () => 0;
    target = "equal_temperament";
  } else {
    const d = pts.length >= MIN_NOTES_FOR_DERIVED ? derivedStretch(pts) : null;
    curve = d ?? railsbackStretch;
    target = d ? "stretch_derived" : "stretch_typical";
  }

  // A derived curve is anchored at A4 = 0; the piano's overall level absorbs any offset.
  const notes: NoteResult[] = ms
    .slice()
    .sort((x, y) => x.midi - y.midi)
    .map((m) => {
      const et = etFrequency(m.midi, a4);
      const stretchTarget = curve(m.midi);
      const centsET = cents(m.f0, et);
      const centsStretch = centsET - stretchTarget;
      return {
        midi: m.midi,
        f0: m.f0,
        B: m.B,
        centsET,
        centsStretch,
        stretchTarget,
        band: bandFor(centsStretch),
        unisonSuspect: m.splitCents !== null || m.beatDb > 3,
      };
    });

  const levelCents = median(notes.map((n) => n.centsStretch));
  const count = (b: Band) => notes.filter((n) => n.band === b).length;
  const red = count("red");
  const amber = count("amber");
  const verdict: Verdict =
    levelCents <= -PITCH_RAISE_CENTS
      ? "pitch_raise"
      : red === 0 && amber <= notes.length * 0.2
        ? "good"
        : "tuning_helps";
  const worst = notes
    .slice()
    .sort((x, y) => Math.abs(y.centsStretch) - Math.abs(x.centsStretch))
    .slice(0, 5)
    .map((n) => ({ midi: n.midi, centsStretch: n.centsStretch }));

  return {
    a4,
    notes,
    summary: { levelCents, verdict, target, greenCount: count("green"), amberCount: amber, redCount: red, worst },
  };
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  good: "Your piano is in good shape.",
  tuning_helps: "A tuning would help.",
  pitch_raise: "A pitch raise is likely needed (more than about 25 cents flat). Please talk to a piano technician.",
};

export function levelText(levelCents: number): string {
  const r = Math.round(levelCents);
  if (Math.abs(r) < 2) return "Your piano is on pitch overall.";
  return `Your piano is on average ${Math.abs(r)} cents ${r < 0 ? "flat" : "sharp"}.`;
}
