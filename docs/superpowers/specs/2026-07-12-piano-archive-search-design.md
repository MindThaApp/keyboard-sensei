# Bulk Private-Archive Search (PianoCoRe) — Design Spec (Phase 1b)

Date: 2026-07-12
Status: Approved by Ramin (design conversation, 2026-07-12); dataset choice independently verified via live web research (WebSearch/WebFetch — arXiv, TISMIR journal listing, GitHub, HuggingFace, Zenodo all cross-checked)

## Overview

A large, searchable, previewable catalog of piano MIDI pieces that a user can search *within the app* and import a chosen piece into their own **private** library — the "search first, already archived, easy preview" half of the original ask, scoped to a specific, verified, rights-conscious dataset rather than an open web search (which remains a separate, later phase — see `CLAUDE.md` roadmap).

This is explicitly a **private-per-user** feature, not an expansion of the public 305-song library: nothing here is ever visible to other users. That decision was made deliberately, given the source dataset's rights posture (below) is meaningfully different from the curated public library's.

## 1. Dataset: PianoCoRe

**PianoCoRe** (Borovik et al., *Transactions of the International Society for Music Information Retrieval*, 2026) — [arXiv:2605.06627](https://arxiv.org/abs/2605.06627), [Zenodo record](https://zenodo.org/records/19186016), [GitHub](https://github.com/ilya16/PianoCoRe).

- **Scale**: 250,046 performances of 5,625 unique pieces by 483 composers (~21,763 hours of performed music). Built by combining and refining MAESTRO, ASAP, (n)ASAP, ATEPP, GiantMIDI-Piano, Aria-MIDI, and PERiScoPe — all established, legitimate MIR research datasets, not scraped-from-nowhere content.
- **Already piano-only**: no track-isolation/instrument-detection engineering needed (unlike a general-MIDI dataset such as the Lakh MIDI Dataset, which was considered and rejected — see below).
- **Already has real metadata**: title + composer attached natively, no separate metadata-matching join needed (again unlike Lakh, whose MD5-keyed files require a join against the Million Song Dataset to get usable title/artist, and even then only ~45k/176k files get a confident match).
- **License**: CC BY-NC-SA 4.0. Per the Zenodo record's own text: *"provided strictly for non-commercial research and educational purposes."* Keyboard Sensei is a non-commercial, self-hosted, explicitly educational piano-learning app — a genuinely good fit for this license's own stated purpose, not a stretch.
- **Rights-clearing effort**: *"A best-effort attempt was made to filter PianoCoRe according to European Union public-domain regulations (works whose authors have been deceased for more than 70 years)."* The dataset's own authors are explicit that *"achieving 100% accuracy across thousands of files from diverse sources is inherently difficult"* — this is a best-effort filter, not a guarantee. The private-per-user scoping (§0 above) is the deliberate mitigation for this, not a claim that every piece is definitively rights-clear.
- **Size**: ~16.4GB full dataset (raw-MIDI-only footprint smaller, since the full archive bundles MusicXML too).

**Why not Lakh MIDI Dataset** (the other large-scale candidate, ~176,581 files / 45,129 metadata-matched): general multi-instrument MIDI scraped from unknown internet sources, no built-in piano-only filtering (would need real track-isolation engineering, and most general-MIDI content isn't piano-primary anyway), requires a separate Million Song Dataset join for any usable title/artist metadata, and its creator explicitly states per-file copyright attribution *"is not feasible"* with no rights-filtering effort comparable to PianoCoRe's. PianoCoRe is a strictly better fit on every axis for this specific app.

**Named risk to carry forward, not solve now**: the NC (non-commercial) license clause means if Keyboard Sensei ever became a paid/commercial product, PianoCoRe-sourced content already in users' private libraries would need re-evaluating at that point. Not a concern today; worth remembering later.

## 2. Search unit: pieces, not performances

Search and browse operate on the **5,625 unique pieces** (title + composer), not the 250,046 raw performances. Many performances are different pianists' renditions of the same piece — surfacing "other recordings of this piece" is a reasonable secondary affordance for later, not part of the core search UX now. Each piece needs one representative performance selected at ingest time (e.g., the first/highest-quality one per PianoCoRe's own quality labels) as the default importable file; don't build UI for choosing among 44 recordings of the same Chopin nocturne in v1.

## 3. Storage architecture: materialize on demand, not bulk-hosted

Given the NC license and the best-effort (not guaranteed) rights filtering, prefer indexing metadata now and fetching/copying actual MIDI bytes only when a specific user actually searches for and imports a specific piece — **not** pre-downloading and permanently hosting the full ~16GB corpus as a standing shared mirror.

- **Ingest-time** (one-time, admin-run script, mirroring the existing `apps/api/scripts/fetch-midi-library.ts` pattern): download PianoCoRe's metadata/index (composers.csv + piece-level metadata — no need to download all 250k performance files at this stage), pick one representative performance per unique piece, and populate a new metadata-only table (see §4) with title/composer/duration/note-count/a source reference sufficient to fetch that one specific file later. Do not download and store all 250k performance MIDI files at ingest time.
- **Import-time** (per user, on demand): when a user searches this archive and picks a piece, fetch *that one specific file* (from wherever PianoCoRe's Zenodo/HuggingFace hosting serves individual files, or from a smaller admin-side cache of just the representative performances if individual-file fetching from the upstream host proves impractical — this needs confirming against the actual Zenodo/HuggingFace file layout during implementation), validate it through the existing `extractSongMetadata`, and copy it into that user's private library exactly like a direct upload (`uploader_id` set, `content_rights: "archive-import"` — a new value, alongside the existing ones and Phase 1a's `"user-import-url"`).

**Open implementation question, not resolved by this design** (flag during planning, don't guess): whether PianoCoRe's actual hosting (Zenodo bulk archive vs. HuggingFace dataset viewer) supports fetching one individual performance file efficiently, or whether the admin-side ingest step needs to download the full ~16GB once to a local staging area and serve individual files from there on demand (still not permanently duplicating it into every/any Song row — just a local source-of-truth cache the import-time step reads from, distinct from "hosting it as a public library"). Resolve this with a quick investigation at the start of implementation before committing to the exact ingest script design.

## 4. Data model

New Prisma model, e.g. `ArchiveEntry` (kept separate from `Song` — these are catalog/index rows for pieces not yet in anyone's library, not `Song` rows themselves, which only exist once a user actually imports something):

```
model ArchiveEntry {
  id           String  @id @default(cuid())
  title        String
  composer     String
  duration_sec Int
  note_count   Int
  difficulty   Int     // computed at ingest time, same heuristic as existing fetch-midi-library.ts
  source_ref   String  // however much is needed to locate/fetch this piece's file later (implementation detail, resolve per §3's open question)
}
```

Add a Postgres full-text-search index (GIN on a generated `tsvector` column combining `title`+`composer`) — this scale (5,625 rows) is trivially served by plain Postgres FTS; no dedicated search service is warranted for a single home-LAN server.

## 5. API

- `GET /archive/search?q=...` — server-side full-text search over `ArchiveEntry` (paginated). This is new: unlike the existing 305-song library, which the client searches entirely client-side, 5,625+ rows warrants real server-side search from the start.
- `POST /archive/:id/import` — fetches (per §3), validates, and creates a private `Song` row for the requesting user, `content_rights: "archive-import"`.

## 6. UI

- A new tab/section in `SongBrowserPage.tsx` (or a dedicated page) — "Browse Archive" — with a search box hitting `GET /archive/search`, showing title/composer/duration/difficulty per result, and an "Import" button per result that calls the import endpoint and then behaves like any other song in the user's library (playable via Play-Along immediately after).
- Label archive-imported songs distinctly in the UI (e.g. a small "from archive" badge), same spirit as Phase 1a's "unverified — imported from a URL" labeling, reflecting the best-effort (not guaranteed) rights filtering.

## Testing

- `packages/*`/`apps/api`: unit tests for the FTS search query (relevance-ordering sanity, not exhaustive), and for the import endpoint's Song-row creation (correct `content_rights`, correct `uploader_id`, no cross-user visibility).
- Manual/in-browser verification: search for a known piece, confirm it's findable, import it, confirm it plays correctly in Play-Along and appears only in the importing user's own library.

## Phasing relative to Phase 1a

Independent of Phase 1a (manage-library + URL-import) — no shared code beyond both landing on the existing `Song`/upload-validation infrastructure. Can be built in either order; no reason to sequence one before the other beyond normal implementation-planning convenience.
