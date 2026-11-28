import { t } from "../../i18n";
import ChordDiagram from "./ChordDiagram";
import Fretboard, { type FretPosition } from "./Fretboard";
import GuitarNotation, { isGuitarNotation, type GuitarNotationData } from "./GuitarNotation";

/**
 * Lesson "notation" sections for guitar. `vexflowData.kind` picks the view:
 *  - "guitar"          staff + tab (GuitarNotation)
 *  - "chord-diagrams"  a row of chord boxes: { chords: ["Em", "Am"] }
 *  - "fretboard"       the on-screen fretboard: { frets?: number, targets: [{string, fret}] }
 */
export const GUITAR_SECTION_KINDS = ["guitar", "chord-diagrams", "fretboard"] as const;

export function isGuitarSection(data: Record<string, unknown>): boolean {
  return typeof data.kind === "string" && (GUITAR_SECTION_KINDS as readonly string[]).includes(data.kind);
}

export default function GuitarSection({ data, title }: { data: Record<string, unknown>; title?: string }) {
  if (isGuitarNotation(data)) return <GuitarNotation data={data as GuitarNotationData} title={title} />;
  if (data.kind === "chord-diagrams") {
    const chords = Array.isArray(data.chords) ? (data.chords as string[]) : [];
    return (
      <div className="flex flex-wrap gap-4" role="group" aria-label={title ?? t("guitar.chordDiagrams")}>
        {chords.map((symbol) => <ChordDiagram key={symbol} chord={symbol} />)}
      </div>
    );
  }
  if (data.kind === "fretboard") {
    return <Fretboard frets={typeof data.frets === "number" ? data.frets : 12} targets={(data.targets as FretPosition[] | undefined) ?? []} />;
  }
  return null;
}
