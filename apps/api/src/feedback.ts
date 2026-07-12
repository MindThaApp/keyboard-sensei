import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";

export const FEEDBACK_SCREENSHOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/feedback-screenshots",
);

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // ~2MB

type ImageType = "png" | "jpeg" | "webp";

/**
 * Sniff the actual image format from magic bytes rather than trusting the
 * client's Content-Type header. Mirrors the file_path/notation_path lesson
 * elsewhere in this codebase: never trust client-supplied metadata for
 * something that gets written to disk and served back.
 */
const sniffImageType = (bytes: Buffer): ImageType | null => {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
};

const CONTENT_TYPE: Record<ImageType, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const feedbackSchema = z.object({
  type: z.enum(["bug", "idea", "other"]),
  message: z.string().trim().min(1).max(2000),
  page_path: z.string().max(300),
});

const statusSchema = z.object({ status: z.enum(["open", "resolved"]) });

// Light in-memory rate limit: 10 submissions per user per hour. Guards against
// accidental spam (stuck key, retry loop) — not a security boundary.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const recentByUser = new Map<string, number[]>();

const rateLimited = (uid: string): boolean => {
  const now = Date.now();
  const timestamps = (recentByUser.get(uid) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  recentByUser.set(uid, timestamps);
  return false;
};

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

/** Routes mounted behind requireAuth. */
export const feedbackRouter: Router = Router();

feedbackRouter.post("/feedback", async (req, res, next) => {
  try {
    const input = feedbackSchema.parse(req.body);
    const user_id = uid(req);
    if (rateLimited(user_id)) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too much feedback too quickly — try again later" } });
      return;
    }
    const row = await prisma.feedback.create({
      data: { ...input, user_id, user_agent: req.headers["user-agent"] ?? "" },
    });
    res.status(201).json({ id: row.id });
  } catch (e) {
    next(e);
  }
});

// Screenshots attach to an already-created feedback row in a second request.
// The raw-binary body follows the POST /songs/upload convention, but unlike
// that route the accompanying fields must NOT ride in the query string: a
// feedback message is up to 2000 chars of user free text, and URLs land in
// Caddy/nginx access logs and browser history. So the text goes in the JSON
// POST above, and only opaque bytes come here.
feedbackRouter.post(
  "/feedback/:id/screenshot",
  express.raw({ type: () => true, limit: "3mb" }),
  async (req, res, next) => {
    try {
      const user_id = uid(req);
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
        res.status(400).json({ error: { code: "empty_upload", message: "Send the screenshot bytes as the request body" } });
        return;
      }
      if (bytes.length > MAX_SCREENSHOT_BYTES) {
        res.status(413).json({ error: { code: "too_large", message: "Screenshot must be 2MB or smaller" } });
        return;
      }
      const imageType = sniffImageType(bytes);
      if (!imageType) {
        res.status(422).json({ error: { code: "invalid_image", message: "Screenshot must be a PNG, JPEG, or WEBP image" } });
        return;
      }
      // Attach only to your own feedback, and only once — otherwise any user
      // could overwrite the screenshot on anyone else's report.
      const row = await prisma.feedback.findUnique({ where: { id: z.string().parse(req.params.id) } });
      if (!row || row.user_id !== user_id) {
        res.status(404).json({ error: { code: "not_found", message: "No such feedback" } });
        return;
      }
      if (row.screenshot) {
        res.status(409).json({ error: { code: "already_attached", message: "This feedback already has a screenshot" } });
        return;
      }
      await mkdir(FEEDBACK_SCREENSHOT_DIR, { recursive: true });
      const filename = `feedback-${row.id}.${imageType}`;
      await writeFile(path.join(FEEDBACK_SCREENSHOT_DIR, filename), bytes);
      await prisma.feedback.update({ where: { id: row.id }, data: { screenshot: filename } });
      res.status(201).json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

feedbackRouter.get("/admin/feedback", requireAdmin, async (req, res, next) => {
  try {
    const status = z.enum(["open", "resolved", "all"]).catch("all").parse(req.query.status);
    const rows = await prisma.feedback.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { created_at: "desc" },
      include: { user: { select: { email: true, display_name: true } } },
    });
    res.json({
      feedback: rows.map((row) => ({
        id: row.id,
        type: row.type,
        message: row.message,
        page_path: row.page_path,
        user_agent: row.user_agent,
        status: row.status,
        created_at: row.created_at.toISOString(),
        user: row.user,
        // Presence indicator only -- fetch actual bytes via
        // GET /admin/feedback/:id/screenshot (admin-only, opaque id, never
        // a filesystem path).
        has_screenshot: row.screenshot !== null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

feedbackRouter.get("/admin/feedback/:id/screenshot", requireAdmin, async (req, res, next) => {
  try {
    const row = await prisma.feedback.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!row || !row.screenshot) {
      res.status(404).json({ error: { code: "not_found", message: "This feedback has no screenshot" } });
      return;
    }
    try {
      const bytes = await readFile(path.join(FEEDBACK_SCREENSHOT_DIR, row.screenshot));
      const imageType = sniffImageType(bytes) ?? "png";
      res.type(CONTENT_TYPE[imageType]).send(bytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(404).json({ error: { code: "not_found", message: "Screenshot file not found on disk" } });
        return;
      }
      throw error;
    }
  } catch (e) {
    next(e);
  }
});

feedbackRouter.patch("/admin/feedback/:id", requireAdmin, async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const id = z.string().parse(req.params.id);
    const row = await prisma.feedback.update({ where: { id }, data: { status } });
    res.json({ id: row.id, status: row.status });
  } catch (e) {
    next(e);
  }
});
