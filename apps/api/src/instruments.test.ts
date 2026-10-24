import type { Request, Response } from "express";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  instrument: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

const ssrfMock = vi.hoisted(() => {
  class MockSsrfBlockedError extends Error {}
  return {
    fetchUrlSafely: vi.fn(),
    SsrfBlockedError: MockSsrfBlockedError,
  };
});

vi.mock("./ssrf-safe-fetch.js", () => ssrfMock);

import { instrumentsRouter } from "./instruments.js";

type InstrumentRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  content_rights: string;
  source_url: string | null;
  pack_path: string;
  uploader_id: string | null;
  created_at: Date;
};

const row = (overrides: Partial<InstrumentRow> = {}): InstrumentRow => ({
  id: "inst-owner-1",
  name: "Rhodes",
  description: "Rhodes — bell-like electric piano, soul and jazz",
  category: "keys",
  content_rights: "user-upload",
  source_url: null,
  pack_path: "/private/instruments/upload-inst-owner-1",
  uploader_id: "owner-1",
  created_at: new Date("2026-07-12T12:00:00.000Z"),
  ...overrides,
});

function mockDb(rows: InstrumentRow[]) {
  vi.clearAllMocks();
  const instruments = new Map(rows.map((instrument) => [instrument.id, { ...instrument }]));
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    role: where.id === "admin-1" ? "admin" : "user",
  }));
  prismaMock.instrument.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => instruments.get(where.id) ?? null);
  prismaMock.instrument.findMany.mockImplementation(async ({ where }: { where?: { OR?: { uploader_id: string | null }[] } }) => {
    if (!where || !where.OR) return [...instruments.values()];
    const allowed = new Set((where.OR ?? []).map((item) => item.uploader_id));
    return [...instruments.values()].filter((item) => allowed.has(item.uploader_id));
  });
  prismaMock.instrument.delete.mockImplementation(async ({ where }: { where: { id: string } }) => instruments.delete(where.id));
}

async function callInstrumentsRouter(options: {
  method: string;
  url: string;
  userId: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: Buffer;
}) {
  return await new Promise<{ status: number; body: unknown; headers: Record<string, string> }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const headers: Record<string, string> = {};
    const parsedUrl = new URL(options.url, "http://test.local");
    let sentRawBody = false;
    const req = new Readable({
      read() {
        if (sentRawBody || !options.rawBody) {
          this.push(null);
          return;
        }
        sentRawBody = true;
        this.push(options.rawBody);
        this.push(null);
      },
    }) as Request;
    Object.assign(req, {
      method: options.method,
      url: options.url,
      originalUrl: options.url,
      baseUrl: "",
      path: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams),
      params: {},
      headers: options.headers ?? {},
      body: options.body,
      userId: options.userId,
    });
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      set(name: string, value: string) {
        headers[name.toLowerCase()] = value;
        return this;
      },
      type(value: string) {
        headers["content-type"] = value;
        return this;
      },
      json(payload: unknown) {
        settled = true;
        resolve({ status, body: payload, headers });
        return this;
      },
      send(payload: unknown) {
        settled = true;
        resolve({ status, body: payload, headers });
        return this;
      },
    } as Response;

    (instrumentsRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error instanceof ZodError) {
          resolve({
            status: 400,
            body: { error: { code: "validation_error", message: "Request validation failed", details: error.flatten() } },
            headers,
          });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({ status: 404, body: { error: { code: "not_found", message: `No route for ${options.method} ${options.url}` } }, headers });
        }
      },
    );
  });
}

describe("GET /instruments", () => {
  const rows = [
    row({ id: "seed-grand", name: "Concert Grand", category: "piano", content_rights: "CC-BY-3.0", uploader_id: null, pack_path: "/private/instruments/acoustic_grand_piano" }),
    row({ id: "own-inst", name: "Mine", uploader_id: "owner-1", pack_path: "/private/instruments/upload-own-inst" }),
    row({ id: "other-inst", name: "Other", uploader_id: "other-1", pack_path: "/private/instruments/upload-other-inst" }),
  ];

  it("returns seeded and own instruments to a normal user without pack_path", async () => {
    mockDb(rows);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments", userId: "owner-1" });

    expect(response.status).toBe(200);
    expect((response.body as { instruments: InstrumentRow[] }).instruments.map((item) => item.id)).toEqual(["seed-grand", "own-inst"]);
    expect(JSON.stringify(response.body)).not.toContain("pack_path");
    expect(JSON.stringify(response.body)).not.toContain("/private/instruments");
    expect(prismaMock.instrument.findMany).toHaveBeenCalledWith({
      where: { OR: [{ uploader_id: null }, { uploader_id: "owner-1" }] },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  });

  it("returns every instrument to admins without pack_path", async () => {
    mockDb(rows);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments", userId: "admin-1" });

    expect(response.status).toBe(200);
    expect((response.body as { instruments: InstrumentRow[] }).instruments.map((item) => item.id)).toEqual(["seed-grand", "own-inst", "other-inst"]);
    expect(JSON.stringify(response.body)).not.toContain("pack_path");
    expect(JSON.stringify(response.body)).not.toContain("/private/instruments");
  });
});

describe("POST /instruments/upload", () => {
  it("rejects bytes that don't sniff as audio or a midi-js data-uri pack, regardless of Content-Type", async () => {
    mockDb([]);

    const response = await callInstrumentsRouter({
      method: "POST",
      url: "/instruments/upload?name=Bad&description=Not%20audio",
      userId: "owner-1",
      headers: { "content-type": "audio/mpeg", "content-length": "4" },
      rawBody: Buffer.from([1, 2, 3, 4]),
    });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: { code: "invalid_pack", message: "Instrument upload must be MP3, OGG, WAV, FLAC, or a midi-js soundfont data-uri pack" },
    });
    expect(prismaMock.instrument.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /instruments/:id", () => {
  it("does not let one user delete another user's instrument", async () => {
    mockDb([row()]);

    const response = await callInstrumentsRouter({ method: "DELETE", url: "/instruments/inst-owner-1", userId: "other-user" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "forbidden", message: "You can only delete instruments you uploaded" },
    });
    expect(prismaMock.instrument.delete).not.toHaveBeenCalled();
  });

  it("lets the owner delete their instrument", async () => {
    mockDb([row()]);

    const response = await callInstrumentsRouter({ method: "DELETE", url: "/instruments/inst-owner-1", userId: "owner-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(prismaMock.instrument.delete).toHaveBeenCalledWith({ where: { id: "inst-owner-1" } });
  });
});

describe("GET /instruments/:id/sampler", () => {
  const layered = {
    engine: "layered-piano",
    version: 1,
    layers: [{ key: "v3", maxVelocity: 127, trim: 1, roots: [60] }],
    release: { key: "r", roots: [60], seconds: 0.9 },
  };

  async function packDir(layout: unknown): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "ks-pack-"));
    await writeFile(path.join(dir, "layout.json"), JSON.stringify(layout));
    return dir;
  }

  it("hands a layered pack's description to the player", async () => {
    const dir = await packDir({ type: "notes", notes: { v3_60: { file: "v3_60.mp3", contentType: "audio/mpeg" } }, sampler: layered });
    mockDb([row({ id: "seed-studio", uploader_id: null, pack_path: dir })]);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments/seed-studio/sampler", userId: "owner-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sampler: layered });
  });

  it("says null for an ordinary one-sample-per-key pack", async () => {
    const dir = await packDir({ type: "notes", notes: { C4: { file: "C4.mp3", contentType: "audio/mpeg" } } });
    mockDb([row({ id: "seed-plain", uploader_id: null, pack_path: dir })]);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments/seed-plain/sampler", userId: "owner-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sampler: null });
  });

  it("does not describe another user's upload", async () => {
    const dir = await packDir({ type: "notes", notes: {}, sampler: layered });
    mockDb([row({ id: "other-inst", uploader_id: "other-1", pack_path: dir })]);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments/other-inst/sampler", userId: "owner-1" });

    expect(response.status).toBe(404);
  });

  it("is a 404 when the pack is missing on disk", async () => {
    mockDb([row({ id: "seed-gone", uploader_id: null, pack_path: "/nonexistent/pack" })]);

    const response = await callInstrumentsRouter({ method: "GET", url: "/instruments/seed-gone/sampler", userId: "owner-1" });

    expect(response.status).toBe(404);
  });
});

describe("GET /instruments/:id/samples/:note", () => {
  it("is a 404, not a lookup on Object, for a note named after a built-in property", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ks-pack-"));
    await writeFile(path.join(dir, "layout.json"), JSON.stringify({ type: "notes", notes: { C4: { file: "C4.mp3", contentType: "audio/mpeg" } } }));
    await writeFile(path.join(dir, "C4.mp3"), "mp3");
    mockDb([row({ id: "seed-notes", uploader_id: null, pack_path: dir })]);

    for (const note of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await callInstrumentsRouter({ method: "GET", url: `/instruments/seed-notes/samples/${note}`, userId: "owner-1" });
      expect(response.status, note).toBe(404);
    }
    const real = await callInstrumentsRouter({ method: "GET", url: "/instruments/seed-notes/samples/C4", userId: "owner-1" });
    expect(real.status).toBe(200);
  });
});
