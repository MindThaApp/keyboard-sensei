/**
 * Admin tooling for the catalogue (library redesign, work package 8). Admin only.
 *
 *   GET  /admin/catalogue/songs      filtered table (tier, status, source, licence, eligibility, no Work)
 *   GET  /admin/catalogue/queue      draft / in-review songs with their signals and tier reasons
 *   POST /admin/catalogue/bulk       status, retire, tier, tags, assign Work on many songs at once
 *   GET  /admin/catalogue/works      Work picker (assign / merge)
 *   PATCH /admin/catalogue/works/:id edit a Work and its aliases
 *   POST /admin/catalogue/works/merge  move songs, aliases and tags into the canonical Work
 *   GET  /admin/catalogue/tags
 *   GET  /admin/catalogue/events     audit log, filtered by song, Work, actor or action
 *   POST /admin/catalogue/events/:id/undo
 *   GET  /admin/catalogue/licences.csv  every shared song with its source and credit line
 *
 * Every change writes a CatalogueEvent holding what it replaced, which is what undo reads.
 * Nothing here deletes a Song: retiring sets retired_at, so play-along history survives and
 * a mistaken retire can be undone.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { isAdmin } from "./auth.js";
import { prisma as defaultPrisma } from "./db.js";
import { rebuildSearchText } from "./catalogue/aliases.js";
import { isCreditedLicence, licenceUrl, sharedSongWhere } from "./catalogue/eligibility.js";
import { MAX_GOOD_DURATION_S, MIN_GOOD_DURATION_S, QUANT_GOOD, QUANT_LOW } from "./midi-quality.js";

export interface AdminCatalogueDeps {
  prisma?: PrismaClient;
  isAdmin?: (userId: string) => Promise<boolean>;
}

const TIERS = ["verified", "good", "unrated", "low"] as const;
const STATUSES = ["draft", "in_review", "published", "hidden", "retired"] as const;
type Status = (typeof STATUSES)[number];

const text = z.string().trim().min(1).max(200);
const flag = z
  .enum(["1", "true", "0", "false"])
  .transform((value) => value === "1" || value === "true")
  .optional();

const songsQuery = z.object({
  tier: z.enum(TIERS).optional(),
  status: z.enum([...STATUSES, "none"]).optional(),
  source: text.optional(),
  licence: text.optional(),
  eligible: flag,
  nowork: flag,
  retired: z.enum(["hide", "only", "all"]).default("hide"),
  uploads: flag,
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const bulkBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_status"), ids: z.array(z.string()).min(1).max(500), status: z.enum(STATUSES), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("retire"), ids: z.array(z.string()).min(1).max(500), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("unretire"), ids: z.array(z.string()).min(1).max(500), reason: z.string().max(500).optional() }),
  z.object({
    action: z.literal("set_tier"),
    ids: z.array(z.string()).min(1).max(500),
    tier: z.enum([...TIERS, "clear"]),
    reason: z.string().trim().min(3, "A reason is required").max(500),
  }),
  z.object({ action: z.literal("add_tag"), ids: z.array(z.string()).min(1).max(500), tag_id: text, reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("remove_tag"), ids: z.array(z.string()).min(1).max(500), tag_id: text, reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("assign_work"), ids: z.array(z.string()).min(1).max(500), work_id: text, reason: z.string().max(500).optional() }),
]);
type BulkBody = z.infer<typeof bulkBody>;

const nullableText = z.string().trim().max(200).nullable();
const workPatch = z
  .object({
    title: text.optional(),
    catalogue: nullableText.optional(),
    movement: nullableText.optional(),
    era: nullableText.optional(),
    genre: text.optional(),
    pd_status: z.enum(["pd-worldwide", "pd-us-eu", "copyrighted", "unknown"]).optional(),
    recognisability: z.number().int().min(1).nullable().optional(),
    featured_rank: z.number().int().min(1).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    aliases: z.array(z.object({ alias: text, kind: z.enum(["title", "nickname", "catalogue", "translation"]) })).max(50).optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "reason"), "Supply at least one field");

const mergeBody = z.object({ from_id: text, into_id: text, reason: z.string().max(500).optional() });

const eventsQuery = z.object({
  song_id: text.optional(),
  work_id: text.optional(),
  actor_id: text.optional(),
  action: text.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const WORK_FIELDS = ["title", "catalogue", "movement", "era", "genre", "pd_status", "recognisability", "featured_rank", "notes"] as const;

const effectiveTier = (song: { tier_override: string | null; quality_tier: string }): string =>
  song.tier_override ?? song.quality_tier;

/** Why a song is not Verified, from what is stored (the classifier's own reasons are not kept). */
export function tierReasons(song: {
  quality_signals: unknown;
  work_id: string | null;
  file_licence: string | null;
  public_eligible: boolean;
}): string[] {
  const reasons: string[] = [];
  const signals =
    typeof song.quality_signals === "object" && song.quality_signals !== null ? (song.quality_signals as Record<string, unknown>) : null;
  if (!signals) {
    reasons.push("no-measurement");
  } else {
    const quant = Number(signals.quant);
    const duration = Number(signals.durationSec);
    if (quant < QUANT_LOW) reasons.push("performance-timing");
    else if (quant < QUANT_GOOD) reasons.push("partly-unquantised");
    if (duration < MIN_GOOD_DURATION_S) reasons.push("fragment");
    if (duration > MAX_GOOD_DURATION_S) reasons.push("very-long");
    if (signals.handSplit === false) reasons.push(Number(signals.noteTracks) === 1 ? "single-track" : "no-hand-split");
  }
  if (!song.work_id) reasons.push("no-work");
  if (!song.file_licence || song.file_licence === "unknown") reasons.push("licence-unknown");
  if (!song.public_eligible) reasons.push("not-public-eligible");
  return reasons;
}

const songSelect = {
  id: true,
  title: true,
  artist: true,
  genre: true,
  difficulty: true,
  duration_sec: true,
  note_count: true,
  arrangement_level: true,
  source_kind: true,
  source_ref: true,
  source_url: true,
  file_licence: true,
  public_eligible: true,
  quality_tier: true,
  quality_score: true,
  quality_signals: true,
  tier_override: true,
  tier_override_reason: true,
  grade_band: true,
  hands: true,
  retired_at: true,
  uploader_id: true,
  work_id: true,
  work: { select: { id: true, title: true, curation_status: true } },
  _count: { select: { attempts: true } },
} satisfies Prisma.SongSelect;

type SongRecord = Prisma.SongGetPayload<{ select: typeof songSelect }>;

function songRow(song: SongRecord) {
  const { _count, work, ...rest } = song;
  return {
    ...rest,
    retired_at: song.retired_at?.toISOString() ?? null,
    effective_tier: effectiveTier(song),
    attempt_count: _count.attempts,
    work,
    reasons: tierReasons(song),
  };
}

function songsWhere(query: z.infer<typeof songsQuery>): Prisma.SongWhereInput {
  const and: Prisma.SongWhereInput[] = [];
  if (!query.uploads) and.push({ uploader_id: null });
  if (query.retired === "hide") and.push({ retired_at: null });
  if (query.retired === "only") and.push({ retired_at: { not: null } });
  if (query.tier) and.push({ OR: [{ tier_override: query.tier }, { tier_override: null, quality_tier: query.tier }] });
  if (query.status === "none") and.push({ work_id: null });
  else if (query.status) and.push({ work: { curation_status: query.status } });
  if (query.nowork) and.push({ work_id: null });
  if (query.source) and.push({ source_kind: query.source });
  if (query.licence === "unknown") and.push({ OR: [{ file_licence: null }, { file_licence: "unknown" }] });
  else if (query.licence) and.push({ file_licence: query.licence });
  if (query.eligible !== undefined) and.push({ public_eligible: query.eligible });
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: "insensitive" } },
        { artist: { contains: query.q, mode: "insensitive" } },
        { id: { contains: query.q, mode: "insensitive" } },
        { work: { title: { contains: query.q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}

/** RFC 4180 quoting, with a leading apostrophe on anything a spreadsheet would run as a formula. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let cell = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export const csvLine = (cells: (string | number | boolean | null | undefined)[]): string => cells.map(csvCell).join(",");

type Tx = Prisma.TransactionClient;
type Outcome = { id: string; outcome: "ok" | "skipped"; reason?: string };

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

const statusAction = (status: Status): string =>
  status === "published" ? "publish" : status === "hidden" ? "hide" : status === "retired" ? "retire" : "status";

async function setWorkStatus(tx: Tx, actor: string, workId: string, status: Status, reason: string | null): Promise<boolean> {
  const work = await tx.work.findUnique({ where: { id: workId }, select: { curation_status: true } });
  if (!work || work.curation_status === status) return false;
  await tx.work.update({ where: { id: workId }, data: { curation_status: status } });
  await tx.catalogueEvent.create({
    data: {
      actor_id: actor,
      work_id: workId,
      action: statusAction(status),
      before: { curation_status: work.curation_status },
      after: { curation_status: status },
      reason,
    },
  });
  return true;
}

const tagIds = async (tx: Tx, workId: string): Promise<string[]> =>
  (await tx.workTag.findMany({ where: { work_id: workId }, select: { tag_id: true }, orderBy: { tag_id: "asc" } })).map((row) => row.tag_id);

async function applyBulk(tx: Tx, actor: string, body: BulkBody): Promise<Outcome[]> {
  const ids = [...new Set(body.ids)];
  const songs = await tx.song.findMany({
    where: { id: { in: ids } },
    select: { id: true, work_id: true, retired_at: true, tier_override: true, tier_override_reason: true },
  });
  const byId = new Map(songs.map((song) => [song.id, song]));
  const reason = ("reason" in body ? body.reason : undefined)?.trim() || null;
  const outcomes = new Map<string, Outcome>();
  const done = (id: string, outcome: "ok" | "skipped", note?: string) => outcomes.set(id, { id, outcome, ...(note ? { reason: note } : {}) });

  for (const id of ids) if (!byId.has(id)) done(id, "skipped", "not_found");

  // Work-level actions run once per Work however many of its songs were selected.
  if (body.action === "set_status" || body.action === "add_tag" || body.action === "remove_tag") {
    if (body.action !== "set_status") {
      const tag = await tx.tag.findUnique({ where: { id: body.tag_id } });
      if (!tag) throw new BulkError(400, "unknown_tag", `No tag "${body.tag_id}"`);
    }
    const workOf = new Map<string, string[]>();
    for (const song of songs) {
      if (!song.work_id) done(song.id, "skipped", "no_work");
      else workOf.set(song.work_id, [...(workOf.get(song.work_id) ?? []), song.id]);
    }
    for (const [workId, songIds] of workOf) {
      let changed: boolean;
      if (body.action === "set_status") {
        changed = await setWorkStatus(tx, actor, workId, body.status, reason);
      } else {
        const before = await tagIds(tx, workId);
        const has = before.includes(body.tag_id);
        changed = body.action === "add_tag" ? !has : has;
        if (changed) {
          if (body.action === "add_tag") await tx.workTag.create({ data: { work_id: workId, tag_id: body.tag_id } });
          else await tx.workTag.delete({ where: { work_id_tag_id: { work_id: workId, tag_id: body.tag_id } } });
          await tx.catalogueEvent.create({
            data: { actor_id: actor, work_id: workId, action: "edit", before: { tags: before }, after: { tags: await tagIds(tx, workId) }, reason },
          });
          await rebuildSearchText(tx, workId);
        }
      }
      for (const id of songIds) done(id, changed ? "ok" : "skipped", changed ? undefined : "unchanged");
    }
    return ids.map((id) => outcomes.get(id)!);
  }

  if (body.action === "assign_work") {
    const target = await tx.work.findUnique({ where: { id: body.work_id }, select: { id: true } });
    if (!target) throw new BulkError(400, "unknown_work", `No Work "${body.work_id}"`);
  }

  for (const song of songs) {
    if (body.action === "retire" || body.action === "unretire") {
      const retiring = body.action === "retire";
      if ((song.retired_at !== null) === retiring) {
        done(song.id, "skipped", "unchanged");
        continue;
      }
      const retiredAt = retiring ? new Date() : null;
      await tx.song.update({ where: { id: song.id }, data: { retired_at: retiredAt } });
      await tx.catalogueEvent.create({
        data: {
          actor_id: actor,
          song_id: song.id,
          work_id: song.work_id,
          action: body.action,
          before: { retired_at: song.retired_at?.toISOString() ?? null },
          after: { retired_at: retiredAt?.toISOString() ?? null },
          reason,
        },
      });
      done(song.id, "ok");
    } else if (body.action === "set_tier") {
      const tier = body.tier === "clear" ? null : body.tier;
      const tierReason = body.tier === "clear" ? null : body.reason;
      if (song.tier_override === tier && song.tier_override_reason === tierReason) {
        done(song.id, "skipped", "unchanged");
        continue;
      }
      await tx.song.update({ where: { id: song.id }, data: { tier_override: tier, tier_override_reason: tierReason } });
      await tx.catalogueEvent.create({
        data: {
          actor_id: actor,
          song_id: song.id,
          work_id: song.work_id,
          action: "override_tier",
          before: { tier_override: song.tier_override, tier_override_reason: song.tier_override_reason },
          after: { tier_override: tier, tier_override_reason: tierReason },
          reason: body.reason,
        },
      });
      done(song.id, "ok");
    } else if (body.action === "assign_work") {
      if (song.work_id === body.work_id) {
        done(song.id, "skipped", "unchanged");
        continue;
      }
      await tx.song.update({ where: { id: song.id }, data: { work_id: body.work_id } });
      await tx.catalogueEvent.create({
        data: {
          actor_id: actor,
          song_id: song.id,
          work_id: body.work_id,
          action: "edit",
          before: { work_id: song.work_id },
          after: { work_id: body.work_id },
          reason,
        },
      });
      done(song.id, "ok");
    }
  }
  return ids.map((id) => outcomes.get(id)!);
}

class BulkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type AliasEntry = { alias: string; kind: string };

/** Order- and key-order-insensitive: jsonb hands object keys back in its own order. */
const sameAliases = (a: AliasEntry[], b: AliasEntry[]): boolean => {
  const key = (list: AliasEntry[]) => list.map((entry) => `${entry.kind}\u0000${entry.alias}`).sort().join("\u0001");
  return key(a) === key(b);
};

const aliasList = async (tx: Tx, workId: string) =>
  (await tx.workAlias.findMany({ where: { work_id: workId }, select: { alias: true, kind: true }, orderBy: { alias: "asc" } }));

async function mergeWorks(tx: Tx, actor: string, fromId: string, intoId: string, reason: string | null) {
  const [from, into] = await Promise.all([
    tx.work.findUnique({ where: { id: fromId } }),
    tx.work.findUnique({ where: { id: intoId } }),
  ]);
  if (!from || !into) throw new BulkError(404, "not_found", "Work not found");
  if (from.id === into.id) throw new BulkError(400, "same_work", "Choose two different Works");

  const songIds = (await tx.song.findMany({ where: { work_id: fromId }, select: { id: true } })).map((song) => song.id);
  const fromAliases = await aliasList(tx, fromId);
  const intoAliasNames = new Set((await aliasList(tx, intoId)).map((alias) => alias.alias));
  const fromTags = await tagIds(tx, fromId);

  await tx.song.updateMany({ where: { work_id: fromId }, data: { work_id: intoId } });
  // The duplicate's own title becomes a way to find the canonical Work.
  const incoming = [...fromAliases, { alias: from.title, kind: "title" }].filter(
    (alias, index, all) =>
      alias.alias !== into.title && !intoAliasNames.has(alias.alias) && all.findIndex((other) => other.alias === alias.alias) === index,
  );
  if (incoming.length > 0) await tx.workAlias.createMany({ data: incoming.map((alias) => ({ ...alias, work_id: intoId })) });
  await tx.workAlias.deleteMany({ where: { work_id: fromId } });
  if (fromTags.length > 0) await tx.workTag.createMany({ data: fromTags.map((tag_id) => ({ work_id: intoId, tag_id })), skipDuplicates: true });
  await tx.workTag.deleteMany({ where: { work_id: fromId } });
  // Kept, not deleted: audit rows and any old link keep resolving.
  await tx.work.update({ where: { id: fromId }, data: { curation_status: "retired" } });
  await rebuildSearchText(tx, intoId);
  await rebuildSearchText(tx, fromId);
  await tx.catalogueEvent.create({
    data: {
      actor_id: actor,
      work_id: intoId,
      action: "merge",
      before: json({ from_id: fromId, from_status: from.curation_status, songs: songIds, aliases: fromAliases, tags: fromTags }),
      after: json({ into_id: intoId, songs_moved: songIds.length, aliases_added: incoming.length }),
      reason,
    },
  });
  return { songs_moved: songIds.length, aliases_added: incoming.length, tags_moved: fromTags.length };
}

type EventRow = { id: string; actor_id: string | null; work_id: string | null; song_id: string | null; action: string; before: unknown; after: unknown };

/** Reverses one event if the thing it changed still holds the value the event left. */
async function undoEvent(tx: Tx, actor: string, event: EventRow): Promise<void> {
  const before = (event.before ?? {}) as Record<string, unknown>;
  const after = (event.after ?? {}) as Record<string, unknown>;
  const reason = `Undo of ${event.id}`;
  const conflict = () => new BulkError(409, "conflict", "This has changed since; undo would overwrite newer edits");
  const log = (data: Partial<Prisma.CatalogueEventUncheckedCreateInput>) =>
    tx.catalogueEvent.create({
      data: { actor_id: actor, work_id: event.work_id, song_id: event.song_id, action: event.action, reason, ...data, before: json(after), after: json(before) },
    });

  if (event.action === "merge") {
    throw new BulkError(422, "not_undoable", "A merge cannot be undone; merge back by hand if it was a mistake");
  } else if ("curation_status" in before && event.work_id) {
    const work = await tx.work.findUnique({ where: { id: event.work_id }, select: { curation_status: true } });
    if (!work || work.curation_status !== after.curation_status) throw conflict();
    await tx.work.update({ where: { id: event.work_id }, data: { curation_status: before.curation_status as string } });
    await log({});
  } else if ("retired_at" in before && event.song_id) {
    const song = await tx.song.findUnique({ where: { id: event.song_id }, select: { retired_at: true } });
    if (!song || (song.retired_at?.toISOString() ?? null) !== after.retired_at) throw conflict();
    await tx.song.update({ where: { id: event.song_id }, data: { retired_at: before.retired_at ? new Date(before.retired_at as string) : null } });
    await log({ action: before.retired_at ? "retire" : "unretire" });
  } else if ("tier_override" in before && event.song_id) {
    const song = await tx.song.findUnique({ where: { id: event.song_id }, select: { tier_override: true, tier_override_reason: true } });
    if (!song || song.tier_override !== after.tier_override || song.tier_override_reason !== after.tier_override_reason) throw conflict();
    await tx.song.update({
      where: { id: event.song_id },
      data: { tier_override: before.tier_override as string | null, tier_override_reason: before.tier_override_reason as string | null },
    });
    await log({});
  } else if ("tags" in before && event.work_id) {
    const current = await tagIds(tx, event.work_id);
    if (JSON.stringify(current) !== JSON.stringify(after.tags)) throw conflict();
    await tx.workTag.deleteMany({ where: { work_id: event.work_id } });
    await tx.workTag.createMany({ data: (before.tags as string[]).map((tag_id) => ({ work_id: event.work_id!, tag_id })) });
    await rebuildSearchText(tx, event.work_id);
    await log({});
  } else if ("work_id" in before && event.song_id) {
    const song = await tx.song.findUnique({ where: { id: event.song_id }, select: { work_id: true } });
    if (!song || song.work_id !== after.work_id) throw conflict();
    await tx.song.update({ where: { id: event.song_id }, data: { work_id: before.work_id as string | null } });
    await log({ work_id: (before.work_id as string | null) ?? event.work_id });
  } else if (event.action === "edit" && event.work_id && !event.song_id) {
    const work = await tx.work.findUnique({ where: { id: event.work_id } });
    if (!work) throw conflict();
    const fields = Object.fromEntries(Object.keys(before).filter((key) => (WORK_FIELDS as readonly string[]).includes(key)).map((key) => [key, before[key]]));
    for (const key of Object.keys(fields)) if (work[key as (typeof WORK_FIELDS)[number]] !== after[key]) throw conflict();
    if ("aliases" in before && !sameAliases(await aliasList(tx, event.work_id), after.aliases as AliasEntry[])) throw conflict();
    await tx.work.update({ where: { id: event.work_id }, data: fields as Prisma.WorkUpdateInput });
    if ("aliases" in before) {
      await tx.workAlias.deleteMany({ where: { work_id: event.work_id } });
      await tx.workAlias.createMany({ data: (before.aliases as { alias: string; kind: string }[]).map((alias) => ({ ...alias, work_id: event.work_id! })) });
    }
    await rebuildSearchText(tx, event.work_id);
    await log({});
  } else {
    throw new BulkError(422, "not_undoable", `A ${event.action} event cannot be undone`);
  }
}

export function adminCatalogueRouter(deps: AdminCatalogueDeps = {}): Router {
  const prisma = deps.prisma ?? defaultPrisma;
  const adminCheck = deps.isAdmin ?? isAdmin;
  const router = Router();

  const guard = (handler: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: unknown) => {
      if (error instanceof BulkError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message } });
        return;
      }
      next(error);
    });
  };
  const actorOf = (req: Request): string => {
    if (!req.userId) throw new Error("Authenticated user missing");
    return req.userId;
  };

  router.use("/admin/catalogue", (req: Request, res: Response, next: NextFunction) => {
    (async () => {
      if (!req.userId || !(await adminCheck(req.userId))) {
        res.status(403).json({ error: { code: "forbidden", message: "Admin access required" } });
        return;
      }
      next();
    })().catch(next);
  });

  router.get(
    "/admin/catalogue/songs",
    guard(async (req, res) => {
      const query = songsQuery.parse(req.query);
      const where = songsWhere(query);
      const [total, rows] = await Promise.all([
        prisma.song.count({ where }),
        prisma.song.findMany({
          where,
          select: songSelect,
          orderBy: [{ artist: "asc" }, { title: "asc" }, { id: "asc" }],
          take: query.limit,
          skip: query.offset,
        }),
      ]);
      res.json({ songs: rows.map(songRow), total });
    }),
  );

  router.get(
    "/admin/catalogue/queue",
    guard(async (_req, res) => {
      const rows = await prisma.song.findMany({
        where: { uploader_id: null, retired_at: null, work: { curation_status: { in: ["draft", "in_review"] } } },
        select: songSelect,
        orderBy: [{ artist: "asc" }, { title: "asc" }, { id: "asc" }],
        take: 500,
      });
      res.json({ songs: rows.map(songRow) });
    }),
  );

  router.post(
    "/admin/catalogue/bulk",
    guard(async (req, res) => {
      const body = bulkBody.parse(req.body);
      const actor = actorOf(req);
      const results = await prisma.$transaction((tx) => applyBulk(tx, actor, body), { timeout: 60_000 });
      res.json({
        results,
        ok: results.filter((result) => result.outcome === "ok").length,
        skipped: results.filter((result) => result.outcome === "skipped").length,
      });
    }),
  );

  router.get(
    "/admin/catalogue/works",
    guard(async (req, res) => {
      const q = z.string().trim().max(100).optional().parse(req.query.q);
      const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit);
      const rows = await prisma.work.findMany({
        where: q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { id: { contains: q, mode: "insensitive" } },
                { search_text: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        select: {
          id: true,
          title: true,
          catalogue: true,
          curation_status: true,
          genre: true,
          era: true,
          featured_rank: true,
          pd_status: true,
          composer: { select: { name: true } },
          aliases: { select: { alias: true, kind: true }, orderBy: { alias: "asc" } },
          tags: { select: { tag_id: true } },
          _count: { select: { songs: true } },
        },
        orderBy: [{ title: "asc" }],
        take: limit,
      });
      res.json({
        works: rows.map(({ composer, _count, tags, ...work }) => ({
          ...work,
          composer: composer?.name ?? null,
          tags: tags.map((tag) => tag.tag_id),
          song_count: _count.songs,
        })),
      });
    }),
  );

  router.get(
    "/admin/catalogue/tags",
    guard(async (_req, res) => {
      res.json({ tags: await prisma.tag.findMany({ orderBy: [{ kind: "asc" }, { label: "asc" }] }) });
    }),
  );

  router.patch(
    "/admin/catalogue/works/:id",
    guard(async (req, res) => {
      const id = z.string().parse(req.params.id);
      const { aliases, reason, ...fields } = workPatch.parse(req.body);
      const actor = actorOf(req);
      const updated = await prisma.$transaction(async (tx) => {
        const work = await tx.work.findUnique({ where: { id } });
        if (!work) throw new BulkError(404, "not_found", "Work not found");
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const key of WORK_FIELDS) {
          const next = fields[key];
          if (next !== undefined && next !== work[key]) {
            before[key] = work[key];
            after[key] = next;
          }
        }
        if (aliases) {
          const current = await aliasList(tx, id);
          const wanted = [...aliases].sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
          if (!sameAliases(current, wanted)) {
            before.aliases = current;
            after.aliases = wanted;
            await tx.workAlias.deleteMany({ where: { work_id: id } });
            await tx.workAlias.createMany({ data: wanted.map((alias) => ({ ...alias, work_id: id })), skipDuplicates: true });
          }
        }
        if (Object.keys(after).length > 0) {
          const data = Object.fromEntries(Object.keys(after).filter((key) => key !== "aliases").map((key) => [key, after[key]]));
          await tx.work.update({ where: { id }, data });
          await tx.catalogueEvent.create({
            data: { actor_id: actor, work_id: id, action: "edit", before: json(before), after: json(after), reason: reason?.trim() || null },
          });
          await rebuildSearchText(tx, id);
        }
        return tx.work.findUniqueOrThrow({ where: { id }, include: { aliases: { orderBy: { alias: "asc" } } } });
      });
      res.json({ work: updated });
    }),
  );

  router.post(
    "/admin/catalogue/works/merge",
    guard(async (req, res) => {
      const body = mergeBody.parse(req.body);
      const actor = actorOf(req);
      const result = await prisma.$transaction((tx) => mergeWorks(tx, actor, body.from_id, body.into_id, body.reason?.trim() || null), {
        timeout: 60_000,
      });
      res.json(result);
    }),
  );

  router.get(
    "/admin/catalogue/events",
    guard(async (req, res) => {
      const query = eventsQuery.parse(req.query);
      const where: Prisma.CatalogueEventWhereInput = {
        ...(query.song_id ? { song_id: query.song_id } : {}),
        ...(query.work_id ? { work_id: query.work_id } : {}),
        ...(query.actor_id ? { actor_id: query.actor_id } : {}),
        ...(query.action ? { action: query.action } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.catalogueEvent.count({ where }),
        prisma.catalogueEvent.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: query.limit, skip: query.offset }),
      ]);
      const actorIds = [...new Set(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : [])))];
      const workIds = [...new Set(rows.flatMap((row) => (row.work_id ? [row.work_id] : [])))];
      const songIds = [...new Set(rows.flatMap((row) => (row.song_id ? [row.song_id] : [])))];
      const [actors, works, songs] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, display_name: true } }),
        prisma.work.findMany({ where: { id: { in: workIds } }, select: { id: true, title: true } }),
        prisma.song.findMany({ where: { id: { in: songIds } }, select: { id: true, title: true } }),
      ]);
      const actorName = new Map(actors.map((actor) => [actor.id, actor.display_name]));
      const workTitle = new Map(works.map((work) => [work.id, work.title]));
      const songTitle = new Map(songs.map((song) => [song.id, song.title]));
      res.json({
        total,
        events: rows.map((row) => ({
          ...row,
          at: row.at.toISOString(),
          actor_name: row.actor_id ? (actorName.get(row.actor_id) ?? null) : null,
          work_title: row.work_id ? (workTitle.get(row.work_id) ?? null) : null,
          song_title: row.song_id ? (songTitle.get(row.song_id) ?? null) : null,
        })),
      });
    }),
  );

  router.post(
    "/admin/catalogue/events/:id/undo",
    guard(async (req, res) => {
      const id = z.string().parse(req.params.id);
      const actor = actorOf(req);
      await prisma.$transaction(async (tx) => {
        const event = await tx.catalogueEvent.findUnique({ where: { id } });
        if (!event) throw new BulkError(404, "not_found", "Event not found");
        await undoEvent(tx, actor, event);
      });
      res.json({ ok: true });
    }),
  );

  router.get(
    "/admin/catalogue/licences.csv",
    guard(async (_req, res) => {
      // The same rows /credits starts from (shared, not retired), but every licence, not only credited ones.
      const rows = await prisma.song.findMany({
        where: { ...sharedSongWhere(), retired_at: null },
        select: {
          id: true,
          title: true,
          artist: true,
          arrangement_level: true,
          source_kind: true,
          source_ref: true,
          source_url: true,
          file_licence: true,
          attribution: true,
          work: { select: { id: true, pd_status: true } },
        },
        orderBy: [{ artist: "asc" }, { title: "asc" }, { arrangement_level: "asc" }, { id: "asc" }],
      });
      const header = ["song_id", "title", "artist", "level", "work_id", "composition_status", "source_kind", "source_ref", "source_url", "file_licence", "licence_url", "credit_required", "attribution"];
      const lines = [
        csvLine(header),
        ...rows.map((row) =>
          csvLine([
            row.id,
            row.title,
            row.artist,
            row.arrangement_level,
            row.work?.id,
            row.work?.pd_status,
            row.source_kind,
            row.source_ref,
            row.source_url,
            row.file_licence,
            licenceUrl(row.file_licence),
            isCreditedLicence(row.file_licence) ? "yes" : "no",
            row.attribution,
          ]),
        ),
      ];
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", 'attachment; filename="keyboard-sensei-licences.csv"');
      res.send(`${lines.join("\r\n")}\r\n`);
    }),
  );

  return router;
}
