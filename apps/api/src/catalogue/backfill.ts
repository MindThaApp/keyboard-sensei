/**
 * Catalogue backfill: give every existing Song its catalogue fields and group
 * the curated songs into Works (called from prisma/seed.ts).
 *
 *   - source_kind / source_ref / file_licence, from the conventions the songs
 *     were created with (`essentials-*` ids, `beginner-<slug>.mid` files,
 *     `seed-*` ADL rows, `content_rights` of uploads);
 *   - Composers (with search aliases) and Works: one Work per Essentials piece,
 *     holding all its levels; beginner-pack and ADL rows join that Work when
 *     ESSENTIALS_REPLACES or DUPLICATE_OF says they are the same piece; other
 *     beginner tunes get a Work of their own. Other ADL rows stay unlinked
 *     until a reviewed mapping exists;
 *   - quality tier, score and signals from src/midi-quality.ts, and
 *     public_eligible from the Work's public-domain status and the file licence.
 *
 * Safety: it only ever writes the catalogue columns and tables. It never
 * deletes a row and never touches a Song's original columns, so ids,
 * play-along attempts, bests, stars and XP are unaffected.
 *
 * Idempotent: values are computed, compared with what is stored, and written
 * only when they differ, so a second run writes nothing. Curated choices that
 * an admin may later change (a song's Work and source, a Work's fields) are
 * only filled in when empty, never overwritten; a Work's title, genre and
 * curation status are set once, when it is created. Derived values
 * (search_text, public_eligible, the measured quality) are kept current.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ESSENTIALS, isAuthored, type EssentialsPiece } from "../essentials/manifest.js";
import { ESSENTIALS_REPLACES } from "../essentials/replacements.js";
import { DUPLICATE_OF } from "../library-titles.js";
import { classifyMidiQuality, type FileLicence, type QualityContext, type QualitySignals } from "../midi-quality.js";
import { buildSearchText } from "./search-text.js";
import {
  BEGINNER_WORKS,
  COLLECTION_TAGS,
  COMPOSERS,
  CURATED_TIER_OVERRIDES,
  ESSENTIALS_WORKS,
  FEATURED_RANK,
  MOOD_TAGS,
  TRADITIONAL,
  WORK_MOOD_TAGS,
  composerIdFor,
  gradeBandFor,
  type AliasSeed,
  type Era,
  type WorkMeta,
} from "./works-data.js";

export type SourceKind = "essentials" | "beginner" | "piano-midi-de" | "mutopia" | "adl" | "upload" | "recording" | "archive" | "unknown";

/**
 * Songs written by the source-pack importer (src/catalogue/packs/import.ts).
 * It holds facts the backfill cannot see (the incipit check against a second
 * source, the licence read from the file), so it owns their quality fields and
 * the backfill leaves them alone.
 */
export const PACK_SOURCE_KINDS: ReadonlySet<string> = new Set(["piano-midi-de", "mutopia"]);
export type PdStatus = "pd-worldwide" | "pd-us-eu" | "copyrighted" | "unknown";

/** The columns the backfill reads. */
export interface SongRow {
  id: string;
  title: string;
  artist: string;
  file_path: string;
  uploader_id: string | null;
  content_rights: string;
  arrangement_group: string | null;
  arrangement_level: string | null;
  retired_at: Date | null;
}

const beginnerSlug = (song: Pick<SongRow, "file_path" | "uploader_id">): string | null =>
  song.uploader_id ? null : (/^beginner-(.+)\.mid$/.exec(path.basename(song.file_path))?.[1] ?? null);

/** Where a song came from, by the conventions it was created with. */
export function sourceKindFor(song: Pick<SongRow, "id" | "file_path" | "uploader_id" | "content_rights">): SourceKind {
  if (song.id.startsWith("essentials-") && !song.uploader_id) return "essentials";
  if (song.id.startsWith("seed-") && !song.uploader_id) return "adl";
  if (beginnerSlug(song)) return "beginner";
  switch (song.content_rights) {
    case "archive-import":
      return "archive";
    case "user-recording":
      return "recording";
    case "user-upload":
    case "user-import-url":
    case "user-score-upload":
      return "upload";
  }
  return song.uploader_id ? "upload" : "unknown";
}

const essentialsBySlug = new Map(ESSENTIALS.map((piece) => [piece.slug, piece]));

/** Licence of the file itself (Song.file_licence). */
export function fileLicenceFor(kind: SourceKind, contentRights: string): string {
  switch (kind) {
    case "essentials":
      // Already the short tag of the Mutopia edition's licence ("cc-by-sa-2.5").
      return contentRights;
    case "beginner":
      return "public-domain";
    case "archive":
      // PianoCoRe dataset card.
      return "cc-by-nc-sa-4.0";
    default:
      // ADL files were scraped with no licence; uploads and recordings are the user's own.
      return "unknown";
  }
}

/** The licence family midi-quality.ts reasons about. */
export function licenceFamily(fileLicence: string | null): FileLicence {
  if (!fileLicence) return "unknown";
  if (fileLicence === "public-domain") return "public-domain";
  if (fileLicence.startsWith("cc-by-nc")) return "cc-by-nc";
  if (fileLicence.startsWith("cc-by-sa")) return "cc-by-sa";
  if (fileLicence.startsWith("cc-by")) return "cc-by";
  return "unknown";
}

function sourceRefFor(song: SongRow, kind: SourceKind): string | null {
  switch (kind) {
    case "essentials": {
      const piece = song.arrangement_group ? essentialsBySlug.get(song.arrangement_group) : undefined;
      if (!piece) return null;
      return isAuthored(piece.source) ? `authored:${piece.slug}` : piece.source.mutopiaId;
    }
    case "beginner":
      return `beginner-pack:${beginnerSlug(song)}`;
    case "adl":
      return song.id.slice("seed-".length);
    default:
      return null;
  }
}

/**
 * Copyright status of a Work (library spec 1.4, conservative):
 * pd-worldwide when every contributor died more than 100 years ago, or the
 * work is traditional; pd-us-eu when they died at least 70 full years ago and
 * it was published more than 95 years ago; copyrighted otherwise. Unknown
 * when the facts needed to decide are missing.
 */
export function pdStatus(input: { traditional: boolean; died: number | null; publishedYear: number | null }, year: number): PdStatus {
  if (input.traditional) return "pd-worldwide";
  if (input.died === null) return "unknown";
  if (input.died <= year - 101) return "pd-worldwide";
  if (input.died > year - 71) return "copyrighted";
  if (input.publishedYear === null) return "unknown";
  return input.publishedYear < year - 95 ? "pd-us-eu" : "copyrighted";
}

const PUBLIC_DOMAIN = new Set<string>(["pd-worldwide", "pd-us-eu"]);
const FREE_LICENCE_FAMILIES = new Set<FileLicence>(["public-domain", "cc-by", "cc-by-sa"]);
const NEVER_PUBLIC = new Set<string>(["adl", "archive", "upload", "recording", "unknown"]);
/**
 * Sources whose licence the owner has not yet confirmed. piano-midi.de publishes
 * under CC BY-SA 3.0 DE; until that is confirmed on its copyright page, nothing
 * from it may reach a public build. Remove "piano-midi-de" here once it is.
 */
export const UNCONFIRMED_LICENCE_SOURCES = new Set<string>(["piano-midi-de"]);

/** Library spec 4.2: may this song ever be served by a public build? */
export function isPublicEligible(input: { sourceKind: string | null; fileLicence: string | null; workPdStatus: string | null }): boolean {
  return (
    input.sourceKind !== null &&
    !NEVER_PUBLIC.has(input.sourceKind) &&
    !UNCONFIRMED_LICENCE_SOURCES.has(input.sourceKind) &&
    FREE_LICENCE_FAMILIES.has(licenceFamily(input.fileLicence)) &&
    input.workPdStatus !== null &&
    PUBLIC_DOMAIN.has(input.workPdStatus)
  );
}

/** Essentials slug for each superseded ADL manifest id / beginner-pack slug. */
const replacedLibrary = new Map<string, string>();
const replacedBeginner = new Map<string, string>();
for (const [slug, replacement] of Object.entries(ESSENTIALS_REPLACES)) {
  for (const id of replacement.library ?? []) replacedLibrary.set(id, slug);
  for (const old of replacement.beginnerPack ?? []) replacedBeginner.set(old, slug);
}

/** Work id for a beginner-pack slug: the Essentials piece it duplicates, else its own. */
const beginnerWorkId = (slug: string): string => replacedBeginner.get(slug) ?? slug;

/**
 * The Work a song belongs to, by the existing curated links only, or null.
 * `via` says whether the song is a known duplicate of a curated version.
 */
export function workLinkFor(song: SongRow, kind: SourceKind): { workId: string; via: "own" | "duplicate" } | null {
  if (kind === "essentials") return song.arrangement_group ? { workId: song.arrangement_group, via: "own" } : null;
  if (kind === "beginner") {
    const slug = beginnerSlug(song)!;
    return { workId: beginnerWorkId(slug), via: replacedBeginner.has(slug) ? "duplicate" : "own" };
  }
  if (kind !== "adl") return null;
  const manifestId = song.id.slice("seed-".length);
  // DUPLICATE_OF points at the copy that was kept; follow it to that copy's Work.
  const kept = DUPLICATE_OF[manifestId] ?? manifestId;
  if (kept.startsWith("beginner-pack:")) return { workId: beginnerWorkId(kept.slice("beginner-pack:".length)), via: "duplicate" };
  const slug = replacedLibrary.get(kept) ?? replacedLibrary.get(manifestId);
  return slug ? { workId: slug, via: "duplicate" } : null;
}

interface WorkSeed {
  id: string;
  title: string;
  composer_id: string | null;
  catalogue: string | null;
  movement: string | null;
  era: Era | null;
  genre: string;
  published_year: number | null;
  pd_status: PdStatus;
  recognisability: number | null;
  featured_rank: number | null;
  notes: string | null;
  aliases: AliasSeed[];
}

const composerById = new Map(COMPOSERS.map((composer) => [composer.id, composer]));

function workSeed(id: string, title: string, artist: string, meta: WorkMeta | undefined, recognisability: number | null, year: number): WorkSeed {
  const composerId = composerIdFor(artist);
  const composer = composerId ? composerById.get(composerId) : undefined;
  const traditional = composerId === TRADITIONAL;
  return {
    id,
    title,
    composer_id: composerId,
    catalogue: meta?.catalogue ?? null,
    movement: meta?.movement ?? null,
    era: composer?.era ?? null,
    genre: meta?.genre ?? "other",
    published_year: meta?.published_year ?? null,
    pd_status: pdStatus({ traditional, died: composer?.died ?? null, publishedYear: meta?.published_year ?? null }, year),
    recognisability,
    featured_rank: FEATURED_RANK[id] ?? null,
    // "Traditional (Welsh)": keep the origin the credit names.
    notes: traditional && artist !== "Traditional" ? artist : null,
    aliases: meta?.aliases ?? [],
  };
}

function essentialsWorkSeed(piece: EssentialsPiece, year: number): WorkSeed {
  return workSeed(piece.slug, piece.title, piece.composer, ESSENTIALS_WORKS[piece.slug], piece.rank, year);
}

interface StoredWorkFields {
  composer_id: string | null;
  catalogue: string | null;
  movement: string | null;
  era: string | null;
  published_year: number | null;
  recognisability: number | null;
  featured_rank: number | null;
  notes: string | null;
  pd_status: string;
}

/**
 * Fields of an existing Work that are empty (or an undecided "unknown"
 * pd_status) and that the curated data can now fill. Never overwrites a value:
 * an admin's edits win, while a fix to the curated data still reaches Works
 * created before it.
 */
export function emptyWorkFieldsToFill(stored: StoredWorkFields, seed: Omit<WorkSeed, "aliases">): Partial<StoredWorkFields> {
  const filled: Partial<StoredWorkFields> = {};
  for (const key of ["composer_id", "catalogue", "movement", "era", "published_year", "recognisability", "featured_rank", "notes"] as const) {
    if (stored[key] === null && seed[key] !== null) Object.assign(filled, { [key]: seed[key] });
  }
  if (stored.pd_status === "unknown" && seed.pd_status !== "unknown") filled.pd_status = seed.pd_status;
  return filled;
}

/** Stable JSON, for comparing what is stored (jsonb reorders keys) with what was computed. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/**
 * Signals as stored: numbers rounded to 4 decimals. jsonb keeps at most 15-16
 * significant digits, so an unrounded double would read back different and
 * every re-run would rewrite every song.
 */
export function storedSignals(signals: QualitySignals): Record<string, number | boolean> {
  return Object.fromEntries(
    Object.entries(signals).map(([key, value]) => [key, typeof value === "number" ? Math.round(value * 1e4) / 1e4 : value]),
  );
}

export interface CatalogueBackfillOptions {
  /** Calendar year the public-domain rules are evaluated in (default: now). */
  year?: number;
  /** Reads a song file; null when it is missing (default: the filesystem). */
  readSongFile?: (filePath: string) => Uint8Array | null;
}

export interface CatalogueBackfillReport {
  composersWritten: number;
  tagsCreated: number;
  worksCreated: number;
  /** Existing Works that had an empty field the curated data now fills. */
  worksUpdated: number;
  aliasesCreated: number;
  workTagsCreated: number;
  searchTextUpdated: number;
  songsUpdated: number;
  tierOverridesApplied: number;
  /** Songs whose file could not be read, so they were not classified. */
  unreadable: string[];
}

export const isNoOp = (report: CatalogueBackfillReport): boolean =>
  report.composersWritten + report.tagsCreated + report.worksCreated + report.worksUpdated + report.aliasesCreated + report.workTagsCreated +
    report.searchTextUpdated + report.songsUpdated + report.tierOverridesApplied === 0;

const defaultReadSongFile = (filePath: string): Uint8Array | null => {
  try {
    return new Uint8Array(readFileSync(filePath));
  } catch {
    return null;
  }
};

export async function backfillCatalogue(prisma: PrismaClient, options: CatalogueBackfillOptions = {}): Promise<CatalogueBackfillReport> {
  const year = options.year ?? new Date().getFullYear();
  const readSongFile = options.readSongFile ?? defaultReadSongFile;
  const report: CatalogueBackfillReport = {
    composersWritten: 0,
    tagsCreated: 0,
    worksCreated: 0,
    worksUpdated: 0,
    aliasesCreated: 0,
    workTagsCreated: 0,
    searchTextUpdated: 0,
    songsUpdated: 0,
    tierOverridesApplied: 0,
    unreadable: [],
  };

  // 1. Composers: curated in code, kept in step with it.
  const storedComposers = new Map((await prisma.composer.findMany()).map((row) => [row.id, row]));
  for (const { era: _era, ...composer } of COMPOSERS) {
    const stored = storedComposers.get(composer.id);
    if (stored && stableJson(stored) === stableJson(composer)) continue;
    await prisma.composer.upsert({ where: { id: composer.id }, create: composer, update: composer });
    report.composersWritten += 1;
  }

  // 2. Collection and mood tags.
  for (const tag of [...Object.values(COLLECTION_TAGS), ...Object.values(MOOD_TAGS)]) {
    const created = await prisma.tag.createMany({ data: [tag], skipDuplicates: true });
    report.tagsCreated += created.count;
  }

  // 3. What each song should be, from the conventions it was created with.
  const songs = await prisma.song.findMany({
    select: {
      id: true, title: true, artist: true, file_path: true, uploader_id: true, content_rights: true,
      arrangement_group: true, arrangement_level: true, retired_at: true,
      work_id: true, source_kind: true, source_ref: true, file_licence: true, public_eligible: true,
      quality_tier: true, quality_score: true, quality_signals: true, tier_override: true,
      difficulty: true, grade_band: true,
    },
    orderBy: { id: "asc" },
  });
  const planned = songs.map((song) => {
    const kind = sourceKindFor(song);
    return { song, kind, link: workLinkFor(song, kind) };
  });

  // 4. Works for every piece a song links to.
  const seeds = new Map<string, WorkSeed>();
  const curatedLive = new Set<string>(); // Works with a live Essentials or beginner-pack version.
  const tagged = { essentials: new Set<string>(), beginner: new Set<string>() };
  for (const { song, kind, link } of planned) {
    if (!link) continue;
    const workId = song.work_id ?? link.workId;
    if (!seeds.has(link.workId)) {
      const piece = essentialsBySlug.get(link.workId);
      const slug = kind === "beginner" ? beginnerSlug(song) : null;
      if (piece) seeds.set(link.workId, essentialsWorkSeed(piece, year));
      else if (slug) seeds.set(link.workId, workSeed(link.workId, song.title, song.artist, BEGINNER_WORKS[slug], null, year));
    }
    if ((kind === "essentials" || kind === "beginner") && !song.retired_at) {
      curatedLive.add(workId);
      tagged[kind].add(workId);
    }
  }

  const storedWorks = new Map((await prisma.work.findMany()).map((row) => [row.id, row]));
  const existingWorks = new Set(storedWorks.keys());
  for (const seed of seeds.values()) {
    const { aliases: _aliases, ...data } = seed;
    const stored = storedWorks.get(seed.id);
    if (!stored) {
      await prisma.work.create({ data: { ...data, curation_status: curatedLive.has(seed.id) ? "published" : "draft" } });
      existingWorks.add(seed.id);
      report.worksCreated += 1;
    } else {
      const filled = emptyWorkFieldsToFill(stored, data);
      if (Object.keys(filled).length > 0) {
        await prisma.work.update({ where: { id: seed.id }, data: filled });
        report.worksUpdated += 1;
      }
    }
    if (seed.aliases.length > 0) {
      const created = await prisma.workAlias.createMany({
        data: seed.aliases.map((alias) => ({ work_id: seed.id, alias: alias.alias, kind: alias.kind })),
        skipDuplicates: true,
      });
      report.aliasesCreated += created.count;
    }
  }
  for (const [kind, workIds] of Object.entries(tagged) as [keyof typeof tagged, Set<string>][]) {
    const ids = [...workIds].filter((id) => existingWorks.has(id));
    if (ids.length === 0) continue;
    const created = await prisma.workTag.createMany({
      data: ids.map((work_id) => ({ work_id, tag_id: COLLECTION_TAGS[kind].id })),
      skipDuplicates: true,
    });
    report.workTagsCreated += created.count;
  }

  // Mood tags (Christmas, Relaxing, Wedding ...): only on a Work with no mood tag yet, so an
  // admin's retagging is not undone. Works that are not in the database yet are skipped.
  const moodTagged = new Set(
    (await prisma.workTag.findMany({ where: { tag: { kind: "mood" } }, select: { work_id: true } })).map((link) => link.work_id),
  );
  const moodLinks = Object.entries(WORK_MOOD_TAGS)
    .filter(([workId]) => existingWorks.has(workId) && !moodTagged.has(workId))
    .flatMap(([workId, tagIds]) => tagIds.map((tag_id) => ({ work_id: workId, tag_id })));
  if (moodLinks.length > 0) {
    const created = await prisma.workTag.createMany({ data: moodLinks, skipDuplicates: true });
    report.workTagsCreated += created.count;
  }

  // 5. search_text, rebuilt for every Work from what is stored now.
  const works = await prisma.work.findMany({
    include: { aliases: { orderBy: { alias: "asc" } }, tags: { include: { tag: true }, orderBy: { tag_id: "asc" } }, composer: true },
  });
  for (const work of works) {
    const search_text = buildSearchText({
      title: work.title,
      catalogue: work.catalogue,
      movement: work.movement,
      aliases: work.aliases.map((alias) => alias.alias),
      composer: work.composer ? { name: work.composer.name, aliases: work.composer.aliases } : null,
      tags: work.tags.map((link) => link.tag.label),
    });
    if (search_text === work.search_text) continue;
    await prisma.work.update({ where: { id: work.id }, data: { search_text } });
    report.searchTextUpdated += 1;
  }
  const workInfo = new Map(works.map((work) => [work.id, work]));

  // 6. Songs: fill the empty catalogue fields, keep the derived ones current.
  for (const { song, kind, link } of planned) {
    const source_kind = song.source_kind ?? kind;
    const source_ref = song.source_ref ?? sourceRefFor(song, kind);
    const file_licence = song.file_licence ?? fileLicenceFor(kind, song.content_rights);
    const work_id = song.work_id ?? (link && workInfo.has(link.workId) ? link.workId : null);
    const work = work_id ? workInfo.get(work_id) : undefined;
    const public_eligible = isPublicEligible({ sourceKind: source_kind, fileLicence: file_licence, workPdStatus: work?.pd_status ?? null });

    const data: Prisma.SongUpdateInput = {};
    if (source_kind !== song.source_kind) data.source_kind = source_kind;
    if (source_ref !== song.source_ref) data.source_ref = source_ref;
    if (file_licence !== song.file_licence) data.file_licence = file_licence;
    if (work_id !== song.work_id) data.work = work_id ? { connect: { id: work_id } } : { disconnect: true };
    if (public_eligible !== song.public_eligible) data.public_eligible = public_eligible;
    // Approximate grade band for curated versions only; an editor's value is never replaced.
    const grade_band = song.grade_band ?? (source_kind === "essentials" || source_kind === "beginner" ? gradeBandFor(song.difficulty) : null);
    if (grade_band !== song.grade_band) data.grade_band = grade_band;

    const bytes = readSongFile(song.file_path);
    if (bytes && PACK_SOURCE_KINDS.has(source_kind)) {
      // Classified by the pack importer, which knows the incipit result and the licence.
    } else if (bytes) {
      const curated = source_kind === "essentials" || source_kind === "beginner";
      const authored =
        source_kind === "beginner" ||
        (source_kind === "essentials" && Boolean(song.arrangement_group && isAuthoredPiece(song.arrangement_group)));
      const context: QualityContext = {
        curated,
        authored,
        singleHandOk: source_kind === "essentials" && song.arrangement_level === "beginner",
        // Every Essentials version passed generate-essentials-pack.ts's incipit
        // check; the beginner-pack tunes were checked note by note when authored.
        incipitCheck: curated ? "pass" : "none",
        fileLicence: licenceFamily(file_licence),
        workPublicDomain: work ? PUBLIC_DOMAIN.has(work.pd_status) : false,
        metadata: work?.composer_id ? "complete" : "pending",
        reviewerApproved: curated && work?.curation_status === "published",
        // A library copy of a piece that has a curated version.
        duplicateOfVerified: source_kind === "adl" && link?.via === "duplicate",
      };
      const quality = classifyMidiQuality(bytes, context);
      const signals = quality.signals ? storedSignals(quality.signals) : null;
      const changed =
        quality.tier !== song.quality_tier ||
        quality.score !== song.quality_score ||
        stableJson(signals) !== stableJson(song.quality_signals);
      if (changed) {
        data.quality_tier = quality.tier;
        data.quality_score = quality.score;
        data.quality_signals = signals ?? Prisma.DbNull;
        data.quality_checked_at = new Date();
      }
    } else {
      report.unreadable.push(song.id);
    }

    if (Object.keys(data).length === 0) continue;
    await prisma.song.update({ where: { id: song.id }, data });
    report.songsUpdated += 1;
  }

  // 7. Hand-approved tiers, applied once and recorded in the audit log.
  const overrideRows = await prisma.song.findMany({
    where: { id: { in: Object.keys(CURATED_TIER_OVERRIDES) }, tier_override: null },
    select: { id: true, work_id: true, quality_tier: true },
  });
  for (const row of overrideRows) {
    const override = CURATED_TIER_OVERRIDES[row.id]!;
    if (row.quality_tier === override.tier) continue;
    await prisma.$transaction([
      prisma.song.update({ where: { id: row.id }, data: { tier_override: override.tier, tier_override_reason: override.reason } }),
      prisma.catalogueEvent.create({
        data: {
          song_id: row.id,
          work_id: row.work_id,
          action: "override_tier",
          before: { tier: row.quality_tier },
          after: { tier: override.tier },
          reason: override.reason,
        },
      }),
    ]);
    report.tierOverridesApplied += 1;
  }

  return report;
}

function isAuthoredPiece(slug: string): boolean {
  const piece = essentialsBySlug.get(slug);
  return piece !== undefined && isAuthored(piece.source);
}
