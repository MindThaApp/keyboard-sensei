import type { ViolinHint } from "@keyboard-sensei/shared-types";
import { VIOLIN_STRING_NUMERAL, ordinal, type ViolinStringName } from "@keyboard-sensei/music-theory/violin";

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
 * Copies an exercise's violin hints onto the engraved notes (matched by note id),
 * deciding what to print so the staff stays readable:
 *  - the finger number on every note;
 *  - the string numeral on the first note and wherever the string changes;
 *  - "Nth pos." on the first note when it is not first position, and wherever the position changes;
 *  - the bow direction and slur ends as authored.
 * Pure: returns a new staff and leaves the input alone.
 */
export function applyViolinHints<N extends HintedNote, T extends HintedStaff<N>>(staff: T, hints: Record<string, ViolinHint>): T {
  let previous: ViolinHint | null = null;
  return {
    ...staff,
    measures: staff.measures.map((measure) => ({
      ...measure,
      notes: measure.notes.map((note) => {
        const hint = note.ids?.map((id) => hints[id]).find((h): h is ViolinHint => h !== undefined);
        if (!hint || note.duration.includes("r")) return note;
        const marks: ViolinMarks = { finger: hint.finger };
        if (!previous || previous.string !== hint.string) marks.string = hint.string;
        if ((!previous && hint.position > 1) || (previous && previous.position !== hint.position)) marks.position = hint.position;
        if (hint.bow) marks.bow = hint.bow;
        if (hint.slur) marks.slur = hint.slur;
        previous = hint;
        return { ...note, violin: marks };
      }),
    })),
  };
}
