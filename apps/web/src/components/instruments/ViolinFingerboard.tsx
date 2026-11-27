import { FINGER_PATTERNS, VIOLIN_OPEN_STRING, VIOLIN_STRINGS, VIOLIN_STRING_NUMERAL, fingerboardY, type FingerPatternId, type ViolinStringName } from "@keyboard-sensei/music-theory/violin";

/** A finger placement to light up. `offset` is semitones above the open string (0 = open). */
export interface FingerboardMark {
  string: ViolinStringName;
  finger: 0 | 1 | 2 | 3 | 4;
  offset: number;
  /** "target" (what to play) or "heard" (what the mic detected). */
  kind?: "target" | "heard";
}

export interface FingerboardGeometry {
  width: number;
  height: number;
  /** x of each string, G to E. */
  stringX: Record<ViolinStringName, number>;
  /** Y of the nut line. */
  nutY: number;
  /** Y for a note `offset` semitones above the open string. */
  yFor: (offset: number) => number;
}

const WIDTH = 220;
const HEIGHT = 300;
const NUT_Y = 36;
/** Vibrating length the drawing stands for; the visible board shows the first positions of it. */
const SCALE_PX = 520;

export const fingerboardGeometry: FingerboardGeometry = {
  width: WIDTH,
  height: HEIGHT,
  stringX: { G: 48, D: 88, A: 128, E: 168 },
  nutY: NUT_Y,
  yFor: (offset) => NUT_Y + fingerboardY(offset, SCALE_PX),
};

/** The marks for one finger pattern on every string, for teaching a hand shape. */
export function patternMarks(pattern: FingerPatternId, strings: readonly ViolinStringName[] = VIOLIN_STRINGS): FingerboardMark[] {
  return strings.flatMap((string) =>
    FINGER_PATTERNS[pattern].map((offset, i) => ({ string, finger: (i + 1) as 1 | 2 | 3 | 4, offset, kind: "target" as const })),
  );
}

/**
 * Where the finger tapes go for a pattern, as semitone offsets (the lines a teacher
 * sticks across the board). Same numbers as the pattern, exposed for tests and copy.
 */
export function tapeOffsets(pattern: FingerPatternId): readonly number[] {
  return FINGER_PATTERNS[pattern];
}

interface Props {
  marks: FingerboardMark[];
  /** Draws a faint tape line for each finger of this pattern. */
  pattern?: FingerPatternId;
  title?: string;
}

/**
 * A violin fingerboard seen from above, nut at the top: where each finger goes for
 * the notes being practised. Display only (it is not an input device); the role the
 * on-screen piano plays for piano lessons.
 */
export function ViolinFingerboard({ marks, pattern, title = "Violin fingerboard" }: Props) {
  const g = fingerboardGeometry;
  return (
    <svg
      role="img"
      aria-label={title}
      viewBox={`0 0 ${g.width} ${g.height}`}
      className="mx-auto h-auto w-full max-w-[220px]"
      data-testid="violin-fingerboard"
    >
      <title>{title}</title>
      <path
        d={`M${g.stringX.G - 28} ${g.nutY} L${g.stringX.E + 28} ${g.nutY} L${g.stringX.E + 36} ${g.height - 8} L${g.stringX.G - 36} ${g.height - 8} Z`}
        fill="var(--fingerboard-fill, #2b2420)"
        stroke="currentColor"
        strokeOpacity={0.3}
      />
      <line x1={g.stringX.G - 28} x2={g.stringX.E + 28} y1={g.nutY} y2={g.nutY} stroke="#e8e0d0" strokeWidth={4} />
      {pattern &&
        FINGER_PATTERNS[pattern].map((offset, i) => (
          <g key={`tape-${i}`} data-testid="finger-tape">
            <line x1={g.stringX.G - 30} x2={g.stringX.E + 30} y1={g.yFor(offset)} y2={g.yFor(offset)} stroke="#c9a227" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="4 3" />
          </g>
        ))}
      {VIOLIN_STRINGS.map((string) => (
        <g key={string}>
          <line x1={g.stringX[string]} x2={g.stringX[string]} y1={g.nutY} y2={g.height - 8} stroke="#d8d2c4" strokeWidth={1 + (3 - VIOLIN_STRINGS.indexOf(string)) * 0.2} />
          <text x={g.stringX[string]} y={16} textAnchor="middle" fontSize={12} fill="currentColor">
            {string}
          </text>
          <text x={g.stringX[string]} y={g.height - 0} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.6}>
            {VIOLIN_STRING_NUMERAL[string]}
          </text>
        </g>
      ))}
      {marks.map((mark, i) => {
        const cx = g.stringX[mark.string];
        const cy = mark.finger === 0 ? g.nutY - 10 : g.yFor(mark.offset);
        const heard = mark.kind === "heard";
        return (
          <g key={`${mark.string}-${mark.finger}-${mark.offset}-${i}`} data-testid="finger-mark" data-string={mark.string} data-finger={mark.finger}>
            <circle cx={cx} cy={cy} r={9} fill={heard ? "none" : "#c9a227"} stroke={heard ? "#4fa3d1" : "#7a5c00"} strokeWidth={heard ? 2.5 : 1.5} />
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={heard ? "#4fa3d1" : "#1b1400"}>
              {mark.finger === 0 ? "0" : mark.finger}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Open string pitches, for captions under the board. */
export const OPEN_STRING_PITCHES = VIOLIN_OPEN_STRING;
export default ViolinFingerboard;
