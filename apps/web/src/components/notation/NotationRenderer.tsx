import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Renderer,
  Stave,
  StaveNote,
  Formatter,
  Voice,
  StaveConnector,
  StaveTie,
  Accidental,
  Beam,
  Dot,
  Fraction,
  Tuplet,
  type RenderContext,
} from "vexflow";
import { midiToVexKey, type NoteData } from "../../utils/measureNotation";
import { displayAccidentals, keyFromSpec } from "../../utils/keySignature";

/** VexFlow ticks per whole note (Tables.RESOLUTION, which the typings do not export). */
const VEXFLOW_RESOLUTION = 16384;

interface MeasureData {
  notes: NoteData[];
  /** Clef change starting at this measure. */
  clef?: string;
  /** Meter change starting at this measure. */
  timeSignature?: string;
  /** Key change starting at this measure (VexFlow spec, e.g. "E"). */
  keySignature?: string;
}

interface SimpleStaveData {
  clef: string;
  timeSignature?: string;
  /** Optional key signature spec, e.g. "G", "D", "F", "Bb", "Am" (VexFlow names). */
  keySignature?: string;
  /** Flat note list (original shape). Ignored when `measures` is present. */
  notes?: NoteData[];
  /** Measure-grouped notes; barlines are drawn between measures. */
  measures?: MeasureData[];
}

interface GrandStaffData {
  grandStaff: true;
  treble: SimpleStaveData;
  bass: SimpleStaveData;
}

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
 * Counts dots in a duration code ("qd" → 1, "8d" → 1, "q" → 0). Same parse
 * as VexFlow's Note.parseDuration (vexflow/src/note.ts), which handles the
 * tick math for "d" suffixes but does NOT draw the dot glyph — that requires
 * an explicit Dot modifier (Dot.buildAndAttach), same story as accidentals.
 * Also matches rest codes ("hr", "qr") via the trailing [nrhms] group.
 */
function dotsFromDuration(duration: string): number {
  const match = /^(\d*\/?\d+|[a-z])(d*)([nrhms]|$)/.exec(duration);
  return match ? match[2].length : 0;
}

const BASE_QUARTERS: Record<string, number> = { w: 4, h: 2, q: 1, "1": 4, "2": 2, "4": 1, "8": 0.5, "16": 0.25, "32": 0.125, "64": 0.0625 };

/** How many quarter notes a NoteData occupies (dots, triplets and whole-bar rests included). */
export function noteLengthInQuarters(note: NoteData): number {
  if (note.barRest !== undefined) return note.barRest;
  const match = /^(\d+|[a-z])(d*)/.exec(note.duration);
  const base = match ? BASE_QUARTERS[match[1]] ?? 1 : 1;
  const dots = match ? match[2].length : 0;
  const dotted = base * (2 - 1 / 2 ** dots);
  return note.tuplet !== undefined ? (dotted * 2) / 3 : dotted;
}

/**
 * Normalizes a stave's content to measure groups: `measures` wins when
 * present; a flat `notes` array is treated as a single measure (no barlines),
 * preserving the original rendering for existing content.
 */
function measuresOf(data: SimpleStaveData): MeasureData[] {
  if (data.measures && data.measures.length > 0) return data.measures.map((m) => ({ ...m, notes: m.notes ?? [] }));
  return data.notes && data.notes.length > 0 ? [{ notes: data.notes }] : [];
}

/**
 * A fixed canvas width was clipping accidentals on longer note runs — a note
 * late in a 16-note passage could get formatted past the SVG's own right
 * edge, silently cutting off its sharp/flat glyph. Each measure is sized from
 * the number of distinct note positions in it instead, with overflow-x-auto
 * on the container as a fallback for anything still too wide.
 */
export const NOTE_WIDTH_PX = 34;
export const BARLINE_WIDTH_PX = 14;
const KEY_SIG_ACCIDENTAL_PX = 12;
export const STAVE_MARGIN_PX = 90;
const MIN_MEASURE_CONTENT_PX = 60;
/** A lone measure (an exercise without barlines) still gets a readable line. */
const MIN_SINGLE_MEASURE_CONTENT_PX = 300;

/**
 * Distinct onset positions in one measure across all the given staves. On a
 * grand staff the two hands are formatted together (so beat 2 in the right
 * hand sits directly above beat 2 in the left), which means the measure
 * needs a column for every position EITHER hand plays at — not just the
 * busier hand's note count.
 */
function measureColumns(staffMeasures: (MeasureData | undefined)[]): number {
  // Position → widest accidental stack any staff has there (sharps/flats spelled
  // in the key; an over-estimate under a key signature, which is the safe side).
  const positions = new Map<number, number>();
  for (const measure of staffMeasures) {
    let t = 0;
    for (const note of measure?.notes ?? []) {
      const position = Math.round(t * 48);
      const accidentals = note.duration.includes("r") ? 0 : note.keys.filter((key) => /^[a-g](#|b)/i.test(key)).length;
      positions.set(position, Math.max(positions.get(position) ?? 0, accidentals));
      t += noteLengthInQuarters(note);
    }
  }
  let columns = 0;
  for (const accidentals of positions.values()) columns += 1 + 0.4 * Math.min(accidentals, 3);
  return Math.max(columns, 1);
}

function keySigWidth(keySignature?: string): number {
  return Math.abs(keyFromSpec(keySignature)?.fifths ?? 0) * KEY_SIG_ACCIDENTAL_PX;
}

/** Rough per-measure width used only to decide where a line should wrap — not the final rendered width. */
function measureWidthPx(staffMeasures: (MeasureData | undefined)[]): number {
  const changes = staffMeasures[0];
  return (
    measureColumns(staffMeasures) * NOTE_WIDTH_PX +
    BARLINE_WIDTH_PX +
    (changes?.keySignature ? keySigWidth(changes.keySignature) * 2 + 10 : 0) +
    (changes?.timeSignature ? 30 : 0)
  );
}

/** Longest a single staff system (line) is allowed to get before wrapping to a new row — mirrors printed sheet music instead of one long horizontally-scrolling line. */
const MAX_SYSTEM_WIDTH_PX = 900;
const SINGLE_STAVE_HEIGHT_PX = 150;
const SYSTEM_GAP_PX = 30;
const GRAND_STAVE_HEIGHT_PX = 230;
const GRAND_SYSTEM_GAP_PX = 40;

/** Chunks measure indices into systems (lines), never splitting a single measure across two lines. All staves break together. */
function chunkIntoSystems(staves: MeasureData[][], maxWidthPx: number): { from: number; to: number }[] {
  const measureCount = Math.max(...staves.map((s) => s.length), 0);
  const systems: { from: number; to: number }[] = [];
  let from = 0;
  let currentWidth = STAVE_MARGIN_PX;
  for (let i = 0; i < measureCount; i++) {
    const width = measureWidthPx(staves.map((s) => s[i]));
    if (i > from && currentWidth + width > maxWidthPx) {
      systems.push({ from, to: i });
      from = i;
      currentWidth = STAVE_MARGIN_PX;
    }
    currentWidth += width;
  }
  if (measureCount > from) systems.push({ from, to: measureCount });
  return systems;
}

/** Beam grouping for a meter: one beam group per counted beat (a dotted quarter in 6/8, a quarter in 4/4; a whole 3/8 bar). */
function beamGroupsFor(timeSignature: string): Fraction[] {
  const [numerator, denominator] = timeSignature.split("/").map(Number);
  if (!numerator || !denominator) return [new Fraction(1, 4)];
  if (denominator >= 8 && numerator % 3 === 0) return [new Fraction(3, denominator)];
  if (denominator >= 8) return [new Fraction(numerator, denominator)];
  return [new Fraction(1, denominator)];
}

/** Running state while walking one staff's measures across systems: the key and meter in force, and the last note (for ties). */
interface StaffState {
  clef: string;
  keySignature?: string;
  timeSignature: string;
  /** False for content that never declared a meter: don't invent a 4/4 sign for it. */
  showTimeSignature: boolean;
  previous: { note: StaveNote; data: NoteData; system: number } | null;
}

/** One measure of one system, laid out (staves sized, notes formatted) but not yet drawn. */
interface LaidMeasure {
  staves: Stave[];
  voices: Voice[];
  beams: Beam[];
  tuplets: Tuplet[];
  noteEntries: { note: StaveNote; ids?: string[] }[];
}

interface LaidSystem {
  measures: LaidMeasure[];
  ties: StaveTie[];
  width: number;
}

function buildStaveNote(n: NoteData, clef: string, accidentals: (string | null)[]): StaveNote {
  const isRest = n.duration.includes("r");
  const staveNote = new StaveNote({
    keys: n.keys,
    duration: n.duration,
    clef,
    auto_stem: !isRest,
  });
  // A whole rest drawn for a whole silent bar has to LAST the whole bar too,
  // or a 3/4 / 6/8 bar would hold four beats and drag the other hand out of
  // line. Scale its ticks from a whole note (4 quarters) to the bar's length.
  if (n.barRest !== undefined && Math.abs(n.barRest - 4) > 1e-6) {
    staveNote.applyTickMultiplier(Math.round(n.barRest * 8), 32);
  }
  // Key strings like "c#/4" place the note at the right pitch but draw no
  // glyph — the Accidental modifier must be attached explicitly. Which ones
  // to draw (key signature, earlier accidentals in the bar) is decided by
  // displayAccidentals.
  accidentals.forEach((accidental, keyIndex) => {
    if (accidental) staveNote.addModifier(new Accidental(accidental), keyIndex);
  });
  const dots = dotsFromDuration(n.duration);
  for (let i = 0; i < dots; i++) Dot.buildAndAttach([staveNote], { all: true });
  return staveNote;
}

/**
 * Builds one staff's notes for one measure: accidentals for the bar, ties
 * from the previous note on the staff, triplets and beams. Returns the
 * measure's Voice (sized to its real length).
 */
function buildMeasureNotes(
  measure: MeasureData,
  state: StaffState,
  system: number,
  ties: StaveTie[],
): { voice: Voice; beams: Beam[]; tuplets: Tuplet[]; noteEntries: { note: StaveNote; ids?: string[] }[] } {
  const fifths = keyFromSpec(state.keySignature)?.fifths ?? 0;
  const previousTied = state.previous?.data.tie === true;
  const accidentals = displayAccidentals(
    measure.notes.map((n, i) => ({
      keys: n.keys,
      isRest: n.duration.includes("r"),
      tiedFromPrevious: i === 0 ? previousTied : measure.notes[i - 1].tie === true,
    })),
    fifths,
  );

  const notes: StaveNote[] = [];
  const noteEntries: { note: StaveNote; ids?: string[] }[] = [];
  const tupletGroups = new Map<number, StaveNote[]>();
  measure.notes.forEach((n, i) => {
    const staveNote = buildStaveNote(n, state.clef, accidentals[i]);
    notes.push(staveNote);
    noteEntries.push({ note: staveNote, ids: n.ids });
    if (n.tuplet !== undefined) tupletGroups.set(n.tuplet, [...(tupletGroups.get(n.tuplet) ?? []), staveNote]);

    const previous = state.previous;
    if (previous?.data.tie) {
      const indices = n.keys.map((_, k) => k);
      if (previous.system === system) {
        ties.push(new StaveTie({ first_note: previous.note, last_note: staveNote, first_indices: indices, last_indices: indices }));
      } else {
        // Over a line break: a half tie off the end of one line, and one into the start of the next.
        ties.push(new StaveTie({ first_note: previous.note, first_indices: indices, last_indices: indices }));
        ties.push(new StaveTie({ last_note: staveNote, first_indices: indices, last_indices: indices }));
      }
    }
    state.previous = { note: staveNote, data: n, system };
  });

  // Triplets change their notes' ticks, so they must exist before the notes
  // join a Voice (which totals ticks as they are added).
  const tuplets: Tuplet[] = [];
  for (const group of tupletGroups.values()) {
    // A bracket only when the group can't be read from its beam alone.
    const bracketed = group.some((note) => note.isRest() || note.getDuration() !== "8");
    tuplets.push(new Tuplet(group, { num_notes: 3, notes_occupied: 2, bracketed }));
  }
  const beams = Beam.generateBeams(notes, { groups: beamGroupsFor(state.timeSignature) });

  const totalTicks = notes.reduce((sum, note) => sum + note.getTicks().value(), 0);
  // beat_value = the default resolution, so one "beat" is one tick: the voice
  // declares exactly the length it holds.
  const voice = new Voice({ num_beats: Math.max(1, Math.round(totalTicks)), beat_value: VEXFLOW_RESOLUTION });
  voice.setStrict(false);
  voice.addTickables(notes);
  return { voice, beams, tuplets, noteEntries };
}

/**
 * Lays out one system (line) — one staff, or a treble/bass pair — as a row of
 * per-measure staves. Each measure is formatted on its own, with all its
 * staves TOGETHER so notes at the same beat line up vertically across the
 * grand staff (formatting each hand separately is what left the left-hand
 * rests floating under the wrong right-hand notes). Measure by measure rather
 * than one long voice, because VexFlow's justifier lets a context shift back
 * by up to 5% of the line width: on a 30,000px scrolling score that let notes
 * slide hundreds of pixels backwards over each other.
 *
 * Clef is drawn at every line start; the key signature in force is repeated
 * there, as in real engraving; the time signature only on the first line or
 * where it changes. Key and meter changes inside a line are drawn at the
 * start of the measure where they happen.
 */
function layoutSystem(
  staffMeasures: MeasureData[][],
  states: StaffState[],
  x: number,
  ys: number[],
  system: number,
): LaidSystem {
  const measureCount = Math.max(...staffMeasures.map((m) => m.length), 0);
  const measures: LaidMeasure[] = [];
  const ties: StaveTie[] = [];
  let cursor = x;

  for (let m = 0; m < measureCount; m++) {
    const slice = staffMeasures.map((staff) => staff[m] ?? { notes: [] });
    const staves = slice.map((measure, s) => {
      const state = states[s];
      const stave = new Stave(cursor, ys[s], 1000);
      const meterChanges = !!measure.timeSignature && measure.timeSignature !== state.timeSignature;
      const keyChanges = !!measure.keySignature && measure.keySignature !== state.keySignature;
      const clefChanges = !!measure.clef && measure.clef !== state.clef;
      if (clefChanges) state.clef = measure.clef!;
      if (m === 0) {
        if (keyChanges) state.keySignature = measure.keySignature;
        if (meterChanges) state.timeSignature = measure.timeSignature!;
        stave.addClef(state.clef);
        if (state.keySignature) stave.addKeySignature(state.keySignature);
        if ((system === 0 && state.showTimeSignature) || meterChanges) stave.addTimeSignature(state.timeSignature);
      } else {
        // A change of clef mid-line is drawn smaller, as in print.
        if (clefChanges) stave.addClef(state.clef, "small");
        if (keyChanges) {
          stave.addKeySignature(measure.keySignature!, state.keySignature ?? "C");
          state.keySignature = measure.keySignature;
        }
        if (meterChanges) {
          stave.addTimeSignature(measure.timeSignature!);
          state.timeSignature = measure.timeSignature!;
        }
      }
      return stave;
    });

    const built = slice.map((measure, s) => buildMeasureNotes(measure, states[s], system, ties));

    // Size every stave of the measure to its widest opening modifiers plus
    // room for its note columns, then line their note start points up.
    const modifierWidth = Math.max(...staves.map((stave) => stave.getNoteStartX() - stave.getX()));
    const minContent = measureCount === 1 ? MIN_SINGLE_MEASURE_CONTENT_PX : MIN_MEASURE_CONTENT_PX;
    const contentWidth = Math.max(measureColumns(slice) * NOTE_WIDTH_PX, minContent) + BARLINE_WIDTH_PX;
    for (const stave of staves) stave.setWidth(modifierWidth + contentWidth);
    if (staves.length > 1) Stave.formatBegModifiers(staves);

    const voices = built.map((b) => b.voice);
    built.forEach((b, s) => {
      b.voice.setStave(staves[s]);
      for (const tickable of b.voice.getTickables()) tickable.setStave(staves[s]);
    });
    if (voices.some((voice) => voice.getTickables().length > 0)) {
      // globalSoftmax: space by each note's share of the measure's ticks across
      // BOTH staves. The default per-voice softmax, with two voices sharing tick
      // contexts, under-fills the measure.
      const formatter = new Formatter({ globalSoftmax: true });
      for (const voice of voices) formatter.joinVoices([voice]);
      const noteStartX = Math.max(...staves.map((stave) => stave.getNoteStartX()));
      formatter.format(voices, Math.max(staves[0].getNoteEndX() - noteStartX - BARLINE_WIDTH_PX, 20));
    }

    measures.push({
      staves,
      voices,
      beams: built.flatMap((b) => b.beams),
      tuplets: built.flatMap((b) => b.tuplets),
      noteEntries: built.flatMap((b) => b.noteEntries),
    });
    cursor += modifierWidth + contentWidth;
  }
  return { measures, ties, width: cursor - x };
}

/** Draws a laid-out system, and records each note's SVG element (for highlighting) and x (for the scrolling cursor). */
function drawSystem(
  context: RenderContext,
  laid: LaidSystem,
  noteElementsById: Map<string, SVGElement>,
  /** When provided, each drawn note's post-format x pixel is appended here,
   *  once per id in its `NoteData.ids` — the primitive ScrollingScore uses
   *  to build its beat→x cursor mapping (see NotationRenderer's `onLayout`). */
  positions?: { id: string; x: number }[],
): void {
  for (const measure of laid.measures) {
    for (const stave of measure.staves) stave.setContext(context).draw();
    if (measure.staves.length > 1) {
      // Barline through both staves of a grand staff, as printed music has.
      const barline = new StaveConnector(measure.staves[0], measure.staves[measure.staves.length - 1]);
      barline.setType("singleRight");
      barline.setContext(context).draw();
    }
    measure.voices.forEach((voice, s) => voice.draw(context, measure.staves[s]));
    for (const beam of measure.beams) beam.setContext(context).draw();
    for (const tuplet of measure.tuplets) tuplet.setContext(context).draw();
  }
  for (const tie of laid.ties) tie.setContext(context).draw();

  for (const measure of laid.measures) {
    for (const { note, ids } of measure.noteEntries) {
      const el = note.getSVGElement();
      // Tag rests so they can be told apart from noteheads in the DOM (styling, and
      // the rest-vs-notehead collision check used when verifying engraving).
      if (note.isRest()) el?.classList.add("ks-rest");
      if (!ids || ids.length === 0 || !el) continue;
      // getAbsoluteX() is only meaningful once the voice has been formatted and drawn.
      if (positions) {
        const noteX = note.getAbsoluteX();
        for (const id of ids) positions.push({ id, x: noteX });
      }
      for (const id of ids) noteElementsById.set(id, el);
    }
  }
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
 * entry in docs/operations.md — a previous clipping bug here came from
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
  // Copy fields explicitly — never `{ ...box }`. The real caller passes the
  // DOMRect from getBBox(), whose x/y/width/height are prototype getters, not
  // own properties, so a spread silently drops x and width (→ NaN viewBox).
  return { x: box.x, y: top, width: box.width, height: bottom - top };
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
  // renderer.resize() also wrote an inline style size, which beats the
  // attributes: left alone, the SVG keeps its pre-crop box and the browser
  // letterboxes the cropped viewBox inside it (shrunk, and pushed sideways).
  svg.style.width = `${width}px`;
  svg.style.height = `${height}px`;
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
      const grand = isGrandStaffData(data);
      const staffData = grand
        ? [(data as unknown as GrandStaffData).treble, (data as unknown as GrandStaffData).bass]
        : [data as unknown as SimpleStaveData];
      const staffMeasures = staffData.map(measuresOf);
      const states: StaffState[] = staffData.map((d) => ({
        clef: d.clef,
        keySignature: d.keySignature,
        timeSignature: d.timeSignature ?? "4/4",
        showTimeSignature: !!d.timeSignature,
        previous: null,
      }));
      const staveHeight = grand ? GRAND_STAVE_HEIGHT_PX : SINGLE_STAVE_HEIGHT_PX;
      const gap = grand ? GRAND_SYSTEM_GAP_PX : SYSTEM_GAP_PX;
      const pad = grand ? 40 : 20;
      // Lay every line out first — the SVG has to be sized before anything is drawn.
      const laid = chunkIntoSystems(staffMeasures, maxSystemWidthPx).map(({ from, to }, i) => {
        const y = 20 + i * (staveHeight + gap);
        return layoutSystem(
          staffMeasures.map((measures) => measures.slice(from, to)),
          states,
          pad / 2,
          grand ? [y, y + 90] : [y],
          i,
        );
      });
      const width = Math.max(...laid.map((system) => system.width), 0);
      const totalHeight = laid.length * staveHeight + Math.max(laid.length - 1, 0) * gap;

      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(width + pad, totalHeight + pad);
      const context = renderer.getContext();

      laid.forEach((system) => {
        drawSystem(context, system, noteElementsById, onLayoutRef.current ? positions : undefined);
        const first = system.measures[0];
        if (!first) return;
        if (grand) {
          const [trebleStave, bassStave] = first.staves;
          rangeStaves.treble ??= trebleStave;
          rangeStaves.bass ??= bassStave;
          const brace = new StaveConnector(trebleStave, bassStave);
          brace.setType("brace");
          brace.setContext(context).draw();
          const leftLine = new StaveConnector(trebleStave, bassStave);
          leftLine.setType("singleLeft");
          leftLine.setContext(context).draw();
        } else {
          rangeStaves.single ??= { stave: first.staves[0], clef: staffData[0].clef };
        }
      });
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
