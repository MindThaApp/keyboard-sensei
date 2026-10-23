import { strFromU8, unzipSync } from "fflate";

export class InvalidScoreError extends Error {}

export type ScoreFormat = "musicxml" | "mei";

/** Extensions the original upload is stored under, by what the bytes turned out to be. */
export type ScoreFileKind = "musicxml" | "mxl" | "mei";

export interface DecodedScore {
  kind: ScoreFileKind;
  format: ScoreFormat;
  /** The score as XML text (an .mxl is unzipped to its root file). */
  text: string;
}

/** Compressed uploads are capped by the route; this caps what they may expand to. */
export const MAX_SCORE_TEXT_BYTES = 20 * 1024 * 1024;

const isZip = (bytes: Uint8Array): boolean => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * An .mxl is a zip whose META-INF/container.xml names the root score file. The entries'
 * declared sizes are checked before anything is inflated, so a zip bomb is refused
 * without allocating its contents.
 */
function unzipMxl(bytes: Uint8Array): string {
  let declaredTotal = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        declaredTotal += file.originalSize;
        if (declaredTotal > MAX_SCORE_TEXT_BYTES) throw new InvalidScoreError("The compressed score expands to more than 20 MB");
        return file.name === "META-INF/container.xml" || /\.(xml|musicxml)$/i.test(file.name);
      },
    });
  } catch (error) {
    if (error instanceof InvalidScoreError) throw error;
    throw new InvalidScoreError("The .mxl file is not a readable zip archive");
  }
  const container = files["META-INF/container.xml"];
  const rootPath = container ? /<rootfile[^>]*full-path="([^"]+)"/.exec(strFromU8(container))?.[1] : undefined;
  const root =
    (rootPath ? files[rootPath] : undefined) ??
    // Some writers omit the container; fall back to the one score file at the top level.
    Object.entries(files).find(([name]) => !name.startsWith("META-INF/") && !name.includes("/"))?.[1];
  if (!root) throw new InvalidScoreError("The .mxl archive has no MusicXML score in it");
  if (root.length > MAX_SCORE_TEXT_BYTES) throw new InvalidScoreError("The score is larger than 20 MB");
  return strFromU8(root);
}

/** Which notation the XML is, from its root element (the extension is only a hint). */
function formatOf(text: string): ScoreFormat {
  // Skip the prolog (declaration, doctype, comments, processing instructions).
  const root = /<([A-Za-z][\w:.-]*)[\s>/]/.exec(text.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, ""))?.[1];
  if (root === "score-partwise") return "musicxml";
  if (root === "mei" || root === "meiHead" || root === "music") return "mei";
  if (root === "score-timewise") throw new InvalidScoreError("Timewise MusicXML isn't supported: export the score as standard (partwise) MusicXML");
  throw new InvalidScoreError("This isn't a MusicXML or MEI score");
}

/** Bytes of an uploaded .musicxml / .xml / .mxl / .mei file, as score text. */
export function decodeScoreFile(bytes: Uint8Array): DecodedScore {
  if (isZip(bytes)) {
    const text = unzipMxl(bytes);
    if (formatOf(text) !== "musicxml") throw new InvalidScoreError("The .mxl archive doesn't contain a MusicXML score");
    return { kind: "mxl", format: "musicxml", text };
  }
  if (bytes.length > MAX_SCORE_TEXT_BYTES) throw new InvalidScoreError("The score is larger than 20 MB");
  // MusicXML may legally be UTF-16 (with a byte-order mark); otherwise it must be UTF-8.
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : null;
  let text: string;
  try {
    text = new TextDecoder(utf16 ?? "utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new InvalidScoreError("This isn't a MusicXML or MEI score");
  }
  const format = formatOf(text);
  return { kind: format === "mei" ? "mei" : "musicxml", format, text };
}
