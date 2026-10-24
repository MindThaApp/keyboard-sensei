import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { eligibilityInclude, isPubliclyEligible, listableSongWhere, songCredit, type EligibilityFields } from "./catalogue/eligibility.js";
import { requireAdmin } from "./auth.js";
import { slidingWindowLimit } from "./rate-limits.js";
import { extractSongMetadata, InvalidMidiError, type SongMetadata } from "./midi-metadata.js";
import { fetchUrlSafely, SsrfBlockedError } from "./ssrf-safe-fetch.js";
import { attemptSchema, levelOf, personalBests } from "./practice-attempts.js";
import { rewardPlayAlongAttempt, type Rewards } from "./progression/rewards.js";
import { classifyMidiQuality } from "./midi-quality.js";
import { storedSignals } from "./catalogue/backfill.js";
import { importScore, InvalidScoreError, type ImportedScore } from "./scores/import-score.js";
import { embedCopyright } from "./midi-credit.js";
import { availableDownloads, contentDispositionFor, downloadCredit, exportFileFor, mayDownloadSong, EXPORT_FORMATS } from "./song-export.js";

export { extractSongMetadata, InvalidMidiError, type SongMetadata };

export const MIDI_LIBRARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/midi-library",
);

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

const isAdminUser = async (userId: string): Promise<boolean> =>
  (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role === "admin";

const uploadQuerySchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(120).default("Unknown"),
  genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).default("other"),
  source_url: z.string().trim().url().max(2000).optional(),
  origin: z.enum(["upload", "recording"]).optional(),
});

// Light in-memory rate limit: 10 URL-fetch attempts per user per hour. This
// endpoint makes outbound requests on the user's behalf; this is not a hard
// security boundary, just the same accidental-abuse posture as feedback.
const FETCH_RATE_LIMIT = 10;
const FETCH_RATE_WINDOW_MS = 60 * 60 * 1000;
const recentFetchByUser = slidingWindowLimit(FETCH_RATE_LIMIT, FETCH_RATE_WINDOW_MS);

export const isFetchRateLimited = (userId: string): boolean => !recentFetchByUser.allow(userId);

// Scores: title and composer default to what the score itself names.
const scoreUploadQuerySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  artist: z.string().trim().min(1).max(120).optional(),
  genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).default("other"),
});

/** Score files are XML; uncompressed MusicXML of a long piece runs to a few MB. */
export const SCORE_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;

const urlPreviewSchema = z.object({ url: z.string().trim().url().max(2000) });

const adminSongPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    artist: z.string().trim().min(1).max(120).optional(),
    genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one field");

const songPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    artist: z.string().trim().min(1).max(120).optional(),
    genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one field");

/**
 * A curated collection the song belongs to, for the shelves on /play.
 * "beginner": the authored pack from scripts/generate-beginner-pack.ts, which
 * writes `beginner-<slug>.mid` with no uploader. "essentials": the graded pack
 * from scripts/generate-essentials-pack.ts, in data/midi-library/essentials/.
 */
export type SongCollection = "beginner" | "essentials";

export const songCollection = (song: { file_path: string; uploader_id: string | null }): SongCollection | null => {
  if (song.uploader_id) return null;
  if (path.basename(song.file_path).startsWith("beginner-")) return "beginner";
  // The Essentials pack (src/essentials) lives in its own folder of the library.
  if (path.basename(path.dirname(song.file_path)) === "essentials") return "essentials";
  return null;
};

/**
 * Who sees a song: the uploader and admins see uploads and archive imports (private to
 * the user who added them); everyone sees the shared catalogue; admins see everything.
 * A song you can't see is indistinguishable from a missing one (404), so ids can't be probed.
 */
export const canSeeSong = (
  song: EligibilityFields,
  userId: string,
  admin: boolean,
): boolean => admin || song.uploader_id === userId || isPubliclyEligible(song);

const songVisibleTo = async (song: EligibilityFields, userId: string): Promise<boolean> =>
  canSeeSong(song, userId, false) || (await isAdminUser(userId));

export const songListItem = (song: {
  id: string;
  title: string;
  artist: string;
  genre: string;
  difficulty: number;
  duration_sec: number;
  note_count: number;
  content_rights: string;
  notation_path: string | null;
  file_path: string;
  uploader_id: string | null;
  arrangement_group: string | null;
  arrangement_level: string | null;
  attribution: string | null;
  work_id: string | null;
  quality_tier: string;
  tier_override: string | null;
  // For `downloads`; every full Song row has them.
  score_path: string | null;
  public_eligible: boolean;
  file_licence: string | null;
  source_kind: string | null;
}, userId: string, admin = false) => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  genre: song.genre,
  difficulty: song.difficulty,
  duration_sec: song.duration_sec,
  note_count: song.note_count,
  content_rights: song.content_rights,
  // Presence indicator only -- the real absolute filesystem path never
  // leaves the server (same reason `file_path` itself isn't included
  // here); fetch actual notation bytes via GET /songs/:id/notation.
  notation_path: song.notation_path ? "available" : null,
  // What the notation file is: Verovio's MEI for score imports, MusicXML for archive imports.
  notation_format: notationFormat(song.notation_path),
  mine: song.uploader_id === userId,
  collection: songCollection(song),
  // Versions of one piece at different difficulty levels share a group.
  arrangement_group: song.arrangement_group,
  arrangement_level: song.arrangement_level,
  attribution: song.attribution,
  // Songs with no Work are not in /library/works; the client lists them separately,
  // best tier first. An admin's override wins over the measured tier.
  work_id: song.work_id,
  quality_tier: song.tier_override ?? song.quality_tier,
  // What this viewer may download (GET /songs/:id/file?download=1&format=...); see song-export.ts.
  downloads: availableDownloads(song, userId, admin),
  // The credit that travels with a CC download (same text as /credits); null when nothing to show.
  download_credit: downloadCredit(song, userId, admin),
});

type NotationFormat = "mei" | "musicxml";

const notationFormat = (notationPath: string | null): NotationFormat | null =>
  notationPath ? (notationPath.endsWith(".mei") ? "mei" : "musicxml") : null;

/** Song library routes; mounted behind requireAuth. */
export const songsRouter: Router = Router();

const deleteSongRow = async (song: {
  id: string;
  file_path: string;
  notation_path: string | null;
  score_path: string | null;
  uploader_id: string | null;
}) => {
  await prisma.song.delete({ where: { id: song.id } });
  // Only unlink files we own (uploads, imports); seeded library files may be shared across reseeds.
  if (!song.uploader_id) return;
  for (const file of [song.file_path, song.notation_path, song.score_path]) {
    if (file) await unlink(file).catch(() => undefined);
  }
};

songsRouter.get("/songs", async (req, res, next) => {
  try {
    const userId = uid(req);
    const admin = await isAdminUser(userId);
    const rows = await prisma.song.findMany({
      // Shared songs (no uploader; only the public-eligible ones when PUBLIC_CATALOGUE
      // is on) plus the user's own uploads; admins see everything.
      // Retired songs (superseded by an Essentials version) stay out of the list.
      where: listableSongWhere(userId, admin),
      include: eligibilityInclude,
      orderBy: [{ artist: "asc" }, { title: "asc" }],
    });
    // canSeeSong repeats the query's rule as the guard used by the single-song routes.
    const visible = rows.filter((row) => canSeeSong(row, userId, admin));
    res.json({ songs: visible.map((row) => songListItem(row, userId, admin)) });
  } catch (e) {
    next(e);
  }
});

songsRouter.get("/songs/attempts/me", async (req, res, next) => {
  try {
    const userId = uid(req);
    const [rows, bestRows] = await Promise.all([
      prisma.playAlongAttempt.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
        take: 50,
        include: { song: { select: { title: true, artist: true, arrangement_level: true } } },
      }),
      // Bests over every scored whole-song run, not just the recent ones.
      prisma.playAlongAttempt.findMany({
        where: { user_id: userId, is_loop: false, wait_mode: false },
        select: {
          song_id: true,
          score: true,
          accuracy: true,
          arrangement_level: true,
          is_loop: true,
          wait_mode: true,
          song: { select: { arrangement_level: true } },
        },
      }),
    ]);
    const { bests, bestsByLevel } = personalBests(bestRows);
    res.json({
      bests,
      bests_by_level: bestsByLevel,
      recent: rows.map((row) => ({
        id: row.id,
        song_id: row.song_id,
        title: row.song.title,
        artist: row.song.artist,
        score: row.score,
        accuracy: row.accuracy,
        tempo_pct: row.tempo_pct,
        tempo_bpm: row.tempo_bpm,
        lookahead_s: row.lookahead_s,
        wait_mode: row.wait_mode,
        arrangement_level: levelOf(row),
        hands: row.hands ?? "both",
        loop_start_bar: row.loop_start_bar,
        loop_end_bar: row.loop_end_bar,
        multiplier: row.multiplier,
        is_loop: row.is_loop,
        created_at: row.created_at.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

const exportQuerySchema = z.object({
  download: z.literal("1"),
  format: z.enum(EXPORT_FORMATS as [string, ...string[]]).default("midi"),
});

songsRouter.get("/songs/:id/file", async (req, res, next) => {
  try {
    const userId = uid(req);
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) }, include: eligibilityInclude });
    const admin = song ? await isAdminUser(userId) : false;
    if (!song || !canSeeSong(song, userId, admin)) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    // ?download=1[&format=midi|musicxml|mei]: an attachment instead of the in-app player's MIDI.
    const exporting = req.query.download !== undefined;
    const query = exporting ? exportQuerySchema.parse(req.query) : null;
    let target = { file: song.file_path, contentType: "audio/midi" } as { file: string; contentType: string; extension?: string };
    if (query) {
      if (!mayDownloadSong(song, userId, admin)) {
        res.status(403).json({ error: { code: "download_not_allowed", message: "This song can be played here but not downloaded" } });
        return;
      }
      const found = exportFileFor(song, query.format as (typeof EXPORT_FORMATS)[number]);
      if (!found) {
        res.status(404).json({ error: { code: "format_unavailable", message: `This song has no ${query.format} file` } });
        return;
      }
      target = found;
    }
    try {
      let bytes: Buffer = await readFile(target.file);
      if (query?.format === "midi") {
        // Attribution travels with the file: a Creative Commons song gets its credit as the MIDI's Copyright Notice.
        const credit = songCredit(song);
        if (credit?.required) bytes = embedCopyright(bytes, credit.text);
      }
      res.type(target.contentType);
      if (query) {
        res.setHeader("Content-Disposition", contentDispositionFor(song.title, target.extension!));
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
      }
      res.send(bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Song file not found on disk" } });
        return;
      }
      throw error;
    }
  } catch (e) {
    next(e);
  }
});

songsRouter.get("/songs/:id/notation", async (req, res, next) => {
  try {
    const userId = uid(req);
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) }, include: eligibilityInclude });
    if (!song || !(await songVisibleTo(song, userId))) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    if (!song.notation_path) {
      res.status(404).json({ error: { code: "not_found", message: "This song has no notation file" } });
      return;
    }
    try {
      const bytes = await readFile(song.notation_path);
      res.type(notationFormat(song.notation_path) === "mei" ? "application/mei+xml" : "application/vnd.recordare.musicxml").send(bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Notation file not found on disk" } });
        return;
      }
      throw error;
    }
  } catch (e) {
    next(e);
  }
});

songsRouter.post("/songs/:id/attempts", async (req, res, next) => {
  try {
    const userId = uid(req);
    const songId = z.string().parse(req.params.id);
    const input = attemptSchema.parse(req.body);
    const song = await prisma.song.findUnique({
      where: { id: songId },
      select: { id: true, uploader_id: true, public_eligible: true, ...eligibilityInclude },
    });
    // Same visibility rule as GET /songs/:id/file: another user's private upload is
    // indistinguishable from a missing song, so its id can't be probed or polluted.
    if (!song || !(await songVisibleTo(song, userId))) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    const row = await prisma.playAlongAttempt.create({ data: { user_id: userId, song_id: songId, ...input } });
    // Same policy as lesson attempts: the run is saved; progress awarding never fails it.
    let rewards: Rewards | null = null;
    try {
      rewards = await rewardPlayAlongAttempt(prisma, { userId, attemptId: row.id });
    } catch (error) {
      console.error("Awarding progress failed", error);
    }
    res.status(201).json({ id: row.id, score: row.score, accuracy: row.accuracy, rewards });
  } catch (e) {
    next(e);
  }
});

songsRouter.post("/songs/fetch-url-preview", async (req, res, next) => {
  try {
    const userId = uid(req);
    if (isFetchRateLimited(userId)) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many import attempts — try again later" } });
      return;
    }
    const { url } = urlPreviewSchema.parse(req.body);
    let bytes: Buffer;
    try {
      bytes = await fetchUrlSafely(url, { maxBytes: 1024 * 1024, timeoutMs: 10_000 });
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        res.status(422).json({ error: { code: "fetch_blocked", message: error.message } });
        return;
      }
      throw error;
    }
    let metadata: SongMetadata;
    try {
      metadata = extractSongMetadata(new Uint8Array(bytes));
    } catch (error) {
      if (error instanceof InvalidMidiError) {
        res.status(422).json({ error: { code: "invalid_midi", message: error.message } });
        return;
      }
      throw error;
    }
    res.set("x-song-duration-sec", String(metadata.durationSec));
    res.set("x-song-note-count", String(metadata.noteCount));
    res.set("x-song-difficulty", String(metadata.difficulty));
    res.type("audio/midi").send(bytes);
  } catch (e) {
    next(e);
  }
});

// Raw MIDI bytes; metadata comes in query params so the body stays binary.
songsRouter.post(
  "/songs/upload",
  express.raw({ type: () => true, limit: "1mb" }),
  async (req, res, next) => {
    try {
      const userId = uid(req);
      const query = uploadQuerySchema.parse(req.query);
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        res.status(400).json({ error: { code: "empty_upload", message: "Send the .mid file bytes as the request body" } });
        return;
      }
      let metadata: SongMetadata;
      try {
        metadata = extractSongMetadata(new Uint8Array(bytes));
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
          title: query.title,
          artist: query.artist,
          genre: query.genre,
          difficulty: metadata.difficulty,
          duration_sec: metadata.durationSec,
          note_count: metadata.noteCount,
          content_rights: query.source_url ? "user-import-url" : query.origin === "recording" ? "user-recording" : "user-upload",
          source_url: query.source_url ?? null,
          file_path: "pending",
          uploader_id: userId,
        },
      });
      const filePath = path.join(MIDI_LIBRARY_DIR, `upload-${song.id}.mid`);
      await writeFile(filePath, bytes);
      const updated = await prisma.song.update({ where: { id: song.id }, data: { file_path: filePath } });
      res.status(201).json(songListItem(updated, userId));
    } catch (e) {
      next(e);
    }
  },
);

export type SongGenre = z.infer<typeof scoreUploadQuerySchema>["genre"];

/**
 * Stores an imported score as a private song of `userId`: the MIDI that is played, the
 * MEI that is shown, and the original score as sent. Shared by score uploads and
 * recognised sheet music (POST /omr/jobs/:id/save).
 */
export async function saveImportedScore(input: {
  userId: string;
  original: Uint8Array;
  imported: ImportedScore;
  metadata: SongMetadata;
  title: string;
  artist: string;
  genre: SongGenre;
  contentRights: "user-score-upload" | "user-score-scan";
}) {
  const { userId, imported, metadata } = input;
  const quality = classifyMidiQuality(imported.midi);
  await mkdir(MIDI_LIBRARY_DIR, { recursive: true });
  const song = await prisma.song.create({
    data: {
      title: input.title,
      artist: input.artist,
      genre: input.genre,
      difficulty: metadata.difficulty,
      duration_sec: metadata.durationSec,
      note_count: metadata.noteCount,
      content_rights: input.contentRights,
      file_path: "pending",
      uploader_id: userId,
      // Catalogue fields, as the backfill would set them for any upload: never public.
      source_kind: "upload",
      source_ref: createHash("sha256").update(input.original).digest("hex"),
      file_licence: "unknown",
      public_eligible: false,
      hands: imported.report.playedStaves.length >= 2 ? "both" : null,
      quality_tier: quality.tier,
      quality_score: quality.score,
      quality_signals: quality.signals ? storedSignals(quality.signals) : undefined,
      quality_checked_at: new Date(),
    },
  });
  const base = path.join(MIDI_LIBRARY_DIR, `score-${song.id}`);
  const files = { file_path: `${base}.mid`, notation_path: `${base}.mei`, score_path: `${base}.${imported.kind}` };
  try {
    await writeFile(files.file_path, imported.midi);
    await writeFile(files.notation_path, imported.mei);
    await writeFile(files.score_path, input.original);
  } catch (error) {
    await deleteSongRow({ id: song.id, uploader_id: userId, ...files });
    throw error;
  }
  return prisma.song.update({ where: { id: song.id }, data: files });
}

/**
 * A score (MusicXML, compressed .mxl or MEI) becomes a private song: Verovio's MEI of it
 * is the notation, the MIDI of the expanded score is what is played and scored, and the
 * original is kept as sent. Mounted under /songs/upload, so the upload rate limit applies.
 */
songsRouter.post(
  "/songs/upload/score",
  express.raw({ type: () => true, limit: SCORE_UPLOAD_LIMIT_BYTES }),
  async (req, res, next) => {
    try {
      const userId = uid(req);
      const query = scoreUploadQuerySchema.parse(req.query);
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        res.status(400).json({ error: { code: "empty_upload", message: "Send the score file's bytes as the request body" } });
        return;
      }
      let imported: Awaited<ReturnType<typeof importScore>>;
      let metadata: SongMetadata;
      try {
        imported = await importScore(new Uint8Array(bytes));
        metadata = extractSongMetadata(imported.midi);
      } catch (error) {
        if (error instanceof InvalidScoreError || error instanceof InvalidMidiError) {
          res.status(422).json({ error: { code: "invalid_score", message: error.message } });
          return;
        }
        throw error;
      }
      const song = await saveImportedScore({
        userId,
        original: bytes,
        imported,
        metadata,
        title: query.title ?? imported.title ?? "Untitled score",
        artist: query.artist ?? imported.composer ?? "Unknown",
        genre: query.genre,
        contentRights: "user-score-upload",
      });
      res.status(201).json({ ...songListItem(song, userId), import_report: imported.report });
    } catch (e) {
      next(e);
    }
  },
);

songsRouter.delete("/songs/:id", async (req, res, next) => {
  try {
    const userId = uid(req);
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!song) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    const admin = await isAdminUser(userId);
    if (song.uploader_id !== userId && !admin) {
      res.status(403).json({ error: { code: "forbidden", message: "You can only delete songs you uploaded" } });
      return;
    }
    await deleteSongRow(song);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

songsRouter.patch("/songs/:id", async (req, res, next) => {
  try {
    const userId = uid(req);
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!song) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    if (song.uploader_id !== userId) {
      res.status(403).json({ error: { code: "forbidden", message: "You can only edit songs you uploaded" } });
      return;
    }
    const updated = await prisma.song.update({ where: { id: song.id }, data: songPatchSchema.parse(req.body) });
    res.json(songListItem(updated, userId));
  } catch (e) {
    next(e);
  }
});

songsRouter.patch("/admin/songs/:id", requireAdmin, async (req, res, next) => {
  try {
    const input = adminSongPatchSchema.parse(req.body);
    const song = await prisma.song.update({ where: { id: z.string().parse(req.params.id) }, data: input });
    res.json(songListItem(song, uid(req), true));
  } catch (e) {
    next(e);
  }
});

songsRouter.delete("/admin/songs/:id", requireAdmin, async (req, res, next) => {
  try {
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!song) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    await deleteSongRow(song);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
