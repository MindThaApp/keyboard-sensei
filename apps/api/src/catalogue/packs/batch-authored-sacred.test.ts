import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ToneMidi from "@tonejs/midi";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAuthoredMidi, checkScore } from "../../essentials/authored/notation.js";
import { ESSENTIALS } from "../../essentials/manifest.js";
import { BEGINNER_WORKS, ESSENTIALS_WORKS, MOOD_TAGS, WORK_GENRES, composerIdFor } from "../works-data.js";
import { abcMelody, splitAbcTunes } from "./abc.js";
import { BATCH_A } from "./batch-a.js";
import { BATCH_AUTHORED_SACRED } from "./batch-authored-sacred.js";
import { BATCH_B } from "./batch-b.js";
import { BATCH_C } from "./batch-c.js";
import { BATCH_D } from "./batch-d.js";
import { PACKS_DIR, importPack, type Fetcher } from "./import.js";
import { attributionFor, isAuthoredPrimary, songIdOf, type AuthoredPrimarySource } from "./pack.js";

const { Midi } = ToneMidi;
const pieces = BATCH_AUTHORED_SACRED.pieces;

describe("Authored carols and classical themes", () => {
  it("holds the two pieces, none duplicating a Work or Song of another pack or the Essentials", () => {
    expect(pieces.map((piece) => piece.slug)).toEqual(["angels-we-have-heard-on-high", "arrival-of-the-queen-of-sheba"]);
    const others = [BATCH_A, BATCH_B, BATCH_C, BATCH_D].flatMap((pack) => pack.pieces);
    const takenSlugs = new Set([...ESSENTIALS.map((piece) => piece.slug), ...Object.keys(ESSENTIALS_WORKS), ...Object.keys(BEGINNER_WORKS), ...others.map((piece) => piece.slug)]);
    const takenSongs = new Set(others.map((piece) => songIdOf(piece)));
    for (const piece of pieces) {
      expect(takenSlugs.has(piece.slug), piece.slug).toBe(false);
      expect(takenSongs.has(songIdOf(piece)), piece.slug).toBe(false);
    }
  });

  it("uses known composers, genres and mood tags, and is tagged christmas where it should be", () => {
    for (const piece of pieces) {
      expect(composerIdFor(piece.composer), piece.composer).not.toBeNull();
      expect(WORK_GENRES).toContain(piece.genre);
      for (const tag of piece.tags ?? []) expect(Object.keys(MOOD_TAGS)).toContain(tag);
    }
    expect(pieces.find((piece) => piece.slug === "angels-we-have-heard-on-high")!.tags).toContain("christmas");
  });

  it("builds each score into a file the library accepts: bars add up, 20 notes, 20 seconds, melody and left hand", () => {
    for (const piece of pieces) {
      expect(isAuthoredPrimary(piece.primary)).toBe(true);
      const { score } = piece.primary as AuthoredPrimarySource;
      expect(checkScore(score), piece.slug).toEqual([]);
      const midi = new Midi(buildAuthoredMidi(score));
      expect(midi.duration, piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.reduce((count, track) => count + track.notes.length, 0), piece.slug).toBeGreaterThanOrEqual(20);
      expect(midi.tracks.map((track) => track.name)).toEqual(expect.arrayContaining(["Melody", "Left hand"]));
      expect(attributionFor(piece, null)).toContain("Harmony and bass are original to this project.");
    }
  });

  it("reads the Queen of Sheba second source into the score's key", () => {
    const sheba = pieces.find((piece) => piece.slug === "arrival-of-the-queen-of-sheba")!;
    if (sheba.second.kind !== "abc") throw new Error("expected an ABC second source");
    expect(abcMelody(splitAbcTunes(sheba.second.abc)[0]!).length).toBeGreaterThanOrEqual(8);
  });

  it("checks the openings offline: Sheba passes against The Session, Angels is listed as a scan", async () => {
    const report = await importPack({} as PrismaClient, BATCH_AUTHORED_SACRED, { dryRun: true, year: 2026 });
    expect(report.counts).toMatchObject({ rejected: 0 });
    const outcome = Object.fromEntries(report.pieces.map((piece) => [piece.slug, piece.incipit?.result]));
    expect(outcome["arrival-of-the-queen-of-sheba"]).toBe("pass");
    expect(outcome["angels-we-have-heard-on-high"]).toBe("none");
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const offline: Fetcher = async (url) => {
  throw new Error(`not cached: ${url}`);
};

const urlFor = (database: string): string => {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
};

describe.skipIf(!TEST_DATABASE_URL)("Authored carols and classical themes import (real Postgres)", () => {
  let scratchName = "";
  let prisma: PrismaClient;

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

  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_sacred_${process.pid}`;
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

  it("imports both as draft Works with one Song each, tagged and aliased", async () => {
    const report = await importPack(prisma, BATCH_AUTHORED_SACRED, options());
    expect(report.counts).toMatchObject({ created: 2, rejected: 0 });
    expect(await prisma.work.count({ where: { curation_status: "draft" } })).toBe(2);
    const works = await prisma.work.findMany({ include: { songs: true, tags: true, aliases: true } });
    expect(works.every((work) => work.songs.length === 1)).toBe(true);
    const angels = works.find((work) => work.id === "angels-we-have-heard-on-high")!;
    expect(angels.tags.map((tag) => tag.tag_id)).toContain("christmas");
    const songs = await prisma.song.findMany({ orderBy: { id: "asc" } });
    for (const song of songs) {
      expect(song.source_kind).toBe("authored");
      expect(song.file_licence).toBe("public-domain");
      expect(song.duration_sec).toBeGreaterThanOrEqual(20);
      expect(song.hands).toBe("both");
    }
  });

  it("re-running changes nothing and creates no duplicate", async () => {
    const before = await snapshot();
    const report = await importPack(prisma, BATCH_AUTHORED_SACRED, options());
    expect(report.counts).toMatchObject({ created: 0, updated: 0, unchanged: 2, rejected: 0 });
    expect(await snapshot()).toBe(before);
    expect(await prisma.work.count()).toBe(2);
  });
});

