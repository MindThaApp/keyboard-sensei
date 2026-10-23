/**
 * Library API for the catalogue: Works with their versions nested.
 *
 *   GET /library/works?q&level&genre&era&tags&composer&hands&duration&tier&unrated&sort&limit&cursor
 *   GET /library/works/:id
 *   GET /library/suggest?q
 *   GET /library/facets
 *
 * The existing GET /songs is unchanged (the player and older clients use it).
 * All routes need a signed-in user; register after requireAuth.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isAdmin } from "../auth.js";
import { env } from "../config.js";
import { prisma as defaultPrisma } from "../db.js";
import {
  DURATION_BUCKETS,
  HANDS,
  SORTS,
  TIERS,
  decodeCursor,
  facetCounts,
  findWork,
  searchWorks,
  suggest,
  type SearchContext,
} from "./search.js";
import { MAX_QUERY_LENGTH } from "./aliases.js";

export interface CatalogueRouterDeps {
  prisma?: PrismaClient;
  isAdmin?: (userId: string) => Promise<boolean>;
  /** Read per request so tests (and a flag flip) take effect without rebuilding the router. */
  publicCatalogue?: () => boolean;
}

/** "a,b,c" or repeated keys -> list; empty entries dropped. */
const list = <T extends z.ZodTypeAny>(item: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(",")).map((part) => part.trim()).filter(Boolean),
    )
    .pipe(z.array(item).max(20))
    .optional();

const flag = z
  .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
  .transform((value) => value === "1" || value === "true")
  .optional();

const idText = z.string().min(1).max(100);

const worksQuery = z.object({
  q: z.string().max(MAX_QUERY_LENGTH * 3).optional(),
  level: list(z.coerce.number().int().min(1).max(5)),
  genre: list(idText),
  era: list(idText),
  tags: list(idText),
  composer: idText.optional(),
  hands: list(z.enum(HANDS)),
  duration: list(z.enum(DURATION_BUCKETS)),
  tier: list(z.enum(TIERS)),
  unrated: flag,
  sort: z.enum(SORTS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
});

const detailQuery = z.object({ tier: list(z.enum(TIERS)), unrated: flag });
const suggestQuery = z.object({ q: z.string().max(MAX_QUERY_LENGTH * 3), limit: z.coerce.number().int().min(1).max(20).optional() });

const badRequest = (res: Response, message: string) =>
  res.status(400).json({ error: { code: "bad_request", message } });

export function catalogueRouter(deps: CatalogueRouterDeps = {}): Router {
  const prisma = deps.prisma ?? defaultPrisma;
  const adminCheck = deps.isAdmin ?? isAdmin;
  const publicCatalogue = deps.publicCatalogue ?? (() => env.PUBLIC_CATALOGUE);
  const router = Router();

  const contextOf = async (req: Request): Promise<SearchContext> => {
    if (!req.userId) throw new Error("Authenticated user missing");
    return { admin: await adminCheck(req.userId), publicCatalogue: publicCatalogue() };
  };
  const guard = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

  router.get(
    "/library/works",
    guard(async (req, res) => {
      const parsed = worksQuery.safeParse(req.query);
      if (!parsed.success) return void badRequest(res, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
      const { cursor, unrated, ...params } = parsed.data;
      const offset = cursor === undefined ? 0 : decodeCursor(cursor);
      if (offset === null) return void badRequest(res, "cursor: not a cursor returned by this API");
      res.json(await searchWorks(prisma, { ...params, showUnrated: unrated, offset }, await contextOf(req)));
    }),
  );

  router.get(
    "/library/works/:id",
    guard(async (req, res) => {
      const parsed = detailQuery.safeParse(req.query);
      if (!parsed.success) return void badRequest(res, "Invalid query");
      const work = await findWork(
        prisma,
        z.string().max(200).parse(req.params.id),
        { tier: parsed.data.tier, showUnrated: parsed.data.unrated },
        await contextOf(req),
      );
      // A Work with nothing visible is indistinguishable from a missing one.
      if (!work) return void res.status(404).json({ error: { code: "not_found", message: "Work not found" } });
      res.json({ work });
    }),
  );

  router.get(
    "/library/suggest",
    guard(async (req, res) => {
      const parsed = suggestQuery.safeParse(req.query);
      if (!parsed.success) return void badRequest(res, "q is required");
      res.json({ suggestions: await suggest(prisma, parsed.data.q, await contextOf(req), parsed.data.limit) });
    }),
  );

  router.get(
    "/library/facets",
    guard(async (req, res) => {
      res.json(await facetCounts(prisma, await contextOf(req)));
    }),
  );

  return router;
}
