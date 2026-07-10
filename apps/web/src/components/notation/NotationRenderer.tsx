import { useEffect, useRef } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Formatter,
  Voice,
  StaveConnector,
  Accidental,
  BarNote,
  Dot,
  type RenderContext,
} from "vexflow";

interface NoteData {
  keys: string[];
  duration: string;
}

interface SimpleStaveData {
  clef: string;
  timeSignature?: string;
  /** Optional key signature spec, e.g. "G", "D", "F", "Bb", "Am" (VexFlow names). */
  keySignature?: string;
  /** Flat note list (original shape). Ignored when `measures` is present. */
  notes?: NoteData[];
  /** Measure-grouped notes; barlines are drawn between measures. */
  measures?: { notes: NoteData[] }[];
}

interface GrandStaffData {
  grandStaff: true;
  treble: SimpleStaveData;
  bass: SimpleStaveData;
}

type NotationData = SimpleStaveData | GrandStaffData;

function isGrandStaffData(data: Record<string, unknown>): boolean {
  return data.grandStaff === true && !!data.treble && !!data.bass;
}

/**
 * VexFlow key strings like "c#/4" or "bb/3" position the note at the right
 * pitch, but do NOT automatically draw the sharp/flat glyph — that requires
 * an explicit Accidental modifier. Extracts the accidental code (if any)
 * from a key string so the caller can attach it.
 */
function accidentalFromKey(key: string): string | null {
  const match = /^[a-gA-G](#{1,2}|b{1,2}|n)\//.exec(key);
  return match?.[1] ?? null;
}

/**
 * Position of each key signature on the circle of fifths: positive = number
 * of sharps, negative = number of flats. Mirrors VexFlow's own key-signature
 * table (vexflow/src/tables.ts) so any spec `addKeySignature` accepts is
 * also understood here.
 */
const KEY_SIG_FIFTHS: Record<string, number> = {
  C: 0, Am: 0,
  G: 1, Em: 1, D: 2, Bm: 2, A: 3, "F#m": 3, E: 4, "C#m": 4,
  B: 5, "G#m": 5, "F#": 6, "D#m": 6, "C#": 7, "A#m": 7,
  F: -1, Dm: -1, Bb: -2, Gm: -2, Eb: -3, Cm: -3, Ab: -4, Fm: -4,
  Db: -5, Bbm: -5, Gb: -6, Ebm: -6, Cb: -7, Abm: -7,
};

const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];

/**
 * Derives which pitch letters a key signature sharpens/flattens (e.g.
 * "D" → { f: "#", c: "#" }). Notes whose explicit accidental is already in
 * the signature must NOT get a redundant accidental glyph — the signature
 * covers them. Accidentals outside the signature still get glyphs.
 */
function keySignatureAccidentals(keySignature?: string): Record<string, string> {
  const fifths = keySignature ? KEY_SIG_FIFTHS[keySignature] : undefined;
  const map: Record<string, string> = {};
  if (!fifths) return map;
  const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  const acc = fifths > 0 ? "#" : "b";
  for (let i = 0; i < Math.abs(fifths); i++) map[order[i]] = acc;
  return map;
}

/**
 * Counts dots in a duration code ("qd" → 1, "8d" → 1, "q" → 0). Same parse
 * as VexFlow's Note.parseDuration (vexflow/src/note.ts), which handles the
 * tick math for "d" suffixes but does NOT draw the dot glyph — that requires
 * an explicit Dot modifier (Dot.buildAndAttach), same story as accidentals.
 */
function dotsFromDuration(duration: string): number {
  const match = /^(\d*\/?\d+|[a-z])(d*)([nrhms]|$)/.exec(duration);
  return match ? match[2].length : 0;
}

/**
 * Normalizes a stave's content to measure groups: `measures` wins when
 * present; a flat `notes` array is treated as a single measure (no barlines),
 * preserving the original rendering for existing content.
 */
function measuresOf(data: SimpleStaveData): NoteData[][] {
  if (data.measures && data.measures.length > 0) return data.measures.map((m) => m.notes ?? []);
  return data.notes && data.notes.length > 0 ? [data.notes] : [];
}

function buildStaveNote(n: NoteData, clef: string, sigAccidentals: Record<string, string>): StaveNote {
  const staveNote = new StaveNote({ keys: n.keys, duration: n.duration, clef });
  n.keys.forEach((key, keyIndex) => {
    const accidental = accidentalFromKey(key);
    if (!accidental) return;
    // Skip the glyph when the key signature already applies this accidental
    // to this pitch letter (e.g. f#/5 under a G-major signature).
    if (sigAccidentals[key[0].toLowerCase()] === accidental) return;
    staveNote.addModifier(new Accidental(accidental), keyIndex);
  });
  const dots = dotsFromDuration(n.duration);
  for (let i = 0; i < dots; i++) Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

/**
 * A fixed canvas width was clipping accidentals on longer note runs — a note
 * late in a 16-note passage could get formatted past the SVG's own right
 * edge, silently cutting off its sharp/flat glyph (found via a real lesson:
 * the flat on B in a D-natural-minor scale rendered at all, just off-canvas).
 * Scale width with note count instead, with overflow-x-auto on the
 * container as a fallback for anything still too wide to fit comfortably.
 */
const NOTE_WIDTH_PX = 34;
const BARLINE_WIDTH_PX = 14;
const KEY_SIG_ACCIDENTAL_PX = 12;
const STAVE_MARGIN_PX = 90;
function computeStaveWidth(noteCount: number): number {
  return Math.max(420, noteCount * NOTE_WIDTH_PX + STAVE_MARGIN_PX);
}

/** Width for a stave's full content: all notes across measures, plus a little per barline and per key-signature accidental. */
function staveWidthFor(data: SimpleStaveData): number {
  const measures = measuresOf(data);
  const noteCount = measures.reduce((sum, m) => sum + m.length, 0);
  const barlineCount = Math.max(measures.length - 1, 0);
  const keySigCount = Math.abs(KEY_SIG_FIFTHS[data.keySignature ?? ""] ?? 0);
  return computeStaveWidth(noteCount) + barlineCount * BARLINE_WIDTH_PX + keySigCount * KEY_SIG_ACCIDENTAL_PX;
}

function drawSingleStave(
  context: RenderContext,
  data: SimpleStaveData,
  x: number,
  y: number,
  width: number,
): Stave {
  const stave = new Stave(x, y, width);
  stave.addClef(data.clef);
  if (data.timeSignature) stave.addTimeSignature(data.timeSignature);
  if (data.keySignature) stave.addKeySignature(data.keySignature);
  stave.setContext(context).draw();

  const sigAccidentals = keySignatureAccidentals(data.keySignature);
  const measures = measuresOf(data);
  const tickables: (StaveNote | BarNote)[] = [];
  let noteCount = 0;
  measures.forEach((measure, measureIndex) => {
    // One voice for the whole stave; BarNote tickables (tick-free by design)
    // render the barlines between measure groups.
    if (measureIndex > 0) tickables.push(new BarNote());
    measure.forEach((n) => {
      tickables.push(buildStaveNote(n, data.clef, sigAccidentals));
      noteCount += 1;
    });
  });

  if (noteCount > 0) {
    const voice = new Voice({ num_beats: noteCount, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(tickables);
    // Format into the space that remains after clef/time/key signatures —
    // getNoteStartX accounts for however wide those modifiers actually are.
    const formatWidth = Math.max(stave.getNoteEndX() - stave.getNoteStartX() - 20, 50);
    new Formatter().joinVoices([voice]).format([voice], formatWidth);
    voice.draw(context, stave);
  }

  return stave;
}

/**
 * Renders lesson vexflowData with VexFlow. Handles the simple single-staff
 * shape and the grand-staff (treble+bass+brace) shape used in the MVP
 * lessons. Keeps notation intentionally simple per MVP scope.
 */
export default function NotationRenderer({
  data,
  title,
}: {
  data: Record<string, unknown>;
  title?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
        const width = Math.max(staveWidthFor(grandStaffData.treble), staveWidthFor(grandStaffData.bass));
        const height = 230;
        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();

        const trebleStave = drawSingleStave(context, grandStaffData.treble, 20, 20, width - 40);
        const bassStave = drawSingleStave(context, grandStaffData.bass, 20, 110, width - 40);

        const brace = new StaveConnector(trebleStave, bassStave);
        brace.setType("brace");
        brace.setContext(context).draw();

        const leftLine = new StaveConnector(trebleStave, bassStave);
        leftLine.setType("singleLeft");
        leftLine.setContext(context).draw();
      } else {
        const staveData = data as unknown as SimpleStaveData;
        const width = staveWidthFor(staveData);
        const height = 150;
        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width, height);
        const context = renderer.getContext();
        drawSingleStave(context, staveData, 10, 20, width - 20);
      }
    } catch (err) {
      console.error("Failed to render notation", err);
      container.innerHTML =
        '<p class="text-sm text-rose-600">Notation could not be rendered.</p>';
    }
  }, [data]);

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block max-w-full rounded-md border border-ivory-200 bg-ivory-50 p-3 text-slate-900 shadow-sm">
        {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>}
        <div ref={containerRef} className="overflow-x-auto" />
      </div>
    </div>
  );
}
