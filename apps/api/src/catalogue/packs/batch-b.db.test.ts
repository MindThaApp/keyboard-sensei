/**
 * Batch B against a real Postgres, from the pinned files a previous
 * `import-pack.ts batch-b` run cached (skipped when they are not cached, and
 * when TEST_DATABASE_URL is unset). Works in a scratch database of its own.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedSongWhere } from "../eligibility.js";
import { BATCH_B } from "./batch-b.js";
import { PACKS_DIR, importPack, type Fetcher } from "./import.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const cached = existsSync(path.join(PACKS_DIR, BATCH_B.id, "raw"));
const enabled = Boolean(TEST_DATABASE_URL) && cached;

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

describe.skipIf(!enabled)("Batch B import (real Postgres, real pins)", () => {
  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_batchb_${process.pid}`;
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

  it("imports all 44 works as drafts, none rejected", async () => {
    const report = await importPack(prisma, BATCH_B, options());
    expect(report.counts).toMatchObject({ created: 44, rejected: 0 });
    expect(report.pieces.every((piece) => piece.incipit?.result === "none")).toBe(true);

    expect(await prisma.work.count({ where: { curation_status: "draft" } })).toBe(44);
    expect(await prisma.work.count({ where: { curation_status: { not: "draft" } } })).toBe(0);
    expect(await prisma.song.count({ where: { source_kind: "mutopia", uploader_id: null } })).toBe(44);
    expect(await prisma.catalogueEvent.count({ where: { action: "import" } })).toBe(44);
    // Every Work has exactly one Song, and a Work's pd status is settled (no "unknown").
    const works = await prisma.work.findMany({ include: { songs: true } });
    expect(works.every((work) => work.songs.length === 1)).toBe(true);
    expect(works.every((work) => work.pd_status === "pd-worldwide")).toBe(true);
    // The Notebook minuets are credited to "Anonymous", which is old enough by nature.
    expect(await prisma.work.count({ where: { composer_id: "anonymous" } })).toBe(5);
  });

  it("re-running changes nothing, and creates no duplicate Work, alias, tag or event", async () => {
    const before = await snapshot();
    const report = await importPack(prisma, BATCH_B, options());
    expect(report.counts).toMatchObject({ created: 0, updated: 0, unchanged: 44, rejected: 0 });
    expect(await snapshot()).toBe(before);
  });

  it("keeps every draft out of the shared list until its Work is published", async () => {
    expect(await prisma.song.count({ where: sharedSongWhere() })).toBe(0);
    await prisma.work.update({ where: { id: "burgmuller-la-candeur" }, data: { curation_status: "published" } });
    const listed = await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } });
    expect(listed.map((song) => song.id)).toEqual(["mutopia-202"]);
    // A re-run must not touch curation status.
    await importPack(prisma, BATCH_B, options());
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "burgmuller-la-candeur" } })).curation_status).toBe("published");
  });
});
