import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";
import { extractSongMetadata, InvalidMidiError, type SongMetadata } from "./midi-metadata.js";
import { fetchUrlSafely, SsrfBlockedError } from "./ssrf-safe-fetch.js";

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
});

// Light in-memory rate limit: 10 URL-fetch attempts per user per hour. This
// endpoint makes outbound requests on the user's behalf; this is not a hard
// security boundary, just the same accidental-abuse posture as feedback.
const FETCH_RATE_LIMIT = 10;
const FETCH_RATE_WINDOW_MS = 60 * 60 * 1000;
const recentFetchByUser = new Map<string, number[]>();

export const isFetchRateLimited = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = (recentFetchByUser.get(userId) ?? []).filter((t) => now - t < FETCH_RATE_WINDOW_MS);
  if (timestamps.length >= FETCH_RATE_LIMIT) return true;
  timestamps.push(now);
  recentFetchByUser.set(userId, timestamps);
  return false;
};

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

const songListItem = (song: {
  id: string;
  title: string;
  artist: string;
  genre: string;
  difficulty: number;
  duration_sec: number;
  note_count: number;
  content_rights: string;
  notation_path: string | null;
  uploader_id: string | null;
}, userId: string) => ({
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
  mine: song.uploader_id === userId,
});

/** Song library routes; mounted behind requireAuth. */
export const songsRouter: Router = Router();

const deleteSongRow = async (song: { id: string; file_path: string; uploader_id: string | null }) => {
  await prisma.song.delete({ where: { id: song.id } });
  // Only unlink files we own (uploads); seeded library files may be shared across reseeds.
  if (song.uploader_id) await unlink(song.file_path).catch(() => undefined);
};

songsRouter.get("/songs", async (req, res, next) => {
  try {
    const userId = uid(req);
    const admin = await isAdminUser(userId);
    const rows = await prisma.song.findMany({
      // Seeded songs (no uploader) are public; uploads are private to their
      // owner, except admins see everything.
      where: admin ? {} : { OR: [{ uploader_id: null }, { uploader_id: userId }] },
      orderBy: [{ artist: "asc" }, { title: "asc" }],
    });
    res.json({ songs: rows.map((row) => songListItem(row, userId)) });
  } catch (e) {
    next(e);
  }
});

songsRouter.get("/songs/attempts/me", async (req, res, next) => {
  try {
    const userId = uid(req);
    const rows = await prisma.playAlongAttempt.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 200,
      include: { song: { select: { title: true, artist: true } } },
    });
    const bests: Record<string, { score: number; accuracy: number }> = {};
    for (const row of rows) {
      const best = bests[row.song_id];
      if (!best || row.score > best.score) bests[row.song_id] = { score: row.score, accuracy: row.accuracy };
    }
    res.json({
      bests,
      recent: rows.slice(0, 50).map((row) => ({
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
        created_at: row.created_at.toISOString(),
      })),
    });
  } catch (e) {
    next(e);
  }
});

songsRouter.get("/songs/:id/file", async (req, res, next) => {
  try {
    const userId = uid(req);
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!song || (song.uploader_id && song.uploader_id !== userId && !(await isAdminUser(userId)))) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    try {
      const bytes = await readFile(song.file_path);
      res.type("audio/midi").send(bytes);
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
    const song = await prisma.song.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!song || (song.uploader_id && song.uploader_id !== userId && !(await isAdminUser(userId)))) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    if (!song.notation_path) {
      res.status(404).json({ error: { code: "not_found", message: "This song has no notation file" } });
      return;
    }
    try {
      const bytes = await readFile(song.notation_path);
      res.type("application/vnd.recordare.musicxml").send(bytes);
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

const attemptSchema = z.object({
  // 160, not 150: with continuous tempo and look-ahead the multipliers can reach
  // 1.5 (they are capped there), so a strong fast run scores above the old 150
  // ceiling. Leaving it at 150 meant Zod rejected the attempt with a 400 — i.e.
  // the user's best runs were exactly the ones that failed to save.
  score: z.number().min(0).max(160),
  accuracy: z.number().min(0).max(100),
  tempo_pct: z.number().min(10).max(250),
  tempo_bpm: z.number().min(20).max(400).nullish(),
  lookahead_s: z.number().min(0.5).max(10),
  wait_mode: z.boolean(),
});

songsRouter.post("/songs/:id/attempts", async (req, res, next) => {
  try {
    const userId = uid(req);
    const songId = z.string().parse(req.params.id);
    const input = attemptSchema.parse(req.body);
    const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
    if (!song) {
      res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
      return;
    }
    const row = await prisma.playAlongAttempt.create({ data: { user_id: userId, song_id: songId, ...input } });
    res.status(201).json({ id: row.id, score: row.score, accuracy: row.accuracy });
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
          content_rights: query.source_url ? "user-import-url" : "user-upload",
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
    res.json(songListItem(song, uid(req)));
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
