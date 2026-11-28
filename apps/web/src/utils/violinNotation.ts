import { isViolinHint, type GuitarHint, type ViolinHint } from "@keyboard-sensei/shared-types";
import { VIOLIN_STRING_NUMERAL, ordinal, printedMarks, type FingerPatternId, type ViolinStringName } from "@keyboard-sensei/music-theory/violin";

/**
 * Violin marks on one note of a lesson's notation data (`NoteData.violin`).
 * All fields are optional; absent means "draw nothing".
 */
export interface ViolinMarks {
  /** 0 = open string, 1-4 = finger. Drawn above the note. */
  finger?: 0 | 1 | 2 | 3 | 4;
  /** Draws the string as a roman numeral (I = E ... IV = G), the way violin parts mark it. */
  string?: ViolinStringName;
  /** Draws "3rd pos." above the note; author it only where the position is announced or changes. */
  position?: number;
  /** Down-bow (a square bracket) or up-bow (a V). */
  bow?: "down" | "up";
  /** A slur from this note ("start") to a later note in the same measure ("end"). */
  slur?: "start" | "end";
}

export interface ViolinLabels {
  /** Text drawn above the note, left to right, in drawing order. */
  above: string[];
  /** VexFlow articulation code: "am" = down-bow, "a|" = up-bow. */
  bowCode: "am" | "a|" | null;
}

/** The text and glyph a note's violin marks turn into. Pure, so it can be tested without a DOM. */
export function violinLabels(marks: ViolinMarks | undefined): ViolinLabels {
  const above: string[] = [];
  if (!marks) return { above, bowCode: null };
  if (marks.position !== undefined) above.push(`${ordinal(marks.position)} pos.`);
  if (marks.string) above.push(VIOLIN_STRING_NUMERAL[marks.string]);
  if (marks.finger !== undefined) above.push(String(marks.finger));
  return { above, bowCode: marks.bow === "down" ? "am" : marks.bow === "up" ? "a|" : null };
}

interface HintedNote { ids?: string[]; duration: string; violin?: ViolinMarks }
interface HintedStaff<N extends HintedNote> { measures: { notes: N[] }[] }

/**
 * Copies an exercise's violin hints onto the engraved notes (matched by note id; any guitar
 * hints are ignored); what gets
 * printed is decided by `printedMarks` (music-theory) so lessons and the player agree.
 * Pure: returns a new staff and leaves the input alone.
 */
export function applyViolinHints<N extends HintedNote, T extends HintedStaff<N>>(staff: T, hints: Record<string, GuitarHint | ViolinHint>): T {
  const notes = staff.measures.flatMap((measure) => measure.notes);
  const hintFor = (note: N): ViolinHint | undefined =>
    note.duration.includes("r") ? undefined : note.ids?.map((id) => hints[id]).find(isViolinHint);
  const marks = new Map<N, ViolinMarks | undefined>();
  const printed = printedMarks(notes.map(hintFor));
  notes.forEach((note, index) => marks.set(note, printed[index]));
  return {
    ...staff,
    measures: staff.measures.map((measure) => ({
      ...measure,
      notes: measure.notes.map((note) => (marks.get(note) ? { ...note, violin: marks.get(note) } : note)),
    })),
  };
}

export interface FingerboardData {
  pattern?: FingerPatternId;
  marks: { string: ViolinStringName; finger: 0 | 1 | 2 | 3 | 4; offset: number }[];
}

const STRING_NAMES = ["G", "D", "A", "E"];

/**
 * Reads a lesson's `{ fingerboard: { pattern?, marks } }` notation data. Returns null when the
 * data is not a fingerboard diagram (so ordinary staff notation is untouched); throws away
 * marks that are not well formed rather than drawing nonsense.
 */
export function fingerboardFromData(data: Record<string, unknown>): FingerboardData | null {
  const raw = data.fingerboard;
  if (!raw || typeof raw !== "object") return null;
  const { pattern, marks } = raw as { pattern?: unknown; marks?: unknown };
  if (!Array.isArray(marks)) return null;
  const good = marks.filter(
    (mark): mark is FingerboardData["marks"][number] =>
      !!mark && typeof mark === "object" &&
      STRING_NAMES.includes((mark as { string?: string }).string ?? "") &&
      Number.isInteger((mark as { finger?: number }).finger) && (mark as { finger: number }).finger >= 0 && (mark as { finger: number }).finger <= 4 &&
      typeof (mark as { offset?: unknown }).offset === "number",
  );
  return { ...(pattern === "high2" || pattern === "low2" || pattern === "low1" ? { pattern } : {}), marks: good };
}
