import { strFromU8, unzipSync } from "fflate";

export class InvalidScoreError extends Error {}

/** The value is also Verovio's `inputFrom` name for the notation. */
export type ScoreFormat = "musicxml" | "mei" | "abc" | "humdrum";

/** Extensions the original upload is stored under, by what the bytes turned out to be. */
export type ScoreFileKind = "musicxml" | "mxl" | "mei" | "abc" | "krn";

export interface DecodedScore {
  kind: ScoreFileKind;
  format: ScoreFormat;
  /** The score as text: XML (an .mxl is unzipped to its root file), ABC or Humdrum. */
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
  throw new InvalidScoreError(NOT_A_SCORE);
}

const NOT_A_SCORE = "This isn't a MusicXML, MEI, ABC or **kern score";

/** Anything but tab, line breaks and printable characters: a text score never holds these. */
// eslint-disable-next-line no-control-regex
const BINARY = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** Header lines are only looked for this far in. */
const SNIFF_CHARS = 8192;

const linesOf = (text: string): string[] => text.split(/\r\n|\r|\n/);

/**
 * Verovio's ABC reader takes one voice: given several it only warns, and then lays them
 * end to end as one long melody. So a second voice (`V:` fields or `[V:]` inline) or a
 * voice overlay (`&`) is refused rather than imported wrongly.
 */
function refuseMultiVoiceAbc(text: string): void {
  const voices = new Set<string>();
  for (const line of linesOf(text)) {
    const field = /^V:\s*([^\s%]+)/.exec(line);
    if (field) voices.add(field[1]);
    for (const inline of line.matchAll(/\[V:\s*([^\s\]]+)/g)) voices.add(inline[1]);
    const isMusic = !/^\s*(%|[A-Za-z+]:)/.test(line);
    if (isMusic && /&/.test(line.replace(/"[^"]*"|![^!]*!/g, ""))) throw new InvalidScoreError("This ABC file overlays voices with &, which isn't supported: use a single-voice tune");
  }
  if (voices.size > 1) throw new InvalidScoreError(`This ABC file has ${voices.size} voices (${[...voices].slice(0, 4).join(", ")}): only single-voice tunes are supported`);
}

/**
 * ABC: a tune starts with an `X:` reference number, and its header runs on to the `K:`
 * (key) line, with no blank line between. Blank lines and `%` comments (including the
 * `%abc-2.1` version line) may come before the X:. A file header ahead of the X: is not
 * accepted. Returns false when the text doesn't start like ABC at all.
 */
function sniffAbc(text: string): boolean {
  const lines = linesOf(text.slice(0, SNIFF_CHARS));
  const start = lines.findIndex((line) => line.trim() !== "" && !line.startsWith("%"));
  if (start < 0 || !/^X:\s*\d+\s*(%.*)?$/.test(lines[start])) return false;
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") break;
    if (/^K:/.test(line)) {
      // The tune ends at a blank line, so a second X: starts a second tune.
      const tunes = text.match(/^X:\s*\d+/gm)?.length ?? 1;
      if (tunes > 1) throw new InvalidScoreError(`This ABC file holds ${tunes} tunes: upload one tune per file`);
      refuseMultiVoiceAbc(text);
      return true;
    }
  }
  throw new InvalidScoreError("This looks like ABC (it starts with X:) but its header has no K: (key) line");
}

/**
 * Humdrum: after any `!` comment and reference lines, the first line is the exclusive
 * interpretations, tab-separated, each starting `**`, and one of them must be `**kern`.
 * A second `**` line (a second movement, after the first one's `*-`) is refused.
 */
function sniffKern(text: string): boolean {
  const lines = linesOf(text.slice(0, SNIFF_CHARS));
  const first = lines.find((line) => line.trim() !== "" && !line.startsWith("!"));
  if (first === undefined || !first.startsWith("**")) return false;
  if (!first.split("\t").some((spine) => spine.trim() === "**kern")) throw new InvalidScoreError("This Humdrum file has no **kern spine to read notes from");
  const movements = text.match(/^\*\*/gm)?.length ?? 1;
  if (movements > 1) throw new InvalidScoreError(`This Humdrum file holds ${movements} movements: upload one movement per file`);
  return true;
}

/** ABC or **kern text, or null when it is neither (binary and XML never are). */
function textFormatOf(text: string): "abc" | "humdrum" | null {
  if (BINARY.test(text)) return null;
  if (sniffAbc(text)) return "abc";
  if (sniffKern(text)) return "humdrum";
  return null;
}

/** Bytes of an uploaded .musicxml / .xml / .mxl / .mei / .abc / .krn file, as score text. */
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
    throw new InvalidScoreError(NOT_A_SCORE);
  }
  if (!text.trimStart().startsWith("<")) {
    const format = textFormatOf(text);
    if (!format) throw new InvalidScoreError(NOT_A_SCORE);
    return { kind: format === "abc" ? "abc" : "krn", format, text };
  }
  const format = formatOf(text);
  return { kind: format === "mei" ? "mei" : "musicxml", format, text };
}
