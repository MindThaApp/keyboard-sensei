/**
 * Plain-language replacements for jargon, plus the "what is this?" text shown by <InfoTip term>.
 * Structure only: the copy table in the redesign spec (section 5) is filled in by the jargon
 * and copy package.
 */
export interface GlossaryEntry {
  /** The plain wording to show in place of the technical term. */
  plain: string;
  /** One or two sentences for the InfoTip popover. Omit when the plain wording says it all. */
  tip?: string;
}

/** Add keys here as terms are replaced, e.g. `lookAhead: { plain: "How far ahead you see", tip: "..." }`. */
export const glossary = {} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTerm = keyof typeof glossary;

/** Looks a term up by key. Accepts any string so callers need no cast while the table is empty. */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return (glossary as Record<string, GlossaryEntry>)[term];
}
