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
