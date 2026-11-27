import { createHash } from "node:crypto";
import { Router, type Request } from "express";
import type { Lesson, OfflineContentBundle, OfflineLessonEntry } from "@keyboard-sensei/shared-types";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { prisma } from "./db.js";

/**
 * Offline lesson content (spec 8.5). Clients download one bundle of every live
 * lesson and its exercises, keyed by a content hash, and keep it in IndexedDB so
 * lessons open and exercises score without a network.
 *
 * The hash covers only content (lesson and exercise JSON, order, tier columns),
 * never per-user progress, so it changes exactly when the seed changes content.
 * Clients send it back as If-None-Match and get a 304 while it is unchanged.
 */

/** Stable JSON: object keys sorted, so the hash does not depend on key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

/** Hash of the content the clients cache. Order of `entries` does not matter. */
export function computeContentHash(entries: readonly OfflineLessonEntry[]): string {
  const sorted = [...entries]
    .map((entry) => ({
      ...entry,
      exercises: [...entry.exercises].sort((a, b) =>
        a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0,
      ),
    }))
    .sort((a, b) => (a.lesson.id < b.lesson.id ? -1 : a.lesson.id > b.lesson.id ? 1 : 0));
  return createHash("sha256").update(stableStringify(sorted)).digest("hex").slice(0, 32);
}

/** `If-None-Match` may hold a list and weak validators; match on the bare hash. */
export function etagMatches(header: string | undefined, hash: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((part) => part.trim().replace(/^W\//, "").replace(/^"|"$/g, ""))
    .some((tag) => tag === hash || tag === "*");
}

/** What GET /lessons serves for a stored row (tier columns merged, answers stripped). */
type Sanitize = (lesson: Lesson, row: { tier: number; skills: string[] }) => Lesson;

/** Reads every live lesson with its live exercises, in curriculum order. */
export async function loadOfflineEntries(sanitize: Sanitize): Promise<OfflineLessonEntry[]> {
  const rows = await prisma.lesson.findMany({
    where: { retired_at: null },
    orderBy: { order: "asc" },
    include: { exercises: { where: { retired_at: null } } },
  });
  return rows.map((row) => ({
    lesson: sanitize(validateLesson(row.lesson_json), row),
    order: row.order,
    exercises: row.exercises.map((item) => validateMidiExercise(item.exercise_json)),
  }));
}

export function offlineContentRouter(sanitize: Sanitize): Router {
  const router = Router();

  router.get("/content/version", async (_req, res, next) => {
    try {
      const contentHash = computeContentHash(await loadOfflineEntries(sanitize));
      res.setHeader("ETag", `"${contentHash}"`);
      res.setHeader("Cache-Control", "no-cache");
      res.json({ contentHash });
    } catch (e) {
      next(e);
    }
  });

  router.get("/content/offline", async (req: Request, res, next) => {
    try {
      const entries = await loadOfflineEntries(sanitize);
      const contentHash = computeContentHash(entries);
      res.setHeader("ETag", `"${contentHash}"`);
      res.setHeader("X-Content-Hash", contentHash);
      res.setHeader("Cache-Control", "no-cache");
      if (etagMatches(req.header("if-none-match"), contentHash)) {
        res.status(304).end();
        return;
      }
      const bundle: OfflineContentBundle = { contentHash, generatedAt: new Date().toISOString(), lessons: entries };
      res.json(bundle);
    } catch (e) {
      next(e);
    }
  });

  return router;
}

/** How far back an offline attempt may be dated; older replays count as played now. */
export const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When an attempt counts as played: the client's `playedAt` for a replayed offline
 * attempt (so practice time lands on the right day), but never in the future and
 * never more than a week back.
 */
export function resolvePlayedAt(playedAt: string | undefined, now: Date): Date {
  if (!playedAt) return now;
  const at = new Date(playedAt);
  const ms = at.getTime();
  if (!Number.isFinite(ms) || ms > now.getTime() || now.getTime() - ms > MAX_OFFLINE_AGE_MS) return now;
  return at;
}
