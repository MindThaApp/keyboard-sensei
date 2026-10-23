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
}

/** May this song be shown to everyone on this deployment? Uploads never are. */
export const isPubliclyEligible = (song: EligibilityFields): boolean =>
  !song.uploader_id && (!env.PUBLIC_CATALOGUE || song.public_eligible === true);

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
