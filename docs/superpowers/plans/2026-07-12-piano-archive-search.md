# Bulk Private-Archive Search (PianoCoRe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user search a large (5,625-piece) catalog of piano MIDI works and import a chosen piece into their own private library, with real sheet-music notation (not just falling bars) for archive-imported songs.

**Architecture:** Ingest PianoCoRe's metadata (tiny — a CSV) into a searchable Postgres table now; fetch a specific piece's actual MIDI+MusicXML bytes only when a user imports it (materialize-on-demand, never a bulk-hosted shared mirror, per the dataset's non-commercial/best-effort-rights-cleared license). Render archive-imported songs' notation via OpenSheetMusicDisplay (OSMD) against the real MusicXML, with direct SVG-element manipulation for live note highlighting (confirmed feasible via OSMD's `Cursor`/`GraphicalNote` API) rather than trying to extend this app's own hand-built VexFlow notation renderer to handle full MusicXML.

**Tech Stack:** `apps/api` (Express 5/Prisma/PostgreSQL), `apps/web` (React/TS, adding `opensheetmusicdisplay`).

## Global Constraints

- **This dataset is CC BY-NC-SA 4.0, "strictly for non-commercial research and educational purposes," with a best-effort (not guaranteed) public-domain composer filter.** Nothing built here may create a shared/public mirror of the dataset — imported pieces are private to the importing user only, exactly like existing uploads (`uploader_id` set, never `null`).
- Reuse the existing `extractSongMetadata` validation on every imported MIDI file, same as direct uploads — an archive source doesn't exempt a file from the same piano-suitability/duration/note-count checks.
- No React component-testing library in this repo — UI changes verified manually in-browser. Backend logic (search query, import endpoint, the ingest script's parsing) gets real `vitest` tests where the data doesn't require live network access; anything touching the actual live PianoCoRe hosting is verified manually/by running the real script, not mocked into a false sense of coverage.
- Run `pnpm --filter @keyboard-sensei/api typecheck && pnpm --filter @keyboard-sensei/api test` after backend tasks, `pnpm --filter @keyboard-sensei/web typecheck` after frontend tasks.

---

### Task 1: Confirm the per-piece fetch mechanism (bounded investigation, real deliverable)

**Files:**
- Create: `docs/superpowers/specs/2026-07-12-pianocore-fetch-mechanism.md` (a short findings note, not a full spec — this is a technical decision record for the next tasks to build against)

**Interfaces:**
- Produces: a confirmed, tested HTTP call pattern (or CLI command) for fetching one specific piece's MIDI (and, if available, MusicXML) bytes, that Tasks 3 and 5 will build against.

**Why this task exists:** PianoCoRe is hosted on Zenodo (a static ~16.4GB bulk archive) and mirrored on HuggingFace (`huggingface.co/datasets/SyMuPe/PianoCoRe`, 8.61GB, **stored as Parquet shards**, per HF's standard Datasets format — not a plain folder of individual `.mid`/`.musicxml` files with directly-browsable paths). This means "fetch just one piece's bytes without downloading everything" is NOT a trivial `GET .../resolve/main/<path>.mid` the way a plain file-tree HF repo would allow — it needs one of: (a) HuggingFace's public **Datasets Server REST API** (`https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=<config>&split=<split>&offset=<n>&length=1`), which can return a single row's data (including any binary columns) without downloading a full shard, if this dataset's binary content is stored as inline bytes columns rather than external file references; or (b) if that doesn't pan out, downloading the dataset (or its `metadata.csv`-referenced representative-performance subset) once to a local staging directory and serving individual files from there on demand — not a public mirror, just this server's own local cache, same posture as the existing curated-library `fetch-midi-library.ts` script.

- [ ] **Step 1: Inspect the dataset's actual structure**

Fetch `https://huggingface.co/datasets/SyMuPe/PianoCoRe/tree/main/data` and, if useful, `https://huggingface.co/api/datasets/SyMuPe/PianoCoRe/parquet` (HF's API for listing a dataset's parquet file URLs) to see the actual shard layout, column names/types, and whether there's a MIDI-bytes or MusicXML-bytes column vs. only path references to something else.

- [ ] **Step 2: Test the Datasets Server API against one real row**

Run (adjust `config`/`split` once Step 1 reveals the actual dataset config name — likely `default`/`train`, but confirm):

```bash
curl -s "https://datasets-server.huggingface.co/rows?dataset=SyMuPe/PianoCoRe&config=default&split=train&offset=0&length=1" | head -c 2000
```

Determine: does the response include the MIDI file's bytes (or a usable download reference) for that row? Does it include a MusicXML reference/bytes too? If binary columns are present, are they base64-encoded inline, or are they references to separate files/URLs?

- [ ] **Step 3: Cross-reference against `metadata.csv`**

Fetch a sample of the dataset's `metadata.csv` (referenced in the Zenodo record as "the entry point... contains paths, statistics, and metrics for all samples") to understand what fields it actually has (title, composer, piece id, performance path, duration, alignment/quality flags) — this determines exactly what Task 3's ingest script can populate into `ArchiveEntry` without needing per-piece fetches at ingest time.

- [ ] **Step 4: Write the findings note and decide**

Write `docs/superpowers/specs/2026-07-12-pianocore-fetch-mechanism.md` with: the confirmed working fetch pattern (exact URL template or CLI command, tested against at least one real piece), whether MusicXML is fetchable the same way as MIDI or needs a different mechanism (or isn't practically available per-piece at all, in which case §3a of the design spec's OSMD integration may need to fall back to a smaller, separately-sourced set of pieces that do have fetchable MusicXML, or to the one-time-local-cache fallback), and which of the two architectures (per-row API fetch vs. one-time local staging cache) Tasks 3 and 5 should implement against.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-12-pianocore-fetch-mechanism.md
git commit -m "docs: confirm PianoCoRe per-piece fetch mechanism"
```

---

### Task 2: Data model — `ArchiveEntry` + `Song.notation_path`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: a Prisma migration (via `prisma migrate dev`, run locally against dev Postgres)

**Interfaces:**
- Produces: `ArchiveEntry` model, `Song.notation_path` nullable field — consumed by Tasks 3-5.

- [ ] **Step 1: Add the schema changes**

In `apps/api/prisma/schema.prisma`, add a new model (placement: near `Song`):

```prisma
model ArchiveEntry {
  id           String @id @default(cuid())
  title        String
  composer     String
  duration_sec Float
  note_count   Int
  difficulty   Int
  source_ref   String // resolves to this piece's fetchable MIDI (and MusicXML, if available) location — exact shape decided by Task 1's findings
}
```

Find the `Song` model's field list and add `notation_path`:

```prisma
model Song {
  id             String             @id @default(cuid())
  title          String
  artist         String
  genre          String
  difficulty     Int
  duration_sec   Float
  note_count     Int
  content_rights String
  source_url     String?
  file_path      String
  uploader_id    String?
  created_at     DateTime           @default(now())
  uploader       User?              @relation(fields: [uploader_id], references: [id], onDelete: Cascade)
  attempts       PlayAlongAttempt[]
}
```

becomes (only the added line matters — `notation_path`):

```prisma
model Song {
  id             String             @id @default(cuid())
  title          String
  artist         String
  genre          String
  difficulty     Int
  duration_sec   Float
  note_count     Int
  content_rights String
  source_url     String?
  notation_path  String?
  file_path      String
  uploader_id    String?
  created_at     DateTime           @default(now())
  uploader       User?              @relation(fields: [uploader_id], references: [id], onDelete: Cascade)
  attempts       PlayAlongAttempt[]
}
```

- [ ] **Step 2: Add a full-text-search index**

Postgres FTS over `ArchiveEntry` needs a `tsvector` — Prisma doesn't model generated/computed columns directly in the schema DSL in a fully portable way across versions; add this via raw SQL in the migration itself rather than the Prisma schema (standard practice for FTS with Prisma). After running `prisma migrate dev --name add_archive_entry` (which generates the migration from the schema changes above), manually edit the generated migration SQL file to add:

```sql
ALTER TABLE "ArchiveEntry" ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(composer, ''))) STORED;
CREATE INDEX archive_entry_search_idx ON "ArchiveEntry" USING GIN (search_vector);
```

- [ ] **Step 3: Run the migration locally**

Run: `pnpm db:start` (if Postgres isn't already running), then `pnpm --filter @keyboard-sensei/api prisma:migrate` (or the equivalent `prisma migrate dev` invocation this repo uses — check `apps/api/package.json`'s `prisma:migrate` script).
Expected: migration applies cleanly, `prisma generate` produces `ArchiveEntry`/updated `Song` types.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @keyboard-sensei/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(api): ArchiveEntry model + Song.notation_path field"
```

---

### Task 3: Ingest script — populate `ArchiveEntry` from PianoCoRe metadata

**Files:**
- Create: `apps/api/scripts/ingest-piano-archive.ts`

**Interfaces:**
- Consumes: the fetch mechanism confirmed in Task 1, `extractSongMetadata`-equivalent difficulty heuristic (reuse the same formula already used in `apps/api/scripts/fetch-midi-library.ts` for consistency).
- Produces: populated `ArchiveEntry` rows in the database — one per unique piece (5,625 total), each with a `source_ref` sufficient for Task 5's import endpoint to later fetch that piece's actual files.

- [ ] **Step 1: Read the existing curated-library script for conventions**

Read `apps/api/scripts/fetch-midi-library.ts` in full before writing this one — mirror its structure (a runnable `tsx` script, clear console progress output, writing a manifest/seeding the DB) rather than inventing a new pattern.

- [ ] **Step 2: Implement the ingest script**

Using Task 1's confirmed fetch mechanism, write a script that:
1. Downloads PianoCoRe's `metadata.csv` (and `composers.csv` if composer names in `metadata.csv` are only IDs/abbreviated).
2. Parses it, groups rows by unique piece (title+composer, or however Task 1's investigation found pieces are identified — e.g. a `piece_id` column), and picks one representative performance per piece (prefer the highest quality-labeled one if a quality/alignment flag column exists, per the dataset's own quality classifier — otherwise the first one encountered).
3. For each unique piece, computes `duration_sec`/`note_count` from the metadata columns if present, or (if not directly available) leaves them as `0`/estimated and does NOT fetch every single file's actual bytes just to compute exact stats at ingest time — that would defeat the whole "don't bulk-download" point. If `metadata.csv` doesn't carry duration/note-count directly, note this explicitly in the script's comments and use a placeholder difficulty (recompute properly at import-time, when the actual file is fetched and validated via `extractSongMetadata` anyway).
4. Writes one `ArchiveEntry` row per unique piece via `prisma.archiveEntry.create` (or a batched `createMany`), with `source_ref` holding whatever Task 1 determined is sufficient to fetch that specific performance's files later (e.g. a row offset/index for the Datasets Server API path, or a resolved file path for the local-staging-cache path).

Exact code depends entirely on Task 1's findings — do not write this script's internals speculatively before Task 1 completes.

- [ ] **Step 3: Run the script against the real dataset**

Run: `pnpm --filter @keyboard-sensei/api exec tsx scripts/ingest-piano-archive.ts`
Expected: completes without error, populates roughly 5,625 `ArchiveEntry` rows (verify with `SELECT COUNT(*) FROM "ArchiveEntry";` via `psql` or Prisma Studio).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @keyboard-sensei/api typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/scripts/ingest-piano-archive.ts
git commit -m "feat(api): PianoCoRe metadata ingest script"
```

---

### Task 4: `GET /archive/search`

**Files:**
- Create: `apps/api/src/archive.ts`
- Test: `apps/api/src/archive.test.ts`
- Modify: `apps/api/src/app.ts` (mount the new router)

**Interfaces:**
- Produces: `GET /archive/search?q=...` — paginated full-text search over `ArchiveEntry`.

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/archive.test.ts` following this repo's existing test conventions (check `apps/api/src/songs.test.ts` for the test-DB setup pattern). Assert: searching for a known seeded piece's title/composer substring returns it; an empty/nonsense query returns an empty (or reasonably ranked) result set, not an error; pagination params (`offset`/`limit`) work.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/api test -- archive`
Expected: FAIL — module/route doesn't exist yet.

- [ ] **Step 3: Implement**

Create `apps/api/src/archive.ts`:

```ts
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(""),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

/** Archive browse/search routes; mounted behind requireAuth. */
export const archiveRouter: Router = Router();

archiveRouter.get("/archive/search", async (req, res, next) => {
  try {
    const { q, offset, limit } = searchQuerySchema.parse(req.query);
    const rows = q
      ? await prisma.$queryRaw<
          { id: string; title: string; composer: string; duration_sec: number; note_count: number; difficulty: number }[]
        >`
          SELECT id, title, composer, duration_sec, note_count, difficulty
          FROM "ArchiveEntry"
          WHERE search_vector @@ plainto_tsquery('english', ${q})
          ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
          OFFSET ${offset} LIMIT ${limit}
        `
      : await prisma.archiveEntry.findMany({
          orderBy: [{ composer: "asc" }, { title: "asc" }],
          skip: offset,
          take: limit,
          select: { id: true, title: true, composer: true, duration_sec: true, note_count: true, difficulty: true },
        });
    res.json({ results: rows });
  } catch (e) {
    next(e);
  }
});
```

In `apps/api/src/app.ts`, find where `songsRouter` is mounted (e.g. `app.use(requireAuth, songsRouter);` or similar — check the exact existing mounting pattern) and mount `archiveRouter` alongside it the same way.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/api test -- archive`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/archive.ts apps/api/src/archive.test.ts apps/api/src/app.ts
git commit -m "feat(api): GET /archive/search over ArchiveEntry"
```

---

### Task 5: `POST /archive/:id/import`

**Files:**
- Modify: `apps/api/src/archive.ts`
- Test: `apps/api/src/archive.test.ts`

**Interfaces:**
- Consumes: Task 1's confirmed fetch mechanism, `extractSongMetadata` (existing), `MIDI_LIBRARY_DIR` (existing, from `apps/api/src/songs.ts`).
- Produces: `POST /archive/:id/import` — creates a private `Song` row for the requesting user.

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/archive.test.ts`: importing a known `ArchiveEntry` creates a `Song` row with `uploader_id` set to the requesting user, `content_rights: "archive-import"`, and — critically — is invisible to a *different* user's `GET /songs` (reuse the existing visibility test pattern from `songs.test.ts`). If Task 1's mechanism is mockable in tests (e.g. it's a plain HTTP fetch you can intercept), mock it here; if it genuinely requires a live network call, mark this specific test as needing network access and keep it minimal (one real piece, not a loop).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @keyboard-sensei/api test -- archive`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `apps/api/src/archive.ts` (exact fetch call depends on Task 1's findings — this shows the surrounding structure, fill in the fetch itself per that task's confirmed mechanism):

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractSongMetadata, InvalidMidiError, MIDI_LIBRARY_DIR } from "./songs.js";

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

archiveRouter.post("/archive/:id/import", async (req, res, next) => {
  try {
    const userId = uid(req);
    const entry = await prisma.archiveEntry.findUnique({ where: { id: z.string().parse(req.params.id) } });
    if (!entry) {
      res.status(404).json({ error: { code: "not_found", message: "Archive entry not found" } });
      return;
    }
    // Fetch this one piece's MIDI (and MusicXML, if available) bytes using
    // entry.source_ref, per Task 1's confirmed mechanism — fill in here.
    const midiBytes: Buffer = /* fetched per Task 1 */ Buffer.alloc(0);
    const musicXmlBytes: Buffer | null = /* fetched per Task 1, or null if unavailable for this piece */ null;

    let metadata;
    try {
      metadata = extractSongMetadata(new Uint8Array(midiBytes));
    } catch (error) {
      if (error instanceof InvalidMidiError) {
        res.status(422).json({ error: { code: "invalid_midi", message: error.message } });
        return;
      }
      throw error;
    }

    await mkdir(MIDI_LIBRARY_DIR, { recursive: true });
    const song = await prisma.song.create({
      data: {
        title: entry.title,
        artist: entry.composer,
        genre: "classical",
        difficulty: metadata.difficulty,
        duration_sec: metadata.durationSec,
        note_count: metadata.noteCount,
        content_rights: "archive-import",
        file_path: "pending",
        uploader_id: userId,
      },
    });
    const filePath = path.join(MIDI_LIBRARY_DIR, `archive-${song.id}.mid`);
    await writeFile(filePath, midiBytes);
    let notationPath: string | null = null;
    if (musicXmlBytes) {
      notationPath = path.join(MIDI_LIBRARY_DIR, `archive-${song.id}.musicxml`);
      await writeFile(notationPath, musicXmlBytes);
    }
    const updated = await prisma.song.update({ where: { id: song.id }, data: { file_path: filePath, notation_path: notationPath } });
    res.status(201).json({ id: updated.id, title: updated.title, artist: updated.artist });
  } catch (e) {
    next(e);
  }
});
```

(`MIDI_LIBRARY_DIR` and `extractSongMetadata`/`InvalidMidiError` are already exported from `apps/api/src/songs.ts` — confirm the exact export names match before importing.)

- [ ] **Step 4: Add a route to serve a song's notation file**

Alongside the existing `GET /songs/:id/file` route in `apps/api/src/songs.ts`, add an analogous `GET /songs/:id/notation` that serves `song.notation_path` (same ownership check as the existing file route), returning 404 if `notation_path` is null (direct uploads/URL-imports have none).

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @keyboard-sensei/api test -- archive`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/archive.ts apps/api/src/archive.test.ts apps/api/src/songs.ts
git commit -m "feat(api): POST /archive/:id/import + GET /songs/:id/notation"
```

---

### Task 6: Client API helpers

**Files:**
- Modify: `apps/web/src/services/api.ts`

**Interfaces:**
- Produces: `searchArchive(q, offset?, limit?)`, `importArchiveEntry(id)`, `getSongNotationFile(id)`, updated `Song` interface with `notation_path`.

- [ ] **Step 1: Add the helpers**

In `apps/web/src/services/api.ts`, update the `Song` interface (find it, add one field):

```ts
export interface Song {
  id: string;
  title: string;
  artist: string;
  genre: SongGenre;
  difficulty: number;
  duration_sec: number;
  note_count: number;
  content_rights: string;
  notation_path: string | null;
  mine: boolean;
}
```

Add near the other song-related exports:

```ts
export interface ArchiveEntryResult {
  id: string;
  title: string;
  composer: string;
  duration_sec: number;
  note_count: number;
  difficulty: number;
}

export const searchArchive = (q: string, offset = 0, limit = 30) =>
  request<{ results: ArchiveEntryResult[] }>(`/archive/search?q=${encodeURIComponent(q)}&offset=${offset}&limit=${limit}`);

export const importArchiveEntry = (id: string) =>
  request<{ id: string; title: string; artist: string }>(`/archive/${encodeURIComponent(id)}/import`, { method: "POST" });

export const getSongNotationFile = async (id: string): Promise<ArrayBuffer | null> => {
  const token = getToken();
  const response = await fetch(`${API_URL}/songs/${encodeURIComponent(id)}/notation`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load notation (${response.status})`);
  return response.arrayBuffer();
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS. (Note: `apps/api`'s `songListItem` response shape needs `notation_path` added too, matching the new `Song` client type — cross-check this against Task 5's implementation and add it there if missed.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/api.ts
git commit -m "feat(web): client API helpers for archive search/import"
```

---

### Task 7: Browse Archive UI

**Files:**
- Modify: `apps/web/src/components/play/SongBrowserPage.tsx`

**Interfaces:**
- Consumes: `searchArchive`, `importArchiveEntry` (Task 6).

- [ ] **Step 1: Add a "Browse Archive" section**

Add a new toggle-able section (same show/hide pattern as the upload dialogs) with a search input calling `searchArchive` (debounced, e.g. 300ms after the user stops typing), listing results (title, composer, duration, difficulty dots — reuse the existing `formatDuration`/`DifficultyDots` helpers already in this file), each with an "Import" button calling `importArchiveEntry` and then adding the returned song to the local `songs` list (matching the existing `onDone` pattern used by `UploadDialog`/`ImportFromUrlDialog`).
- Label each result/imported song with a small "From archive" badge (distinct from the plain library list), reflecting the best-effort (not guaranteed) rights filtering — same spirit as the URL-import flow's "unverified" framing.

Exact JSX layout is an implementation detail — follow this file's existing visual conventions (card wrapper, `primary-button`/`secondary-button` classes, felt/brass color tokens) rather than inventing a new style.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`, go to `/play`, open "Browse Archive," search for a well-known piece (e.g. a Chopin or Beethoven title), confirm results appear, import one, confirm it shows up in your song list labeled "from archive," and confirm it's playable via Play-Along.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/play/SongBrowserPage.tsx
git commit -m "feat(web): Browse Archive search + import UI"
```

---

### Task 8: OSMD notation rendering for archive-imported songs

**Files:**
- Modify: `apps/web/package.json` (add `opensheetmusicdisplay`)
- Create: `apps/web/src/components/play/OsmdNotation.tsx`
- Modify: `apps/web/src/components/play/PlayAlongPage.tsx`

**Interfaces:**
- Produces: `OsmdNotation` component rendering a song's MusicXML (when `song.notation_path` is set) with live note highlighting driven by `songTimeS`, as an alternative to `NotationPreviewStrip` for archive-sourced songs.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && pnpm add opensheetmusicdisplay`

- [ ] **Step 2: Build the OSMD wrapper component**

Create `apps/web/src/components/play/OsmdNotation.tsx`. This needs, at minimum: (a) mounting an `OpenSheetMusicDisplay` instance into a container `div` ref and loading the fetched MusicXML bytes (`osmd.load(xmlString)` then `osmd.render()`); (b) once loaded, walking `osmd.cursor.Iterator` once (per OSMD's own documented "Extracting note timing for playing" pattern — reset the cursor, then repeatedly read `iterator.CurrentVoiceEntries`/`.Notes` and `iterator.currentTimeStamp`/tempo to build one flat list of `{ note, startTimeS, graphicalNote }` for the whole piece, calling `iterator.moveToNext()` until `EndReached`) so real-time highlighting doesn't need to re-walk the cursor on every frame; (c) on each `songTimeS` update, compute which notes are "due now" from that pre-built list and toggle a highlight by calling `.getSVGGElement()` on the corresponding `GraphicalNote` (from `cursor.GNotesUnderCursor()` or directly from the pre-built list) and setting/removing a CSS class or inline `fill`/`stroke` style directly on that SVG element — **not** via OSMD's `Note.NoteheadColor` + a full re-render, which would be far more expensive to do at animation-frame rates; clear the previous frame's highlighted elements' style before applying the new set.

Props: `{ musicXml: string; songTimeS: number }` (parent is responsible for fetching the MusicXML bytes via `getSongNotationFile` and decoding to a string before passing it in).

Given the real uncertainty in exactly how OSMD's cursor/tempo API behaves for a specific real MusicXML file (tempo changes mid-piece, multi-voice complexity), build this incrementally: get static rendering working first, then the pre-built note-timing list, then live highlighting — verify each stage manually in-browser before moving to the next, rather than writing all three at once and debugging blind.

- [ ] **Step 3: Wire into `PlayAlongPage`**

In `PlayAlongPage.tsx`, when the loaded `song.notation_path` is non-null, fetch the notation via `getSongNotationFile(songId)`, decode it (`new TextDecoder().decode(...)`), and render `<OsmdNotation musicXml={...} songTimeS={songTimeS} />` in place of `<NotationPreviewStrip ... />` for that song specifically (both are gated by the existing `settings.viewMode !== "falling"` condition from the view-toggles batch — `OsmdNotation` when `notation_path` is set, `NotationPreviewStrip` otherwise).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, import an archive song (Task 7), open it in Play-Along with view mode set to "Sheet music" or "Both." Confirm real engraved notation renders (not the small quantized preview strip). Start playback and confirm notes visually highlight as they become due, roughly in sync with the falling notes below (exact frame-perfect sync isn't required — this is a reading aid, same spirit as the existing preview strip). Confirm a non-archive song (direct upload or URL import) still shows the existing `NotationPreviewStrip` unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/src/components/play/OsmdNotation.tsx apps/web/src/components/play/PlayAlongPage.tsx
git commit -m "feat(web): OSMD real notation rendering for archive-imported songs"
```

---

## Self-Review

**Spec coverage:** §1 (dataset choice) → Task 1 (verification) + Task 3 (ingest). §2 (search unit = pieces) → Task 3. §3/§3a (storage architecture, OSMD) → Tasks 1, 5, 8. §4 (data model) → Task 2. §5 (API) → Tasks 4-5. §6 (UI) → Task 7.

**Placeholder scan:** Task 1 is an explicit, bounded investigation task with a real deliverable (a findings doc + a tested fetch call) — this is legitimate plan content given genuine technical uncertainty about a third-party dataset's exact hosting mechanics, not a vague "figure it out" placeholder. Tasks 3 and 5 explicitly and honestly defer their exact fetch-call code to Task 1's findings rather than guessing — flagged clearly in each step, not silently glossed over.

**Type consistency:** `ArchiveEntry`'s fields match between the Prisma model (Task 2), the ingest script (Task 3), the search endpoint's raw-SQL select list (Task 4), and the client's `ArchiveEntryResult` interface (Task 6). `Song.notation_path` flows consistently from the Prisma field (Task 2) through the import endpoint's response (Task 5) to the client `Song` interface (Task 6) to `OsmdNotation`'s consumption (Task 8).
