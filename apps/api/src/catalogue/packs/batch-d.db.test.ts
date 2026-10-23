/**
 * Batch D against a real Postgres (skipped when TEST_DATABASE_URL is unset).
 * The 17 authored pieces need no files, so they always run; the 9 Mutopia
 * hymns run when a previous `import-pack.ts batch-d` run cached their pins.
 * Works in a scratch database of its own.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedSongWhere } from "../eligibility.js";
import { BATCH_D } from "./batch-d.js";
import { PACKS_DIR, importPack, type Fetcher } from "./import.js";
import { isAuthoredPrimary, type Pack } from "./pack.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

const mutopiaCached = BATCH_D.pieces.every((piece) => isAuthoredPrimary(piece.primary) || existsSync(path.join(PACKS_DIR, BATCH_D.id, "raw", piece.primary.sha256)));
const pack: Pack = mutopiaCached ? BATCH_D : { ...BATCH_D, pieces: BATCH_D.pieces.filter((piece) => isAuthoredPrimary(piece.primary)) };
const total = pack.pieces.length;
const authoredCount = pack.pieces.filter((piece) => isAuthoredPrimary(piece.primary)).length;

const offline: Fetcher = async (url) => {
  throw new Error(`not cached: ${url}`);
};

let scratchName = "";
let prisma: PrismaClient;

const urlFor = (database: string): string => {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
};

const snapshot = async (): Promise<string> =>
  JSON.stringify(
    await Promise.all([
      prisma.song.findMany({ orderBy: { id: "asc" } }),
      prisma.work.findMany({ orderBy: { id: "asc" } }),
      prisma.workAlias.findMany({ orderBy: [{ work_id: "asc" }, { alias: "asc" }] }),
      prisma.workTag.findMany({ orderBy: [{ work_id: "asc" }, { tag_id: "asc" }] }),
      prisma.composer.findMany({ orderBy: { id: "asc" } }),
      prisma.catalogueEvent.findMany({ orderBy: { id: "asc" } }),
    ]),
  );

describe.skipIf(!enabled)("Batch D import (real Postgres)", () => {
  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_batchd_${process.pid}`;
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
    await maintenance.$disconnect();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: urlFor(scratchName) },
      stdio: "ignore",
    });
    prisma = new PrismaClient({ datasourceUrl: urlFor(scratchName) });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$disconnect();
  }, 60_000);

  // The importer reads pins from `<dir>/<pack>/raw`: the cache a CLI run leaves in the library directory.
  const options = () => ({ fetcher: offline, dir: PACKS_DIR, year: 2026 });

  it("imports every piece as a draft Work with one Song, none rejected", async () => {
    const report = await importPack(prisma, pack, options());
    expect(report.counts).toMatchObject({ created: total, rejected: 0 });
    expect(report.publicEligible).toBe(total);

    expect(await prisma.work.count({ where: { curation_status: "draft" } })).toBe(total);
    expect(await prisma.work.count({ where: { curation_status: { not: "draft" } } })).toBe(0);
    expect(await prisma.catalogueEvent.count({ where: { action: "import" } })).toBe(total);
    const works = await prisma.work.findMany({ include: { songs: true } });
    expect(works.every((work) => work.songs.length === 1)).toBe(true);
    // Traditional tunes are public domain by nature; the two composers who died after 1925 carry a publication year.
    expect(works.every((work) => work.pd_status === "pd-worldwide" || work.pd_status === "pd-us-eu")).toBe(true);
    // None is tagged as Midiano's.
    expect(await prisma.workTag.count({ where: { tag_id: "midiano-classics" } })).toBe(0);
  });

  it("stores the authored files as public-domain, eligible, two-hand Songs credited to this project", async () => {
    const songs = await prisma.song.findMany({ where: { source_kind: "authored" }, orderBy: { id: "asc" } });
    expect(songs).toHaveLength(authoredCount);
    for (const song of songs) {
      expect(song.id, song.id).toMatch(/^authored-/);
      expect(song.file_licence).toBe("public-domain");
      expect(song.content_rights).toBe("public-domain");
      expect(song.public_eligible).toBe(true);
      expect(song.uploader_id).toBeNull();
      expect(song.hands).toBe("both");
      expect(song.attribution).toContain("arranged for Keyboard Sensei");
      expect(song.duration_sec).toBeGreaterThanOrEqual(20);
      expect(song.genre).toBe("other");
    }
    // The flagged and unchecked pieces are recorded as such, never as verified.
    const gifts = songs.find((song) => song.id === "authored-simple-gifts")!;
    expect(gifts.quality_signals).toMatchObject({ incipitCheck: "fail" });
    const sakura = songs.find((song) => song.id === "authored-sakura-sakura")!;
    expect(sakura.quality_signals).toMatchObject({ incipitCheck: "none" });
    const korobeiniki = songs.find((song) => song.id === "authored-korobeiniki")!;
    expect(korobeiniki.quality_signals).toMatchObject({ incipitCheck: "pass" });
    expect(songs.every((song) => (song.tier_override ?? song.quality_tier) !== "verified")).toBe(true);
  });

  it("reads Work fields the way the proposal asks", async () => {
    const jolly = await prisma.work.findUniqueOrThrow({ where: { id: "jolly-old-saint-nicholas" }, include: { tags: true, aliases: true } });
    expect(jolly.genre).toBe("hymn-carol");
    expect(jolly.composer_id).toBe("traditional");
    expect(jolly.tags.map((tag) => tag.tag_id).sort()).toEqual(["christmas", "kids"]);
    const bingo = await prisma.work.findUniqueOrThrow({ where: { id: "bingo" } });
    expect(bingo.genre).toBe("childrens");
  });

  it("re-running changes nothing, and creates no duplicate Work, alias, tag or event", async () => {
    const before = await snapshot();
    const report = await importPack(prisma, pack, options());
    expect(report.counts).toMatchObject({ created: 0, updated: 0, unchanged: total, rejected: 0 });
    expect(await snapshot()).toBe(before);
  });

  it("keeps every draft out of the shared list until its Work is published", async () => {
    expect(await prisma.song.count({ where: sharedSongWhere() })).toBe(0);
    await prisma.work.update({ where: { id: "loch-lomond" }, data: { curation_status: "published" } });
    const listed = await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } });
    expect(listed.map((song) => song.id)).toEqual(["authored-loch-lomond"]);
    // A re-run must not touch curation status.
    await importPack(prisma, pack, options());
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "loch-lomond" } })).curation_status).toBe("published");
  });

  it("stops for review rather than duplicate a Work that already exists under another id", async () => {
    const piece = pack.pieces.find((candidate) => candidate.slug === "bingo")!;
    await prisma.work.update({ where: { id: "bingo" }, data: { id: "bingo-old" } });
    // The Song still points at the Work (renamed); remove it so the importer looks the piece up afresh.
    await prisma.song.deleteMany({ where: { id: `authored-${piece.slug}` } });
    const report = await importPack(prisma, { ...pack, pieces: [piece] }, options());
    expect(report.counts).toMatchObject({ rejected: 1, created: 0 });
    expect(report.pieces[0]!.reason).toMatch(/needs review: Work "bingo-old"/);
  });
});
