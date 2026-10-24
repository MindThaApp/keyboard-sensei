/**
 * The authored folk pack against a real Postgres (skipped when TEST_DATABASE_URL is unset).
 * Every piece is an authored score, so nothing is fetched. Works in a scratch database of its own.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sharedSongWhere } from "../eligibility.js";
import { BATCH_AUTHORED_FOLK } from "./batch-authored-folk.js";
import { PACKS_DIR, importPack, type Fetcher } from "./import.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

const pack = BATCH_AUTHORED_FOLK;
const total = pack.pieces.length;

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

describe.skipIf(!enabled)("Authored folk pack import (real Postgres)", () => {
  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_folk_${process.pid}`;
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
    expect(works.every((work) => work.pd_status === "pd-worldwide" || work.pd_status === "pd-us-eu")).toBe(true);
    expect(await prisma.workTag.count({ where: { tag_id: "midiano-classics" } })).toBe(0);
  });

  it("stores each file as a public-domain, eligible, two-hand Song of at least 20 seconds, credited to this project", async () => {
    const songs = await prisma.song.findMany({ where: { source_kind: "authored" }, orderBy: { id: "asc" } });
    expect(songs).toHaveLength(total);
    for (const song of songs) {
      expect(song.id, song.id).toMatch(/^authored-/);
      expect(song.file_licence).toBe("public-domain");
      expect(song.content_rights).toBe("public-domain");
      expect(song.public_eligible).toBe(true);
      expect(song.uploader_id).toBeNull();
      expect(song.hands).toBe("both");
      expect(song.attribution).toContain("arranged for OctaviApp");
      expect(song.duration_sec).toBeGreaterThanOrEqual(20);
      expect(song.quality_signals).toMatchObject({ incipitCheck: "pass" });
      expect((song.tier_override ?? song.quality_tier) !== "verified").toBe(true);
    }
  });

  it("reads Work fields the way the proposal asks", async () => {
    const santa = await prisma.work.findUniqueOrThrow({ where: { id: "santa-lucia" }, include: { aliases: true } });
    expect(santa.genre).toBe("folk");
    expect(santa.composer_id).toBe("teodoro-cottrau");
    expect(santa.pd_status).toBe("pd-worldwide");
    const clementine = await prisma.work.findUniqueOrThrow({ where: { id: "oh-my-darling-clementine" }, include: { tags: true } });
    expect(clementine.genre).toBe("childrens");
    expect(clementine.composer_id).toBe("traditional");
    expect(clementine.tags.map((tag) => tag.tag_id)).toEqual(["kids"]);
  });

  it("re-running changes nothing, and creates no duplicate Work, alias, tag or event", async () => {
    const before = await snapshot();
    const report = await importPack(prisma, pack, options());
    expect(report.counts).toMatchObject({ created: 0, updated: 0, unchanged: total, rejected: 0 });
    expect(await snapshot()).toBe(before);
  });

  it("keeps every draft out of the shared list until its Work is published", async () => {
    expect(await prisma.song.count({ where: sharedSongWhere() })).toBe(0);
    await prisma.work.update({ where: { id: "arirang" }, data: { curation_status: "published" } });
    const listed = await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } });
    expect(listed.map((song) => song.id)).toEqual(["authored-arirang"]);
    await importPack(prisma, pack, options());
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "arirang" } })).curation_status).toBe("published");
  });
});
