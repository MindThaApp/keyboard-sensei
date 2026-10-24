import type { Prisma } from "@prisma/client";
import { env } from "../config.js";

/**
 * Public-catalogue gating. With PUBLIC_CATALOGUE on, a shared (non-upload) song is
 * served only when the catalogue marked it `public_eligible`: a public-domain work
 * in a freely licensed file, from a source that is not ADL, the PianoCoRe archive,
 * an upload or a recording (see isPublicEligible in backfill.ts). With the flag
 * off, every shared song is served, as on the LAN.
 */
export interface EligibilityFields {
  uploader_id: string | null;
  public_eligible: boolean;
  /** The song's Work, if it has one; load it with `eligibilityInclude`. */
  work: { curation_status: string } | null;
}

/** What a single-song query must load for isPubliclyEligible to see the Work's status. */
export const eligibilityInclude = { work: { select: { curation_status: true } } } as const;

/**
 * May this song be shown to everyone on this deployment? Uploads never are. The
 * per-song form of sharedSongWhere: keep the two in step.
 */
export const isPubliclyEligible = (song: EligibilityFields): boolean =>
  !song.uploader_id &&
  (!env.PUBLIC_CATALOGUE || song.public_eligible === true) &&
  !UNPUBLISHED_WORK_STATUSES.includes(song.work?.curation_status ?? "");

/** The same rule as a query, for list endpoints. */
export const sharedSongWhere = (): Prisma.SongWhereInput => ({
  uploader_id: null,
  ...(env.PUBLIC_CATALOGUE ? { public_eligible: true } : {}),
  // A song whose Work is still a draft (or in review) is not for players yet,
  // e.g. a freshly imported source pack. Songs with no Work are unaffected.
  NOT: { work: { curation_status: { in: UNPUBLISHED_WORK_STATUSES } } },
});

const UNPUBLISHED_WORK_STATUSES = ["draft", "in_review"];

/** Rows a user may list: the shared catalogue plus their own songs; admins see all. */
export const listableSongWhere = (userId: string, admin: boolean): Prisma.SongWhereInput =>
  admin ? { retired_at: null } : { retired_at: null, OR: [sharedSongWhere(), { uploader_id: userId }] };

/** Licence tags that require a visible credit (Creative Commons). */
export const isCreditedLicence = (fileLicence: string | null): boolean => (fileLicence ?? "").startsWith("cc-");

const CC_TAG = /^cc-(by(?:-sa|-nc|-nc-sa|-nd)?)-(\d\.\d)(?:-([a-z]{2}))?$/;

/**
 * Canonical licence text URL for a `cc-by-sa-2.5` style tag, or null. A trailing
 * two-letter jurisdiction (`cc-by-sa-3.0-de`) selects that country's port.
 */
export const licenceUrl = (fileLicence: string | null): string | null => {
  const match = CC_TAG.exec(fileLicence ?? "");
  if (!match) return null;
  const port = match[3] ? `${match[3]}/` : "";
  return `https://creativecommons.org/licenses/${match[1]}/${match[2]}/${port}`;
};

/** What a song's credit line is built from (the columns /credits reads). */
export interface CreditSource {
  title: string;
  artist: string;
  file_licence: string | null;
  attribution: string | null;
}

export interface SongCredit {
  /** True for Creative Commons licences: the credit must travel with the file. */
  required: boolean;
  /** Short form for the UI: "by Artist, licence cc-by-sa-4.0" or "Public domain". */
  summary: string;
  /** The full credit line: the stored attribution (or "Title by Artist") plus the licence and its URL. */
  text: string;
  /** The stored attribution exactly as /credits lists it. */
  attribution: string | null;
  licence: string;
  licence_url: string | null;
}

/**
 * The credit for a song: the single formatter behind GET /credits and the download endpoints,
 * so the licence page, the download buttons and the Copyright notice inside a downloaded MIDI
 * file always say the same thing. Null when the song has no recorded licence.
 */
export function songCredit(song: CreditSource): SongCredit | null {
  const licence = song.file_licence;
  if (!licence) return null;
  const url = licenceUrl(licence);
  if (!isCreditedLicence(licence)) {
    return licence === "public-domain"
      ? { required: false, summary: "Public domain", text: "Public domain", attribution: song.attribution, licence, licence_url: null }
      : null;
  }
  const base = song.attribution?.trim() || `${song.title} by ${song.artist}.`;
  return {
    required: true,
    summary: `by ${song.artist}, licence ${licence}`,
    text: `${base} Licence: ${licence}${url ? `, ${url}` : ""}`,
    attribution: song.attribution,
    licence,
    licence_url: url,
  };
}
