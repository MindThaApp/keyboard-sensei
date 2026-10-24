import path from "node:path";
import { licenceFamily } from "./catalogue/backfill.js";

/**
 * Song export (GET /songs/:id/file?download=1&format=midi|musicxml|mei).
 *
 * WHO may download (the server is the authority; the web app only hides buttons):
 *   - the uploader of a song (uploads, recordings, score imports, archive imports);
 *   - an admin, for any song;
 *   - anyone else, for a shared library song ONLY when its FILE may be redistributed:
 *       no uploader, `public_eligible` set by the catalogue, `file_licence` a free family
 *       (public-domain, cc-by, cc-by-sa; NOT cc-by-nc, NOT unknown), and a source_kind that
 *       is not one of the never-redistribute sources (adl, archive, upload, recording,
 *       unknown). Everything the catalogue could not clear stays play-only.
 * Seeing the song at all (canSeeSong) is checked first and unchanged: invisible = 404.
 */
export type ExportFormat = "midi" | "musicxml" | "mei";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["midi", "musicxml", "mei"];

export interface ExportSong {
  title: string;
  uploader_id: string | null;
  public_eligible: boolean;
  file_licence: string | null;
  source_kind: string | null;
  file_path: string;
  notation_path: string | null;
  score_path: string | null;
}

const REDISTRIBUTABLE_FAMILIES = new Set(["public-domain", "cc-by", "cc-by-sa"]);
const NEVER_REDISTRIBUTE_SOURCES = new Set(["adl", "archive", "upload", "recording", "unknown"]);

/** May a stranger be handed the bytes of this shared library song? */
export const isRedistributable = (song: Pick<ExportSong, "uploader_id" | "public_eligible" | "file_licence" | "source_kind">): boolean =>
  !song.uploader_id &&
  song.public_eligible === true &&
  song.source_kind !== null &&
  !NEVER_REDISTRIBUTE_SOURCES.has(song.source_kind) &&
  REDISTRIBUTABLE_FAMILIES.has(licenceFamily(song.file_licence));

/** The ownership / admin / licence gate. Visibility is checked separately, before this. */
export const mayDownloadSong = (song: ExportSong, userId: string, admin: boolean): boolean =>
  admin || song.uploader_id === userId || isRedistributable(song);

export interface ExportFile {
  /** Absolute path of the stored file to send. */
  file: string;
  contentType: string;
  extension: string;
}

/** The stored file behind a format, or null when this song has none (e.g. MusicXML of a plain MIDI upload). */
export function exportFileFor(song: ExportSong, format: ExportFormat): ExportFile | null {
  if (format === "midi") return { file: song.file_path, contentType: "audio/midi", extension: "mid" };
  // Only score imports keep a score (score_path); notation_path alone is a viewing copy.
  if (!song.score_path) return null;
  const ext = path.extname(song.score_path).toLowerCase();
  if (format === "musicxml") {
    if (ext === ".mxl") return { file: song.score_path, contentType: "application/vnd.recordare.musicxml", extension: "mxl" };
    if (ext === ".musicxml") return { file: song.score_path, contentType: "application/vnd.recordare.musicxml+xml", extension: "musicxml" };
    return null;
  }
  // MEI: the original when it was MEI, otherwise Verovio's MEI of the score.
  if (ext === ".mei") return { file: song.score_path, contentType: "application/mei+xml", extension: "mei" };
  if (song.notation_path && path.extname(song.notation_path).toLowerCase() === ".mei") {
    return { file: song.notation_path, contentType: "application/mei+xml", extension: "mei" };
  }
  return null;
}

/** Which downloads to offer in the UI for this viewer (same rule the route enforces). */
export const availableDownloads = (song: ExportSong, userId: string, admin: boolean): Record<ExportFormat, boolean> => {
  const allowed = mayDownloadSong(song, userId, admin);
  return {
    midi: allowed,
    musicxml: allowed && exportFileFor(song, "musicxml") !== null,
    mei: allowed && exportFileFor(song, "mei") !== null,
  };
};

const MAX_NAME_CHARS = 100;

/**
 * A file name base from a song title. Strips control characters, path separators, quotes
 * and characters Windows forbids, collapses whitespace, drops leading/trailing dots and
 * spaces, caps the length; "song" when nothing is left. May still contain Unicode.
 */
export function sanitiseFilename(title: string): string {
  const cleaned = Array.from(
    title
      .normalize("NFC")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
      .replace(/[/\\:*?"'`<>|;%]/g, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s.]+|[\s.]+$/g, ""),
  )
    .slice(0, MAX_NAME_CHARS)
    .join("")
    .replace(/[\s.]+$/g, "");
  return cleaned || "song";
}

/** Plain-ASCII version of a sanitised name, for the legacy `filename=` parameter. */
export function asciiFilename(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._()+,&-]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return /[A-Za-z0-9]/.test(ascii) ? ascii : "song";
}

/** RFC 5987 value-chars: encodeURIComponent plus the marks it leaves bare. */
const encodeRfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** `attachment; filename="Fur Elise.mid"; filename*=UTF-8''F%C3%BCr%20Elise.mid` */
export function contentDispositionFor(title: string, extension: string): string {
  const name = sanitiseFilename(title);
  return `attachment; filename="${asciiFilename(name)}.${extension}"; filename*=UTF-8''${encodeRfc5987(`${name}.${extension}`)}`;
}
