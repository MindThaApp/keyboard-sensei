# Song Library Management + URL Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit their own uploaded songs' metadata after the fact, and import a song from a URL with a real preview step before committing — both scoped to the existing per-user-private song library.

**Architecture:** Backend-first: a new owner-scoped `PATCH /songs/:id`, a hardened server-side URL-fetch-and-preview endpoint (`POST /songs/fetch-url-preview`), and a small additive change to the existing upload endpoint to record provenance (`source_url`, `content_rights`). Frontend: an inline edit affordance in the existing song list, and a second "Import from URL" mode alongside the existing upload dialog.

**Tech Stack:** `apps/api` (Express 5/Prisma/PostgreSQL/Zod, adding `undici` for the hardened fetch), `apps/web` (React/TS), reusing the existing `parsePlayAlongSong`/`pianoSynth` preview utilities.

## Global Constraints

- Every ownership check on a user-facing song route must mirror the existing `DELETE /songs/:id` pattern exactly (fetch/verify `uploader_id === userId`, or an atomic `updateMany` with `uploader_id` in the `where` clause) — never the admin route's bare `update({ where: { id } })`, which has no ownership predicate.
- The SSRF-safety requirement in the design spec is binding: connect-time IP validation via a custom `undici` connector, not a pre-flight-check-then-fetch pattern. This applies to every hop, including redirects.
- No test-library exists for React components in this repo — UI changes are verified manually in-browser, matching established practice. Backend logic (ownership checks, the IP-range validator, SSRF fetch behavior) gets real `vitest` tests.
- Run `pnpm --filter @keyboard-sensei/api typecheck && pnpm --filter @keyboard-sensei/api test` after backend tasks, `pnpm --filter @keyboard-sensei/web typecheck` after frontend tasks.

---

### Task 1: `PATCH /songs/:id` — user-facing song edit

**Files:**
- Modify: `apps/api/src/songs.ts`
- Test: `apps/api/src/songs.test.ts`

**Interfaces:**
- Produces: `PATCH /songs/:id` (owner-scoped, non-admin), returning the updated `songListItem` shape on success, 403 if the song exists but isn't the caller's, 404 if it doesn't exist.

- [ ] **Step 1: Write the failing tests**

Check `apps/api/src/songs.test.ts`'s existing setup (test DB/fixtures pattern) before writing — match its existing conventions for creating a test user and a test song. Add tests asserting: (a) the owner can `PATCH` their own song's title/artist/genre and the response reflects the change, (b) a different (non-owner, non-admin) user gets 403 attempting to `PATCH` someone else's song, (c) `PATCH`ing a public/seeded song (`uploader_id: null`) as a non-admin gets 403, (d) `PATCH`ing a nonexistent id gets 404, (e) sending `difficulty` in the body is rejected by the schema (400) or silently ignored — assert the schema does not accept it as a valid field at all (it should not be in the Zod object's shape).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/api test -- songs`
Expected: FAIL — route doesn't exist yet (404 on all cases, or a routing error).

- [ ] **Step 3: Implement the route**

In `apps/api/src/songs.ts`, add near the existing `DELETE /songs/:id` route:

```ts
const songPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    artist: z.string().trim().min(1).max(120).optional(),
    genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Supply at least one field");

songsRouter.patch("/songs/:id", async (req, res, next) => {
  try {
    const userId = uid(req);
    const songId = z.string().parse(req.params.id);
    const input = songPatchSchema.parse(req.body);
    const result = await prisma.song.updateMany({ where: { id: songId, uploader_id: userId }, data: input });
    if (result.count === 0) {
      const exists = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
      if (!exists) {
        res.status(404).json({ error: { code: "not_found", message: "Song not found" } });
        return;
      }
      res.status(403).json({ error: { code: "forbidden", message: "You can only edit songs you uploaded" } });
      return;
    }
    const updated = await prisma.song.findUniqueOrThrow({ where: { id: songId } });
    res.json(songListItem(updated, userId));
  } catch (e) {
    next(e);
  }
});
```

(This intentionally does not accept `difficulty` — the schema's shape has no such field, so any `difficulty` sent in the request body is silently dropped by Zod's default stripping behavior, same as any other unrecognized field.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/api test -- songs`
Expected: PASS, all new tests plus every pre-existing test in this file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/songs.ts apps/api/src/songs.test.ts
git commit -m "feat(api): user-facing PATCH /songs/:id, owner-scoped"
```

---

### Task 2: Manage-library UI (edit your own uploads)

**Files:**
- Modify: `apps/web/src/services/api.ts`
- Modify: `apps/web/src/components/play/SongBrowserPage.tsx`

**Interfaces:**
- Consumes: `PATCH /songs/:id` from Task 1.
- Produces: `updateSong(id, fields)` client helper.

- [ ] **Step 1: Add the client API helper**

In `apps/web/src/services/api.ts`, near `adminUpdateSong`, add:

```ts
export const updateSong = (id: string, fields: Partial<{ title: string; artist: string; genre: SongGenre }>) =>
  request<Song>(`/songs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
```

- [ ] **Step 2: Add inline edit state and an edit form to `SongBrowserPage.tsx`**

Import the new helper — find:

```tsx
import { deleteSong, getMyPlayAlongAttempts, getSongs, uploadSong, type Song, type SongGenre } from "../../services/api";
```

Replace with:

```tsx
import { deleteSong, getMyPlayAlongAttempts, getSongs, updateSong, uploadSong, type Song, type SongGenre } from "../../services/api";
```

Add a small inline-edit sub-component, just above `export default function SongBrowserPage()`:

```tsx
function EditSongRow({ song, onSaved, onCancel }: { song: Song; onSaved: (song: Song) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState<SongGenre>(song.genre);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return;
    setState("saving");
    setError(null);
    try {
      onSaved(await updateSong(song.id, { title: title.trim(), artist: artist.trim() || "Unknown", genre }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
      setState("idle");
    }
  };

  const field = "rounded-md border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600";
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
      <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
        {GENRES.filter((g) => g.value !== "all").map((g) => (
          <option key={g.value} value={g.value}>{g.label}</option>
        ))}
      </select>
      <button className="primary-button px-2 py-1 text-xs" disabled={!title.trim() || state === "saving"} onClick={() => void save()}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button className="secondary-button px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>
      {error && <p role="alert" className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </li>
  );
}
```

- [ ] **Step 3: Wire edit state into the song list**

Find the `export default function SongBrowserPage()` component's state declarations:

```tsx
  const [uploading, setUploading] = useState(false);
```

Replace with:

```tsx
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
```

Find the list rendering:

```tsx
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.map((song) => {
          const best = bests[song.id];
          return (
            <li key={song.id}>
              <Link
                to={`/play/${song.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ivory-50 dark:hover:bg-slate-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-xs text-slate-500">{song.artist}</p>
                </div>
                {song.mine && (
                  <button
                    onClick={(e) => { e.preventDefault(); void removeSong(song); }}
                    className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  >
                    Delete
                  </button>
                )}
```

Replace with:

```tsx
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.map((song) => {
          const best = bests[song.id];
          if (editingId === song.id) {
            return (
              <EditSongRow
                key={song.id}
                song={song}
                onSaved={(updated) => {
                  setSongs((current) => current?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) ?? null);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <li key={song.id}>
              <Link
                to={`/play/${song.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ivory-50 dark:hover:bg-slate-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-xs text-slate-500">{song.artist}</p>
                </div>
                {song.mine && (
                  <>
                    <button
                      onClick={(e) => { e.preventDefault(); setEditingId(song.id); }}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); void removeSong(song); }}
                      className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                    >
                      Delete
                    </button>
                  </>
                )}
```

(The rest of that `<li>`'s content — genre badge, difficulty dots, duration, best score — is unchanged; only the opening structure and the `song.mine` button block change.)

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, log in, go to `/play`, upload a test song (or use one you already own), click "Edit," change the title, save, confirm it updates in the list and persists after a page reload. Confirm "Edit"/"Delete" only appear on your own uploads, never on public library songs.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/services/api.ts apps/web/src/components/play/SongBrowserPage.tsx
git commit -m "feat(web): inline edit for your own uploaded songs"
```

---

### Task 3: SSRF-safe URL fetcher

**Files:**
- Create: `apps/api/src/ssrf-safe-fetch.ts`
- Test: `apps/api/src/ssrf-safe-fetch.test.ts`
- Modify: `apps/api/package.json` (add `undici` dependency)

**Interfaces:**
- Produces: `isDisallowedIp(address: string): boolean`, `SsrfBlockedError`, `fetchUrlSafely(url: string, opts: { maxBytes: number; timeoutMs: number }): Promise<Buffer>` — consumed by Task 4's new endpoint.

- [ ] **Step 1: Add `undici` as a dependency**

Run: `cd apps/api && pnpm add undici`
(Node's global `fetch` is undici-backed internally but doesn't expose the `Agent`/custom-connector API needed here — this needs the package directly. Use whatever current stable version `pnpm add` resolves; this repo doesn't pin an unusual Node version that would need an older undici major.)

- [ ] **Step 2: Write failing tests for `isDisallowedIp`**

Create `apps/api/src/ssrf-safe-fetch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isDisallowedIp } from "./ssrf-safe-fetch.js";

describe("isDisallowedIp", () => {
  it("blocks standard private IPv4 ranges", () => {
    expect(isDisallowedIp("10.0.0.1")).toBe(true);
    expect(isDisallowedIp("172.16.0.1")).toBe(true);
    expect(isDisallowedIp("172.31.255.255")).toBe(true);
    expect(isDisallowedIp("192.168.1.1")).toBe(true);
  });

  it("blocks loopback, link-local (incl. cloud metadata), and 0.0.0.0", () => {
    expect(isDisallowedIp("127.0.0.1")).toBe(true);
    expect(isDisallowedIp("169.254.169.254")).toBe(true);
    expect(isDisallowedIp("0.0.0.0")).toBe(true);
  });

  it("blocks multicast/reserved IPv4 (>=224)", () => {
    expect(isDisallowedIp("224.0.0.1")).toBe(true);
    expect(isDisallowedIp("240.0.0.1")).toBe(true);
  });

  it("allows ordinary public IPv4 addresses", () => {
    expect(isDisallowedIp("8.8.8.8")).toBe(false);
    expect(isDisallowedIp("93.184.216.34")).toBe(false);
  });

  it("blocks IPv6 loopback, unique-local, and link-local", () => {
    expect(isDisallowedIp("::1")).toBe(true);
    expect(isDisallowedIp("fc00::1")).toBe(true);
    expect(isDisallowedIp("fd12:3456::1")).toBe(true);
    expect(isDisallowedIp("fe80::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses that embed a disallowed IPv4 address", () => {
    expect(isDisallowedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isDisallowedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows an IPv4-mapped IPv6 address that embeds a public IPv4 address", () => {
    expect(isDisallowedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on a string that isn't a recognizable IP literal", () => {
    expect(isDisallowedIp("not-an-ip")).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/api test -- ssrf-safe-fetch`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 4: Implement `isDisallowedIp`, `SsrfBlockedError`, and `fetchUrlSafely`**

Create `apps/api/src/ssrf-safe-fetch.ts`:

```ts
import { Agent, fetch as undiciFetch } from "undici";
import { connect as netConnect, isIPv4, isIPv6 } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { lookup } from "node:dns/promises";

export class SsrfBlockedError extends Error {}

/**
 * Blocks private/reserved/loopback/link-local addresses (including the
 * common cloud-metadata address 169.254.169.254) across both IPv4 and the
 * IPv6 forms that alias them (IPv4-mapped, unique-local, link-local).
 * Fails closed on anything it doesn't recognize as a literal IP.
 */
export function isDisallowedIp(address: string): boolean {
  if (isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("::ffff:")) {
      const embedded = normalized.slice("::ffff:".length);
      return isIPv4(embedded) ? isDisallowedIp(embedded) : true;
    }
    if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) return true; // fc00::/7 unique-local
    return false;
  }
  return true;
}

/**
 * A custom undici connector that resolves the target hostname and validates
 * the resolved IP BEFORE connecting — and connects directly to that
 * validated IP (not a second hostname lookup), so there's no window between
 * "checked" and "connected" for a DNS answer to change (rebinding), and
 * every redirect hop goes through this same connector since it's the
 * Agent's own connect function, not a one-time pre-flight check.
 */
function buildSafeAgent(): Agent {
  return new Agent({
    connect: async (options: { hostname: string; port?: number; protocol?: string }, callback: (err: Error | null, socket: unknown) => void) => {
      try {
        const resolved = await lookup(options.hostname);
        if (isDisallowedIp(resolved.address)) {
          callback(new SsrfBlockedError(`Refusing to connect to ${options.hostname} (resolves to a private/reserved address)`), null);
          return;
        }
        const connectOptions = { host: resolved.address, port: options.port, servername: options.hostname };
        const socket = options.protocol === "https:" ? tlsConnect(connectOptions) : netConnect(connectOptions);
        socket.once("error", (err: Error) => callback(err, null));
        socket.once("connect", () => callback(null, socket));
      } catch (err) {
        callback(err as Error, null);
      }
    },
  });
}

/** Fetches a URL server-side with SSRF hardening, a streamed byte-size cap, and a timeout. Throws SsrfBlockedError on any safety violation. */
export async function fetchUrlSafely(url: string, opts: { maxBytes: number; timeoutMs: number }): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("Only http/https URLs are allowed");
  }
  const agent = buildSafeAgent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await undiciFetch(url, {
      dispatcher: agent,
      signal: controller.signal,
      headers: { "accept-encoding": "identity" },
    });
    if (!response.ok || !response.body) {
      throw new SsrfBlockedError(`Fetch failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel();
        throw new SsrfBlockedError(`Response exceeds ${opts.maxBytes} byte limit`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
    await agent.close();
  }
}
```

**Important verification step, not optional:** `undici`'s exact `Agent`'s `connect` option type signature (parameter names/shape) can differ slightly between major versions. Immediately after `pnpm add undici`, check the installed package's TypeScript types (e.g. `node_modules/undici/types/connector.d.ts` or equivalent, or run `pnpm --filter @keyboard-sensei/api typecheck` and read any type errors) and adjust the `connect` function's parameter types/field names to match exactly — the logic above is correct in intent (resolve once, validate, connect to the validated IP directly, set `servername` for TLS SNI/cert validation), but the exact undici API surface must be confirmed against what's actually installed, not assumed from this plan alone.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/api typecheck && pnpm --filter @keyboard-sensei/api test -- ssrf-safe-fetch`
Expected: PASS, all `isDisallowedIp` tests.

(The full connect-time-validation behavior — a live redirect to a private address actually getting blocked — is inherently hard to unit test cleanly, since any local test server necessarily runs on loopback, which is itself in the blocked range. `isDisallowedIp`'s exhaustive coverage above is the high-value, fully-testable core of this safety mechanism; verify the full connector wiring manually in Task 4's manual verification step instead of forcing a brittle automated integration test here.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ssrf-safe-fetch.ts apps/api/src/ssrf-safe-fetch.test.ts apps/api/package.json
git commit -m "feat(api): SSRF-safe URL fetcher with connect-time IP validation"
```

---

### Task 4: `POST /songs/fetch-url-preview` + provenance in `/songs/upload`

**Files:**
- Modify: `apps/api/src/songs.ts`
- Test: `apps/api/src/songs.test.ts`
- Modify: `apps/api/prisma/schema.prisma` (no new field needed — `source_url` already exists and is unused; this task is the first to populate it)

**Interfaces:**
- Consumes: `fetchUrlSafely`, `isDisallowedIp` from Task 3.
- Produces: `POST /songs/fetch-url-preview`; `/songs/upload` gains an optional `source_url` query param.

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/songs.test.ts`: a test that `POST /songs/fetch-url-preview` with a URL resolving to a private address (e.g. mock/stub `fetchUrlSafely` to throw `SsrfBlockedError`, or use a URL like `http://127.0.0.1:1/whatever` which will fail fast) returns a 4xx with a clear error, not a 500 or a silent pass-through. Add a test that a successful fetch (mock `fetchUrlSafely` to resolve with valid MIDI bytes, reusing an existing test fixture MIDI buffer already used elsewhere in this test file) returns 200 with the bytes and extracted metadata. Add a test that `/songs/upload?...&source_url=https://example.com/song.mid` sets `content_rights: "user-import-url"` and stores the `source_url` on the created row, while omitting `source_url` still produces `content_rights: "user-upload"` exactly as today (regression check — must not break existing behavior for direct uploads with no URL).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/api test -- songs`
Expected: FAIL — route/behavior don't exist yet.

- [ ] **Step 3: Implement `POST /songs/fetch-url-preview`**

In `apps/api/src/songs.ts`, add the import:

```ts
import { fetchUrlSafely, SsrfBlockedError } from "./ssrf-safe-fetch.js";
```

Add a rate limiter mirroring `apps/api/src/feedback.ts`'s pattern (near the top of the file, alongside the other module-level consts):

```ts
// Light in-memory rate limit: 10 URL-fetch attempts per user per hour — this
// endpoint makes an outbound request on the user's behalf, the one genuinely
// new server-side risk surface in this feature. Not a hard security
// boundary, same posture as the feedback widget's identical pattern.
const FETCH_RATE_LIMIT = 10;
const FETCH_RATE_WINDOW_MS = 60 * 60 * 1000;
const recentFetchByUser = new Map<string, number[]>();
const isFetchRateLimited = (userId: string): boolean => {
  const now = Date.now();
  const timestamps = (recentFetchByUser.get(userId) ?? []).filter((t) => now - t < FETCH_RATE_WINDOW_MS);
  if (timestamps.length >= FETCH_RATE_LIMIT) return true;
  timestamps.push(now);
  recentFetchByUser.set(userId, timestamps);
  return false;
};

const urlPreviewSchema = z.object({ url: z.string().trim().url().max(2000) });
```

Add the route, near the existing `/songs/upload` route:

```ts
songsRouter.post("/songs/fetch-url-preview", async (req, res, next) => {
  try {
    const userId = uid(req);
    if (isFetchRateLimited(userId)) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many import attempts — try again later" } });
      return;
    }
    const { url } = urlPreviewSchema.parse(req.body);
    let bytes: Buffer;
    try {
      bytes = await fetchUrlSafely(url, { maxBytes: 1024 * 1024, timeoutMs: 10_000 });
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        res.status(422).json({ error: { code: "fetch_blocked", message: error.message } });
        return;
      }
      throw error;
    }
    let metadata: SongMetadata;
    try {
      metadata = extractSongMetadata(new Uint8Array(bytes));
    } catch (error) {
      if (error instanceof InvalidMidiError) {
        res.status(422).json({ error: { code: "invalid_midi", message: error.message } });
        return;
      }
      throw error;
    }
    res.set("x-song-duration-sec", String(metadata.durationSec));
    res.set("x-song-note-count", String(metadata.noteCount));
    res.set("x-song-difficulty", String(metadata.difficulty));
    res.type("audio/midi").send(bytes);
  } catch (e) {
    next(e);
  }
});
```

(Returning metadata via response headers, alongside the raw bytes as the body — matching how `/songs/upload` already takes raw bytes, avoiding base64-in-JSON's ~33% size inflation.)

- [ ] **Step 4: Thread `source_url`/`content_rights` through `/songs/upload`**

Find:

```ts
const uploadQuerySchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(120).default("Unknown"),
  genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).default("other"),
});
```

Replace with:

```ts
const uploadQuerySchema = z.object({
  title: z.string().trim().min(1).max(120),
  artist: z.string().trim().min(1).max(120).default("Unknown"),
  genre: z.enum(["classical", "pop", "film", "game", "jazz", "other"]).default("other"),
  source_url: z.string().trim().url().max(2000).optional(),
});
```

Find:

```ts
      const song = await prisma.song.create({
        data: {
          title: query.title,
          artist: query.artist,
          genre: query.genre,
          difficulty: metadata.difficulty,
          duration_sec: metadata.durationSec,
          note_count: metadata.noteCount,
          content_rights: "user-upload",
          file_path: "pending",
          uploader_id: userId,
        },
      });
```

Replace with:

```ts
      const song = await prisma.song.create({
        data: {
          title: query.title,
          artist: query.artist,
          genre: query.genre,
          difficulty: metadata.difficulty,
          duration_sec: metadata.durationSec,
          note_count: metadata.noteCount,
          content_rights: query.source_url ? "user-import-url" : "user-upload",
          source_url: query.source_url ?? null,
          file_path: "pending",
          uploader_id: userId,
        },
      });
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/api test -- songs`
Expected: PASS, all new and pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/songs.ts apps/api/src/songs.test.ts
git commit -m "feat(api): POST /songs/fetch-url-preview, source_url provenance on upload"
```

---

### Task 5: Client API helpers for URL import

**Files:**
- Modify: `apps/web/src/services/api.ts`

**Interfaces:**
- Produces: `fetchUrlPreview(url)`, an updated `uploadSong` accepting an optional `source_url`.

- [ ] **Step 1: Add `fetchUrlPreview` and update `uploadSong`**

Find:

```ts
export const uploadSong = async (file: File, meta: { title: string; artist: string; genre: SongGenre }): Promise<Song> => {
  const token = getToken();
  const params = new URLSearchParams({ title: meta.title, artist: meta.artist, genre: meta.genre });
  const response = await fetch(`${API_URL}/songs/upload?${params}`, {
    method: "POST",
    headers: { "content-type": "audio/midi", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = await response.json().catch(() => null) as (Song & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  return body as Song;
};
```

Replace with:

```ts
export const uploadSong = async (
  file: File | Blob,
  meta: { title: string; artist: string; genre: SongGenre; source_url?: string },
): Promise<Song> => {
  const token = getToken();
  const params = new URLSearchParams({ title: meta.title, artist: meta.artist, genre: meta.genre });
  if (meta.source_url) params.set("source_url", meta.source_url);
  const response = await fetch(`${API_URL}/songs/upload?${params}`, {
    method: "POST",
    headers: { "content-type": "audio/midi", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: file,
  });
  const body = await response.json().catch(() => null) as (Song & { error?: { message?: string } }) | null;
  if (!response.ok) throw new Error(body?.error?.message ?? `Upload failed (${response.status})`);
  return body as Song;
};

export interface UrlPreview {
  bytes: ArrayBuffer;
  durationSec: number;
  noteCount: number;
  difficulty: number;
}

export const fetchUrlPreview = async (url: string): Promise<UrlPreview> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/songs/fetch-url-preview`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Could not fetch that URL (${response.status})`);
  }
  return {
    bytes: await response.arrayBuffer(),
    durationSec: Number(response.headers.get("x-song-duration-sec") ?? 0),
    noteCount: Number(response.headers.get("x-song-note-count") ?? 0),
    difficulty: Number(response.headers.get("x-song-difficulty") ?? 1),
  };
};
```

(`uploadSong`'s `file` parameter widened from `File` to `File | Blob` since the URL-import flow's confirm step will pass a `Blob` built from the previewed bytes, not a `File` from a file input.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/api.ts
git commit -m "feat(web): client API helpers for URL-import preview"
```

---

### Task 6: Import-from-URL UI with preview

**Files:**
- Modify: `apps/web/src/components/play/SongBrowserPage.tsx`

**Interfaces:**
- Consumes: `fetchUrlPreview`, `uploadSong` (Task 5), `parsePlayAlongSong` (existing, `apps/web/src/utils/playalongSong.ts`), `pianoSynth` (existing, `apps/web/src/utils/synth.ts`).

- [ ] **Step 1: Read the current `pianoSynth` interface**

Before writing this step, read `apps/web/src/utils/synth.ts` to confirm the exact exported API (`pianoSynth.playNote`/`.stopNote` or equivalent) — the code below assumes a `playNote(midi: number, velocity: number)`/`stopNote(midi: number)` shape matching how `playalongEngine.ts` already calls it; adjust to match whatever the actual exported signature is if it differs.

- [ ] **Step 2: Add a "Import from URL" mode alongside the existing upload dialog**

Add a new component just above `UploadDialog` in `SongBrowserPage.tsx`:

```tsx
function ImportFromUrlDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [state, setState] = useState<"idle" | "fetching" | "playing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchPreview = async () => {
    if (!url.trim()) return;
    setState("fetching");
    setError(null);
    setPreview(null);
    try {
      const result = await fetchUrlPreview(url.trim());
      setPreview(result);
      if (!title) {
        const guess = url.split("/").pop()?.replace(/\.midi?$/i, "").replace(/[-_]/g, " ") ?? "Imported song";
        setTitle(guess);
      }
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that URL");
      setState("idle");
    }
  };

  const playPreview = () => {
    if (!preview) return;
    setState("playing");
    const parsed = parsePlayAlongSong(preview.bytes);
    let lastEnd = 0;
    for (const note of parsed.notes) {
      const onMs = note.startS * 1000;
      const offMs = onMs + note.durationS * 1000;
      lastEnd = Math.max(lastEnd, offMs);
      setTimeout(() => pianoSynth.playNote(note.midi, 90), onMs);
      setTimeout(() => pianoSynth.stopNote(note.midi), offMs);
    }
    setTimeout(() => setState("idle"), lastEnd + 150);
  };

  const confirmImport = async () => {
    if (!preview || !title.trim()) return;
    setState("saving");
    setError(null);
    try {
      const blob = new Blob([preview.bytes], { type: "audio/midi" });
      onDone(await uploadSong(blob, { title: title.trim(), artist: artist.trim() || "Unknown", genre, source_url: url.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setState("idle");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <section aria-label="Import from URL" className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Import from a URL</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Paste a link to a .mid file. Imported songs are private to you, and unverified for rights — you're responsible for making sure you're allowed to use whatever you import.
      </p>
      <div className="flex gap-2">
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/song.mid"
        />
        <button className="secondary-button whitespace-nowrap text-sm" disabled={!url.trim() || state === "fetching"} onClick={() => void fetchPreview()}>
          {state === "fetching" ? "Fetching…" : "Fetch"}
        </button>
      </div>
      {preview && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-500">Title
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-xs text-slate-500">Artist
              <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Unknown" />
            </label>
          </div>
          <label className="block text-xs text-slate-500">Genre
            <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
              {GENRES.filter((g) => g.value !== "all").map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            {formatDuration(preview.durationSec)} · {preview.noteCount} notes · difficulty {preview.difficulty}
          </p>
          <button className="secondary-button text-sm" disabled={state === "playing"} onClick={playPreview}>
            {state === "playing" ? "Playing…" : "▶ Preview"}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" disabled={!preview || !title.trim() || state === "saving"} onClick={() => void confirmImport()}>
          {state === "saving" ? "Adding…" : "Add to my library"}
        </button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add the imports this needs**

Find:

```tsx
import { deleteSong, getMyPlayAlongAttempts, getSongs, updateSong, uploadSong, type Song, type SongGenre } from "../../services/api";
```

Replace with:

```tsx
import { deleteSong, fetchUrlPreview, getMyPlayAlongAttempts, getSongs, updateSong, uploadSong, type Song, type SongGenre, type UrlPreview } from "../../services/api";
import { parsePlayAlongSong } from "../../utils/playalongSong";
import { pianoSynth } from "../../utils/synth";
```

- [ ] **Step 4: Add a mode switch next to the existing upload toggle**

Find:

```tsx
        <button className="secondary-button ml-auto text-sm" onClick={() => setUploading((value) => !value)}>
          Upload MIDI
        </button>
      </div>

      {uploading && (
        <UploadDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(false); }}
          onCancel={() => setUploading(false)}
        />
      )}
```

Replace with:

```tsx
        <div className="ml-auto flex gap-2">
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "file" ? null : "file")); }}>
            Upload MIDI
          </button>
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "url" ? null : "url")); }}>
            Import from URL
          </button>
        </div>
      </div>

      {uploading === "file" && (
        <UploadDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(null); }}
          onCancel={() => setUploading(null)}
        />
      )}
      {uploading === "url" && (
        <ImportFromUrlDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(null); }}
          onCancel={() => setUploading(null)}
        />
      )}
```

Find the `uploading` state declaration:

```tsx
  const [uploading, setUploading] = useState(false);
```

Replace with:

```tsx
  const [uploading, setUploading] = useState<"file" | "url" | null>(null);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, log in, go to `/play`, click "Import from URL," paste a real small public `.mid` file URL, click Fetch, confirm the preview metadata appears, click "▶ Preview" and confirm you hear it play, fill in title, click "Add to my library," confirm it appears in your song list (and only your view — check with a second account or the admin view that it's not public), and confirm it's actually playable via Play-Along afterward. Also try a URL that isn't a valid MIDI file and confirm a clear error, and (if feasible) a URL pointing at an internal/private address to confirm the fetch is refused rather than silently succeeding.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/play/SongBrowserPage.tsx
git commit -m "feat(web): import-from-URL flow with preview before committing"
```

---

## Self-Review

**Spec coverage:** §1 (manage library) → Tasks 1-2. §2 (URL import with preview, SSRF hardening) → Tasks 3-6.

**Placeholder scan:** none — every step has complete code or exact commands. Task 3's `undici` API-shape verification note is an explicit, named uncertainty to resolve during implementation (real undici version-surface risk), not a vague placeholder.

**Type consistency:** `UrlPreview` (Task 5) is used identically by `ImportFromUrlDialog` (Task 6). `uploadSong`'s widened `File | Blob` parameter (Task 5) matches the `Blob` actually constructed and passed in Task 6.
