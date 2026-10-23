/**
 * Source packs: batches of pieces ingested from piano-midi.de and the Mutopia
 * Project as DRAFT catalogue entries (see ./import.ts). A pack lists, per piece,
 * the pinned primary file (URL and sha256), where it came from, and the
 * independent second source its opening is checked against.
 *
 * Nothing a pack ingests is ever published or public-eligible by the pipeline
 * itself: a reviewer publishes it, and piano-midi.de material additionally
 * stays out of public builds until its licence is confirmed (see
 * UNCONFIRMED_LICENCE_SOURCES in ../backfill.ts).
 */
import type { AliasSeed, Era, MoodTagId, WorkGenre } from "../works-data.js";

/** A Mutopia licence name as the site prints it. */
export type MutopiaLicence =
  | "Public Domain"
  | "Creative Commons Attribution 3.0"
  | "Creative Commons Attribution 4.0"
  | "Creative Commons Attribution-ShareAlike 2.5"
  | "Creative Commons Attribution-ShareAlike 3.0"
  | "Creative Commons Attribution-ShareAlike 4.0";

/** A piano-midi.de file. Fetched from `url`; the site itself refuses scripted requests. */
export interface PianoMidiDeSource {
  kind: "piano-midi-de";
  /** File name on piano-midi.de, e.g. "mond_2.mid". */
  file: string;
  /** Exact URL fetched (a copy of the file; the bytes are pinned by `sha256`). */
  url: string;
  sha256: string;
}

/** A Mutopia Project file, possibly a member of a `.zip`. */
export interface MutopiaSource {
  kind: "mutopia";
  /** Piece number on the Mutopia site, e.g. "1007". */
  mutopiaId: string;
  url: string;
  sha256: string;
  member?: string;
  infoUrl: string;
}

/** A Mutopia file chosen as the primary source (adds what the credit needs). */
export interface MutopiaPrimarySource extends MutopiaSource {
  /** The id as written in the file header, e.g. "Mutopia-2015/08/18-931". */
  mutopiaRef: string;
  licence: MutopiaLicence;
  /** Who typeset the edition (the attribution a CC licence requires). */
  maintainer: string;
}

/**
 * An independent source for the opening-notes check that cannot be read by
 * machine (an IMSLP scan of a public-domain edition): the piece is ingested
 * unchecked and a reviewer compares it by eye.
 */
export interface ScanSecondSource {
  kind: "scan";
  reference: string;
  reason: string;
}

export interface PackPiece {
  /** Work id, e.g. "moonlight-sonata-2". */
  slug: string;
  /** Order within the pack, most recognisable first. */
  rank: number;
  title: string;
  /** Composer's credited name (matches the Composer table). */
  composer: string;
  catalogue?: string;
  movement?: string;
  genre: WorkGenre;
  era: Era;
  /** Editorial difficulty 1-5; sets the approximate grade band. */
  level: 1 | 2 | 3 | 4 | 5;
  tags?: MoodTagId[];
  aliases?: AliasSeed[];
  primary: PianoMidiDeSource | MutopiaPrimarySource;
  second: MutopiaSource | ScanSecondSource;
}

export interface Pack {
  id: string;
  name: string;
  pieces: PackPiece[];
}

export const PIANO_MIDI_DE_HOME = "https://www.piano-midi.de/";
export const PIANO_MIDI_DE_AUTHOR = "Bernd Krueger";
/** Stored in Song.file_licence and Song.content_rights for piano-midi.de files. */
export const PIANO_MIDI_DE_LICENCE_TAG = "cc-by-sa-3.0-de";
const PIANO_MIDI_DE_LICENCE_NAME = "Creative Commons Attribution-ShareAlike 3.0 Germany (CC BY-SA 3.0 DE)";
const PIANO_MIDI_DE_LICENCE_URL = "https://creativecommons.org/licenses/by-sa/3.0/de/";

/** "Copyright © 1998 by Bernd Krueger" (some files spell it Krüger), as found in a piano-midi.de file. */
const COPYRIGHT_NOTICE = /Copyright\s*(?:©|\(c\))\s*(\d{4})\s+by\s+Bernd\s+Kr(?:ue|ü)ger/i;

/** The copyright year, when a piano-midi.de file carries Bernd Krueger's notice; null otherwise. */
export function pianoMidiDeCopyrightYear(notices: string[]): number | null {
  for (const text of notices) {
    const match = COPYRIGHT_NOTICE.exec(text);
    if (match) return Number(match[1]);
  }
  return null;
}

export const isPianoMidiDe = (source: PackPiece["primary"]): source is PianoMidiDeSource => source.kind === "piano-midi-de";

/** Short licence tag for a Mutopia licence name, in the form Song.file_licence uses. */
export function mutopiaLicenceTag(licence: MutopiaLicence): string {
  if (licence === "Public Domain") return "public-domain";
  const version = /(\d\.\d)$/.exec(licence)?.[1] ?? "";
  return `${licence.includes("ShareAlike") ? "cc-by-sa" : "cc-by"}-${version}`;
}

/** The licence tag of a piece's primary file. */
export const fileLicenceOf = (piece: PackPiece): string =>
  isPianoMidiDe(piece.primary) ? PIANO_MIDI_DE_LICENCE_TAG : mutopiaLicenceTag(piece.primary.licence);

/** Song.source_kind. */
export const sourceKindOf = (piece: PackPiece): "piano-midi-de" | "mutopia" => piece.primary.kind;

/** Song.source_ref: the file name, or the Mutopia piece id. */
export const sourceRefOf = (piece: PackPiece): string => (isPianoMidiDe(piece.primary) ? piece.primary.file : piece.primary.mutopiaRef);

/** Song.source_url: the page the piece's credit points at. */
export const sourceUrlOf = (piece: PackPiece): string => (isPianoMidiDe(piece.primary) ? PIANO_MIDI_DE_HOME : piece.primary.infoUrl);

/** Song id: stable and derived from the source, so a re-run finds the same row. */
export const songIdOf = (piece: PackPiece): string =>
  isPianoMidiDe(piece.primary) ? `pmd-${piece.primary.file.replace(/\.mid$/i, "")}` : `mutopia-${piece.primary.mutopiaId}`;

/**
 * The credit line the licence requires. For piano-midi.de: the author, the
 * site, the copyright year read from the file, the licence with a link to it,
 * and the share-alike condition.
 */
export function attributionFor(piece: PackPiece, copyrightYear: number | null): string {
  const { primary } = piece;
  if (isPianoMidiDe(primary)) {
    const year = copyrightYear ? ` Copyright © ${copyrightYear} by ${PIANO_MIDI_DE_AUTHOR}.` : "";
    return (
      `${piece.title} (${piece.composer}). MIDI sequence by ${PIANO_MIDI_DE_AUTHOR}, piano-midi.de (${primary.file}).${year} ` +
      `Licensed under ${PIANO_MIDI_DE_LICENCE_NAME}, ${PIANO_MIDI_DE_LICENCE_URL}. Adaptations must be shared under the same licence.`
    );
  }
  const who = primary.maintainer && primary.maintainer !== "Anonymous" ? ` typeset by ${primary.maintainer}` : "";
  return `${piece.title} (${piece.composer}),${who} for the Mutopia Project, ${primary.mutopiaRef}. ${primary.licence}. ${primary.infoUrl}`;
}
