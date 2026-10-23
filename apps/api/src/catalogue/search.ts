/**
 * Catalogue search: one row per Work, with its playable versions nested.
 *
 * The text match uses exactly the expressions the 20261024100000_catalogue
 * migration indexes, so both GIN indexes apply:
 *   to_tsvector('simple', ks_unaccent(search_text)) @@ websearch_to_tsquery('simple', ks_unaccent(q))
 *   ks_unaccent(lower(q)) <% ks_unaccent(lower(search_text))
 * Changing either side of those expressions silently turns an index lookup
 * into a scan of every Work (see the EXPLAIN check in search.db.test.ts).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { fold, matchedAlias, searchTerms, type SearchTerms } from "./aliases.js";

export const TIERS = ["verified", "good", "unrated", "low"] as const;
export type QualityTier = (typeof TIERS)[number];
export const HANDS = ["both", "right-hand-melody", "single-line"] as const;
export type Hands = (typeof HANDS)[number];
export const DURATION_BUCKETS = ["under-1", "1-3", "3-6", "over-6"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];
export const SORTS = ["recommended", "easiest", "title", "featured"] as const;
export type WorkSort = (typeof SORTS)[number];

/** pg_trgm word_similarity at or above which a Work counts as a fuzzy match (library spec 3.2). */
const SIMILARITY_THRESHOLD = 0.35;
/** Shorter queries match whole words only. */
const MIN_FUZZY_LENGTH = 4;
/** Exact word matches at or above which fuzzy matching is skipped. */
const EXACT_ENOUGH = 3;
/** Recent play counts only reorder Works within a tier, over this many days. */
const RECENT_PLAY_DAYS = 90;

export interface WorkSearchParams {
  q?: string;
  /** Song difficulty levels 1-5; a Work matches when one of its versions does. */
  level?: number[];
  genre?: string[];
  era?: string[];
  /** Tag ids; a Work must carry every one. */
  tags?: string[];
  composer?: string;
  /** Restrict to one Work (the detail route). */
  workId?: string;
  hands?: Hands[];
  duration?: DurationBucket[];
  /** Exact tier filter. Overrides the default tier set; "low" is dropped for non-admins. */
  tier?: QualityTier[];
  /** Also return Unrated versions (below the Verified and Good ones). */
  showUnrated?: boolean;
  sort?: WorkSort;
  limit?: number;
  offset?: number;
}

export interface SearchContext {
  admin: boolean;
  /** PUBLIC_CATALOGUE: only public-eligible versions are ever returned, admins included. */
  publicCatalogue: boolean;
}

export interface WorkVersion {
  id: string;
  title: string;
  arrangement_level: string | null;
  difficulty: number;
  grade_band: string | null;
  hands: Hands;
  duration_sec: number;
  note_count: number;
  quality_tier: QualityTier;
  quality_score: number | null;
  attribution: string | null;
  content_rights: string;
}

export interface WorkSummary {
  id: string;
  title: string;
  composer: { id: string; name: string; sort_name: string } | null;
  catalogue: string | null;
  movement: string | null;
  era: string | null;
  genre: string;
  recognisability: number | null;
  featured_rank: number | null;
  curation_status: string;
  tags: { id: string; label: string; kind: string }[];
  /** Best tier among the returned versions; drives the Unrated divider. */
  best_tier: QualityTier;
  level_min: number;
  level_max: number;
  /** The alias the query matched when it was not the title ("Mondscheinsonate"), else null. */
  matched_alias: string | null;
  versions: WorkVersion[];
}

export interface WorkSearchResult {
  works: WorkSummary[];
  total: number;
  /** Opaque; pass back as `cursor` for the next page. Null on the last page. */
  next_cursor: string | null;
}

const TIER_RANK = { verified: 0, good: 1, unrated: 2, low: 3 } as const;
/** Added to relevance so a Verified match outranks an equally good Unrated one. */
const TIER_BOOST = { verified: 0.3, good: 0.1, unrated: 0, low: -0.1 } as const;

const effectiveTier = Prisma.sql`COALESCE(s.tier_override, s.quality_tier)`;

const durationClause = (bucket: DurationBucket): Prisma.Sql => {
  switch (bucket) {
    case "under-1":
      return Prisma.sql`s.duration_sec < 60`;
    case "1-3":
      return Prisma.sql`(s.duration_sec >= 60 AND s.duration_sec < 180)`;
    case "3-6":
      return Prisma.sql`(s.duration_sec >= 180 AND s.duration_sec < 360)`;
    case "over-6":
      return Prisma.sql`s.duration_sec >= 360`;
  }
};

/** Which tiers a request may see: the default, widened by showUnrated, or an explicit list. */
export function visibleTiers(params: Pick<WorkSearchParams, "tier" | "showUnrated">, admin: boolean): QualityTier[] {
  const wanted: QualityTier[] = params.tier?.length ? params.tier : params.showUnrated ? ["verified", "good", "unrated"] : ["verified", "good"];
  return wanted.filter((tier) => tier !== "low" || admin);
}

/**
 * The song-level visibility rule: a catalogue version is a library song with
 * no uploader, not retired, in an allowed tier, and under PUBLIC_CATALOGUE
 * public-eligible. (WP4 owns the canonical public-eligibility predicate in
 * eligibility.ts; this is its minimal SQL form: Song.public_eligible.)
 */
function versionFilters(params: WorkSearchParams, context: SearchContext): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [
    Prisma.sql`s.work_id IS NOT NULL`,
    Prisma.sql`s.retired_at IS NULL`,
    Prisma.sql`s.uploader_id IS NULL`,
    Prisma.sql`${effectiveTier} IN (${Prisma.join(visibleTiers(params, context.admin))})`,
  ];
  if (context.publicCatalogue) filters.push(Prisma.sql`s.public_eligible`);
  if (params.level?.length) filters.push(Prisma.sql`s.difficulty IN (${Prisma.join(params.level)})`);
  if (params.hands?.length) filters.push(Prisma.sql`COALESCE(s.hands, 'both') IN (${Prisma.join(params.hands)})`);
  if (params.duration?.length) {
    filters.push(Prisma.sql`(${Prisma.join(params.duration.map(durationClause), " OR ")})`);
  }
  return filters;
}

const and = (clauses: Prisma.Sql[]): Prisma.Sql =>
  clauses.length > 0 ? Prisma.join(clauses, " AND ") : Prisma.sql`TRUE`;

/**
 * The text predicate (index expressions, used in the WHERE) and the relevance
 * score. The score reads each Work's text folded once by `lateral`, because
 * ks_unaccent is the expensive part of a broad match.
 */
export function textMatch(terms: SearchTerms, fuzzy: boolean): { where: Prisma.Sql; lateral: Prisma.Sql; score: Prisma.Sql } {
  // Scalar subqueries, not expressions on the parameter: they are evaluated once
  // (an InitPlan) and stay index-usable and unfolded-cost-free even when
  // Postgres switches the prepared statement to a generic plan, where a bare
  // ks_unaccent($1) would be recomputed for every row.
  const q = Prisma.sql`(SELECT ks_unaccent(lower(${terms.text})))`;
  const tsq = Prisma.sql`(SELECT websearch_to_tsquery('simple', ks_unaccent(${terms.tsQuery})))`;
  const fts = Prisma.sql`to_tsvector('simple', ks_unaccent(w.search_text)) @@ ${tsq}`;
  const where = fuzzy ? Prisma.sql`(${fts} OR ${q} <% ks_unaccent(lower(w.search_text)))` : fts;
  return {
    where,
    lateral: Prisma.sql`CROSS JOIN LATERAL (
      SELECT ks_unaccent(lower(w.search_text)) AS doc, ks_unaccent(lower(w.title)) AS title
    ) d`,
    // search_text joins its parts (title, aliases, composer, ...) with " | ", so
    // a part equal to the whole query is an exact title/alias/composer hit.
    score: Prisma.sql`(
      CASE WHEN to_tsvector('simple', d.doc) @@ ${tsq} THEN 1.0 ELSE 0 END
      + word_similarity(${q}, d.doc)
      + CASE
          WHEN d.title = ${q} THEN 1.0
          WHEN left(d.title, length(${q})) = ${q} THEN 0.5
          WHEN strpos(d.title, ${q}) > 0 THEN 0.3
          ELSE 0
        END
      + CASE WHEN strpos(' | ' || d.doc || ' | ', ' | ' || ${q} || ' | ') > 0 THEN 0.8 ELSE 0 END
    )`,
  };
}

/**
 * Typo and prefix tolerance is a fallback: with a few exact word matches the
 * person found what they typed, and the trigram scan (the slow part) is skipped.
 * A catalogue number is exact by intent and a very short query is mostly noise
 * at this threshold, so neither goes fuzzy.
 */
async function wantsFuzzy(prisma: PrismaClient, terms: SearchTerms, workFilters: Prisma.Sql[]): Promise<boolean> {
  if (terms.text.length < MIN_FUZZY_LENGTH || terms.catalogue.length > 0) return false;
  const exact = textMatch(terms, false).where;
  const rows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT count(*)::int AS n FROM (SELECT 1 FROM "Work" w WHERE ${and([...workFilters, exact])} LIMIT ${EXACT_ENOUGH}) hits`);
  return (rows[0]?.n ?? 0) < EXACT_ENOUGH;
}

const orderFor = (sort: WorkSort, searching: boolean): Prisma.Sql => {
  const tail = Prisma.sql`w.recognisability ASC NULLS LAST, lower(w.title) ASC, w.id ASC`;
  switch (sort) {
    case "title":
      return Prisma.sql`lower(w.title) ASC, w.id ASC`;
    case "easiest":
      return Prisma.sql`agg.best_tier ASC, agg.easiest ASC, ${tail}`;
    case "featured":
      return Prisma.sql`w.featured_rank ASC NULLS LAST, agg.best_tier ASC, ${tail}`;
    case "recommended":
      return searching
        ? Prisma.sql`relevance DESC, ${tail}`
        : Prisma.sql`agg.best_tier ASC, w.recognisability ASC NULLS LAST, COALESCE(plays.n, 0) DESC, agg.easiest ASC, lower(w.title) ASC, w.id ASC`;
  }
};

interface WorkRow {
  id: string;
  total: number;
  best_tier: number;
}

interface VersionRow {
  work_id: string;
  id: string;
  title: string;
  arrangement_level: string | null;
  difficulty: number;
  grade_band: string | null;
  hands: string | null;
  duration_sec: number;
  note_count: number;
  tier: string;
  quality_score: number | null;
  attribution: string | null;
  content_rights: string;
}

const tierNames = ["verified", "good", "unrated", "low"] as const;

export async function searchWorks(
  prisma: PrismaClient,
  params: WorkSearchParams,
  context: SearchContext,
): Promise<WorkSearchResult> {
  const terms = searchTerms(params.q);
  const searching = terms.text.length > 0;
  const sort = params.sort ?? "recommended";
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const tiers = visibleTiers(params, context.admin);
  // Asked only for tiers this person may not see (Low, as a non-admin): nothing, not the defaults.
  if (tiers.length === 0) return { works: [], total: 0, next_cursor: null };
  const versions = versionFilters(params, context);
  const workFilters: Prisma.Sql[] = [
    context.admin ? Prisma.sql`w.curation_status <> 'retired'` : Prisma.sql`w.curation_status = 'published'`,
  ];
  if (params.genre?.length) workFilters.push(Prisma.sql`w.genre IN (${Prisma.join(params.genre)})`);
  if (params.era?.length) workFilters.push(Prisma.sql`w.era IN (${Prisma.join(params.era)})`);
  if (params.workId) workFilters.push(Prisma.sql`w.id = ${params.workId}`);
  if (params.composer) workFilters.push(Prisma.sql`w.composer_id = ${params.composer}`);
  if (params.tags?.length) {
    workFilters.push(Prisma.sql`(
      SELECT count(DISTINCT wt.tag_id) FROM "WorkTag" wt
      WHERE wt.work_id = w.id AND wt.tag_id IN (${Prisma.join(params.tags)})
    ) = ${new Set(params.tags).size}`);
  }
  const text = searching ? textMatch(terms, await wantsFuzzy(prisma, terms, workFilters)) : null;
  if (text) workFilters.push(text.where);

  const needsPlays = sort === "recommended" && !searching;
  const plays = needsPlays
    ? Prisma.sql`LEFT JOIN (
        SELECT s.work_id, count(*) AS n
        FROM "PlayAlongAttempt" a JOIN "Song" s ON s.id = a.song_id
        WHERE s.work_id IS NOT NULL AND a.created_at > ${new Date(Date.now() - RECENT_PLAY_DAYS * 86_400_000)}
        GROUP BY s.work_id
      ) plays ON plays.work_id = w.id`
    : Prisma.empty;

  // Tier boost needs the best tier per Work, so it is added to the text score here.
  const relevance = text
    ? Prisma.sql`${text.score} + CASE agg.best_tier WHEN 0 THEN ${TIER_BOOST.verified} WHEN 1 THEN ${TIER_BOOST.good} WHEN 2 THEN ${TIER_BOOST.unrated} ELSE ${TIER_BOOST.low} END`
    : Prisma.sql`0`;

  const rows = await prisma.$transaction(async (tx) => {
    if (searching) {
      // The threshold `<%` uses; transaction-local so it never leaks to other queries.
      await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(SIMILARITY_THRESHOLD)}, true)`;
    }
    return tx.$queryRaw<(WorkRow & { relevance: number })[]>(Prisma.sql`
      WITH hit AS MATERIALIZED (
        SELECT w.id FROM "Work" w WHERE ${and(workFilters)}
      ),
      agg AS (
        SELECT s.work_id,
               min(CASE ${effectiveTier} WHEN 'verified' THEN 0 WHEN 'good' THEN 1 WHEN 'unrated' THEN 2 ELSE 3 END) AS best_tier,
               min(s.difficulty) AS easiest
        FROM "Song" s
        WHERE s.work_id IN (SELECT id FROM hit) AND ${and(versions)}
        GROUP BY s.work_id
      )
      SELECT w.id, (count(*) OVER())::int AS total, agg.best_tier::int AS best_tier,
             (${relevance})::float8 AS relevance
      FROM agg
      JOIN "Work" w ON w.id = agg.work_id
      ${text ? text.lateral : Prisma.empty}
      ${plays}
      ORDER BY ${orderFor(sort, searching)}
      LIMIT ${limit} OFFSET ${offset}
    `);
  });

  const total = rows[0]?.total ?? (offset > 0 ? await countAt(prisma, params, context) : 0);
  if (rows.length === 0) return { works: [], total, next_cursor: null };

  const ids = rows.map((row) => row.id);
  const [works, versionRows] = await Promise.all([
    prisma.work.findMany({
      where: { id: { in: ids } },
      include: { composer: true, aliases: { select: { alias: true } }, tags: { include: { tag: true } } },
    }),
    prisma.$queryRaw<VersionRow[]>(Prisma.sql`
      SELECT s.work_id, s.id, s.title, s.arrangement_level, s.difficulty, s.grade_band, s.hands,
             s.duration_sec, s.note_count, ${effectiveTier} AS tier, s.quality_score, s.attribution, s.content_rights
      FROM "Song" s
      WHERE ${and(versions)} AND s.work_id IN (${Prisma.join(ids)})
      ORDER BY CASE ${effectiveTier} WHEN 'verified' THEN 0 WHEN 'good' THEN 1 WHEN 'unrated' THEN 2 ELSE 3 END,
               s.difficulty ASC, s.quality_score DESC NULLS LAST, s.id ASC
    `),
  ]);

  const byId = new Map(works.map((work) => [work.id, work]));
  const versionsByWork = new Map<string, WorkVersion[]>();
  for (const row of versionRows) {
    const list = versionsByWork.get(row.work_id) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      arrangement_level: row.arrangement_level,
      difficulty: row.difficulty,
      grade_band: row.grade_band,
      hands: (HANDS as readonly string[]).includes(row.hands ?? "") ? (row.hands as Hands) : "both",
      duration_sec: row.duration_sec,
      note_count: row.note_count,
      quality_tier: row.tier as QualityTier,
      quality_score: row.quality_score,
      attribution: row.attribution,
      content_rights: row.content_rights,
    });
    versionsByWork.set(row.work_id, list);
  }

  const summaries: WorkSummary[] = [];
  for (const row of rows) {
    const work = byId.get(row.id);
    const workVersions = versionsByWork.get(row.id) ?? [];
    if (!work || workVersions.length === 0) continue;
    const levels = workVersions.map((version) => version.difficulty);
    summaries.push({
      id: work.id,
      title: work.title,
      composer: work.composer ? { id: work.composer.id, name: work.composer.name, sort_name: work.composer.sort_name } : null,
      catalogue: work.catalogue,
      movement: work.movement,
      era: work.era,
      genre: work.genre,
      recognisability: work.recognisability,
      featured_rank: work.featured_rank,
      curation_status: work.curation_status,
      tags: work.tags.map(({ tag }) => ({ id: tag.id, label: tag.label, kind: tag.kind })).sort((a, b) => a.id.localeCompare(b.id)),
      best_tier: tierNames[row.best_tier] ?? "unrated",
      level_min: Math.min(...levels),
      level_max: Math.max(...levels),
      matched_alias: searching ? matchedAlias(terms, work.title, work.aliases.map((alias) => alias.alias)) : null,
      versions: workVersions,
    });
  }

  const nextOffset = offset + rows.length;
  return { works: summaries, total, next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null };
}

/** Total when the requested page is past the end (an empty page has no window count). */
async function countAt(prisma: PrismaClient, params: WorkSearchParams, context: SearchContext): Promise<number> {
  const first = await searchWorks(prisma, { ...params, offset: 0, limit: 1 }, context);
  return first.total;
}

export const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ o: offset })).toString("base64url");

/** Offset from an opaque cursor, or null when it is not one of ours. */
export function decodeCursor(cursor: string): number | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    return typeof parsed.o === "number" && Number.isInteger(parsed.o) && parsed.o >= 0 && parsed.o < 100_000 ? parsed.o : null;
  } catch {
    return null;
  }
}

export interface Suggestion {
  kind: "work" | "composer" | "alias";
  /** What to put in the search box. */
  text: string;
  /** The Work to open (work, alias), or the composer id. */
  id: string;
  /** Secondary line: the composer of a work, the work an alias belongs to. */
  detail: string | null;
}

/**
 * Type-ahead: Work titles, composers and aliases that start with or contain
 * what has been typed so far. Only Works that have a visible version are offered.
 */
export async function suggest(
  prisma: PrismaClient,
  rawQuery: string,
  context: SearchContext,
  limit = 8,
): Promise<Suggestion[]> {
  const terms = searchTerms(rawQuery);
  if (terms.text.length < 2) return [];
  const result = await searchWorks(prisma, { q: terms.text, limit }, context);
  const needle = fold(terms.text);
  const composerIds = [...new Set(result.works.flatMap((work) => (work.composer ? [work.composer.id] : [])))];
  const composers = await prisma.composer.findMany({ where: { id: { in: composerIds } } });
  const composerMatches = new Set(
    composers.filter((composer) => [composer.name, ...composer.aliases].some((name) => fold(name).includes(needle))).map((composer) => composer.id),
  );
  const out: Suggestion[] = [];
  const seenComposers = new Set<string>();
  for (const work of result.works) {
    out.push({ kind: "work", text: work.title, id: work.id, detail: work.composer?.name ?? null });
    if (work.matched_alias) out.push({ kind: "alias", text: work.matched_alias, id: work.id, detail: work.title });
    const composer = work.composer;
    if (composer && composerMatches.has(composer.id) && !seenComposers.has(composer.id)) {
      seenComposers.add(composer.id);
      out.push({ kind: "composer", text: composer.name, id: composer.id, detail: null });
    }
  }
  return out.slice(0, limit);
}

export interface FacetCounts {
  eras: { value: string; count: number }[];
  genres: { value: string; count: number }[];
  tags: { id: string; label: string; kind: string; count: number }[];
  /** Works per level, over their visible versions. */
  levels: { value: number; count: number }[];
  /** Works hidden by the default tier filter that "Show unrated" would add. */
  unrated_extra: number;
}

/** Counts for the filter bar, over the same visibility rules as searchWorks (default tiers). */
export async function facetCounts(prisma: PrismaClient, context: SearchContext): Promise<FacetCounts> {
  const defaults = versionFilters({}, context);
  const withUnrated = versionFilters({ showUnrated: true }, context);
  const published = context.admin ? Prisma.sql`w.curation_status <> 'retired'` : Prisma.sql`w.curation_status = 'published'`;
  const live = (filters: Prisma.Sql[]) =>
    Prisma.sql`SELECT DISTINCT s.work_id FROM "Song" s WHERE ${and(filters)}`;

  const [eras, genres, tags, levels, extra] = await Promise.all([
    prisma.$queryRaw<{ value: string; count: number }[]>(Prisma.sql`
      SELECT w.era AS value, count(*)::int AS count FROM "Work" w
      WHERE ${published} AND w.era IS NOT NULL AND w.id IN (${live(defaults)}) GROUP BY w.era ORDER BY count DESC, value`),
    prisma.$queryRaw<{ value: string; count: number }[]>(Prisma.sql`
      SELECT w.genre AS value, count(*)::int AS count FROM "Work" w
      WHERE ${published} AND w.id IN (${live(defaults)}) GROUP BY w.genre ORDER BY count DESC, value`),
    prisma.$queryRaw<{ id: string; label: string; kind: string; count: number }[]>(Prisma.sql`
      SELECT t.id, t.label, t.kind, count(*)::int AS count
      FROM "Tag" t JOIN "WorkTag" wt ON wt.tag_id = t.id JOIN "Work" w ON w.id = wt.work_id
      WHERE ${published} AND w.id IN (${live(defaults)}) GROUP BY t.id ORDER BY t.kind, count DESC, t.label`),
    prisma.$queryRaw<{ value: number; count: number }[]>(Prisma.sql`
      SELECT s.difficulty AS value, count(DISTINCT s.work_id)::int AS count FROM "Song" s JOIN "Work" w ON w.id = s.work_id
      WHERE ${published} AND ${and(defaults)} GROUP BY s.difficulty ORDER BY s.difficulty`),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT count(*)::int AS count FROM "Work" w
      WHERE ${published} AND w.id IN (${live(withUnrated)}) AND w.id NOT IN (${live(defaults)})`),
  ]);
  return { eras, genres, tags, levels, unrated_extra: extra[0]?.count ?? 0 };
}

/** One Work, with the same visibility rules as the list; null when it has no visible version. */
export async function findWork(
  prisma: PrismaClient,
  id: string,
  params: Pick<WorkSearchParams, "showUnrated" | "tier">,
  context: SearchContext,
): Promise<WorkSummary | null> {
  const result = await searchWorks(prisma, { ...params, workId: id, limit: 1 }, context);
  return result.works[0] ?? null;
}
