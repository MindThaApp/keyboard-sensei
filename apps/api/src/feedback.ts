import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { requireAdmin } from "./auth.js";

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
    await prisma.feedback.create({
      data: { ...input, user_id, user_agent: req.headers["user-agent"] ?? "" },
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

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
      })),
    });
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
