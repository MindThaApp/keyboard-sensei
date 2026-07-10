import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request } from "express";
// @tonejs/midi ships CJS; a named ESM import breaks under real node (works
// only under vitest's transform), so go through the default export.
import ToneMidi from "@tonejs/midi";
const { Midi } = ToneMidi;
type MidiFile = InstanceType<typeof Midi>;
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";

const PIANO_MIN = 21; // A0
const PIANO_MAX = 108; // C8
const MIN_NOTES = 20;
const MIN_DURATION_S = 20;
const MAX_DURATION_S = 15 * 60;

export const MIDI_LIBRARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/midi-library",
);

export class InvalidMidiError extends Error {}

export interface SongMetadata {
  durationSec: number;
  noteCount: number;
  difficulty: number;
}

/**
 * Parse and sanity-check a MIDI file, returning library metadata.
 * Difficulty is a 1-5 heuristic from note density and polyphony, tuned so
 * beginner rep lands 1-2 and virtuoso rep saturates at 5.
 */
export function extractSongMetadata(bytes: Uint8Array): SongMetadata {
  let midi: MidiFile;
  try {
    midi = new Midi(bytes);
  } catch {
    throw new InvalidMidiError("File is not a parseable MIDI file");
  }
  const notes = midi.tracks.flatMap((track) => track.notes);
  const pianoNotes = notes.filter((note) => note.midi >= PIANO_MIN && note.midi <= PIANO_MAX);
  if (pianoNotes.length === 0) throw new InvalidMidiError("No notes in piano range");
  if (notes.length < MIN_NOTES) throw new InvalidMidiError(`Too few notes (${notes.length} < ${MIN_NOTES})`);
  const durationSec = midi.duration;
  if (durationSec < MIN_DURATION_S || durationSec > MAX_DURATION_S) {
    throw new InvalidMidiError(`Duration ${durationSec.toFixed(1)}s outside ${MIN_DURATION_S}s-${MAX_DURATION_S / 60}min`);
  }

  const notesPerSec = pianoNotes.length / durationSec;
  // Mean simultaneity: for each note start, how many notes are sounding.
  const starts = pianoNotes.map((note) => note.time).sort((a, b) => a - b);
  let overlapTotal = 0;
  for (const note of pianoNotes) {
    overlapTotal += pianoNotes.filter(
      (other) => other.time <= note.time && other.time + other.duration > note.time,
    ).length;
  }
  const polyphony = overlapTotal / pianoNotes.length;
  const raw = notesPerSec * 0.9 + (polyphony - 1) * 1.1;
  const difficulty = Math.max(1, Math.min(5, Math.round(raw)));
  return { durationSec, noteCount: pianoNotes.length, difficulty };
}

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
});

const adminSongPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    artist: z.string().trim().min(1).max(120).optional(),
    genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
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
  mine: song.uploader_id === userId,
});

/** Song library routes; mounted behind requireAuth. */
export const songsRouter: Router = Router();

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

const attemptSchema = z.object({
  score: z.number().min(0).max(150),
  accuracy: z.number().min(0).max(100),
  tempo_pct: z.union([z.literal(25), z.literal(50), z.literal(75), z.literal(100)]),
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
          content_rights: "user-upload",
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
    await prisma.song.delete({ where: { id: song.id } });
    // Only unlink files we own (uploads); seeded library files may be shared across reseeds.
    if (song.uploader_id) await unlink(song.file_path).catch(() => undefined);
    res.json({ ok: true });
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
