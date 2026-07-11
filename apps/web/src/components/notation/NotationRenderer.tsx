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
  ids?: string[];
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
 * Also matches rest codes ("hr", "qr") via the trailing [nrhms] group, so
 * rests fall through this unaffected (0 dots).
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

/** Felt-crimson (matches the app's accent color) used to tint note(s) currently due to be played. */
const ACTIVE_NOTE_COLOR = "#b4323e";

function buildStaveNote(
  n: NoteData,
  clef: string,
  sigAccidentals: Record<string, string>,
  activeNoteIds?: Set<string>,
): StaveNote {
  const staveNote = new StaveNote({ keys: n.keys, duration: n.duration, clef });
  if (activeNoteIds && n.ids?.some((id) => activeNoteIds.has(id))) {
    staveNote.setStyle({ fillStyle: ACTIVE_NOTE_COLOR, strokeStyle: ACTIVE_NOTE_COLOR });
  }
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

/** Width for one system's content: its own notes/rests, plus a little per barline and per key-signature accidental. */
function systemWidth(measures: NoteData[][], keySignature?: string): number {
  const noteCount = measures.reduce((sum, m) => sum + m.length, 0);
  const barlineCount = Math.max(measures.length - 1, 0);
  const keySigCount = Math.abs(KEY_SIG_FIFTHS[keySignature ?? ""] ?? 0);
  return computeStaveWidth(noteCount) + barlineCount * BARLINE_WIDTH_PX + keySigCount * KEY_SIG_ACCIDENTAL_PX;
}

/** Rough per-measure width used only to decide where a line should wrap — not the final rendered width. */
function measureWidthPx(measure: NoteData[]): number {
  return measure.length * NOTE_WIDTH_PX + BARLINE_WIDTH_PX;
}

/** Longest a single staff system (line) is allowed to get before wrapping to a new row — mirrors printed sheet music instead of one long horizontally-scrolling line. */
const MAX_SYSTEM_WIDTH_PX = 900;
const SINGLE_STAVE_HEIGHT_PX = 150;
const SYSTEM_GAP_PX = 30;
const GRAND_STAVE_HEIGHT_PX = 230;
const GRAND_SYSTEM_GAP_PX = 40;

/** Chunks measures into systems (lines), never splitting a single measure across two lines. */
function chunkMeasuresIntoSystems(measures: NoteData[][], maxWidthPx: number): NoteData[][][] {
  const systems: NoteData[][][] = [];
  let current: NoteData[][] = [];
  let currentWidth = STAVE_MARGIN_PX;
  for (const measure of measures) {
    const width = measureWidthPx(measure);
    if (current.length > 0 && currentWidth + width > maxWidthPx) {
      systems.push(current);
      current = [];
      currentWidth = STAVE_MARGIN_PX;
    }
    current.push(measure);
    currentWidth += width;
  }
  if (current.length > 0) systems.push(current);
  return systems;
}

/** Same wrapping decision as chunkMeasuresIntoSystems, but for a treble/bass pair that must break at the same measure boundaries. */
function chunkGrandStaffIntoSystems(
  trebleMeasures: NoteData[][],
  bassMeasures: NoteData[][],
  maxWidthPx: number,
): { treble: NoteData[][]; bass: NoteData[][] }[] {
  const measureCount = Math.max(trebleMeasures.length, bassMeasures.length);
  const systems: { treble: NoteData[][]; bass: NoteData[][] }[] = [];
  let currentTreble: NoteData[][] = [];
  let currentBass: NoteData[][] = [];
  let currentWidth = STAVE_MARGIN_PX;
  for (let i = 0; i < measureCount; i++) {
    const treble = trebleMeasures[i] ?? [];
    const bass = bassMeasures[i] ?? [];
    const width = Math.max(measureWidthPx(treble), measureWidthPx(bass));
    if (currentTreble.length > 0 && currentWidth + width > maxWidthPx) {
      systems.push({ treble: currentTreble, bass: currentBass });
      currentTreble = [];
      currentBass = [];
      currentWidth = STAVE_MARGIN_PX;
    }
    currentTreble.push(treble);
    currentBass.push(bass);
    currentWidth += width;
  }
  if (currentTreble.length > 0) systems.push({ treble: currentTreble, bass: currentBass });
  return systems;
}

/**
 * Draws one staff system (line): a Stave plus its notes/rests. Clef is
 * always drawn; key signature is drawn whenever the caller passes one (real
 * engraving repeats the key signature on every system); time signature is
 * only passed by the caller for the first system of a piece.
 */
function drawStaveSystem(
  context: RenderContext,
  measures: NoteData[][],
  clef: string,
  x: number,
  y: number,
  width: number,
  keySignature: string | undefined,
  timeSignature: string | undefined,
  activeNoteIds: Set<string> | undefined,
): Stave {
  const stave = new Stave(x, y, width);
  stave.addClef(clef);
  if (timeSignature) stave.addTimeSignature(timeSignature);
  if (keySignature) stave.addKeySignature(keySignature);
  stave.setContext(context).draw();

  const sigAccidentals = keySignatureAccidentals(keySignature);
  const tickables: (StaveNote | BarNote)[] = [];
  let noteCount = 0;
  measures.forEach((measure, measureIndex) => {
    // One voice for the whole system; BarNote tickables (tick-free by
    // design) render the barlines between measure groups.
    if (measureIndex > 0) tickables.push(new BarNote());
    measure.forEach((n) => {
      tickables.push(buildStaveNote(n, clef, sigAccidentals, activeNoteIds));
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
 * shape and the grand-staff (treble+bass+brace) shape used in lessons. Long
 * pieces automatically wrap into multiple staff systems (like printed sheet
 * music) instead of one long horizontally-scrolling line.
 */
export default function NotationRenderer({
  data,
  title,
  activeNoteIds,
}: {
  data: Record<string, unknown>;
  title?: string;
  /** ExpectedNoteEvent ids (or play-along note ids) currently due to be played — tinted on the stave. */
  activeNoteIds?: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
        const trebleMeasures = measuresOf(grandStaffData.treble);
        const bassMeasures = measuresOf(grandStaffData.bass);
        const systems = chunkGrandStaffIntoSystems(trebleMeasures, bassMeasures, MAX_SYSTEM_WIDTH_PX);
        const widths = systems.map(({ treble, bass }) =>
          Math.max(
            systemWidth(treble, grandStaffData.treble.keySignature),
            systemWidth(bass, grandStaffData.bass.keySignature),
          ),
        );
        const width = Math.max(...widths, 420);
        const totalHeight =
          systems.length * GRAND_STAVE_HEIGHT_PX + Math.max(systems.length - 1, 0) * GRAND_SYSTEM_GAP_PX;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width + 40, totalHeight + 40);
        const context = renderer.getContext();

        systems.forEach((system, i) => {
          const y = 20 + i * (GRAND_STAVE_HEIGHT_PX + GRAND_SYSTEM_GAP_PX);
          const trebleStave = drawStaveSystem(
            context, system.treble, grandStaffData.treble.clef, 20, y, widths[i] - 40,
            grandStaffData.treble.keySignature, i === 0 ? grandStaffData.treble.timeSignature : undefined,
            activeNoteIds,
          );
          const bassStave = drawStaveSystem(
            context, system.bass, grandStaffData.bass.clef, 20, y + 90, widths[i] - 40,
            grandStaffData.bass.keySignature, i === 0 ? grandStaffData.bass.timeSignature : undefined,
            activeNoteIds,
          );
          const brace = new StaveConnector(trebleStave, bassStave);
          brace.setType("brace");
          brace.setContext(context).draw();
          const leftLine = new StaveConnector(trebleStave, bassStave);
          leftLine.setType("singleLeft");
          leftLine.setContext(context).draw();
        });
      } else {
        const staveData = data as unknown as SimpleStaveData;
        const measures = measuresOf(staveData);
        const chunks = chunkMeasuresIntoSystems(measures, MAX_SYSTEM_WIDTH_PX);
        const widths = chunks.map((chunk) => systemWidth(chunk, staveData.keySignature));
        const width = Math.max(...widths, 420);
        const totalHeight = chunks.length * SINGLE_STAVE_HEIGHT_PX + Math.max(chunks.length - 1, 0) * SYSTEM_GAP_PX;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width + 20, totalHeight + 20);
        const context = renderer.getContext();

        chunks.forEach((chunk, i) => {
          const y = 20 + i * (SINGLE_STAVE_HEIGHT_PX + SYSTEM_GAP_PX);
          drawStaveSystem(
            context, chunk, staveData.clef, 10, y, widths[i] - 20,
            staveData.keySignature, i === 0 ? staveData.timeSignature : undefined,
            activeNoteIds,
          );
        });
      }
    } catch (err) {
      console.error("Failed to render notation", err);
      container.innerHTML =
        '<p class="text-sm text-rose-600">Notation could not be rendered.</p>';
    }
  }, [data, activeNoteIds]);

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block max-w-full rounded-md border border-ivory-200 bg-ivory-50 p-3 text-slate-900 shadow-sm">
        {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>}
        <div ref={containerRef} className="overflow-x-auto" />
      </div>
    </div>
  );
}
