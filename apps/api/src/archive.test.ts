import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

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
  },
}));

vi.mock("./db.js", () => ({ prisma: prismaMock }));

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
