import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { extractSongMetadata, InvalidMidiError, isFetchRateLimited, MIDI_LIBRARY_DIR } from "./songs.js";

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

/**
 * Fetches one PianoCoRe row's performance MIDI (and MusicXML, when the row
 * is a tier_a/tier_a_star piece) via HuggingFace's Datasets Server per-row
 * REST API -- no bulk dataset download. `sourceRef` is `"<split>:<offset>"`
 * as produced by the ingest script (Task 3); the offset is this repo's own
 * server-controlled value (looked up from our DB, never taken directly from
 * request input), so this is a fixed, trusted, hardcoded host with no SSRF
 * exposure -- unlike the user-supplied-URL import path (Task 3/4), this
 * does NOT need fetchUrlSafely.
 *
 * `score_xml_bytes`, when present, is a base64-encoded `.mxl` file -- a
 * *compressed* MusicXML container (a zip archive), not plain XML text.
 * Confirmed by direct testing: decoded bytes start with `PK\x03\x04` (zip
 * magic) and unzip to a `score.xml` entry. Stored as-is; Task 8 (OSMD
 * rendering) is responsible for the unzip step, if OSMD doesn't handle
 * `.mxl` natively.
 */
async function fetchArchiveRowBytes(sourceRef: string): Promise<{ midiBytes: Buffer; musicXmlBytes: Buffer | null }> {
  const [split, offsetStr] = sourceRef.split(":");
  const offset = Number(offsetStr);
  if ((split !== "train" && split !== "test") || !Number.isInteger(offset) || offset < 0) {
    throw new Error(`Malformed archive source_ref: ${sourceRef}`);
  }
  const url = `https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=${split}&offset=${offset}&length=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PianoCoRe fetch failed for ${sourceRef}: HTTP ${response.status}`);
  const data = (await response.json()) as { rows?: { row?: Record<string, unknown> }[] };
  const row = data.rows?.[0]?.row;
  if (!row) throw new Error(`PianoCoRe row not found for ${sourceRef}`);
  const midiB64 = row.performance_midi_bytes;
  if (typeof midiB64 !== "string") throw new Error(`PianoCoRe row ${sourceRef} has no performance_midi_bytes`);
  const midiBytes = Buffer.from(midiB64, "base64");
  const xmlB64 = row.score_xml_bytes;
  const musicXmlBytes = typeof xmlB64 === "string" ? Buffer.from(xmlB64, "base64") : null;
  return { midiBytes, musicXmlBytes };
}

/** Archive browse/search routes; mounted behind requireAuth. */
export const archiveRouter: Router = Router();

archiveRouter.get("/archive/search", async (req, res, next) => {
  try {
    const { q, offset, limit } = searchQuerySchema.parse(req.query);
    const rows = q
      ? await prisma.$queryRaw<
          { id: string; title: string; composer: string; duration_sec: number; note_count: number; difficulty: number }[]
        >`
          SELECT id, title, composer, duration_sec, note_count, difficulty
          FROM "ArchiveEntry"
          WHERE search_vector @@ plainto_tsquery('english', ${q})
          ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
          OFFSET ${offset} LIMIT ${limit}
        `
      : await prisma.archiveEntry.findMany({
          orderBy: [{ composer: "asc" }, { title: "asc" }],
          skip: offset,
          take: limit,
          select: { id: true, title: true, composer: true, duration_sec: true, note_count: true, difficulty: true },
        });
    res.json({ results: rows });
  } catch (e) {
    next(e);
  }
});

archiveRouter.post("/archive/:id/import", async (req, res, next) => {
  try {
    const userId = uid(req);
    if (isFetchRateLimited(userId)) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many import attempts — try again later" } });
      return;
    }
    const entry = await prisma.archiveEntry.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!entry) {
      res.status(404).json({ error: { code: "not_found", message: "Archive entry not found" } });
      return;
    }
    const { midiBytes, musicXmlBytes } = await fetchArchiveRowBytes(entry.source_ref);

    let metadata;
    try {
      metadata = extractSongMetadata(new Uint8Array(midiBytes));
    } catch (error) {
      if (error instanceof InvalidMidiError) {
        res.status(422).json({ error: { code: "invalid_midi", message: error.message } });
        return;
      }
      throw error;
    }

    await mkdir(MIDI_LIBRARY_DIR, { recursive: true });
    const song = await prisma.song.create({
      data: {
        title: entry.title,
        artist: entry.composer,
        genre: "classical",
        difficulty: metadata.difficulty,
        duration_sec: metadata.durationSec,
        note_count: metadata.noteCount,
        content_rights: "archive-import",
        file_path: "pending",
        uploader_id: userId,
      },
    });
    const filePath = path.join(MIDI_LIBRARY_DIR, `archive-${song.id}.mid`);
    await writeFile(filePath, midiBytes);
    let notationPath: string | null = null;
    if (musicXmlBytes) {
      notationPath = path.join(MIDI_LIBRARY_DIR, `archive-${song.id}.mxl`);
      await writeFile(notationPath, musicXmlBytes);
    }
    const updated = await prisma.song.update({ where: { id: song.id }, data: { file_path: filePath, notation_path: notationPath } });
    res.status(201).json({ id: updated.id, title: updated.title, artist: updated.artist });
  } catch (e) {
    next(e);
  }
});
