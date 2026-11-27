import { STANDARD_TUNING, STRING_NAMES, fretToMidi } from "@keyboard-sensei/music-theory";

/**
 * Display-only fretboard (the guitar's counterpart of the on-screen piano): lights target
 * positions and the pitch the microphone currently hears. It is not an input device for grading.
 */

export interface FretPosition { string: number; fret: number }
export interface FretboardProps {
  /** Number of frets to draw after the nut (default 12). */
  frets?: number;
  /** Positions to play (highlighted). */
  targets?: FretPosition[];
  /** Pitch currently heard (sounding MIDI note); every position that sounds it is lit softly. */
  detectedMidi?: number | null;
  className?: string;
}

const W = { left: 34, top: 14, fretWidth: 52, stringGap: 20 } as const;
const MARKERS = new Set([3, 5, 7, 9, 12, 15]);

export function detectedPositions(detectedMidi: number | null | undefined, frets: number): FretPosition[] {
  if (detectedMidi === null || detectedMidi === undefined) return [];
  const out: FretPosition[] = [];
  for (let string = 1; string <= 6; string++) {
    const fret = detectedMidi - STANDARD_TUNING[6 - string]!;
    if (fret >= 0 && fret <= frets) out.push({ string, fret });
  }
  return out;
}

export default function Fretboard({ frets = 12, targets = [], detectedMidi, className }: FretboardProps) {
  const width = W.left + frets * W.fretWidth + 12;
  const height = W.top + 5 * W.stringGap + 30;
  const stringY = (string: number) => W.top + (string - 1) * W.stringGap; // string 1 (high e) on top
  const fretX = (fret: number) => W.left + (fret - 0.5) * W.fretWidth;
  const heard = detectedPositions(detectedMidi, frets);
  const key = (p: FretPosition) => `${p.string}:${p.fret}`;
  const targetKeys = new Set(targets.map(key));
  const spot = (p: FretPosition) => ({ cx: p.fret === 0 ? W.left - 16 : fretX(p.fret), cy: stringY(p.string) });
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Guitar fretboard" fill="none" stroke="currentColor" data-testid="fretboard">
      <line x1={W.left} x2={W.left} y1={W.top} y2={stringY(6)} strokeWidth={4} />
      {Array.from({ length: frets }, (_, i) => (
        <line key={`f${i}`} x1={W.left + (i + 1) * W.fretWidth} x2={W.left + (i + 1) * W.fretWidth} y1={W.top} y2={stringY(6)} strokeWidth={1} opacity={0.5} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <g key={`s${i}`}>
          <line x1={W.left} x2={W.left + frets * W.fretWidth} y1={stringY(i + 1)} y2={stringY(i + 1)} strokeWidth={0.6 + i * 0.35} opacity={0.85} />
          <text x={8} y={stringY(i + 1) + 4} fontSize="11" fill="currentColor" stroke="none">{STRING_NAMES[5 - i]}</text>
        </g>
      ))}
      {Array.from({ length: frets }, (_, i) => i + 1).filter((n) => MARKERS.has(n)).map((n) => (
        <text key={`n${n}`} x={fretX(n)} y={stringY(6) + 20} textAnchor="middle" fontSize="10" fill="currentColor" stroke="none" opacity={0.7}>{n}</text>
      ))}
      {heard.filter((p) => !targetKeys.has(key(p))).map((p) => (
        <circle key={`h${key(p)}`} data-marker="heard" {...spot(p)} r={6} fill="currentColor" stroke="none" opacity={0.35} />
      ))}
      {targets.map((p) => {
        const isHeard = heard.some((h) => key(h) === key(p));
        return (
          <g key={`t${key(p)}`} data-marker="target" data-string={p.string} data-fret={p.fret} data-hit={isHeard ? "true" : "false"}>
            <circle {...spot(p)} r={8} fill="currentColor" stroke="none" opacity={isHeard ? 1 : 0.8} />
            <text x={spot(p).cx} y={spot(p).cy + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--chord-dot-text, #fff)" stroke="none">{p.fret}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** The sounding pitch of a fretboard position (re-exported for lesson views). */
export const positionMidi = (p: FretPosition): number => fretToMidi(p.string, p.fret);
