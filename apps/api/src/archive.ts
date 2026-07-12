import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

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
