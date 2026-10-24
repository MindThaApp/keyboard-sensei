import type { ScoreFormat } from "./score-file.js";

/**
 * Verovio writes a note's sounding accidental into MEI (`accid.ges`) only when its own
 * importer sees a need, and its MIDI writer reads nothing else (it does not apply the key
 * signature or an accidental earlier in the bar to a note that has none). So an imported
 * note that depends on either plays a semitone off. This adds the missing `accid.ges`
 * to the MEI of the two text formats that lose it, from the source's own spelling:
 *
 * - **kern spells every note's accidental in full, whatever the key, so each MEI note
 *   (its id names the source line and column) takes its accidental from its token.
 * - ABC leaves a bar's earlier accidental to carry to later notes of the same pitch, so
 *   it is carried in MEI order, restarting at each measure (Verovio already writes the
 *   key signature's accidentals).
 *
 * Only `accid.ges` is added, which is never engraved: the notation does not change.
 */

const GESTURAL = ["ff", "f", "n", "s", "ss"] as const;
const gestural = (alter: number): string => GESTURAL[Math.max(-2, Math.min(2, alter)) + 2];

const NOTE_TAG = /<note\b[^>]*>/g;
const hasAccidental = (tag: string): boolean => /\saccid(\.ges)?="/.test(tag);
const withGestural = (tag: string, value: string): string => tag.replace(/\s*(\/?)>$/, ` accid.ges="${value}"$1>`);

/** The alteration a **kern token spells: `#` raises, `-` lowers, `n` is natural. */
function kernAlter(token: string): number | null {
  const pitch = /([a-gA-G])\1*([#\-n]*)/.exec(token);
  if (!pitch) return null;
  const marks = pitch[2];
  return (marks.match(/#/g)?.length ?? 0) - (marks.match(/-/g)?.length ?? 0);
}

function fromKern(mei: string, source: string): string {
  const lines = source.split(/\r\n|\r|\n/);
  return mei.replace(NOTE_TAG, (tag) => {
    if (hasAccidental(tag)) return tag;
    const id = /\sxml:id="note-L(\d+)F(\d+)(?:S(\d+))?/.exec(tag);
    if (!id) return tag;
    const token = lines[Number(id[1]) - 1]?.split("\t")[Number(id[2]) - 1]?.split(" ")[Number(id[3] ?? 1) - 1];
    const alter = token ? kernAlter(token) : null;
    return alter === null ? tag : withGestural(tag, gestural(alter));
  });
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\s${name.replace(".", "\\.")}="([^"]*)"`).exec(tag)?.[1];

function fromAbc(mei: string): string {
  let inBar = new Map<string, string>();
  return mei.replace(/<measure\b[^>]*>|<note\b[^>]*?\/>|<note\b[^>]*>[\s\S]*?<\/note>/g, (element) => {
    if (element.startsWith("<measure")) {
      inBar = new Map();
      return element;
    }
    // The note's own tag; a written accidental is an attribute of it or an <accid> child.
    const open = /^<note\b[^>]*>/.exec(element)![0];
    const child = /<accid\b[^>]*>/.exec(element)?.[0];
    const pitch = `${attr(open, "pname")}${attr(open, "oct")}`;
    const written = attr(open, "accid.ges") ?? attr(open, "accid") ?? (child && (attr(child, "accid.ges") ?? attr(child, "accid")));
    if (written) {
      inBar.set(pitch, written);
      return element;
    }
    const carried = inBar.get(pitch);
    return carried ? withGestural(open, carried) + element.slice(open.length) : element;
  });
}

export function addGesturalAccidentals(mei: string, format: ScoreFormat, source: string): string {
  if (format === "humdrum") return fromKern(mei, source);
  if (format === "abc") return fromAbc(mei);
  return mei;
}
