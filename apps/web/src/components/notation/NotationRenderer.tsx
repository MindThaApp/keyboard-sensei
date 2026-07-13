import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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
import { midiToVexKey } from "../../utils/measureNotation";

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
export interface NotationRendererHandle {
  setActiveNoteIds: (activeNoteIds?: Set<string>) => void;
}
export interface NotationVerticalRange {
  lowestNote: number;
  highestNote: number;
}

interface StaveYGeometry {
  getYForLine(line: number): number;
  getYForNote(line: number): number;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

function buildStaveNote(
  n: NoteData,
  clef: string,
  sigAccidentals: Record<string, string>,
): StaveNote {
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
export const NOTE_WIDTH_PX = 34;
export const BARLINE_WIDTH_PX = 14;
const KEY_SIG_ACCIDENTAL_PX = 12;
export const STAVE_MARGIN_PX = 90;
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
  noteElementsById: Map<string, SVGElement>,
  /** When provided, each drawn note's post-format x pixel is appended here,
   *  once per id in its `NoteData.ids` — the primitive ScrollingScore uses
   *  to build its beat→x cursor mapping (see NotationRenderer's `onLayout`). */
  positions?: { id: string; x: number }[],
): Stave {
  const stave = new Stave(x, y, width);
  stave.addClef(clef);
  if (timeSignature) stave.addTimeSignature(timeSignature);
  if (keySignature) stave.addKeySignature(keySignature);
  stave.setContext(context).draw();

  const sigAccidentals = keySignatureAccidentals(keySignature);
  const tickables: (StaveNote | BarNote)[] = [];
  const noteEntries: { note: StaveNote; ids?: string[] }[] = [];
  let noteCount = 0;
  measures.forEach((measure, measureIndex) => {
    // One voice for the whole system; BarNote tickables (tick-free by
    // design) render the barlines between measure groups.
    if (measureIndex > 0) tickables.push(new BarNote());
    measure.forEach((n) => {
      const staveNote = buildStaveNote(n, clef, sigAccidentals);
      tickables.push(staveNote);
      noteEntries.push({ note: staveNote, ids: n.ids });
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

  // getAbsoluteX() is only meaningful once the voice has been formatted and
  // drawn above — it reads back the x the Formatter actually assigned.
  if (positions) {
    for (const { note, ids } of noteEntries) {
      if (!ids || ids.length === 0) continue;
      const noteX = note.getAbsoluteX();
      for (const id of ids) positions.push({ id, x: noteX });
    }
  }
  for (const { note, ids } of noteEntries) {
    if (!ids || ids.length === 0) continue;
    const el = note.getSVGElement();
    if (!el) continue;
    for (const id of ids) noteElementsById.set(id, el);
  }

  return stave;
}

/**
 * The pre-draw `renderer.resize(...)` calls above size the SVG generously
 * (clef/key-signature/margin worst-case) so nothing clips *during* drawing —
 * VexFlow's SVG root has `overflow: hidden` by spec, so anything drawn
 * outside the declared width/height is invisible. That fixed padding is also
 * where a lot of empty space above/below/right-of the notes came from.
 * After drawing, measure the ACTUAL ink extents (`getBBox`, which includes
 * ledger lines and accidentals — anything really drawn) and shrink the SVG's
 * viewBox/width/height down to that, with a small pad. This sizes to real
 * content instead of guessing a smaller constant (see the "magic numbers"
 * lesson in docs/agent-briefing.md — a previous clipping bug here came from
 * exactly that kind of guess).
 */
// Breathing room around the cropped ink. getBBox() returns the GEOMETRY box, which
// in some browsers excludes stroke width, so a hairline stem or ledger line can sit
// a pixel or two outside it. Keep this comfortably above zero: clipping a low note
// is far worse than a few px of margin.
const CONTENT_HUG_PAD_PX = 10;
const NOTEHEAD_RADIUS_IN_STAFF_SPACES = 0.5;
const EXTRA_VERTICAL_CLEARANCE_IN_STAFF_SPACES = 0.35;

function staffSpacePx(stave: StaveYGeometry): number {
  return Math.abs(stave.getYForLine(1) - stave.getYForLine(0));
}

function midiStaffLine(note: number, clef: string): number {
  const staveNote = new StaveNote({ keys: [midiToVexKey(note)], duration: "q", clef });
  return staveNote.getKeyProps()[0].line;
}

function yForMidi(stave: StaveYGeometry, note: number, clef: string): number {
  return stave.getYForNote(midiStaffLine(note, clef));
}

export function expandCropBoxForVerticalRange(
  box: CropBox,
  verticalRange: NotationVerticalRange | undefined,
  staves: { treble?: StaveYGeometry; bass?: StaveYGeometry; single?: { stave: StaveYGeometry; clef: string } },
): CropBox {
  if (!verticalRange) return box;
  const topStave = staves.treble ?? staves.single?.stave;
  const bottomStave = staves.bass ?? staves.single?.stave;
  const topClef = staves.treble ? "treble" : staves.single?.clef;
  const bottomClef = staves.bass ? "bass" : staves.single?.clef;
  if (!topStave || !bottomStave || !topClef || !bottomClef) return box;

  const topPad = staffSpacePx(topStave) * (NOTEHEAD_RADIUS_IN_STAFF_SPACES + EXTRA_VERTICAL_CLEARANCE_IN_STAFF_SPACES);
  const bottomPad = staffSpacePx(bottomStave) * (NOTEHEAD_RADIUS_IN_STAFF_SPACES + EXTRA_VERTICAL_CLEARANCE_IN_STAFF_SPACES);
  const requiredTop = yForMidi(topStave, verticalRange.highestNote, topClef) - topPad;
  const requiredBottom = yForMidi(bottomStave, verticalRange.lowestNote, bottomClef) + bottomPad;

  const top = Math.min(box.y, requiredTop);
  const bottom = Math.max(box.y + box.height, requiredBottom);
  return { ...box, y: top, height: bottom - top };
}

function syncActiveNoteElements(
  noteElementsById: Map<string, SVGElement>,
  previouslyActiveElements: Set<SVGElement>,
  activeNoteIds?: Set<string>,
): Set<SVGElement> {
  for (const el of previouslyActiveElements) el.classList.remove("note-active");

  const nextActiveElements = new Set<SVGElement>();
  if (activeNoteIds) {
    for (const id of activeNoteIds) {
      const el = noteElementsById.get(id);
      if (!el) continue;
      el.classList.add("note-active");
      nextActiveElements.add(el);
    }
  }
  return nextActiveElements;
}

function hugContent(
  container: HTMLDivElement,
  verticalRange?: NotationVerticalRange,
  staves: { treble?: Stave; bass?: Stave; single?: { stave: Stave; clef: string } } = {},
): void {
  const svg = container.querySelector("svg");
  if (!svg || typeof (svg as SVGGraphicsElement).getBBox !== "function") return;
  let bbox: DOMRect;
  try {
    bbox = (svg as SVGGraphicsElement).getBBox();
  } catch {
    return; // getBBox can throw before layout in some non-browser test environments
  }
  if (!bbox.width || !bbox.height) return;
  const cropBox = expandCropBoxForVerticalRange(bbox, verticalRange, staves);
  const width = cropBox.width + CONTENT_HUG_PAD_PX * 2;
  const height = cropBox.height + CONTENT_HUG_PAD_PX * 2;
  svg.setAttribute(
    "viewBox",
    `${cropBox.x - CONTENT_HUG_PAD_PX} ${cropBox.y - CONTENT_HUG_PAD_PX} ${width} ${height}`,
  );
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
}

/**
 * Renders lesson vexflowData with VexFlow. Handles the simple single-staff
 * shape and the grand-staff (treble+bass+brace) shape used in lessons. Long
 * pieces automatically wrap into multiple staff systems (like printed sheet
 * music) instead of one long horizontally-scrolling line.
 */
const NotationRenderer = forwardRef<NotationRendererHandle, {
  data: Record<string, unknown>;
  title?: string;
  /** ExpectedNoteEvent ids (or play-along note ids) currently due to be played — tinted on the stave. */
  activeNoteIds?: Set<string>;
  /** Width (px) at which a system wraps to a new line. Callers that need a
   *  height that never jumps (e.g. a rolling preview strip) can pass
   *  Infinity to force exactly one system regardless of note density. */
  maxSystemWidthPx?: number;
  /** Fires once per render with each drawn note's post-format absolute x pixel
   *  (one entry per id in its `NoteData.ids`) — how ScrollingScore learns
   *  where each beat landed on the ribbon. Read via a ref internally, so it
   *  need not be memoized by the caller and never re-triggers this effect. */
  onLayout?: (positions: { id: string; x: number }[]) => void;
  verticalRange?: NotationVerticalRange;
}>(function NotationRenderer({
  data,
  title,
  activeNoteIds,
  maxSystemWidthPx = MAX_SYSTEM_WIDTH_PX,
  onLayout,
  verticalRange,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLayoutRef = useRef(onLayout);
  const activeNoteIdsRef = useRef(activeNoteIds);
  const noteElementsByIdRef = useRef<Map<string, SVGElement>>(new Map());
  const activeNoteElementsRef = useRef<Set<SVGElement>>(new Set());
  onLayoutRef.current = onLayout;

  const applyActiveNoteIds = (nextActiveNoteIds?: Set<string>) => {
    activeNoteIdsRef.current = nextActiveNoteIds;
    activeNoteElementsRef.current = syncActiveNoteElements(
      noteElementsByIdRef.current,
      activeNoteElementsRef.current,
      nextActiveNoteIds,
    );
  };

  useImperativeHandle(ref, () => ({
    setActiveNoteIds: applyActiveNoteIds,
  }));

  useEffect(() => {
    applyActiveNoteIds(activeNoteIds);
  }, [activeNoteIds]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";
    const positions: { id: string; x: number }[] = [];
    const noteElementsById = new Map<string, SVGElement>();
    noteElementsByIdRef.current = noteElementsById;
    activeNoteElementsRef.current = new Set();
    const rangeStaves: { treble?: Stave; bass?: Stave; single?: { stave: Stave; clef: string } } = {};

    try {
      if (isGrandStaffData(data)) {
        const grandStaffData = data as unknown as GrandStaffData;
        const trebleMeasures = measuresOf(grandStaffData.treble);
        const bassMeasures = measuresOf(grandStaffData.bass);
        const systems = chunkGrandStaffIntoSystems(trebleMeasures, bassMeasures, maxSystemWidthPx);
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
            noteElementsById, onLayoutRef.current ? positions : undefined,
          );
          const bassStave = drawStaveSystem(
            context, system.bass, grandStaffData.bass.clef, 20, y + 90, widths[i] - 40,
            grandStaffData.bass.keySignature, i === 0 ? grandStaffData.bass.timeSignature : undefined,
            noteElementsById, onLayoutRef.current ? positions : undefined,
          );
          rangeStaves.treble ??= trebleStave;
          rangeStaves.bass ??= bassStave;
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
        const chunks = chunkMeasuresIntoSystems(measures, maxSystemWidthPx);
        const widths = chunks.map((chunk) => systemWidth(chunk, staveData.keySignature));
        const width = Math.max(...widths, 420);
        const totalHeight = chunks.length * SINGLE_STAVE_HEIGHT_PX + Math.max(chunks.length - 1, 0) * SYSTEM_GAP_PX;

        const renderer = new Renderer(container, Renderer.Backends.SVG);
        renderer.resize(width + 20, totalHeight + 20);
        const context = renderer.getContext();

        chunks.forEach((chunk, i) => {
          const y = 20 + i * (SINGLE_STAVE_HEIGHT_PX + SYSTEM_GAP_PX);
          const stave = drawStaveSystem(
            context, chunk, staveData.clef, 10, y, widths[i] - 20,
            staveData.keySignature, i === 0 ? staveData.timeSignature : undefined,
            noteElementsById, onLayoutRef.current ? positions : undefined,
          );
          rangeStaves.single ??= { stave, clef: staveData.clef };
        });
      }
      hugContent(container, verticalRange, rangeStaves);
      activeNoteElementsRef.current = syncActiveNoteElements(
        noteElementsById,
        activeNoteElementsRef.current,
        activeNoteIdsRef.current,
      );
      onLayoutRef.current?.(positions);
    } catch (err) {
      console.error("Failed to render notation", err);
      container.innerHTML =
        '<p class="text-sm text-rose-600">Notation could not be rendered.</p>';
    }
  }, [data, maxSystemWidthPx, verticalRange]);

  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block max-w-full rounded-md border border-ivory-200 bg-ivory-50 p-1 text-slate-900 shadow-sm">
        {title && <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h3>}
        <div ref={containerRef} className="overflow-x-auto" />
      </div>
    </div>
  );
});

export default NotationRenderer;
