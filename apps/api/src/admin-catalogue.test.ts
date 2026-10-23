/**
 * Admin catalogue tooling. The pure helpers always run; the route tests need a real Postgres
 * (TEST_DATABASE_URL) and use a scratch database of their own, as catalogue/search.db.test.ts
 * does, because integration.db.test.ts truncates every table in the shared one.
 */
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminCatalogueRouter, csvCell, csvLine, tierReasons } from "./admin-catalogue.js";
import { isCreditedLicence, sharedSongWhere } from "./catalogue/eligibility.js";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Nocturne, "Op. 9"')).toBe('"Nocturne, ""Op. 9"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvLine(["a", null, 3, true])).toBe("a,,3,true");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-1+1")).toBe("'-1+1");
  });
});

describe("tierReasons", () => {
  const base = { work_id: "w", file_licence: "public-domain", public_eligible: true };

  it("names the measured shortfalls and the missing provenance", () => {
    expect(tierReasons({ ...base, quality_signals: { quant: 0.5, durationSec: 20, handSplit: false, noteTracks: 1 } })).toEqual([
      "performance-timing",
      "fragment",
      "single-track",
    ]);
    expect(tierReasons({ work_id: null, file_licence: null, public_eligible: false, quality_signals: null })).toEqual([
      "no-measurement",
      "no-work",
      "licence-unknown",
      "not-public-eligible",
    ]);
  });

  it("is empty for a clean song", () => {
    expect(tierReasons({ ...base, quality_signals: { quant: 0.99, durationSec: 90, handSplit: true, noteTracks: 2 } })).toEqual([]);
  });
});

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("admin catalogue routes (real Postgres)", () => {
  let prisma: PrismaClient;
  let scratchName = "";
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let base = "";

  const urlFor = (database: string): string => {
    const url = new URL(TEST_DATABASE_URL!);
    url.pathname = `/${database}`;
    // A small pool: this runs next to other suites on a shared server.
    url.searchParams.set("connection_limit", "3");
    return url.toString();
  };

  const call = async (method: string, path: string, user: string | null, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // CSV and other plain bodies stay text.
    }
    return { status: response.status, body: parsed as any, headers: response.headers };
  };

  const song = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Song ${id}`,
    artist: "Test",
    genre: "classical",
    difficulty: 2,
    duration_sec: 60,
    note_count: 100,
    content_rights: "public-domain",
    file_path: `/nowhere/${id}.mid`,
    ...extra,
  });

  const work = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: `Work ${id}`,
    genre: "classical",
    pd_status: "pd-worldwide",
    ...extra,
  });

  beforeAll(async () => {
    scratchName = `${new URL(TEST_DATABASE_URL!).pathname.slice(1)}_admincat_${process.pid}`;
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`);
    await maintenance.$disconnect();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { ...process.env, DATABASE_URL: urlFor(scratchName) },
      stdio: "ignore",
    });
    prisma = new PrismaClient({ datasourceUrl: urlFor(scratchName) });

    await prisma.user.createMany({
      data: [
        { id: "admin", email: "admin@test", display_name: "Admin", password_hash: "x", role: "admin" },
        { id: "player", email: "player@test", display_name: "Player", password_hash: "x" },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const user = req.header("x-test-user");
      if (user) req.userId = user;
      next();
    });
    app.use(adminCatalogueRouter({ prisma, isAdmin: async (id) => id === "admin" }));
    app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof ZodError) res.status(400).json({ error: { code: "validation_error", message: error.message } });
      else res.status(500).json({ error: { code: "internal", message: String(error) } });
    });
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
    const maintenance = new PrismaClient({ datasourceUrl: urlFor("postgres") });
    await maintenance.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`);
    await maintenance.$disconnect();
  });

  it("refuses everyone but admins", async () => {
    expect((await call("GET", "/admin/catalogue/songs", null)).status).toBe(403);
    expect((await call("GET", "/admin/catalogue/songs", "player")).status).toBe(403);
    expect((await call("POST", "/admin/catalogue/bulk", "player", { action: "retire", ids: ["x"] })).status).toBe(403);
    expect((await call("GET", "/admin/catalogue/songs", "admin")).status).toBe(200);
  });

  it("bulk-retires 50 songs with 50 audit events and keeps every row, attempts included", async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `retire-${index}`);
    await prisma.song.createMany({ data: ids.map((id) => song(id)) });
    await prisma.playAlongAttempt.createMany({
      data: ids.slice(0, 5).map((song_id) => ({
        user_id: "player",
        song_id,
        score: 80,
        accuracy: 0.9,
        tempo_pct: 100,
        lookahead_s: 2,
        wait_mode: false,
      })),
    });

    const res = await call("POST", "/admin/catalogue/bulk", "admin", { action: "retire", ids, reason: "superseded" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(50);

    expect(await prisma.catalogueEvent.count({ where: { action: "retire", song_id: { in: ids } } })).toBe(50);
    const rows = await prisma.song.findMany({ where: { id: { in: ids } } });
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => row.retired_at !== null)).toBe(true);
    expect(await prisma.playAlongAttempt.count({ where: { song_id: { in: ids } } })).toBe(5);

    // Hidden by default, listed on request, and a second retire is a no-op rather than a second event.
    const listed = await call("GET", "/admin/catalogue/songs?q=retire-&limit=200", "admin");
    expect(listed.body.total).toBe(0);
    expect((await call("GET", "/admin/catalogue/songs?q=retire-&retired=only&limit=200", "admin")).body.total).toBe(50);
    const again = await call("POST", "/admin/catalogue/bulk", "admin", { action: "retire", ids });
    expect(again.body.ok).toBe(0);
    expect(await prisma.catalogueEvent.count({ where: { action: "retire", song_id: { in: ids } } })).toBe(50);
  });

  it("merges two Works without losing a song, alias or tag, and undoes nothing it cannot", async () => {
    await prisma.tag.createMany({ data: [{ id: "mood-calm", label: "Calm", kind: "mood" }, { id: "mood-bright", label: "Bright", kind: "mood" }] });
    await prisma.work.createMany({ data: [work("canon", { title: "Moonlight Sonata" }), work("dupe", { title: "Mondscheinsonate" })] });
    await prisma.workAlias.createMany({
      data: [
        { work_id: "canon", alias: "Sonata quasi una fantasia", kind: "nickname" },
        { work_id: "canon", alias: "shared alias", kind: "nickname" },
        { work_id: "dupe", alias: "shared alias", kind: "nickname" },
        { work_id: "dupe", alias: "Op. 27 No. 2", kind: "catalogue" },
      ],
    });
    await prisma.workTag.createMany({
      data: [
        { work_id: "canon", tag_id: "mood-calm" },
        { work_id: "dupe", tag_id: "mood-calm" },
        { work_id: "dupe", tag_id: "mood-bright" },
      ],
    });
    await prisma.song.createMany({ data: [song("m1", { work_id: "canon" }), song("m2", { work_id: "dupe" }), song("m3", { work_id: "dupe" })] });

    const res = await call("POST", "/admin/catalogue/works/merge", "admin", { from_id: "dupe", into_id: "canon", reason: "same piece" });
    expect(res.status).toBe(200);
    expect(res.body.songs_moved).toBe(2);

    const songs = await prisma.song.findMany({ where: { id: { in: ["m1", "m2", "m3"] } }, select: { work_id: true } });
    expect(songs.map((row) => row.work_id)).toEqual(["canon", "canon", "canon"]);
    const aliases = (await prisma.workAlias.findMany({ where: { work_id: "canon" } })).map((row) => row.alias).sort();
    expect(aliases).toEqual(["Mondscheinsonate", "Op. 27 No. 2", "Sonata quasi una fantasia", "shared alias"].sort());
    expect((await prisma.workTag.findMany({ where: { work_id: "canon" } })).map((row) => row.tag_id).sort()).toEqual(["mood-bright", "mood-calm"]);
    expect(await prisma.workAlias.count({ where: { work_id: "dupe" } })).toBe(0);
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "dupe" } })).curation_status).toBe("retired");
    // The merged Work is found by the duplicate's old title and its catalogue alias.
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "canon" } })).search_text.toLowerCase()).toContain("mondscheinsonate");

    const event = await prisma.catalogueEvent.findFirstOrThrow({ where: { action: "merge" } });
    expect(event.work_id).toBe("canon");
    expect((await call("POST", `/admin/catalogue/events/${event.id}/undo`, "admin")).status).toBe(422);
    expect((await call("POST", "/admin/catalogue/works/merge", "admin", { from_id: "canon", into_id: "canon" })).status).toBe(400);
    expect((await call("POST", "/admin/catalogue/works/merge", "admin", { from_id: "nope", into_id: "canon" })).status).toBe(404);
  });

  it("publishes a batch from the import queue, skipping songs with no Work", async () => {
    await prisma.work.createMany({ data: [work("q-a"), work("q-b", { curation_status: "in_review" })] });
    await prisma.song.createMany({
      data: [song("q1", { work_id: "q-a" }), song("q2", { work_id: "q-a" }), song("q3", { work_id: "q-b" }), song("q4")],
    });

    const queue = await call("GET", "/admin/catalogue/queue", "admin");
    const queued = queue.body.songs.map((row: { id: string }) => row.id);
    expect(queued).toEqual(expect.arrayContaining(["q1", "q2", "q3"]));
    expect(queued).not.toContain("q4");

    const res = await call("POST", "/admin/catalogue/bulk", "admin", { action: "set_status", status: "published", ids: ["q1", "q2", "q3", "q4"] });
    expect(res.body.results.map((row: { id: string; outcome: string; reason?: string }) => [row.id, row.outcome, row.reason])).toEqual([
      ["q1", "ok", undefined],
      ["q2", "ok", undefined],
      ["q3", "ok", undefined],
      ["q4", "skipped", "no_work"],
    ]);
    const statuses = await prisma.work.findMany({ where: { id: { in: ["q-a", "q-b"] } }, select: { curation_status: true } });
    expect(statuses.every((row) => row.curation_status === "published")).toBe(true);
    // One event per Work, not per song.
    expect(await prisma.catalogueEvent.count({ where: { action: "publish", work_id: { in: ["q-a", "q-b"] } } })).toBe(2);
    expect((await call("GET", "/admin/catalogue/queue", "admin")).body.songs.map((row: { id: string }) => row.id)).not.toContain("q1");
  });

  it("sets and clears a tier override with a mandatory reason, and undoes it", async () => {
    await prisma.song.create({ data: song("tier-1") });
    expect((await call("POST", "/admin/catalogue/bulk", "admin", { action: "set_tier", ids: ["tier-1"], tier: "verified" })).status).toBe(400);

    await call("POST", "/admin/catalogue/bulk", "admin", { action: "set_tier", ids: ["tier-1"], tier: "verified", reason: "checked by ear" });
    let row = await prisma.song.findUniqueOrThrow({ where: { id: "tier-1" } });
    expect([row.tier_override, row.tier_override_reason]).toEqual(["verified", "checked by ear"]);

    const event = await prisma.catalogueEvent.findFirstOrThrow({ where: { song_id: "tier-1", action: "override_tier" } });
    expect((await call("POST", `/admin/catalogue/events/${event.id}/undo`, "admin")).status).toBe(200);
    row = await prisma.song.findUniqueOrThrow({ where: { id: "tier-1" } });
    expect(row.tier_override).toBeNull();
    // Undoing twice would overwrite nothing useful: refused.
    expect((await call("POST", `/admin/catalogue/events/${event.id}/undo`, "admin")).status).toBe(409);
  });

  it("refuses an undo that would overwrite a newer change", async () => {
    await prisma.work.create({ data: work("undo-w", { curation_status: "draft" }) });
    await prisma.song.create({ data: song("undo-s", { work_id: "undo-w" }) });
    await call("POST", "/admin/catalogue/bulk", "admin", { action: "set_status", status: "published", ids: ["undo-s"] });
    await call("POST", "/admin/catalogue/bulk", "admin", { action: "set_status", status: "hidden", ids: ["undo-s"] });
    const publish = await prisma.catalogueEvent.findFirstOrThrow({ where: { work_id: "undo-w", action: "publish" } });
    expect((await call("POST", `/admin/catalogue/events/${publish.id}/undo`, "admin")).status).toBe(409);

    const hide = await prisma.catalogueEvent.findFirstOrThrow({ where: { work_id: "undo-w", action: "hide" } });
    expect((await call("POST", `/admin/catalogue/events/${hide.id}/undo`, "admin")).status).toBe(200);
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "undo-w" } })).curation_status).toBe("published");
  });

  it("edits a Work, rebuilds its search text and undoes the edit", async () => {
    await prisma.work.create({ data: work("edit-w", { title: "Plain Title" }) });
    const res = await call("PATCH", "/admin/catalogue/works/edit-w", "admin", {
      title: "Renamed Piece",
      featured_rank: 7,
      aliases: [{ alias: "Tiny Name", kind: "nickname" }],
    });
    expect(res.status).toBe(200);
    let row = await prisma.work.findUniqueOrThrow({ where: { id: "edit-w" } });
    expect(row.search_text.toLowerCase()).toContain("renamed piece");
    expect(row.search_text.toLowerCase()).toContain("tiny name");

    const event = await prisma.catalogueEvent.findFirstOrThrow({ where: { work_id: "edit-w", action: "edit" } });
    expect((await call("POST", `/admin/catalogue/events/${event.id}/undo`, "admin")).status).toBe(200);
    row = await prisma.work.findUniqueOrThrow({ where: { id: "edit-w" } });
    expect([row.title, row.featured_rank]).toEqual(["Plain Title", null]);
    expect(await prisma.workAlias.count({ where: { work_id: "edit-w" } })).toBe(0);
    expect(row.search_text.toLowerCase()).not.toContain("tiny name");
  });

  it("assigns a Work and adds a tag, filtering by what it changed", async () => {
    await prisma.work.create({ data: work("assign-w") });
    await prisma.song.createMany({ data: [song("as-1"), song("as-2")] });
    expect((await call("GET", "/admin/catalogue/songs?nowork=1&q=as-", "admin")).body.total).toBe(2);
    await call("POST", "/admin/catalogue/bulk", "admin", { action: "assign_work", ids: ["as-1", "as-2"], work_id: "assign-w" });
    expect((await call("GET", "/admin/catalogue/songs?nowork=1&q=as-", "admin")).body.total).toBe(0);
    expect((await call("POST", "/admin/catalogue/bulk", "admin", { action: "assign_work", ids: ["as-1"], work_id: "missing" })).status).toBe(400);

    await prisma.tag.create({ data: { id: "mood-tag-x", label: "Xylophone", kind: "mood" } });
    const tagged = await call("POST", "/admin/catalogue/bulk", "admin", { action: "add_tag", ids: ["as-1", "as-2"], tag_id: "mood-tag-x" });
    expect(tagged.body.results.map((row: { outcome: string }) => row.outcome)).toEqual(["ok", "ok"]);
    expect((await prisma.work.findUniqueOrThrow({ where: { id: "assign-w" } })).search_text.toLowerCase()).toContain("xylophone");
    expect(await prisma.catalogueEvent.count({ where: { work_id: "assign-w", action: "edit" } })).toBe(3);
  });

  it("filters the table by tier, source, licence and eligibility", async () => {
    await prisma.song.createMany({
      data: [
        song("f-1", { quality_tier: "good", source_kind: "mutopia", file_licence: "public-domain", public_eligible: true }),
        song("f-2", { quality_tier: "good", tier_override: "verified", tier_override_reason: "x", source_kind: "adl" }),
        song("f-3", { source_kind: "adl", file_licence: "unknown" }),
      ],
    });
    const ids = async (query: string) => (await call("GET", `/admin/catalogue/songs?q=f-&${query}`, "admin")).body.songs.map((row: { id: string }) => row.id).sort();
    expect(await ids("tier=verified")).toEqual(["f-2"]);
    expect(await ids("tier=good")).toEqual(["f-1"]);
    expect(await ids("source=adl")).toEqual(["f-2", "f-3"]);
    expect(await ids("licence=unknown")).toEqual(["f-2", "f-3"]);
    expect(await ids("eligible=1")).toEqual(["f-1"]);
    expect((await call("GET", "/admin/catalogue/songs?tier=bogus", "admin")).status).toBe(400);
  });

  it("exports a licence CSV whose credited rows are exactly the /credits songs", async () => {
    await prisma.song.createMany({
      data: [
        song("c-1", { file_licence: "cc-by-sa-2.5", attribution: 'Typeset by "A. Person", CC BY-SA' }),
        song("c-2", { file_licence: "cc-by-4.0", attribution: "=evil()" }),
        song("c-3", { file_licence: "public-domain" }),
        song("c-4", { file_licence: "cc-by-sa-2.5", retired_at: new Date() }),
        song("c-5", { file_licence: "cc-by-sa-2.5", uploader_id: "player" }),
      ],
    });
    const res = await call("GET", "/admin/catalogue/licences.csv", "admin");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const lines = (res.body as string).trim().split("\r\n");
    const header = lines[0]!.split(",");
    expect(header.slice(0, 3)).toEqual(["song_id", "title", "artist"]);
    const idIndex = header.indexOf("song_id");
    const creditIndex = header.indexOf("credit_required");
    // Rows here contain no embedded commas outside the quoted attribution column, which is last.
    const credited = lines
      .slice(1)
      .map((line) => line.split(","))
      .filter((cells) => cells[creditIndex] === "yes")
      .map((cells) => cells[idIndex])
      .sort();

    // /credits' own query (credits.ts), run against the same database.
    const credits = (
      await prisma.song.findMany({
        where: { ...sharedSongWhere(), retired_at: null, file_licence: { startsWith: "cc-" } },
        select: { id: true, file_licence: true },
      })
    )
      .filter((row) => isCreditedLicence(row.file_licence))
      .map((row) => row.id)
      .sort();
    expect(credited).toEqual(credits);
    expect(credited).toEqual(expect.arrayContaining(["c-1", "c-2"]));
    expect(credited).not.toContain("c-4");
    expect(credited).not.toContain("c-5");
    expect(res.body).toContain("'=evil()");
    expect(res.body).toContain('"Typeset by ""A. Person"", CC BY-SA"');
  });

  it("lists the audit log by song, Work and action", async () => {
    const bySong = await call("GET", "/admin/catalogue/events?song_id=tier-1", "admin");
    expect(bySong.body.total).toBeGreaterThanOrEqual(2);
    expect(bySong.body.events[0]).toMatchObject({ actor_name: "Admin", song_title: "Song tier-1" });
    const byWork = await call("GET", "/admin/catalogue/events?work_id=canon&action=merge", "admin");
    expect(byWork.body.events).toHaveLength(1);
    expect(byWork.body.events[0].work_title).toBe("Moonlight Sonata");
  });
});
