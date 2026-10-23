import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { fetchUrlSafely, SsrfBlockedError } from "./ssrf-safe-fetch.js";

export const INSTRUMENT_LIBRARY_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/instruments",
);

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

const isAdminUser = async (userId: string): Promise<boolean> =>
  (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role === "admin";

const instrumentQuerySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  category: z.enum(["piano", "keys", "more"]).default("more"),
  source_url: z.string().trim().url().max(2000).optional(),
});

const importSchema = instrumentQuerySchema.extend({ url: z.string().trim().url().max(2000) });

const FETCH_RATE_LIMIT = 10;
const FETCH_RATE_WINDOW_MS = 60 * 60 * 1000;
const recentFetchByUser = new Map<string, number[]>();

export const isInstrumentFetchRateLimited = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = (recentFetchByUser.get(userId) ?? []).filter((t) => now - t < FETCH_RATE_WINDOW_MS);
  if (timestamps.length >= FETCH_RATE_LIMIT) return true;
  timestamps.push(now);
  recentFetchByUser.set(userId, timestamps);
  return false;
};

type PackLayout =
  | { type: "single"; file: string; contentType: string }
  | {
      type: "notes";
      notes: Record<string, { file: string; contentType: string }>;
      /** Present on multi-layer packs (the VCSL piano): tells the player how to map keys and touch to samples. */
      sampler?: unknown;
    };

const instrumentListItem = (instrument: {
  id: string;
  name: string;
  description: string;
  category: string;
  content_rights: string;
  source_url: string | null;
  uploader_id: string | null;
  created_at: Date;
}, userId: string) => ({
  id: instrument.id,
  name: instrument.name,
  description: instrument.description,
  category: instrument.category,
  content_rights: instrument.content_rights,
  source_url: instrument.source_url,
  mine: instrument.uploader_id === userId,
  created_at: instrument.created_at.toISOString(),
});

const canAccess = async (instrument: { uploader_id: string | null }, userId: string): Promise<boolean> =>
  !instrument.uploader_id || instrument.uploader_id === userId || (await isAdminUser(userId));

const sniffAudio = (bytes: Buffer): { ext: string; contentType: string } | null => {
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") {
    return { ext: "wav", contentType: "audio/wav" };
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "OggS") return { ext: "ogg", contentType: "audio/ogg" };
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "fLaC") return { ext: "flac", contentType: "audio/flac" };
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") return { ext: "mp3", contentType: "audio/mpeg" };
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { ext: "mp3", contentType: "audio/mpeg" };
  return null;
};

const dataUriPattern = /["']?([A-G](?:#|b)?-?\d)["']?\s*:\s*["']data:audio\/([^;"']+);base64,([A-Za-z0-9+/=]+)["']/g;

const extractDataUriNotes = (bytes: Buffer): Record<string, { bytes: Buffer; ext: string; contentType: string }> | null => {
  const text = bytes.toString("utf8");
  const notes: Record<string, { bytes: Buffer; ext: string; contentType: string }> = {};
  let match: RegExpExecArray | null;
  while ((match = dataUriPattern.exec(text))) {
    const [, note, rawType, payload] = match;
    const type = rawType === "mp3" || rawType === "mpeg" ? "mpeg" : rawType;
    const ext = type === "mpeg" ? "mp3" : type;
    notes[note] = { bytes: Buffer.from(payload, "base64"), ext, contentType: `audio/${type}` };
  }
  return Object.keys(notes).length > 0 ? notes : null;
};

export const detectInstrumentPack = (bytes: Buffer): "audio" | "data-uri-pack" | null => {
  if (sniffAudio(bytes)) return "audio";
  if (extractDataUriNotes(bytes)) return "data-uri-pack";
  return null;
};

const writePack = async (bytes: Buffer, finalDir: string): Promise<void> => {
  const tmpDir = `${finalDir}.tmp-${process.pid}-${Date.now()}`;
  await rm(tmpDir, { recursive: true, force: true });
  await mkdir(tmpDir, { recursive: true });
  try {
    const notes = extractDataUriNotes(bytes);
    if (notes) {
      const layout: PackLayout = { type: "notes", notes: {} };
      for (const [note, sample] of Object.entries(notes)) {
        const file = `${note.replace("#", "s").replace("b", "f")}.${sample.ext}`;
        await writeFile(path.join(tmpDir, file), sample.bytes);
        layout.notes[note] = { file, contentType: sample.contentType };
      }
      await writeFile(path.join(tmpDir, "layout.json"), JSON.stringify(layout, null, 2));
    } else {
      const audio = sniffAudio(bytes);
      if (!audio) throw new Error("Unsupported instrument pack");
      const file = `sample.${audio.ext}`;
      await writeFile(path.join(tmpDir, file), bytes);
      await writeFile(path.join(tmpDir, "layout.json"), JSON.stringify({ type: "single", file, contentType: audio.contentType } satisfies PackLayout, null, 2));
    }
    await rm(finalDir, { recursive: true, force: true });
    await rename(tmpDir, finalDir);
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
};

const createInstrumentFromBytes = async (
  bytes: Buffer,
  input: z.infer<typeof instrumentQuerySchema>,
  userId: string,
): Promise<ReturnType<typeof instrumentListItem>> => {
  if (bytes.length === 0) throw Object.assign(new Error("Instrument pack is empty"), { statusCode: 400 });
  if (!detectInstrumentPack(bytes)) throw Object.assign(new Error("Instrument must be MP3, OGG, WAV, FLAC, or a midi-js soundfont data-uri pack"), { statusCode: 422 });
  await mkdir(INSTRUMENT_LIBRARY_DIR, { recursive: true });
  const instrument = await prisma.instrument.create({
    data: {
      name: input.name,
      description: input.description,
      category: input.category,
      pack_path: "pending",
      source_url: input.source_url ?? null,
      content_rights: input.source_url ? "user-import-url" : "user-upload",
      uploader_id: userId,
    },
  });
  const packPath = path.join(INSTRUMENT_LIBRARY_DIR, `upload-${instrument.id}`);
  try {
    await writePack(bytes, packPath);
  } catch (error) {
    await prisma.instrument.delete({ where: { id: instrument.id } }).catch(() => undefined);
    throw error;
  }
  const updated = await prisma.instrument.update({ where: { id: instrument.id }, data: { pack_path: packPath } });
  return instrumentListItem(updated, userId);
};

export const instrumentsRouter: Router = Router();

instrumentsRouter.get("/instruments", async (req, res, next) => {
  try {
    const userId = uid(req);
    const admin = await isAdminUser(userId);
    const rows = await prisma.instrument.findMany({
      where: admin ? {} : { OR: [{ uploader_id: null }, { uploader_id: userId }] },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json({ instruments: rows.map((row) => instrumentListItem(row, userId)) });
  } catch (e) {
    next(e);
  }
});

/**
 * How to play a pack whose samples aren't one-per-key: the layer/root map from its layout.json,
 * or `{ sampler: null }` for a plain one-sample-per-note pack.
 */
instrumentsRouter.get("/instruments/:id/sampler", async (req, res, next) => {
  try {
    const userId = uid(req);
    const instrument = await prisma.instrument.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!instrument || !(await canAccess(instrument, userId))) {
      res.status(404).json({ error: { code: "not_found", message: "Instrument not found" } });
      return;
    }
    try {
      const layout = JSON.parse(await readFile(path.join(instrument.pack_path, "layout.json"), "utf8")) as PackLayout;
      res.json({ sampler: layout.type === "notes" ? (layout.sampler ?? null) : null });
    } catch {
      res.status(404).json({ error: { code: "not_found", message: "Instrument pack not found on disk" } });
    }
  } catch (e) {
    next(e);
  }
});

instrumentsRouter.get("/instruments/:id/samples/:note", async (req, res, next) => {
  try {
    const userId = uid(req);
    const instrument = await prisma.instrument.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!instrument || !(await canAccess(instrument, userId))) {
      res.status(404).json({ error: { code: "not_found", message: "Instrument not found" } });
      return;
    }
    let layout: PackLayout;
    try {
      layout = JSON.parse(await readFile(path.join(instrument.pack_path, "layout.json"), "utf8")) as PackLayout;
    } catch {
      res.status(404).json({ error: { code: "not_found", message: "Instrument pack not found on disk" } });
      return;
    }
    const sample = layout.type === "single" ? layout : layout.notes[req.params.note];
    if (!sample) {
      res.status(404).json({ error: { code: "not_found", message: "Sample note not found" } });
      return;
    }
    const filePath = path.resolve(instrument.pack_path, sample.file);
    if (!filePath.startsWith(path.resolve(instrument.pack_path) + path.sep)) {
      res.status(404).json({ error: { code: "not_found", message: "Sample note not found" } });
      return;
    }
    try {
      res.type(sample.contentType).send(await readFile(filePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Sample file not found on disk" } });
        return;
      }
      throw error;
    }
  } catch (e) {
    next(e);
  }
});

instrumentsRouter.post(
  "/instruments/upload",
  express.raw({ type: () => true, limit: "50mb" }),
  async (req, res, next) => {
    try {
      const userId = uid(req);
      const input = instrumentQuerySchema.parse(req.query);
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        res.status(400).json({ error: { code: "empty_upload", message: "Send the sample pack bytes as the request body" } });
        return;
      }
      if (!detectInstrumentPack(bytes)) {
        res.status(422).json({ error: { code: "invalid_pack", message: "Instrument upload must be MP3, OGG, WAV, FLAC, or a midi-js soundfont data-uri pack" } });
        return;
      }
      res.status(201).json(await createInstrumentFromBytes(bytes, input, userId));
    } catch (e) {
      next(e);
    }
  },
);

instrumentsRouter.post("/instruments/import-url", async (req, res, next) => {
  try {
    const userId = uid(req);
    if (isInstrumentFetchRateLimited(userId)) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many import attempts — try again later" } });
      return;
    }
    const { url, ...input } = importSchema.parse(req.body);
    let bytes: Buffer;
    try {
      bytes = await fetchUrlSafely(url, { maxBytes: 50 * 1024 * 1024, timeoutMs: 15_000 });
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        res.status(422).json({ error: { code: "fetch_blocked", message: error.message } });
        return;
      }
      throw error;
    }
    if (!detectInstrumentPack(bytes)) {
      res.status(422).json({ error: { code: "invalid_pack", message: "Imported instrument must be MP3, OGG, WAV, FLAC, or a midi-js soundfont data-uri pack" } });
      return;
    }
    res.status(201).json(await createInstrumentFromBytes(bytes, { ...input, source_url: url }, userId));
  } catch (e) {
    next(e);
  }
});

instrumentsRouter.delete("/instruments/:id", async (req, res, next) => {
  try {
    const userId = uid(req);
    const instrument = await prisma.instrument.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!instrument) {
      res.status(404).json({ error: { code: "not_found", message: "Instrument not found" } });
      return;
    }
    const admin = await isAdminUser(userId);
    if (instrument.uploader_id !== userId && !admin) {
      res.status(403).json({ error: { code: "forbidden", message: "You can only delete instruments you uploaded" } });
      return;
    }
    await prisma.instrument.delete({ where: { id: instrument.id } });
    if (instrument.uploader_id) await rm(instrument.pack_path, { recursive: true, force: true }).catch(() => undefined);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
