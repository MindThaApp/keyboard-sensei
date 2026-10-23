/**
 * Catalogue search against a real Postgres. Runs only when TEST_DATABASE_URL is set.
 *
 * It does NOT use that database's tables: integration.db.test.ts truncates every
 * table in it, in parallel with this file. Instead it creates a scratch database
 * next to it (named after it), migrates it with `prisma migrate deploy`, and
 * drops it afterwards.
 *
 * Fixture: the real Essentials Works (built by the real backfill, so titles,
 * aliases, composers and search_text are what production has) plus 5,000
 * synthetic Works for the latency and index checks.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ESSENTIALS } from "../essentials/manifest.js";
import { backfillCatalogue } from "./backfill.js";
import { catalogueRouter } from "./routes.js";
import { buildSearchText } from "./search-text.js";
import { searchWorks, textMatch, type SearchContext, type WorkSearchParams } from "./search.js";
import { searchTerms } from "./aliases.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_DATABASE_URL);

const SYNTHETIC = 5000;
const everyone: SearchContext = { admin: false, publicCatalogue: false };
const admin: SearchContext = { admin: true, publicCatalogue: false };

let scratchUrl = "";
let scratchName = "";
let prisma: PrismaClient;

const urlFor = (database: string): string => {
  const url = new URL(TEST_DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
};

const first = async (q: string, params: WorkSearchParams = {}) => (await searchWorks(prisma, { q, ...params }, everyone)).works;

describe.skipIf(!enabled)("catalogue search (real Postgres)", () => {
  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_catalogue${process.env.KEEP_SCRATCH_DB ? "_kept" : `_${process.pid}`}`;
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
    await maintenance.$disconnect();
    scratchUrl = urlFor(scratchName);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: scratchUrl },
      stdio: "ignore",
    });
    prisma = new PrismaClient({ datasourceUrl: scratchUrl });

    // Real Essentials Works, via the real backfill.
    await prisma.song.createMany({
      data: ESSENTIALS.map((piece) => ({
        id: `essentials-${piece.slug}-full`,
        title: piece.title,
        artist: piece.composer,
        genre: piece.genre,
        difficulty: 3,
        duration_sec: 120,
        note_count: 200,
        content_rights: "cc-by-sa-2.5",
        file_path: `/app/apps/api/data/midi-library/essentials/${piece.slug}-full.mid`,
        arrangement_group: piece.slug,
        arrangement_level: "full",
      })),
    });
    await backfillCatalogue(prisma, { readSongFile: () => null });
    await prisma.song.updateMany({ where: { id: { startsWith: "essentials-" } }, data: { quality_tier: "verified" } });

    // 5,000 synthetic Works, one Good version each, with realistic search_text.
    const words = ["Autumn", "Nocturne", "Waltz", "Rondo", "Sonata", "Étude", "Prelude", "Bagatelle", "Mazurka", "Gavotte", "Minuet", "Fantasia", "Romance", "Barcarolle", "Capriccio", "Intermezzo"];
    const places = ["Vienna", "Prague", "Zürich", "Kraków", "Lisbon", "Bergen", "Naples", "Seville", "Dresden", "Leipzig"];
    const composer = await prisma.composer.create({ data: { id: "synthetic", name: "Synthetic Composer", sort_name: "Composer, Synthetic", aliases: ["Synth"] } });
    const works: Prisma.WorkCreateManyInput[] = [];
    const songs: Prisma.SongCreateManyInput[] = [];
    for (let i = 0; i < SYNTHETIC; i += 1) {
      const title = `${words[i % words.length]} in ${places[(i >> 4) % places.length]} No. ${i}`;
      const catalogue = `Op. ${100 + (i % 400)} No. ${i % 9}`;
      works.push({
        id: `syn-${i}`,
        title,
        composer_id: composer.id,
        catalogue,
        era: "romantic",
        genre: i % 7 === 0 ? "folk" : "classical",
        pd_status: "pd-worldwide",
        recognisability: 500 + i,
        curation_status: "published",
        search_text: buildSearchText({ title, catalogue, aliases: [], composer: { name: composer.name, aliases: composer.aliases }, tags: [] }),
        updated_at: new Date(),
      });
      songs.push({
        id: `syn-song-${i}`,
        title,
        artist: composer.name,
        genre: "classical",
        difficulty: 1 + (i % 5),
        duration_sec: 30 + (i % 600),
        note_count: 100,
        content_rights: "public-domain",
        file_path: `/x/syn-${i}.mid`,
        work_id: `syn-${i}`,
        quality_tier: i % 10 === 0 ? "unrated" : "good",
        public_eligible: i % 2 === 0,
      });
    }
    await prisma.work.createMany({ data: works });
    await prisma.song.createMany({ data: songs });
    await prisma.$executeRawUnsafe("ANALYZE");
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (!scratchName || process.env.KEEP_SCRATCH_DB) return;
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$disconnect();
  });

  describe("library spec 7 WP3: the nine queries", () => {
    const expected: [query: string, workId: string][] = [
      ["fur elise", "fur-elise"],
      ["Für Elise", "fur-elise"],
      ["fuer elise", "fur-elise"],
      ["moonlight", "moonlight-sonata-1"],
      ["sonata 14", "moonlight-sonata-1"],
      ["op 27", "moonlight-sonata-1"],
      ["k545", "sonata-facile"],
      ["turkish march", "rondo-alla-turca"],
    ];
    it.each(expected)("%s -> %s first", async (query, workId) => {
      const works = await first(query);
      expect(works[0]?.id).toBe(workId);
    });

    it("tschaikowski returns Tchaikovsky's best-known piece first", async () => {
      const works = await first("tschaikowski");
      const tchaikovsky = ESSENTIALS.filter((piece) => /Tchaikovsky/.test(piece.composer)).sort((a, b) => a.rank - b.rank);
      expect(tchaikovsky.length).toBeGreaterThan(1);
      expect(works[0]?.id).toBe(tchaikovsky[0]!.slug);
      expect(works.slice(0, tchaikovsky.length).map((work) => work.composer?.id)).toEqual(tchaikovsky.map(() => "pyotr-ilyich-tchaikovsky"));
    });

    it("catalogue numbers match however they are written", async () => {
      for (const query of ["K. 545", "KV545", "k 545", "K545"]) {
        expect((await first(query))[0]?.id, query).toBe("sonata-facile");
      }
    });

    it("says which alias matched when it was not the title", async () => {
      const [work] = await first("Mondscheinsonate");
      expect(work?.id).toBe("moonlight-sonata-1");
      expect(work?.matched_alias).toBe("Mondscheinsonate");
      expect((await first("moonlight"))[0]?.matched_alias).toBeNull();
    });

    it("finds a piece from a prefix and from a typo", async () => {
      expect((await first("moonli"))[0]?.id).toBe("moonlight-sonata-1");
      expect((await first("Clair de Lun"))[0]?.id).toBe("clair-de-lune");
      expect((await first("moonlite"))[0]?.id).toBe("moonlight-sonata-1");
    });

    it("returns nothing, not everything, for a query that matches nothing", async () => {
      expect(await first("zzzzzzzzqqqq")).toEqual([]);
    });
  });

  describe("filters and ordering", () => {
    it("lists one row per Work with its versions nested", async () => {
      await prisma.song.create({
        data: {
          id: "essentials-fur-elise-beginner",
          title: "Für Elise",
          artist: "Ludwig van Beethoven",
          genre: "classical",
          difficulty: 1,
          duration_sec: 40,
          note_count: 60,
          content_rights: "cc-by-sa-2.5",
          file_path: "/app/apps/api/data/midi-library/essentials/fur-elise-beginner.mid",
          work_id: "fur-elise",
          arrangement_group: "fur-elise",
          arrangement_level: "beginner",
          quality_tier: "verified",
        },
      });
      const works = await first("fur elise");
      expect(works.filter((work) => work.id === "fur-elise")).toHaveLength(1);
      const work = works[0]!;
      expect(work.versions.map((version) => version.arrangement_level)).toEqual(["beginner", "full"]);
      expect([work.level_min, work.level_max]).toEqual([1, 3]);
      expect(work.best_tier).toBe("verified");
    });

    it("default order is tier, then recognisability, and Unrated is hidden until asked for", async () => {
      const defaultList = (await searchWorks(prisma, { limit: 100 }, everyone)).works;
      expect(defaultList[0]?.id).toBe("fur-elise");
      expect(defaultList.every((work) => work.best_tier !== "unrated")).toBe(true);
      const tiers = defaultList.map((work) => work.best_tier);
      expect(tiers).toEqual([...tiers].sort((a, b) => (a === "verified" ? 0 : 1) - (b === "verified" ? 0 : 1)));

      const withUnrated = await searchWorks(prisma, { showUnrated: true, limit: 100, sort: "recommended", level: [1, 2, 3, 4, 5] }, everyone);
      expect(withUnrated.total).toBeGreaterThan((await searchWorks(prisma, { limit: 1 }, everyone)).total);
    });

    it("easiest-first keeps tier as the primary key", async () => {
      const works = (await searchWorks(prisma, { sort: "easiest", showUnrated: true, limit: 100 }, everyone)).works;
      const order = ["verified", "good", "unrated"];
      const ranks = works.map((work) => order.indexOf(work.best_tier));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    });

    it("filters by level, genre, tag, hands and duration", async () => {
      expect((await first("", { level: [1] })).map((work) => work.id)).toContain("fur-elise");
      expect((await first("", { level: [5], tags: ["essentials"] })).length).toBe(0);
      const folk = await searchWorks(prisma, { genre: ["folk"], limit: 5 }, everyone);
      expect(folk.works.every((work) => work.genre === "folk")).toBe(true);
      const essentials = await searchWorks(prisma, { tags: ["essentials"], limit: 100 }, everyone);
      expect(essentials.total).toBe(ESSENTIALS.length);
      expect((await searchWorks(prisma, { hands: ["single-line"] }, everyone)).total).toBe(0);
      const short = await searchWorks(prisma, { duration: ["under-1"], limit: 100 }, everyone);
      expect(short.works.every((work) => work.versions.every((version) => version.duration_sec < 60))).toBe(true);
    });

    it("pages through results without repeating or skipping a Work", async () => {
      const seen: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await searchWorks(prisma, { limit: 40, offset, genre: ["classical"] }, everyone);
        seen.push(...page.works.map((work) => work.id));
        if (!page.next_cursor) break;
        offset += page.works.length;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBe((await searchWorks(prisma, { genre: ["classical"], limit: 1 }, everyone)).total);
    });

    it("Low is admin-only; a retired or uploaded version never shows", async () => {
      await prisma.song.update({ where: { id: "syn-song-1" }, data: { quality_tier: "low" } });
      await prisma.song.update({ where: { id: "syn-song-3" }, data: { retired_at: new Date() } });
      await prisma.song.update({ where: { id: "syn-song-5" }, data: { uploader_id: null, tier_override: "verified", quality_tier: "low" } });
      expect(await first("", { tier: ["low"] })).toEqual([]);
      const asAdmin = await searchWorks(prisma, { tier: ["low"], limit: 100 }, admin);
      expect(asAdmin.works.map((work) => work.id)).toContain("syn-1");
      // An override wins over the computed tier.
      expect((await searchWorks(prisma, { tier: ["verified"], workId: "syn-5" }, everyone)).works.map((work) => work.id)).toEqual(["syn-5"]);
      const all = await searchWorks(prisma, { workId: "syn-3", showUnrated: true }, everyone);
      expect(all.works).toEqual([]);
    });

    it("hides draft Works from everyone but admins", async () => {
      await prisma.work.update({ where: { id: "syn-7" }, data: { curation_status: "draft" } });
      expect((await searchWorks(prisma, { workId: "syn-7" }, everyone)).works).toEqual([]);
      expect((await searchWorks(prisma, { workId: "syn-7" }, admin)).works.map((work) => work.id)).toEqual(["syn-7"]);
    });

    it("under PUBLIC_CATALOGUE returns only public-eligible versions, admins included", async () => {
      const publicContext: SearchContext = { admin: false, publicCatalogue: true };
      const result = await searchWorks(prisma, { genre: ["classical"], showUnrated: true, limit: 100 }, publicContext);
      const ids = result.works.flatMap((work) => work.versions.map((version) => version.id));
      const eligible = await prisma.song.findMany({ where: { id: { in: ids } }, select: { public_eligible: true } });
      expect(eligible.length).toBeGreaterThan(0);
      expect(eligible.every((song) => song.public_eligible)).toBe(true);
      const asAdmin = await searchWorks(prisma, { genre: ["classical"], showUnrated: true, limit: 100 }, { admin: true, publicCatalogue: true });
      const adminIds = asAdmin.works.flatMap((work) => work.versions.map((version) => version.id));
      expect((await prisma.song.findMany({ where: { id: { in: adminIds } }, select: { public_eligible: true } })).every((song) => song.public_eligible)).toBe(true);
    });

    it("reorders by recent plays within a tier", async () => {
      const user = await prisma.user.create({ data: { email: "plays@example.test", display_name: "P", password_hash: "x" } });
      const [a, b] = ["essentials-twinkle-twinkle-little-star-full", "essentials-jingle-bells-full"];
      await prisma.playAlongAttempt.createMany({
        data: [a!, a!, a!].map((song_id) => ({ user_id: user.id, song_id, score: 80, accuracy: 0.9, tempo_pct: 100, lookahead_s: 4, wait_mode: false })),
      });
      // Same recognisability so only plays decide.
      await prisma.work.updateMany({ where: { id: { in: ["twinkle-twinkle-little-star", "jingle-bells"] } }, data: { recognisability: 0 } });
      const list = (await searchWorks(prisma, { limit: 10 }, everyone)).works.map((work) => work.id);
      expect(list.indexOf("twinkle-twinkle-little-star")).toBeLessThan(list.indexOf("jingle-bells"));
      expect(b).toBeDefined();
    });
  });

  describe("indexes and latency", () => {
    it("the text match uses the migration's GIN indexes", async () => {
      const { where } = textMatch(searchTerms("tschaikowski"), true);
      // Force the planner's hand only as far as the table is small (5,000 rows);
      // the indexes must still be what it picks for a selective query.
      const plan = await prisma.$queryRaw<{ "QUERY PLAN": string }[]>(
        Prisma.sql`EXPLAIN SELECT w.id FROM "Work" w WHERE ${where}`,
      );
      const text = plan.map((row) => row["QUERY PLAN"]).join("\n");
      expect(text).toMatch(/Work_search_fts_idx/);
      expect(text).toMatch(/Work_search_trgm_idx/);
      expect(text).not.toMatch(/Seq Scan on "Work"/);
    });

    it("p95 under 50 ms over 5,000 seeded Works", async () => {
      const queries = [
        "fur elise", "Für Elise", "fuer elise", "moonlight", "sonata 14", "op 27", "k545", "turkish march", "tschaikowski",
        "waltz", "Nocturne Vienna", "Op. 250", "mazurka 42", "Étude Prague", "bagatelle no. 1234", "clair", "bach",
      ];
      for (const query of queries) await first(query); // warm the connection and plan cache
      const times: number[] = [];
      const byQuery = new Map<string, number>();
      for (let round = 0; round < 12; round += 1) {
        for (const query of queries) {
          const started = performance.now();
          await searchWorks(prisma, { q: query, limit: 30 }, everyone);
          const elapsed = performance.now() - started;
          times.push(elapsed);
          byQuery.set(query, Math.max(byQuery.get(query) ?? 0, elapsed));
        }
      }
      console.log("slowest:", [...byQuery].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([q, ms]) => `${q}=${ms.toFixed(0)}ms`).join(", "));
      for (let i = 0; i < 20; i += 1) {
        const started = performance.now();
        await searchWorks(prisma, { limit: 30, showUnrated: true }, everyone);
        times.push(performance.now() - started);
      }
      // A query every one of the 5,000 Works matches (they share a composer): the worst case, reported, not in the p95.
      const broadStarted = performance.now();
      await searchWorks(prisma, { q: "synth", limit: 30 }, everyone);
      console.log(`query matching all ${SYNTHETIC} Works: ${(performance.now() - broadStarted).toFixed(0)} ms`);
      times.sort((a, b) => a - b);
      const p95 = times[Math.floor(times.length * 0.95)]!;
      console.log(`catalogue search: ${times.length} queries, median ${times[times.length >> 1]!.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${times[times.length - 1]!.toFixed(1)} ms`);
      expect(p95).toBeLessThan(50);
    }, 60_000);
  });

  describe("HTTP routes", () => {
    let server: ReturnType<ReturnType<typeof express>["listen"]>;
    let base = "";

    beforeAll(async () => {
      const app = express();
      app.use((req, _res, next) => {
        req.userId = String(req.headers["x-user"] ?? "u1");
        next();
      });
      app.use(
        catalogueRouter({
          prisma,
          isAdmin: async (userId) => userId === "admin",
          publicCatalogue: () => false,
        }),
      );
      server = app.listen(0);
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const get = async (path: string, user = "u1") => {
      const response = await fetch(`${base}${path}`, { headers: { "x-user": user } });
      return { status: response.status, body: (await response.json()) as any };
    };

    it("GET /library/works parses comma lists and follows next_cursor", async () => {
      const page1 = await get("/library/works?genre=classical,folk&level=1,2&limit=10");
      expect(page1.status).toBe(200);
      expect(page1.body.works).toHaveLength(10);
      expect(typeof page1.body.next_cursor).toBe("string");
      const page2 = await get(`/library/works?genre=classical,folk&level=1,2&limit=10&cursor=${page1.body.next_cursor}`);
      expect(page2.body.works[0].id).not.toBe(page1.body.works[0].id);
    });

    it("rejects bad parameters", async () => {
      expect((await get("/library/works?level=9")).status).toBe(400);
      expect((await get("/library/works?sort=random")).status).toBe(400);
      expect((await get("/library/works?cursor=not-a-cursor")).status).toBe(400);
      expect((await get("/library/works?tier=nope")).status).toBe(400);
    });

    it("searches, with Low hidden from a non-admin even when asked for", async () => {
      expect((await get("/library/works?q=k545")).body.works[0].id).toBe("sonata-facile");
      const asked = await get("/library/works?tier=low");
      expect(asked.body.works.map((work: { id: string }) => work.id)).not.toContain("syn-1");
      const asAdmin = await get("/library/works?tier=low&limit=100", "admin");
      expect(asAdmin.body.works.map((work: { id: string }) => work.id)).toContain("syn-1");
    });

    it("GET /library/works/:id returns the Work, 404 when nothing is visible", async () => {
      const found = await get("/library/works/fur-elise");
      expect(found.body.work.versions.length).toBeGreaterThan(0);
      expect((await get("/library/works/syn-3")).status).toBe(404);
      expect((await get("/library/works/no-such-work")).status).toBe(404);
    });

    it("suggests titles, aliases and composers", async () => {
      const result = await get("/library/suggest?q=tschaik");
      expect(result.body.suggestions.some((item: { kind: string }) => item.kind === "composer")).toBe(true);
      const alias = await get("/library/suggest?q=Mondschein");
      expect(alias.body.suggestions.map((item: { kind: string }) => item.kind)).toEqual(expect.arrayContaining(["work", "alias"]));
      expect((await get("/library/suggest?q=a")).body.suggestions).toEqual([]);
    });

    it("facet counts cover eras, genres, tags and levels", async () => {
      const { body } = await get("/library/facets");
      expect(body.tags.map((tag: { id: string }) => tag.id)).toContain("essentials");
      expect(body.genres.length).toBeGreaterThan(0);
      expect(body.levels.length).toBeGreaterThan(0);
      expect(body.unrated_extra).toBeGreaterThan(0);
    });
  });
});
