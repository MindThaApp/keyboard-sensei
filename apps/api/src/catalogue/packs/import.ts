/**
 * The source-pack importer: pinned files in, DRAFT catalogue entries out.
 *
 * For each piece in a pack (see ./pack.ts):
 *   1. fetch the primary file (and the second source, when it is a Mutopia
 *      file), refusing anything whose sha256 differs from the pin;
 *   2. parse it, and for piano-midi.de require Bernd Krueger's own copyright
 *      notice in the file;
 *   3. compare its opening notes with the second source (./incipit.ts);
 *   4. classify quality (src/midi-quality.ts);
 *   5. create the Work (draft) and the Song, with attribution and licence.
 *
 * Nothing it writes is published or public-eligible. Idempotent: a re-run
 * rewrites only values that differ from what is stored, creates no duplicate
 * Work, alias, tag or audit event, and never touches curation status, tier
 * overrides, or anything an admin has edited (a Song's title, Work and grade
 * band, a Work's fields are set only when the row is created).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, type PrismaClient } from "@prisma/client";
import ToneMidi from "@tonejs/midi";
import { buildAuthoredMidi } from "../../essentials/authored/notation.js";
import { unzipMember } from "../../essentials/build.js";
import { InvalidMidiError, extractSongMetadata } from "../../midi-metadata.js";
import { classifyMidiQuality, type QualityResult } from "../../midi-quality.js";
import { isPublicEligible, licenceFamily, pdStatus, storedSignals, stableJson } from "../backfill.js";
import { buildSearchText } from "../search-text.js";
import { COLLECTION_TAGS, COMPOSERS, MOOD_TAGS, TRADITIONAL, composerIdFor, gradeBandFor, type MoodTagId } from "../works-data.js";
import { abcMelody, splitAbcTunes } from "./abc.js";
import { INCIPIT_REJECT_BELOW, compareIncipits, skylineIncipit } from "./incipit.js";
import {
  attributionFor,
  fileLicenceOf,
  isAuthoredPrimary,
  isPianoMidiDe,
  type AbcSecondSource,
  pianoMidiDeCopyrightYear,
  songIdOf,
  sourceKindOf,
  sourceRefOf,
  sourceUrlOf,
  type MutopiaSource,
  type Pack,
  type PackPiece,
} from "./pack.js";

const { Midi } = ToneMidi;

/** Where fetched pack files are kept (gitignored, like the rest of the MIDI library). */
export const PACKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/midi-library/packs");

export type Fetcher = (url: string) => Promise<Buffer>;

export async function httpFetcher(url: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "KeyboardSensei-catalogue-pipeline" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`download failed: ${String(lastError)}`);
}

const sha256Of = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * The bytes of a pinned file: from the cache when a cached copy still matches
 * the pin, otherwise downloaded. A mismatch is an error and nothing is cached.
 * `member` selects a file inside a `.zip` (the pin is of the zip itself).
 */
async function pinnedBytes(source: { url: string; sha256: string; member?: string }, cacheDir: string, fetcher: Fetcher): Promise<Buffer> {
  const cached = path.join(cacheDir, "raw", source.sha256);
  let raw: Buffer | null = null;
  if (existsSync(cached)) {
    const onDisk = readFileSync(cached);
    if (sha256Of(onDisk) === source.sha256) raw = onDisk;
  }
  if (!raw) {
    raw = await fetcher(source.url);
    const got = sha256Of(raw);
    if (got !== source.sha256) throw new Error(`sha256 mismatch for ${source.url} (got ${got}): the upstream file changed`);
    mkdirSync(path.dirname(cached), { recursive: true });
    writeFileSync(cached, raw);
  }
  return source.member ? unzipMember(raw, source.member) : raw;
}

export interface IncipitOutcome {
  /** none: no machine-readable second source, a reviewer compares by eye. */
  result: "pass" | "fail" | "none";
  /** Leading notes the two openings share. */
  matched?: number;
  /** Notes they share in order (a looser measure, for editions that differ in ornaments). */
  lcs?: number;
  /** Opening of the primary and of the second source, as pitch names. */
  primary?: string;
  second?: string;
  /** What the second source is, or why there is no check. */
  note: string;
}

export interface PieceReport {
  slug: string;
  songId: string;
  status: "created" | "updated" | "unchanged" | "rejected" | "checked";
  tier?: string;
  tierReasons?: string[];
  incipit?: IncipitOutcome;
  /** Why the piece was not imported. */
  reason?: string;
}

export interface PackReport {
  pack: string;
  pieces: PieceReport[];
  counts: Record<PieceReport["status"], number>;
}

export interface ImportOptions {
  fetcher?: Fetcher;
  /** Cache and library directory (default: apps/api/data/midi-library/packs). */
  dir?: string;
  /** Calendar year the public-domain rules are evaluated in (default: now). */
  year?: number;
  /** Fetch and check only; write nothing to the database. */
  dryRun?: boolean;
}

interface CheckedPiece {
  bytes: Buffer;
  copyrightYear: number | null;
  incipit: IncipitOutcome;
  quality: QualityResult;
  meta: ReturnType<typeof extractSongMetadata>;
}

class Rejected extends Error {}

/** Every text a MIDI file carries that could hold a copyright notice. */
function copyrightTexts(bytes: Uint8Array): string[] {
  const midi = new Midi(bytes);
  return [midi.header.name, ...midi.header.meta.map((event) => event.text), ...midi.tracks.map((track) => track.name)];
}

function compareWithSecond(primary: Uint8Array, second: Uint8Array, source: MutopiaSource): IncipitOutcome {
  const comparison = compareIncipits(skylineIncipit(primary), skylineIncipit(second));
  return {
    result: comparison.result,
    matched: comparison.matched,
    lcs: comparison.lcs,
    primary: comparison.primary,
    second: comparison.second,
    note: `Mutopia ${source.mutopiaId}`,
  };
}

/** The opening of an ABC transcription, shifted into the score's key, as the second source of an authored piece. */
function compareWithAbc(primary: Uint8Array, source: AbcSecondSource): IncipitOutcome {
  const tune = splitAbcTunes(source.abc)[0];
  if (!tune) throw new Rejected(`${source.reference}: the ABC excerpt has no X: line`);
  const notes = abcMelody(tune).map((pitch) => pitch + (source.transpose ?? 0));
  if (notes.length < 8) throw new Rejected(`${source.reference}: the ABC excerpt holds only ${notes.length} notes`);
  const comparison = compareIncipits(skylineIncipit(primary), notes.slice(0, 16));
  return {
    result: comparison.result,
    matched: comparison.matched,
    lcs: comparison.lcs,
    primary: comparison.primary,
    second: comparison.second,
    note: source.reference,
  };
}

/** Public-domain status as the pipeline reads it: traditional tunes are always public domain. */
const pdStatusOf = (piece: PackPiece, composerId: string, died: number | null, year: number): ReturnType<typeof pdStatus> =>
  pdStatus({ traditional: composerId === TRADITIONAL, died, publishedYear: piece.publishedYear ?? null }, year);

async function checkPiece(piece: PackPiece, cacheDir: string, fetcher: Fetcher, year: number): Promise<CheckedPiece> {
  const composerId = composerIdFor(piece.composer);
  const composer = COMPOSERS.find((candidate) => candidate.id === composerId);
  if (!composer) throw new Rejected(`unknown composer "${piece.composer}" (add it to COMPOSERS)`);

  let bytes: Buffer;
  if (isAuthoredPrimary(piece.primary)) {
    try {
      bytes = buildAuthoredMidi(piece.primary.score);
    } catch (error) {
      throw new Rejected(`score does not build: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    bytes = await pinnedBytes(piece.primary, cacheDir, fetcher);
  }
  let meta: ReturnType<typeof extractSongMetadata>;
  try {
    meta = extractSongMetadata(new Uint8Array(bytes));
  } catch (error) {
    if (error instanceof InvalidMidiError) throw new Rejected(`not a usable MIDI file: ${error.message}`);
    throw error;
  }

  let copyrightYear: number | null = null;
  if (isPianoMidiDe(piece.primary)) {
    copyrightYear = pianoMidiDeCopyrightYear(copyrightTexts(bytes));
    if (copyrightYear === null) throw new Rejected("file does not carry Bernd Krueger's copyright notice");
  }

  let incipit: IncipitOutcome;
  if (piece.second.kind === "scan") {
    incipit = { result: "none", note: `${piece.second.reference}: ${piece.second.reason}` };
  } else if (piece.second.kind === "abc") {
    incipit = compareWithAbc(bytes, piece.second);
    if (incipit.result === "fail" && (incipit.lcs ?? 0) < INCIPIT_REJECT_BELOW) {
      throw new Rejected(`opening does not match ${incipit.note} (${incipit.matched} leading and ${incipit.lcs} shared notes of 16): not the same tune`);
    }
  } else {
    const secondBytes = await pinnedBytes(piece.second, cacheDir, fetcher);
    incipit = compareWithSecond(bytes, secondBytes, piece.second);
    if (incipit.result === "fail" && (incipit.lcs ?? 0) < INCIPIT_REJECT_BELOW) {
      throw new Rejected(`opening does not match ${incipit.note} (${incipit.matched} leading and ${incipit.lcs} shared notes of 16): not the same piece`);
    }
  }

  const fileLicence = fileLicenceOf(piece);
  const quality = classifyMidiQuality(new Uint8Array(bytes), {
    curated: true,
    authored: isAuthoredPrimary(piece.primary),
    incipitCheck: incipit.result,
    fileLicence: licenceFamily(fileLicence),
    workPublicDomain: ["pd-worldwide", "pd-us-eu"].includes(pdStatusOf(piece, composerId!, composer.died, year)),
    metadata: "complete",
    reviewerApproved: false,
  });
  return { bytes, copyrightYear, incipit, quality, meta };
}

/**
 * Equality for stored columns. A double read back from Postgres keeps 15
 * significant digits, so an unrounded duration would never equal what was
 * computed and every re-run would rewrite every song.
 */
const sameValue = (stored: unknown, computed: unknown): boolean =>
  typeof stored === "number" && typeof computed === "number"
    ? Math.abs(stored - computed) <= 1e-9 * Math.max(1, Math.abs(computed))
    : stored === computed;

const normalise = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The hands value for a song with these signals; null when unknown (the API then reads it as both). */
function handsFor(quality: QualityResult): string | null {
  if (!quality.signals) return null;
  if (quality.signals.handSplit) return "both";
  return quality.signals.noteTracks === 1 ? "single-line" : null;
}

async function writeSong(prisma: PrismaClient, pack: Pack, piece: PackPiece, checked: CheckedPiece, options: { year: number; dir: string }): Promise<PieceReport> {
  const songId = songIdOf(piece);
  const composerId = composerIdFor(piece.composer)!;
  const composer = COMPOSERS.find((candidate) => candidate.id === composerId)!;
  const { era: _era, ...composerRow } = composer;

  const filePath = path.join(options.dir, pack.id, `${songId}.mid`);
  mkdirSync(path.dirname(filePath), { recursive: true });
  if (!existsSync(filePath) || sha256Of(readFileSync(filePath)) !== sha256Of(checked.bytes)) writeFileSync(filePath, checked.bytes);

  const file_licence = fileLicenceOf(piece);
  const source_kind = sourceKindOf(piece);
  const work = await prisma.work.findUnique({ where: { id: piece.slug }, select: { id: true } });

  // The same piece under another Work id: stop for review rather than make a duplicate.
  if (!work) {
    const sameTitle = (await prisma.work.findMany({ where: { composer_id: composerId }, select: { id: true, title: true } })).find(
      (other) => normalise(other.title) === normalise(piece.title),
    );
    if (sameTitle) throw new Rejected(`needs review: Work "${sameTitle.id}" has the same composer and title`);
  }

  const quality = checked.quality;
  const signals = quality.signals
    ? { ...storedSignals(quality.signals), incipitCheck: checked.incipit.result, incipitSource: checked.incipit.note }
    : null;
  const pd = pdStatusOf(piece, composerId, composer.died, options.year);
  const pinned = {
    difficulty: checked.meta.difficulty,
    duration_sec: checked.meta.durationSec,
    note_count: checked.meta.noteCount,
    content_rights: file_licence,
    source_url: sourceUrlOf(piece),
    attribution: attributionFor(piece, checked.copyrightYear),
    file_path: filePath,
    source_kind,
    source_ref: sourceRefOf(piece),
    file_licence,
    // False for piano-midi.de whatever the licence tag says: its licence is unconfirmed (UNCONFIRMED_LICENCE_SOURCES).
    public_eligible: isPublicEligible({ sourceKind: source_kind, fileLicence: file_licence, workPdStatus: pd }),
  };
  const measured = {
    quality_tier: quality.tier,
    quality_score: quality.score,
    quality_signals: signals,
  };

  const existing = await prisma.song.findUnique({ where: { id: songId } });
  if (existing) {
    const data: Prisma.SongUpdateInput = {};
    for (const key of ["difficulty", "duration_sec", "note_count", "content_rights", "source_url", "attribution", "file_path", "source_kind", "source_ref", "file_licence", "public_eligible"] as const) {
      if (!sameValue(existing[key], pinned[key])) Object.assign(data, { [key]: pinned[key] });
    }
    const measuredChanged =
      existing.quality_tier !== measured.quality_tier ||
      !sameValue(existing.quality_score, measured.quality_score) ||
      stableJson(existing.quality_signals) !== stableJson(measured.quality_signals);
    if (measuredChanged) {
      data.quality_tier = measured.quality_tier;
      data.quality_score = measured.quality_score;
      data.quality_signals = measured.quality_signals ?? Prisma.DbNull;
      data.quality_checked_at = new Date();
    }
    if (Object.keys(data).length === 0) return { slug: piece.slug, songId, status: "unchanged", tier: existing.tier_override ?? existing.quality_tier, tierReasons: quality.reasons, incipit: checked.incipit };
    await prisma.song.update({ where: { id: songId }, data });
    return { slug: piece.slug, songId, status: "updated", tier: existing.tier_override ?? measured.quality_tier, tierReasons: quality.reasons, incipit: checked.incipit };
  }

  const moodTags = (piece.tags ?? []) as MoodTagId[];
  const tags = [COLLECTION_TAGS.midiano, ...moodTags.map((id) => MOOD_TAGS[id])];
  const aliases = [...(piece.aliases ?? [])].sort((a, b) => a.alias.localeCompare(b.alias));

  await prisma.$transaction(async (tx) => {
    await tx.composer.createMany({ data: [composerRow], skipDuplicates: true });
    await tx.tag.createMany({ data: tags.map(({ id, label, kind }) => ({ id, label, kind })), skipDuplicates: true });
    if (!work) {
      await tx.work.create({
        data: {
          id: piece.slug,
          title: piece.title,
          composer_id: composerId,
          catalogue: piece.catalogue ?? null,
          movement: piece.movement ?? null,
          era: piece.era,
          genre: piece.genre,
          pd_status: pd,
          // After the 100 Essentials, in pack order.
          recognisability: 100 + piece.rank,
          curation_status: "draft",
          search_text: buildSearchText({
            title: piece.title,
            catalogue: piece.catalogue,
            movement: piece.movement,
            aliases: aliases.map((alias) => alias.alias),
            composer: { name: composer.name, aliases: composer.aliases },
            tags: [...tags].sort((a, b) => a.id.localeCompare(b.id)).map((tag) => tag.label),
          }),
        },
      });
      await tx.workAlias.createMany({ data: aliases.map(({ alias, kind }) => ({ work_id: piece.slug, alias, kind })), skipDuplicates: true });
      await tx.workTag.createMany({ data: tags.map((tag) => ({ work_id: piece.slug, tag_id: tag.id })), skipDuplicates: true });
    }
    await tx.song.create({
      data: {
        id: songId,
        ...pinned,
        title: piece.title,
        artist: piece.composer,
        // Song.genre is the coarse filter the Essentials use (classical, jazz, other).
        genre: piece.genre === "classical" ? "classical" : "other",
        uploader_id: null,
        work_id: piece.slug,
        grade_band: gradeBandFor(piece.level),
        hands: handsFor(quality),
        ...measured,
        quality_signals: measured.quality_signals ?? Prisma.DbNull,
        quality_checked_at: new Date(),
      },
    });
    await tx.catalogueEvent.create({
      data: {
        work_id: piece.slug,
        song_id: songId,
        action: "import",
        after: {
          pack: pack.id,
          source: `${source_kind}:${sourceRefOf(piece)}`,
          // An authored file has no upstream pin: its hash is that of the file generated from the score.
          sha256: isAuthoredPrimary(piece.primary) ? sha256Of(checked.bytes) : piece.primary.sha256,
          tier: quality.tier,
          tierReasons: quality.reasons,
          incipit: { result: checked.incipit.result, matched: checked.incipit.matched ?? null, lcs: checked.incipit.lcs ?? null, note: checked.incipit.note },
        },
        reason: "source pack import (draft)",
      },
    });
  });
  return { slug: piece.slug, songId, status: "created", tier: quality.tier, tierReasons: quality.reasons, incipit: checked.incipit };
}

/** Fetch, check and (unless dryRun) import every piece of a pack as drafts. */
export async function importPack(prisma: PrismaClient, pack: Pack, options: ImportOptions = {}): Promise<PackReport> {
  const fetcher = options.fetcher ?? httpFetcher;
  const dir = options.dir ?? PACKS_DIR;
  const year = options.year ?? new Date().getFullYear();
  const reports: PieceReport[] = [];

  for (const piece of pack.pieces) {
    const songId = songIdOf(piece);
    let checked: CheckedPiece;
    try {
      checked = await checkPiece(piece, path.join(dir, pack.id), fetcher, year);
    } catch (error) {
      // A bad pin, the wrong piece, an unknown composer or a network failure must not stop the rest.
      reports.push({ slug: piece.slug, songId, status: "rejected", reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (options.dryRun) {
      reports.push({ slug: piece.slug, songId, status: "checked", tier: checked.quality.tier, tierReasons: checked.quality.reasons, incipit: checked.incipit });
      continue;
    }
    try {
      reports.push(await writeSong(prisma, pack, piece, checked, { year, dir }));
    } catch (error) {
      if (!(error instanceof Rejected)) throw error; // a database failure is not a verdict on the piece
      reports.push({ slug: piece.slug, songId, status: "rejected", reason: error.message });
    }
  }

  const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, checked: 0 };
  for (const report of reports) counts[report.status] += 1;
  return { pack: pack.id, pieces: reports, counts };
}
