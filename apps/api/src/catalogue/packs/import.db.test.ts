/**
 * The source-pack importer against a real Postgres. Runs only when TEST_DATABASE_URL is set.
 *
 * Like search.db.test.ts it works in a scratch database of its own (the other
 * db suites truncate TEST_DATABASE_URL's tables in parallel). Pieces are
 * synthetic MIDI files served by a fake fetcher, so no test touches the network;
 * the one test on the real Batch A pins runs only when its files are cached.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import ToneMidi from "@tonejs/midi";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { backfillCatalogue } from "../backfill.js";
import { sharedSongWhere } from "../eligibility.js";
import { BATCH_A } from "./batch-a.js";
import { BATCH_C } from "./batch-c.js";
import { PACKS_DIR, importPack, type Fetcher } from "./import.js";
import { songIdOf, type Pack, type PackPiece } from "./pack.js";

const { Midi } = ToneMidi;

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const MELODY_A = [72, 71, 69, 71, 72, 74, 76, 74, 72, 71, 69, 67, 69, 71, 72, 74];
const MELODY_OTHER = [50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76];

/** A step-sequenced two-hand piece, ~46 s at 120 bpm: 8 bars of 16ths cycling `melody`. */
function midiBytes(melody: number[], options: { copyright?: string | null } = {}): Buffer {
  const midi = new Midi();
  midi.header.setTempo(120);
  const right = midi.addTrack();
  right.name = "Piano right";
  const left = midi.addTrack();
  left.name = "Piano left";
  const ppq = midi.header.ppq;
  for (let i = 0; i < 96; i++) {
    const ticks = (i * ppq) / 4;
    right.addNote({ midi: melody[i % melody.length]! + 12, ticks, durationTicks: ppq / 4 });
    if (i % 4 === 0) left.addNote({ midi: melody[i % melody.length]! - 12, ticks, durationTicks: ppq });
  }
  // A long final note so the file reaches the 20 s minimum duration.
  right.addNote({ midi: 84, ticks: 24 * ppq, durationTicks: 40 * ppq });
  if (options.copyright !== null) midi.addTrack().name = options.copyright ?? "Copyright © 1999 by Bernd Krueger";
  return Buffer.from(midi.toArray());
}

const files = new Map<string, Buffer>();
const serve = (url: string, bytes: Buffer): string => {
  files.set(url, bytes);
  return url;
};
const fetcher: Fetcher = async (url) => {
  const bytes = files.get(url);
  if (!bytes) throw new Error(`HTTP 404 ${url}`);
  return bytes;
};

function pmdPiece(slug: string, file: string, bytes: Buffer, second: PackPiece["second"], overrides: Partial<PackPiece> = {}): PackPiece {
  return {
    slug,
    rank: 1,
    title: `Piece ${slug}`,
    composer: "Frédéric Chopin",
    catalogue: "Op. 99",
    genre: "classical",
    era: "romantic",
    level: 3,
    tags: ["relaxing"],
    aliases: [{ alias: `Alias ${slug}`, kind: "nickname" }],
    primary: { kind: "piano-midi-de", file, url: serve(`https://mirror.test/${file}`, bytes), sha256: sha256(bytes) },
    second,
    ...overrides,
  };
}

function mutopiaSecond(id: string, bytes: Buffer): PackPiece["second"] {
  return { kind: "mutopia", mutopiaId: id, url: serve(`https://mutopia.test/${id}.mid`, bytes), sha256: sha256(bytes), infoUrl: `https://mutopia.test/info/${id}` };
}

const scan: PackPiece["second"] = { kind: "scan", reference: "IMSLP test scan", reason: "scan only" };

let scratchUrl = "";
let scratchName = "";
let prisma: PrismaClient;
let dir: string;

const urlFor = (database: string): string => {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
};

/** Every row the importer writes, as one comparable snapshot. */
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

describe.skipIf(!enabled)("source pack importer (real Postgres)", () => {
  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_packs_${process.pid}`;
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
    await maintenance.$disconnect();
    scratchUrl = urlFor(scratchName);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("../../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: scratchUrl },
      stdio: "ignore",
    });
    prisma = new PrismaClient({ datasourceUrl: scratchUrl });
    dir = mkdtempSync(path.join(tmpdir(), "ks-packs-"));
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(dir, { recursive: true, force: true });
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$disconnect();
  }, 60_000);

  const mutopiaCopyA = midiBytes(MELODY_A, { copyright: null });
  const goodPmd = midiBytes(MELODY_A);
  const pack: Pack = {
    id: "test-pack",
    name: "Test pack",
    pieces: [
      pmdPiece("checked-piece", "ok_1.mid", goodPmd, mutopiaSecond("1", mutopiaCopyA)),
      pmdPiece("scan-piece", "ok_2.mid", midiBytes(MELODY_A.map((n) => n + 1)), scan, { title: "Scan Piece", tags: [] }),
      pmdPiece("wrong-piece", "bad_1.mid", midiBytes(MELODY_A), mutopiaSecond("2", midiBytes(MELODY_OTHER, { copyright: null }))),
      pmdPiece("no-notice", "bad_2.mid", midiBytes(MELODY_A, { copyright: "Some other sequencer" }), scan),
      {
        ...pmdPiece("bad-pin", "bad_3.mid", midiBytes(MELODY_A), scan),
        primary: { kind: "piano-midi-de", file: "bad_3.mid", url: "https://mirror.test/bad_3.mid", sha256: "0".repeat(64) },
      },
      pmdPiece("unknown-composer", "bad_4.mid", midiBytes(MELODY_A), scan, { composer: "Nobody Atall" }),
    ],
  };

  it("imports verified pieces as drafts and rejects the rest with reasons", async () => {
    const report = await importPack(prisma, pack, { fetcher, dir, year: 2026 });
    const byStatus = Object.fromEntries(report.pieces.map((piece) => [piece.slug, piece]));

    expect(report.counts).toMatchObject({ created: 2, rejected: 4 });
    expect(byStatus["checked-piece"]!.status).toBe("created");
    expect(byStatus["checked-piece"]!.incipit).toMatchObject({ result: "pass", matched: 16 });
    expect(byStatus["scan-piece"]!.incipit).toMatchObject({ result: "none" });
    expect(byStatus["wrong-piece"]!.reason).toMatch(/not the same piece/);
    expect(byStatus["no-notice"]!.reason).toMatch(/Bernd Krueger's copyright notice/);
    expect(byStatus["bad-pin"]!.reason).toMatch(/sha256 mismatch/);
    expect(byStatus["unknown-composer"]!.reason).toMatch(/unknown composer/);

    const songs = await prisma.song.findMany({ orderBy: { id: "asc" } });
    expect(songs.map((song) => song.id)).toEqual(["pmd-ok_1", "pmd-ok_2"]);
    for (const song of songs) {
      expect(song.public_eligible).toBe(false);
      expect(song.uploader_id).toBeNull();
      expect(song.source_kind).toBe("piano-midi-de");
      expect(song.file_licence).toBe("cc-by-sa-3.0-de");
      expect(song.attribution).toContain("Bernd Krueger");
      expect(song.attribution).toContain("CC BY-SA 3.0 DE");
      expect(song.attribution).toContain("https://creativecommons.org/licenses/by-sa/3.0/de/");
      expect(song.attribution).toContain("Copyright © 1999");
    }
    const works = await prisma.work.findMany();
    expect(works.map((work) => work.curation_status)).toEqual(["draft", "draft"]);
    expect(works.every((work) => work.pd_status === "pd-worldwide")).toBe(true);
    expect((await prisma.catalogueEvent.findMany({ where: { action: "import" } })).length).toBe(2);
  });

  it("re-running changes nothing", async () => {
    const before = await snapshot();
    const report = await importPack(prisma, pack, { fetcher, dir, year: 2026 });
    expect(report.counts).toMatchObject({ created: 0, updated: 0, unchanged: 2, rejected: 4 });
    expect(await snapshot()).toBe(before);
  });

  it("re-runs from the cache with no network", async () => {
    files.clear();
    const offline = await importPack(prisma, { ...pack, pieces: pack.pieces.slice(0, 2) }, { fetcher, dir, year: 2026 });
    expect(offline.counts).toMatchObject({ unchanged: 2, rejected: 0 });
  });

  it("never makes a piano-midi.de song public-eligible, even when the backfill reclassifies the catalogue", async () => {
    const before = await prisma.song.findMany({ orderBy: { id: "asc" }, select: { id: true, quality_tier: true, quality_score: true, public_eligible: true } });
    await backfillCatalogue(prisma, { year: 2026 });
    await backfillCatalogue(prisma, { year: 2026 });
    const after = await prisma.song.findMany({ orderBy: { id: "asc" }, select: { id: true, quality_tier: true, quality_score: true, public_eligible: true } });
    expect(after).toEqual(before);
    expect(after.every((song) => song.public_eligible === false)).toBe(true);
  });

  it("keeps draft songs out of the shared list until their Work is published", async () => {
    expect(await prisma.song.count({ where: sharedSongWhere() })).toBe(0);
    await prisma.work.update({ where: { id: "checked-piece" }, data: { curation_status: "published" } });
    const listed = await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } });
    expect(listed.map((song) => song.id)).toEqual(["pmd-ok_1"]);
    // Songs with no Work at all are unaffected by the draft rule.
    await prisma.song.create({
      data: { id: "no-work", title: "No Work", artist: "x", genre: "classical", difficulty: 1, duration_sec: 30, note_count: 30, content_rights: "public-domain", file_path: "/x.mid" },
    });
    expect((await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } })).map((song) => song.id).sort()).toEqual(["no-work", "pmd-ok_1"]);
  });

  it("stops for review when the same piece already has a Work under another id", async () => {
    await prisma.work.create({
      data: { id: "an-older-work", title: "Duplicate Candidate", composer_id: "frederic-chopin", genre: "classical", pd_status: "pd-worldwide", search_text: "" },
    });
    const duplicate = pmdPiece("a-new-slug", "dup_1.mid", midiBytes(MELODY_A), scan, { title: "Duplicate  Candidate" });
    const report = await importPack(prisma, { id: "test-pack", name: "dup", pieces: [duplicate] }, { fetcher, dir, year: 2026 });
    expect(report.pieces[0]).toMatchObject({ status: "rejected" });
    expect(report.pieces[0]!.reason).toMatch(/needs review: Work "an-older-work"/);
    expect(await prisma.work.findUnique({ where: { id: "a-new-slug" } })).toBeNull();
  });

  it("imports a Mutopia primary with its typesetter credit and a public-domain licence", async () => {
    const bytes = midiBytes(MELODY_A, { copyright: null });
    const piece: PackPiece = {
      slug: "mutopia-piece",
      rank: 2,
      title: "Mutopia Piece",
      composer: "Johann Sebastian Bach",
      genre: "classical",
      era: "baroque",
      level: 2,
      primary: {
        kind: "mutopia",
        mutopiaId: "777",
        mutopiaRef: "Mutopia-2010/01/01-777",
        url: serve("https://mutopia.test/777.mid", bytes),
        sha256: sha256(bytes),
        licence: "Creative Commons Attribution-ShareAlike 3.0",
        maintainer: "A. Typesetter",
        infoUrl: "https://mutopia.test/info/777",
      },
      second: scan,
    };
    const report = await importPack(prisma, { id: "test-pack", name: "m", pieces: [piece] }, { fetcher, dir, year: 2026 });
    expect(report.counts.created).toBe(1);
    const song = await prisma.song.findUniqueOrThrow({ where: { id: "mutopia-777" } });
    expect(song).toMatchObject({ source_kind: "mutopia", source_ref: "Mutopia-2010/01/01-777", file_licence: "cc-by-sa-3.0", public_eligible: true });
    expect(song.attribution).toContain("A. Typesetter");
    // Eligible by licence and composition, but a draft Work: not listed.
    expect((await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } })).map((s) => s.id)).not.toContain("mutopia-777");
  });

  // The real pins, from the cache a previous `import-pack.ts` run left behind.
  const cached = existsSync(path.join(PACKS_DIR, BATCH_A.id, "raw"));
  it.skipIf(!cached)("checks every real Batch A pin offline: no rejection, and all incipit checks pass or are listed", async () => {
    const offline: Fetcher = async (url) => {
      throw new Error(`not cached: ${url}`);
    };
    const report = await importPack(prisma, BATCH_A, { fetcher: offline, dryRun: true, year: 2026 });
    expect(report.pieces.filter((piece) => piece.status === "rejected")).toEqual([]);
    const failed = report.pieces.filter((piece) => piece.incipit?.result === "fail");
    expect(failed.map((piece) => piece.slug)).toEqual(["k331-menuetto"]);
    expect(report.pieces.filter((piece) => piece.incipit?.result === "pass").length).toBe(21);
    expect(report.pieces.filter((piece) => piece.incipit?.result === "none").length).toBe(19);
  });

  const cachedC = existsSync(path.join(PACKS_DIR, BATCH_C.id, "raw"));
  it.skipIf(!cachedC)("imports the real Batch C pins as drafts, then re-running changes nothing", async () => {
    const offline: Fetcher = async (url) => {
      throw new Error(`not cached: ${url}`);
    };
    const first = await importPack(prisma, BATCH_C, { fetcher: offline, year: 2026 });
    expect(first.pieces.filter((piece) => piece.status === "rejected")).toEqual([]);
    expect(first.counts).toMatchObject({ created: 30, rejected: 0 });

    const songIds = BATCH_C.pieces.map((piece) => songIdOf(piece));
    const songs = await prisma.song.findMany({ where: { id: { in: songIds } } });
    expect(songs).toHaveLength(30);
    expect(songs.every((song) => song.source_kind === "mutopia" && song.uploader_id === null)).toBe(true);
    const works = await prisma.work.findMany({ where: { id: { in: BATCH_C.pieces.map((piece) => piece.slug) } }, include: { tags: true } });
    expect(works).toHaveLength(30);
    expect(works.every((work) => work.curation_status === "draft")).toBe(true);
    expect(works.some((work) => work.tags.some((tag) => tag.tag_id === "midiano-classics"))).toBe(false);
    // Sousa died in 1932: public domain only because the marches came out before 1931.
    expect(works.filter((work) => work.composer_id === "john-philip-sousa").map((work) => work.pd_status)).toEqual(["pd-us-eu", "pd-us-eu"]);
    // Drafts: none of it is listed until a reviewer publishes it.
    expect((await prisma.song.findMany({ where: sharedSongWhere(), select: { id: true } })).filter((song) => songIds.includes(song.id))).toEqual([]);

    const before = await snapshot();
    const second = await importPack(prisma, BATCH_C, { fetcher: offline, year: 2026 });
    expect(second.counts).toMatchObject({ created: 0, updated: 0, unchanged: 30, rejected: 0 });
    expect(await snapshot()).toBe(before);
  });
});
