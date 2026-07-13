import type { Request, Response } from "express";
import { describe, expect, it, vi, afterEach } from "vitest";
import { Midi } from "@tonejs/midi";

type ArchiveEntryRow = {
  id: string;
  title: string;
  composer: string;
  duration_sec: number;
  note_count: number;
  difficulty: number;
};

const archiveRows = vi.hoisted<ArchiveEntryRow[]>(() => [
  {
    id: "archive-bach-invention-1",
    title: "Invention No. 1 in C Major",
    composer: "Johann Sebastian Bach",
    duration_sec: 72,
    note_count: 310,
    difficulty: 3,
  },
  {
    id: "archive-chopin-prelude-4",
    title: "Prelude in E Minor",
    composer: "Frederic Chopin",
    duration_sec: 118,
    note_count: 420,
    difficulty: 4,
  },
  {
    id: "archive-debussy-clair",
    title: "Clair de Lune",
    composer: "Claude Debussy",
    duration_sec: 302,
    note_count: 900,
    difficulty: 5,
  },
]);

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  archiveEntry: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  song: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

import { readFile, rm } from "node:fs/promises";
import { archiveRouter } from "./archive.js";

function mockArchiveDb() {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockImplementation(
    async (_strings: TemplateStringsArray, q: string, _rankQ: string, offset: number, limit: number) => {
      const needle = q.toLowerCase();
      return archiveRows
        .filter((row) => `${row.title} ${row.composer}`.toLowerCase().includes(needle))
        .slice(offset, offset + limit);
    },
  );
  prismaMock.archiveEntry.findMany.mockImplementation(
    async ({ skip, take }: { skip: number; take: number }) => archiveRows.slice(skip, skip + take),
  );
}

async function getArchiveSearch(query: Record<string, unknown>) {
  return await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
    const queryString = searchParams.toString();
    const url = `/archive/search${queryString ? `?${queryString}` : ""}`;
    const req = {
      method: "GET",
      url,
      originalUrl: url,
      baseUrl: "",
      path: "/archive/search",
      query,
    } as unknown as Request;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        settled = true;
        resolve({ status, body: payload });
        return this;
      },
    } as Response;

    (archiveRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({
            status: 404,
            body: { error: { code: "not_found", message: "No route for GET /archive/search" } },
          });
        }
      },
    );
  });
}

/** Build a valid in-range MIDI file: `count` quarter notes at 120bpm starting at C4. */
function buildMidi(count: number): Uint8Array {
  const midi = new Midi();
  const track = midi.addTrack();
  for (let i = 0; i < count; i++) {
    track.addNote({ midi: 60 + (i % 12), time: i * 0.5, duration: 0.4 });
  }
  return new Uint8Array(midi.toArray());
}

async function postArchiveImport(id: string, userId: string) {
  return await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const url = `/archive/${id}/import`;
    const req = {
      method: "POST",
      url,
      originalUrl: url,
      baseUrl: "",
      path: `/archive/${id}/import`,
      params: { id },
      query: {},
      userId,
    } as unknown as Request;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: Record<string, unknown>) {
        settled = true;
        resolve({ status, body: payload });
        return this;
      },
    } as Response;

    (archiveRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({ status: 404, body: { error: { code: "not_found", message: "No route" } } });
        }
      },
    );
  });
}

describe("GET /archive/search", () => {
  it("returns a known archive entry by title substring", async () => {
    mockArchiveDb();

    const response = await getArchiveSearch({ q: "invention" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [
        {
          id: "archive-bach-invention-1",
          title: "Invention No. 1 in C Major",
          composer: "Johann Sebastian Bach",
          duration_sec: 72,
          note_count: 310,
          difficulty: 3,
        },
      ],
    });
  });

  it("returns a known archive entry by composer substring", async () => {
    mockArchiveDb();

    const response = await getArchiveSearch({ q: "chopin" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      results: [{ id: "archive-chopin-prelude-4", title: "Prelude in E Minor", composer: "Frederic Chopin" }],
    });
  });

  it("returns an empty result set for a nonsense query", async () => {
    mockArchiveDb();

    const response = await getArchiveSearch({ q: "zzzz-not-a-piece" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
  });

  it("applies offset and limit when browsing without a query", async () => {
    mockArchiveDb();

    const response = await getArchiveSearch({ q: "", offset: "1", limit: "1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [archiveRows[1]] });
    expect(prismaMock.archiveEntry.findMany).toHaveBeenCalledWith({
      orderBy: [{ composer: "asc" }, { title: "asc" }],
      skip: 1,
      take: 1,
      select: { id: true, title: true, composer: true, duration_sec: true, note_count: true, difficulty: true },
    });
  });
});

describe("POST /archive/:id/import", () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const p of cleanupPaths.splice(0)) await rm(p, { force: true });
  });

  function mockHfRow(row: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ rows: [{ row }] }) })),
    );
  }

  it("returns 404 when the archive entry does not exist", async () => {
    vi.clearAllMocks();
    prismaMock.archiveEntry.findUnique.mockResolvedValue(null);

    const response = await postArchiveImport("missing-id", "user-1");

    expect(response.status).toBe(404);
  });

  it("imports a known entry as a private Song row, invisible to other users", async () => {
    vi.clearAllMocks();
    const midiBytes = Buffer.from(buildMidi(80));
    mockHfRow({ performance_midi_bytes: midiBytes.toString("base64"), score_xml_bytes: null });
    prismaMock.archiveEntry.findUnique.mockResolvedValue({
      id: "archive-bach-invention-1",
      title: "Invention No. 1 in C Major",
      composer: "Johann Sebastian Bach",
      duration_sec: 72,
      note_count: 310,
      difficulty: 3,
      source_ref: "train:9436",
    });
    prismaMock.song.create.mockResolvedValue({ id: "song-1", uploader_id: "user-1" });
    prismaMock.song.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "song-1",
      title: "Invention No. 1 in C Major",
      artist: "Johann Sebastian Bach",
      ...data,
    }));

    const response = await postArchiveImport("archive-bach-invention-1", "user-1");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "song-1", title: "Invention No. 1 in C Major" });
    expect(prismaMock.song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Invention No. 1 in C Major",
        artist: "Johann Sebastian Bach",
        genre: "classical",
        content_rights: "archive-import",
        uploader_id: "user-1", // owned by the importing user, not shared/public
      }),
    });
    const updateCall = prismaMock.song.update.mock.calls[0][0];
    expect(updateCall.data.notation_path).toBeNull(); // no score_xml_bytes on this row
    cleanupPaths.push(updateCall.data.file_path);
  });

  it("stores the .mxl notation file when score_xml_bytes is present", async () => {
    vi.clearAllMocks();
    const midiBytes = Buffer.from(buildMidi(80));
    const mxlBytes = Buffer.from("PK\x03\x04-fake-mxl-zip-bytes");
    mockHfRow({ performance_midi_bytes: midiBytes.toString("base64"), score_xml_bytes: mxlBytes.toString("base64") });
    prismaMock.archiveEntry.findUnique.mockResolvedValue({
      id: "archive-mozart-333",
      title: "Piano Sonata No.13",
      composer: "Wolfgang Amadeus Mozart",
      duration_sec: 100,
      note_count: 500,
      difficulty: 3,
      source_ref: "test:21760",
    });
    prismaMock.song.create.mockResolvedValue({ id: "song-2", uploader_id: "user-1" });
    prismaMock.song.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "song-2",
      title: "Piano Sonata No.13",
      artist: "Wolfgang Amadeus Mozart",
      ...data,
    }));

    const response = await postArchiveImport("archive-mozart-333", "user-1");

    expect(response.status).toBe(201);
    const updateCall = prismaMock.song.update.mock.calls[0][0];
    expect(updateCall.data.notation_path).toMatch(/\.mxl$/);
    const written = await readFile(updateCall.data.notation_path);
    expect(written.equals(mxlBytes)).toBe(true);
    cleanupPaths.push(updateCall.data.file_path, updateCall.data.notation_path);
  });

  it("returns 422 for an unparseable MIDI payload from the archive source", async () => {
    vi.clearAllMocks();
    mockHfRow({ performance_midi_bytes: Buffer.from("not a real midi file").toString("base64"), score_xml_bytes: null });
    prismaMock.archiveEntry.findUnique.mockResolvedValue({
      id: "archive-broken",
      title: "Broken Entry",
      composer: "Nobody",
      duration_sec: 10,
      note_count: 5,
      difficulty: 1,
      source_ref: "train:1",
    });

    const response = await postArchiveImport("archive-broken", "user-1");

    expect(response.status).toBe(422);
    expect(prismaMock.song.create).not.toHaveBeenCalled();
  });
});

// Not the automated suite above (which mocks the HuggingFace fetch entirely) --
// this hits the REAL Datasets Server API for exactly one known-good row, per
// the task brief's allowance ("if it genuinely requires a live network call,
// mark this specific test as needing network access and keep it minimal").
// Confirms fetchArchiveRowBytes's base64-decode + real endpoint shape still
// works against the actual live service, not just our own mocked shape of it.
// Opt-in: this suite makes a REAL call to HuggingFace's dataset server. Leaving it
// on by default means any third-party outage, rate limit or slow response turns CI
// red for reasons that have nothing to do with this codebase — which has already
// happened. Run it deliberately with LIVE_NETWORK_TESTS=1.
describe.skipIf(!process.env.LIVE_NETWORK_TESTS)("POST /archive/:id/import (live network)", () => {
  it("fetches a real PianoCoRe row's MIDI and MXL bytes end-to-end", async () => {
    vi.clearAllMocks();
    prismaMock.archiveEntry.findUnique.mockResolvedValue({
      id: "archive-live-test",
      title: "Piano Sonata No.13 in B flat major, K.333 -- 3. Allegretto grazioso",
      composer: "Wolfgang Amadeus Mozart",
      duration_sec: 100,
      note_count: 500,
      difficulty: 3,
      source_ref: "test:21760", // confirmed live: tier_a_star, has score_xml_bytes
    });
    prismaMock.song.create.mockResolvedValue({ id: "song-live", uploader_id: "user-1" });
    prismaMock.song.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "song-live",
      title: "Piano Sonata No.13",
      artist: "Wolfgang Amadeus Mozart",
      ...data,
    }));

    const response = await postArchiveImport("archive-live-test", "user-1");

    expect(response.status).toBe(201);
    const updateCall = prismaMock.song.update.mock.calls[0][0];
    expect(updateCall.data.notation_path).toMatch(/\.mxl$/);
    const midiOnDisk = await readFile(updateCall.data.file_path);
    expect(midiOnDisk.subarray(0, 4).toString("latin1")).toBe("MThd");
    const mxlOnDisk = await readFile(updateCall.data.notation_path);
    expect(mxlOnDisk.subarray(0, 4).toString("latin1")).toBe("PK\x03\x04");
    await rm(updateCall.data.file_path, { force: true });
    await rm(updateCall.data.notation_path, { force: true });
  }, 20000);
});
