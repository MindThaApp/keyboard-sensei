import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { Midi } from "@tonejs/midi";
import { ZodError } from "zod";
// Import from midi-metadata directly: songs.ts pulls in auth/db/config, whose
// env parsing fails in CI where no .env exists.
import { extractSongMetadata, InvalidMidiError } from "./midi-metadata.js";

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  song: {
    create: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
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

import { songsRouter } from "./songs.js";

/** Build a valid in-range MIDI file: `count` quarter notes at 120bpm starting at C4. */
function buildMidi(count: number, options: { midi?: number; durationEach?: number } = {}): Uint8Array {
  const midi = new Midi();
  const track = midi.addTrack();
  for (let i = 0; i < count; i++) {
    track.addNote({
      midi: options.midi ?? 60 + (i % 12),
      time: i * 0.5,
      duration: options.durationEach ?? 0.4,
    });
  }
  return new Uint8Array(midi.toArray());
}

describe("extractSongMetadata", () => {
  it("extracts duration, note count, and difficulty from a valid file", () => {
    const bytes = buildMidi(80); // 80 notes over ~40s → 2 notes/sec, monophonic
    const meta = extractSongMetadata(bytes);
    expect(meta.noteCount).toBe(80);
    expect(meta.durationSec).toBeGreaterThan(30);
    expect(meta.difficulty).toBeGreaterThanOrEqual(1);
    expect(meta.difficulty).toBeLessThanOrEqual(5);
  });

  it("gives denser, more polyphonic music a higher difficulty", () => {
    const sparse = extractSongMetadata(buildMidi(60)); // 2 notes/sec
    const midi = new Midi();
    const track = midi.addTrack();
    // 8 notes/sec in chords of 4 for ~25s
    for (let i = 0; i < 50; i++) {
      for (const offset of [0, 4, 7, 12]) {
        track.addNote({ midi: 60 + offset, time: i * 0.5, duration: 0.4 });
      }
    }
    const dense = extractSongMetadata(new Uint8Array(midi.toArray()));
    expect(dense.difficulty).toBeGreaterThan(sparse.difficulty);
    expect(dense.difficulty).toBe(5);
  });

  it("rejects unparseable bytes", () => {
    expect(() => extractSongMetadata(new Uint8Array([1, 2, 3, 4]))).toThrow(InvalidMidiError);
  });

  it("rejects files with too few notes", () => {
    expect(() => extractSongMetadata(buildMidi(3))).toThrow(InvalidMidiError);
  });

  it("rejects files that are too short", () => {
    // 25 notes crammed into 5 seconds
    const midi = new Midi();
    const track = midi.addTrack();
    for (let i = 0; i < 25; i++) track.addNote({ midi: 60, time: i * 0.2, duration: 0.1 });
    expect(() => extractSongMetadata(new Uint8Array(midi.toArray()))).toThrow(InvalidMidiError);
  });

  it("rejects files with no notes in piano range", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    for (let i = 0; i < 30; i++) track.addNote({ midi: 110 + (i % 10), time: i, duration: 0.5 });
    expect(() => extractSongMetadata(new Uint8Array(midi.toArray()))).toThrow(InvalidMidiError);
  });
});

type SongRow = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  difficulty: number;
  duration_sec: number;
  note_count: number;
  content_rights: string;
  source_url: string | null;
  file_path: string;
  uploader_id: string | null;
};

const uploadedSong = (overrides: Partial<SongRow> = {}): SongRow => ({
  id: "song-owner-1",
  title: "Original Title",
  artist: "Original Artist",
  genre: "classical",
  difficulty: 3,
  duration_sec: 90,
  note_count: 180,
  content_rights: "user-upload",
  source_url: null,
  file_path: "/tmp/original.mid",
  uploader_id: "owner-1",
  ...overrides,
});

function mockSongsDb(rows: SongRow[]) {
  vi.clearAllMocks();
  const songs = new Map(rows.map((song) => [song.id, { ...song }]));
  prismaMock.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    role: where.id === "admin-1" ? "admin" : "user",
  }));
  prismaMock.song.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    return songs.get(where.id) ?? null;
  });
  prismaMock.song.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Partial<SongRow> }) => {
      const song = songs.get(where.id);
      if (!song) throw new Error("Song not found");
      songs.set(song.id, { ...song, ...data });
      return songs.get(song.id);
    },
  );
  prismaMock.song.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const song = songs.get(where.id);
    if (!song) throw new Error("Song not found");
    songs.delete(song.id);
    return song;
  });
  prismaMock.song.findUniqueOrThrow.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const song = songs.get(where.id);
    if (!song) throw new Error("Song not found");
    return song;
  });
  return songs;
}

async function patchSong(userId: string, songId: string, body: Record<string, unknown>) {
  return await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    let status = 200;
    let settled = false;
    const req = {
      method: "PATCH",
      url: `/songs/${songId}`,
      originalUrl: `/songs/${songId}`,
      baseUrl: "",
      path: `/songs/${songId}`,
      headers: { "content-type": "application/json" },
      body,
      userId,
    } as Request;
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

    (songsRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error instanceof ZodError) {
          resolve({
            status: 400,
            body: {
              error: { code: "validation_error", message: "Request validation failed", details: error.flatten() },
            },
          });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({
            status: 404,
            body: { error: { code: "not_found", message: `No route for PATCH /songs/${songId}` } },
          });
        }
      },
    );
  });
}

async function callSongsRouter(options: {
  method: string;
  url: string;
  userId: string;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: Buffer;
}) {
  return await new Promise<{
    status: number;
    body: unknown;
    headers: Record<string, string>;
  }>((resolve, reject) => {
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

    (songsRouter as unknown as (req: Request, res: Response, next: (error?: unknown) => void) => void)(
      req,
      res,
      (error?: unknown) => {
        if (error instanceof ZodError) {
          resolve({
            status: 400,
            body: {
              error: { code: "validation_error", message: "Request validation failed", details: error.flatten() },
            },
            headers,
          });
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        if (!settled) {
          resolve({
            status: 404,
            body: { error: { code: "not_found", message: `No route for ${options.method} ${options.url}` } },
            headers,
          });
        }
      },
    );
  });
}

describe("POST /songs/fetch-url-preview", () => {
  it("returns a clear 4xx error when SSRF protection blocks the target URL", async () => {
    vi.clearAllMocks();
    ssrfMock.fetchUrlSafely.mockRejectedValueOnce(new ssrfMock.SsrfBlockedError("Refusing to connect to localhost"));

    const response = await callSongsRouter({
      method: "POST",
      url: "/songs/fetch-url-preview",
      userId: "owner-1",
      headers: { "content-type": "application/json" },
      body: { url: "http://127.0.0.1:1/whatever" },
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body).toEqual({
      error: { code: "fetch_blocked", message: "Refusing to connect to localhost" },
    });
  });

  it("returns fetched MIDI bytes with extracted metadata headers", async () => {
    vi.clearAllMocks();
    const bytes = Buffer.from(buildMidi(80));
    ssrfMock.fetchUrlSafely.mockResolvedValueOnce(bytes);

    const response = await callSongsRouter({
      method: "POST",
      url: "/songs/fetch-url-preview",
      userId: "owner-1",
      headers: { "content-type": "application/json" },
      body: { url: "https://example.com/song.mid" },
    });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("audio/midi");
    expect(response.headers["x-song-duration-sec"]).toBeTruthy();
    expect(response.headers["x-song-note-count"]).toBe("80");
    expect(response.headers["x-song-difficulty"]).toBeTruthy();
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect((response.body as Buffer).equals(bytes)).toBe(true);
    expect(ssrfMock.fetchUrlSafely).toHaveBeenCalledWith("https://example.com/song.mid", {
      maxBytes: 1024 * 1024,
      timeoutMs: 10_000,
    });
  });
});

describe("POST /songs/upload", () => {
  it("stores source_url provenance for URL imports", async () => {
    vi.clearAllMocks();
    const bytes = Buffer.from(buildMidi(80));
    const created = uploadedSong({
      id: "song-import-1",
      title: "Imported Song",
      artist: "URL Artist",
      genre: "game",
      content_rights: "user-import-url",
      source_url: "https://example.com/song.mid",
      file_path: "pending",
    });
    const updated = uploadedSong({ ...created, file_path: "/tmp/upload-song-import-1.mid" });
    prismaMock.song.create.mockResolvedValueOnce(created);
    prismaMock.song.update.mockResolvedValueOnce(updated);

    const response = await callSongsRouter({
      method: "POST",
      url: "/songs/upload?title=Imported%20Song&artist=URL%20Artist&genre=game&source_url=https%3A%2F%2Fexample.com%2Fsong.mid",
      userId: "owner-1",
      headers: { "content-type": "audio/midi", "content-length": String(bytes.length) },
      rawBody: bytes,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "song-import-1", content_rights: "user-import-url", mine: true });
    expect(prismaMock.song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Imported Song",
        artist: "URL Artist",
        genre: "game",
        content_rights: "user-import-url",
        source_url: "https://example.com/song.mid",
        uploader_id: "owner-1",
      }),
    });
  });

  it("keeps direct uploads as user-upload when source_url is omitted", async () => {
    vi.clearAllMocks();
    const bytes = Buffer.from(buildMidi(80));
    const created = uploadedSong({ id: "song-upload-1", title: "Direct Song", artist: "Direct Artist", file_path: "pending" });
    const updated = uploadedSong({ ...created, file_path: "/tmp/upload-song-upload-1.mid" });
    prismaMock.song.create.mockResolvedValueOnce(created);
    prismaMock.song.update.mockResolvedValueOnce(updated);

    const response = await callSongsRouter({
      method: "POST",
      url: "/songs/upload?title=Direct%20Song&artist=Direct%20Artist",
      userId: "owner-1",
      headers: { "content-type": "audio/midi", "content-length": String(bytes.length) },
      rawBody: bytes,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "song-upload-1", content_rights: "user-upload", mine: true });
    expect(prismaMock.song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Direct Song",
        artist: "Direct Artist",
        genre: "other",
        content_rights: "user-upload",
        source_url: null,
        uploader_id: "owner-1",
      }),
    });
  });

  it("stores recording uploads as user-recording", async () => {
    vi.clearAllMocks();
    const bytes = Buffer.from(buildMidi(80));
    const created = uploadedSong({
      id: "song-recording-1",
      title: "Recorded Song",
      artist: "Me",
      content_rights: "user-recording",
      file_path: "pending",
    });
    const updated = uploadedSong({ ...created, file_path: "/tmp/upload-song-recording-1.mid" });
    prismaMock.song.create.mockResolvedValueOnce(created);
    prismaMock.song.update.mockResolvedValueOnce(updated);

    const response = await callSongsRouter({
      method: "POST",
      url: "/songs/upload?title=Recorded%20Song&artist=Me&origin=recording",
      userId: "owner-1",
      headers: { "content-type": "audio/midi", "content-length": String(bytes.length) },
      rawBody: bytes,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ id: "song-recording-1", content_rights: "user-recording", mine: true });
    expect(prismaMock.song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Recorded Song",
        artist: "Me",
        genre: "other",
        content_rights: "user-recording",
        source_url: null,
        uploader_id: "owner-1",
      }),
    });
  });
});

describe("PATCH /songs/:id", () => {
  it("lets the uploader edit title, artist, and genre", async () => {
    const songs = mockSongsDb([uploadedSong()]);

    const response = await patchSong("owner-1", "song-owner-1", {
      title: "Updated Title",
      artist: "Updated Artist",
      genre: "jazz",
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "song-owner-1",
      title: "Updated Title",
      artist: "Updated Artist",
      genre: "jazz",
      difficulty: 3,
      mine: true,
    });
    expect(songs.get("song-owner-1")).toMatchObject({
      title: "Updated Title",
      artist: "Updated Artist",
      genre: "jazz",
    });
  });

  it("returns 403 when a different non-admin user edits someone else's song", async () => {
    mockSongsDb([uploadedSong()]);

    const response = await patchSong("other-user", "song-owner-1", { title: "Not Yours" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "forbidden", message: "You can only edit songs you uploaded" },
    });
  });

  it("returns 403 when a non-admin user edits a public library song", async () => {
    mockSongsDb([uploadedSong({ id: "seed-public-1", uploader_id: null, content_rights: "public-domain" })]);

    const response = await patchSong("owner-1", "seed-public-1", { title: "Public Edit" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "forbidden", message: "You can only edit songs you uploaded" },
    });
  });

  it("returns 404 when the song does not exist", async () => {
    mockSongsDb([]);

    const response = await patchSong("owner-1", "missing-song", { title: "Ghost Song" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { code: "not_found", message: "Song not found" },
    });
  });

  it("does not accept difficulty as a patch field", async () => {
    mockSongsDb([uploadedSong()]);

    const response = await patchSong("owner-1", "song-owner-1", { difficulty: 5 });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({ code: "validation_error" });
    expect(prismaMock.song.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /admin/songs/:id", () => {
  it("lets an admin delete a song they do not own", async () => {
    const songs = mockSongsDb([uploadedSong({ id: "song-other-1", uploader_id: "owner-1" })]);

    const response = await callSongsRouter({
      method: "DELETE",
      url: "/admin/songs/song-other-1",
      userId: "admin-1",
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(songs.has("song-other-1")).toBe(false);
    expect(prismaMock.song.delete).toHaveBeenCalledWith({ where: { id: "song-other-1" } });
  });

  it("does not let a non-admin delete another user's song", async () => {
    const songs = mockSongsDb([uploadedSong({ id: "song-other-1", uploader_id: "owner-1" })]);

    const response = await callSongsRouter({
      method: "DELETE",
      url: "/admin/songs/song-other-1",
      userId: "other-user",
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: { code: "forbidden", message: "Admin access required" },
    });
    expect(songs.has("song-other-1")).toBe(true);
    expect(prismaMock.song.delete).not.toHaveBeenCalled();
  });
});
