import { findGuitarChord, type GuitarChordShape } from "@keyboard-sensei/music-theory";

/**
 * Guitar chord box: 6 strings (low E on the left), 4-5 frets, dots with finger numbers,
 * open/muted markers, a barre bar and a base-fret label. Driven by the shared chord
 * dictionary, so what is drawn is exactly what the chord grader listens for.
 */

const STRINGS = 6;
const GEOMETRY = { width: 120, height: 150, left: 24, right: 100, top: 36, fretGap: 22 } as const;

export interface ChordDiagramProps {
  /** Symbol in the shared dictionary ("Em", "G", ...), or a shape for custom fingerings. */
  chord: string | GuitarChordShape;
  /** Number of fret rows to draw (default 4, or 5 when the shape needs it). */
  frets?: number;
  className?: string;
}

export interface DiagramDot { string: number; row: number; finger: number }
export interface DiagramModel {
  symbol: string;
  baseFret: number;
  rows: number;
  dots: DiagramDot[];
  open: number[];
  muted: number[];
  barre: { row: number; fromString: number; toString: number } | null;
}

/** Strings are numbered 6 (low E, left) to 1 (high e, right) like the dictionary's `frets` order. */
export function diagramModel(chord: GuitarChordShape, minRows = 4): DiagramModel {
  const rows = Math.max(minRows, ...chord.frets.map((fret) => (fret ? fret - chord.baseFret + 1 : 0)));
  const dots: DiagramDot[] = [];
  const open: number[] = [];
  const muted: number[] = [];
  chord.frets.forEach((fret, index) => {
    const string = 6 - index;
    if (fret === null) muted.push(string);
    else if (fret === 0) open.push(string);
    else if (!chord.barre || fret !== chord.barre.fret || string === chord.barre.fromString || string === chord.barre.toString) {
      dots.push({ string, row: fret - chord.baseFret + 1, finger: chord.fingers[index] ?? 0 });
    }
  });
  return {
    symbol: chord.symbol,
    baseFret: chord.baseFret,
    rows,
    dots,
    open,
    muted,
    barre: chord.barre ? { row: chord.barre.fret - chord.baseFret + 1, fromString: chord.barre.fromString, toString: chord.barre.toString } : null,
  };
}

const stringX = (string: number) => GEOMETRY.left + ((6 - string) * (GEOMETRY.right - GEOMETRY.left)) / (STRINGS - 1);
const rowY = (row: number) => GEOMETRY.top + (row - 0.5) * GEOMETRY.fretGap;

export default function ChordDiagram({ chord, frets, className }: ChordDiagramProps) {
  const shape = typeof chord === "string" ? findGuitarChord(chord) : chord;
  if (!shape) return null;
  const model = diagramModel(shape, frets ?? 4);
  const bottom = GEOMETRY.top + model.rows * GEOMETRY.fretGap;
  const height = bottom + 12;
  const description = `${shape.name} chord diagram: ${shape.frets
    .map((fret, i) => `string ${6 - i} ${fret === null ? "muted" : fret === 0 ? "open" : `fret ${fret}`}`)
    .join(", ")}`;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${GEOMETRY.width} ${height}`}
      width={GEOMETRY.width}
      role="img"
      aria-label={description}
      data-chord={shape.symbol}
      fill="none"
      stroke="currentColor"
    >
      <text x={GEOMETRY.width / 2} y={14} textAnchor="middle" fontSize="14" fontWeight="600" fill="currentColor" stroke="none">{shape.symbol}</text>
      {/* nut (thick) at the open position, otherwise a base-fret label */}
      {model.baseFret === 1 ? (
        <line x1={GEOMETRY.left} x2={GEOMETRY.right} y1={GEOMETRY.top} y2={GEOMETRY.top} strokeWidth={4} />
      ) : (
        <text x={GEOMETRY.right + 6} y={rowY(1) + 4} fontSize="11" fill="currentColor" stroke="none" data-testid="base-fret">{model.baseFret}fr</text>
      )}
      {Array.from({ length: model.rows + 1 }, (_, i) => (
        <line key={`f${i}`} x1={GEOMETRY.left} x2={GEOMETRY.right} y1={GEOMETRY.top + i * GEOMETRY.fretGap} y2={GEOMETRY.top + i * GEOMETRY.fretGap} strokeWidth={i === 0 && model.baseFret === 1 ? 0 : 1} opacity={0.6} />
      ))}
      {Array.from({ length: STRINGS }, (_, i) => (
        <line key={`s${i}`} x1={stringX(6 - i)} x2={stringX(6 - i)} y1={GEOMETRY.top} y2={bottom} strokeWidth={1} opacity={0.8} />
      ))}
      {model.muted.map((string) => (
        <g key={`m${string}`} data-marker="muted" strokeWidth={1.5}>
          <line x1={stringX(string) - 4} x2={stringX(string) + 4} y1={GEOMETRY.top - 14} y2={GEOMETRY.top - 6} />
          <line x1={stringX(string) + 4} x2={stringX(string) - 4} y1={GEOMETRY.top - 14} y2={GEOMETRY.top - 6} />
        </g>
      ))}
      {model.open.map((string) => (
        <circle key={`o${string}`} data-marker="open" cx={stringX(string)} cy={GEOMETRY.top - 10} r={4} strokeWidth={1.5} />
      ))}
      {model.barre && (
        <rect
          data-marker="barre"
          x={stringX(model.barre.fromString) - 6}
          y={rowY(model.barre.row) - 7}
          width={stringX(model.barre.toString) - stringX(model.barre.fromString) + 12}
          height={14}
          rx={7}
          fill="currentColor"
          stroke="none"
          opacity={0.85}
        />
      )}
      {model.dots.map((dot) => (
        <g key={`d${dot.string}`} data-marker="dot" data-string={dot.string} data-row={dot.row}>
          <circle cx={stringX(dot.string)} cy={rowY(dot.row)} r={7.5} fill="currentColor" stroke="none" />
          {dot.finger > 0 && (
            <text x={stringX(dot.string)} y={rowY(dot.row) + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--chord-dot-text, #fff)" stroke="none">{dot.finger}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
