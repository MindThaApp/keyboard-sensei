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
export const sharedSongWhere = (): Prisma.SongWhereInput =>
  env.PUBLIC_CATALOGUE ? { uploader_id: null, public_eligible: true } : { uploader_id: null };

/** Rows a user may list: the shared catalogue plus their own songs; admins see all. */
export const listableSongWhere = (userId: string, admin: boolean): Prisma.SongWhereInput =>
  admin ? { retired_at: null } : { retired_at: null, OR: [sharedSongWhere(), { uploader_id: userId }] };

/** Licence tags that require a visible credit (Creative Commons). */
export const isCreditedLicence = (fileLicence: string | null): boolean => (fileLicence ?? "").startsWith("cc-");

const CC_TAG = /^cc-(by(?:-sa|-nc|-nc-sa|-nd)?)-(\d\.\d)$/;

/** Canonical licence text URL for a `cc-by-sa-2.5` style tag, or null. */
export const licenceUrl = (fileLicence: string | null): string | null => {
  const match = CC_TAG.exec(fileLicence ?? "");
  return match ? `https://creativecommons.org/licenses/${match[1]}/${match[2]}/` : null;
};
