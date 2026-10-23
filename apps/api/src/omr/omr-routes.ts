import express, { Router, type Request } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { extractSongMetadata, InvalidMidiError, saveImportedScore, songListItem, type SongMetadata } from "../songs.js";
import { importScore, InvalidScoreError, type ImportedScore } from "../scores/import-score.js";
import { normalizeRecognisedMusicXml } from "./normalize-musicxml.js";
import { OmrQueue, type OmrJob } from "./omr-jobs.js";
import { OmrError, recognizeSheetMusic, sheetMusicKind } from "./omr-service.js";

/**
 * Sheet music from a photo or PDF (beta). The upload is queued, recognised by the OMR
 * service into MusicXML, and run through the same score import as an uploaded MusicXML
 * file. The result waits, private to the uploader and only in memory, until they have
 * looked at the engraving and save it (or discard it). GET /config says whether the
 * feature is on (OMR_SERVICE_URL set).
 *
 *   POST   /songs/upload/omr        PDF/PNG/JPEG body -> 202 job (upload rate limits apply)
 *   GET    /omr/jobs/:id            progress, then a summary of what was recognised
 *   GET    /omr/jobs/:id/notation   the recognised score as MEI, for the review screen
 *   POST   /omr/jobs/:id/save       {title, artist, genre} -> 201 song
 *   DELETE /omr/jobs/:id            discard
 */

/** A phone photo is a few MB; a scanned PDF of a few pages, more. */
export const OMR_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

interface Recognition {
  musicXml: Uint8Array;
  imported: ImportedScore;
  metadata: SongMetadata;
  pages: number;
  warnings: string[];
}

async function recognise(input: Uint8Array): Promise<Recognition> {
  if (!env.OMR_SERVICE_URL) throw new OmrError("omr_unavailable", "Sheet-music recognition isn't set up on this server.", 503);
  const recognised = await recognizeSheetMusic(env.OMR_SERVICE_URL, input);
  let musicXml: Uint8Array;
  let imported: ImportedScore;
  let metadata: SongMetadata;
  try {
    musicXml = new TextEncoder().encode(normalizeRecognisedMusicXml(new TextDecoder().decode(recognised.musicXml)).text);
    imported = await importScore(musicXml);
    metadata = extractSongMetadata(imported.midi);
  } catch (error) {
    if (error instanceof InvalidScoreError || error instanceof InvalidMidiError) {
      throw new OmrError("no_music", `The recognised music couldn't be turned into a song (${error.message}). Try a clearer copy.`);
    }
    throw error;
  }
  if (metadata.noteCount === 0) {
    throw new OmrError("no_music", "No notes were recognised. Use a sharp, evenly lit photo taken straight on, or the original PDF.");
  }
  return { musicXml, imported, metadata, pages: recognised.pages, warnings: imported.report.warnings };
}

export const omrQueue = new OmrQueue<Recognition>(recognise);

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

const notFound = { error: { code: "not_found", message: "That recognition job has finished or expired" } };

const jobView = (job: OmrJob<Recognition>) => {
  const result = job.result;
  return {
    id: job.id,
    status: job.status,
    position: omrQueue.position(job),
    created_at: new Date(job.createdAt).toISOString(),
    started_at: job.startedAt === null ? null : new Date(job.startedAt).toISOString(),
    finished_at: job.finishedAt === null ? null : new Date(job.finishedAt).toISOString(),
    error: job.error,
    result: result && {
      title: result.imported.title,
      composer: result.imported.composer,
      pages: result.pages,
      bars: result.imported.report.printedMeasures,
      played_bars: result.imported.report.playedMeasures,
      staff_count: result.imported.report.staffCount,
      note_count: result.metadata.noteCount,
      duration_sec: result.metadata.durationSec,
      difficulty: result.metadata.difficulty,
      warnings: result.warnings,
    },
  };
};

const saveSchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(120).default("Unknown"),
  genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).default("other"),
});

export const omrRouter: Router = Router();

omrRouter.post(
  "/songs/upload/omr",
  express.raw({ type: () => true, limit: OMR_UPLOAD_LIMIT_BYTES }),
  (req, res, next) => {
    try {
      const userId = uid(req);
      if (!env.OMR_SERVICE_URL) {
        res.status(503).json({ error: { code: "omr_unavailable", message: "Sheet-music recognition isn't set up on this server." } });
        return;
      }
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        res.status(400).json({ error: { code: "empty_upload", message: "Send the PDF or photo as the request body" } });
        return;
      }
      if (!sheetMusicKind(bytes)) {
        res.status(415).json({ error: { code: "unsupported_type", message: "Send a PDF, or a photo as JPEG or PNG" } });
        return;
      }
      const job = omrQueue.submit(userId, new Uint8Array(bytes));
      res.status(202).json(jobView(job));
    } catch (error) {
      if (error instanceof OmrError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      next(error);
    }
  },
);

omrRouter.get("/omr/jobs/:id", (req, res) => {
  const job = omrQueue.get(String(req.params.id), uid(req));
  if (!job) {
    res.status(404).json(notFound);
    return;
  }
  res.json(jobView(job));
});

omrRouter.get("/omr/jobs/:id/notation", (req, res) => {
  const job = omrQueue.get(String(req.params.id), uid(req));
  if (!job?.result) {
    res.status(404).json(notFound);
    return;
  }
  res.type("application/mei+xml").send(job.result.imported.mei);
});

omrRouter.post("/omr/jobs/:id/save", async (req, res, next) => {
  try {
    const userId = uid(req);
    const job = omrQueue.get(String(req.params.id), userId);
    if (!job?.result) {
      res.status(404).json(notFound);
      return;
    }
    const input = saveSchema.parse(req.body);
    const { result } = job;
    // Forget the job first, so a double-click can't save the same score twice.
    omrQueue.remove(job.id, userId);
    const song = await saveImportedScore({
      userId,
      original: result.musicXml,
      imported: result.imported,
      metadata: result.metadata,
      title: input.title,
      artist: input.artist,
      genre: input.genre,
      contentRights: "user-score-scan",
    });
    res.status(201).json({ ...songListItem(song, userId), import_report: { ...result.imported.report, warnings: result.warnings } });
  } catch (error) {
    next(error);
  }
});

omrRouter.delete("/omr/jobs/:id", (req, res) => {
  if (!omrQueue.remove(String(req.params.id), uid(req))) {
    res.status(404).json(notFound);
    return;
  }
  res.json({ ok: true });
});
