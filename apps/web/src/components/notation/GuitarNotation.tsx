import { useEffect, useRef } from "react";
import { Accidental, Annotation, Formatter, GhostNote, Renderer, Stave, StaveConnector, StaveNote, TabNote, TabStave, Voice } from "vexflow";
import { fretToMidi } from "@keyboard-sensei/music-theory";

/**
 * Guitar notation: standard staff (treble clef with the octave-below marking) stacked over tab,
 * with chord symbols above the staff. Data is authored with the guitar's SOUNDING pitch in mind:
 * a fretting is {string, fret} and the staff shows it an octave higher, as guitar music is written.
 */

export interface GuitarFret { string: number; fret: number }
export interface GuitarNoteData {
  id?: string;
  /** Frets struck together; empty or omitted means a rest. */
  positions?: GuitarFret[];
  /** VexFlow duration: "w" "h" "q" "8" "16". */
  duration: string;
  /** Chord symbol shown above the staff on this note. */
  chord?: string;
}
export interface GuitarNotationData {
  kind: "guitar";
  timeSignature?: string;
  /** "staff-tab" (default) or "tab" only. */
  view?: "staff-tab" | "tab";
  measures: { notes: GuitarNoteData[] }[];
}

export function isGuitarNotation(data: Record<string, unknown>): data is Record<string, unknown> & GuitarNotationData {
  return data.kind === "guitar" && Array.isArray(data.measures);
}

const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

/** VexFlow staff key for a fretting. The staff is written an octave above the sounding pitch (treble-8vb). */
export function staffKeyFor(position: GuitarFret): string {
  const written = fretToMidi(position.string, position.fret) + 12;
  return `${SHARP_NAMES[written % 12]}/${Math.floor(written / 12) - 1}`;
}

export interface TabEvent { chord: string | null; rest: boolean; staffKeys: string[]; tab: string[] }
/** What will be drawn, as plain data (used by tests and by the renderer). */
export function guitarNotationModel(data: GuitarNotationData): TabEvent[][] {
  return data.measures.map((measure) =>
    measure.notes.map((note) => {
      const positions = [...(note.positions ?? [])].sort((a, b) => b.string - a.string);
      return {
        chord: note.chord ?? null,
        rest: positions.length === 0,
        staffKeys: positions.map(staffKeyFor),
        tab: positions.map((p) => `${p.string}:${p.fret}`),
      };
    }),
  );
}

const MEASURES_PER_LINE = 4;
const MEASURE_WIDTH = 190;
const FIRST_EXTRA = 70;
const LINE_HEIGHT = 250;

function renderInto(container: HTMLElement, data: GuitarNotationData): void {
  container.innerHTML = "";
  const tabOnly = data.view === "tab";
  const time = data.timeSignature ?? "4/4";
  const [beats, beatValue] = time.split("/").map(Number) as [number, number];
  const lines: GuitarNotationData["measures"][] = [];
  for (let i = 0; i < data.measures.length; i += MEASURES_PER_LINE) lines.push(data.measures.slice(i, i + MEASURES_PER_LINE));
  const lineHeight = tabOnly ? 150 : LINE_HEIGHT;
  const width = FIRST_EXTRA + Math.min(MEASURES_PER_LINE, data.measures.length) * MEASURE_WIDTH + 20;
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, lines.length * lineHeight + 10);
  const context = renderer.getContext();

  lines.forEach((line, lineIndex) => {
    const y = lineIndex * lineHeight;
    let x = 10;
    line.forEach((measure, measureIndex) => {
      const first = measureIndex === 0;
      const w = MEASURE_WIDTH + (first ? FIRST_EXTRA : 0);
      const staffY = y + 40;
      const tabY = tabOnly ? y + 20 : staffY + 100;
      const staff = tabOnly ? null : new Stave(x, staffY, w);
      const tab = new TabStave(x, tabY, w);
      if (first) {
        staff?.addClef("treble", "default", "8vb");
        tab.addTabGlyph();
        if (lineIndex === 0) { staff?.addTimeSignature(time); tab.addTimeSignature(time); }
      }
      staff?.setContext(context).draw();
      tab.setContext(context).draw();
      if (staff && first) {
        new StaveConnector(staff, tab).setType(StaveConnector.type.SINGLE_LEFT).setContext(context).draw();
      }
      if (staff) new StaveConnector(staff, tab).setType(StaveConnector.type.SINGLE_RIGHT).setContext(context).draw();

      const staffNotes: (StaveNote | GhostNote)[] = [];
      const tabNotes: (TabNote | GhostNote)[] = [];
      for (const note of measure.notes) {
        const positions = [...(note.positions ?? [])].sort((a, b) => b.string - a.string);
        if (positions.length === 0) {
          staffNotes.push(new StaveNote({ keys: ["b/4"], duration: `${note.duration}r` }));
          tabNotes.push(new GhostNote({ duration: note.duration }));
          continue;
        }
        const keys = positions.map(staffKeyFor);
        const sn = new StaveNote({ keys, duration: note.duration, clef: "treble" });
        keys.forEach((key, i) => { if (key.includes("#")) sn.addModifier(new Accidental("#"), i); });
        if (note.chord) {
          sn.addModifier(new Annotation(note.chord).setFont("Arial", 13, "bold").setVerticalJustification(Annotation.VerticalJustify.TOP), 0);
        }
        staffNotes.push(sn);
        tabNotes.push(new TabNote({ positions: positions.map((p) => ({ str: p.string, fret: p.fret })), duration: note.duration }));
      }
      const voices: Voice[] = [];
      const makeVoice = (notes: (StaveNote | TabNote | GhostNote)[]) =>
        new Voice({ num_beats: beats, beat_value: beatValue }).setStrict(false).addTickables(notes);
      const tabVoice = makeVoice(tabNotes);
      voices.push(tabVoice);
      const staffVoice = staff ? makeVoice(staffNotes) : null;
      if (staffVoice) voices.push(staffVoice);
      const formatter = new Formatter();
      voices.forEach((voice) => formatter.joinVoices([voice]));
      formatter.format(voices, w - (first ? FIRST_EXTRA + 20 : 30));
      staffVoice?.draw(context, staff!);
      tabVoice.draw(context, tab);
      x += w;
    });
  });
}

export default function GuitarNotation({ data, title }: { data: GuitarNotationData; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderInto(ref.current, data);
  }, [data]);
  return <div ref={ref} role="img" aria-label={`Guitar ${data.view === "tab" ? "tab" : "staff and tab"}${title ? `: ${title}` : ""}`} className="overflow-x-auto" data-testid="guitar-notation" />;
}
