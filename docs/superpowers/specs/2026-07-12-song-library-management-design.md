# Song Library Management + URL Import — Design Spec (Phase 1a)

Date: 2026-07-12
Status: Approved by Ramin (design conversation, 2026-07-11/12), independently reviewed by a second-opinion pass (Opus)

## Overview

Two additions to Keyboard Sensei's existing song library (`Song` Prisma model, `apps/api/src/songs.ts`, `apps/web/src/components/play/SongBrowserPage.tsx`):

1. **Manage your library** — edit title/artist/genre on your own uploaded songs after the fact (today you can only upload and delete, not fix a typo).
2. **Import from a URL, with a preview step** — paste a URL to a `.mid` file, preview it (hear it) before committing, then add it to your private library. This is the deliberately-scoped Phase 1 answer to "search the web for MIDI files" — the search itself (a live, curated external catalog) is Phase 1b (bulk archive) and a separate future phase (live external search), not this spec.

Everything here follows the existing privacy model exactly: imported/uploaded songs are private to the uploader (`uploader_id` set), never shared to other users, same as today's direct upload.

## 1. Manage your library

### API
- New `PATCH /songs/:id`, non-admin, owner-scoped. **Must mirror the existing `DELETE /songs/:id` ownership-check pattern exactly** (`apps/api/src/songs.ts:210-222`): fetch the song, 404 if missing, 403 if `song.uploader_id !== userId` (and not admin — admins keep using the existing `PATCH /admin/songs/:id`, this is not a replacement for that route). Do **not** model this on the admin route's bare `update({ where: { id } })` — that has no ownership predicate and would let any user edit any song, including the public seeded library.
- Request body validated by a Zod schema covering `title`/`artist`/`genre` only — explicitly **excludes `difficulty`**, which stays system-computed (admin-only, via the existing admin route).
- Implementation detail: prefer `updateMany({ where: { id, uploader_id: userId }, data })` and treat a 0 count as not-found-or-not-yours, for an atomic check-and-update in one query.

### UI
- `SongBrowserPage.tsx`: add an edit affordance (inline form, same visual pattern as `AdminSongsPage.tsx`'s existing inline edit) next to the existing delete button, both gated on the API's existing `mine` boolean.

## 2. Import from a URL, with a real preview step

### The SSRF requirement (binding, not optional)

A naive "check the URL string, then fetch it" implementation does **not** close this risk — this was flagged explicitly by independent review and must not be simplified away during implementation:

- **DNS rebinding / TOCTOU**: validating a hostname's resolved IP, then fetching the URL separately, re-resolves the hostname a second time — an attacker-controlled DNS record can return a public IP on the first check and a private one on the actual fetch.
- **Redirects**: Node's global `fetch`/undici follows 3xx redirects by default. A URL that passes validation can redirect to an internal address (e.g. `169.254.169.254`, `192.168.x.x`), and the redirected request is never re-validated.
- **Alternate address encodings**: decimal/octal/hex IPv4 (`0x7f000001`), IPv4-mapped IPv6 (`::ffff:127.0.0.1`), ULA (`fc00::/7`), link-local (`fe80::/10`), `0.0.0.0` — a string-based private-range regex misses these.

**Required implementation approach**: a custom `undici` `Agent`/dispatcher that validates the actual resolved socket IP address **at connect time** (parsing the binary address, not string-matching), applied uniformly to the initial request and every redirect hop. Restrict scheme to `http`/`https` only (no `file:`/`data:`). Enforce the byte-size cap on actual streamed/decoded bytes as they arrive (not `Content-Length`, which can lie or be absent — this also bounds any decompression-bomb risk, since counting decoded bytes as you read catches it regardless of compression). Send no `Accept-Encoding` header (MIDI files aren't compressed, so there's nothing to gain and it removes a whole class of decompression concern).

Context: this app is a self-hosted home-LAN server (Tailscale-routed, tiny trusted user base per `CLAUDE.md`), which lowers real-world exploitability — but the spec still mandates connect-time validation because a pre-flight-check-then-fetch implementation would be security theater, not real protection, and the fix is a well-understood pattern, not a large lift.

### API

- New `POST /songs/fetch-url-preview`: body `{ url: string }`. Validates `url` as `http(s)` with a length cap. Fetches server-side per the SSRF requirements above, with a timeout and the same byte-size cap as direct upload (1MB). Runs the fetched bytes through the *existing* `extractSongMetadata` (`apps/api/src/midi-metadata.ts`) — same 422 (`invalid_midi`) on failure as direct upload. On success, returns the raw bytes as the response body (not base64-in-JSON — avoids ~33% inflation and matches how `/songs/upload` already takes a raw body) plus extracted metadata (duration, note count, difficulty estimate) in response headers or a parallel small JSON field.
- **Nothing is persisted by this endpoint** — it's a validated proxy-fetch only.
- Commit step: reuses the **existing** `POST /songs/upload` endpoint unchanged in its core logic (bytes in, same validation, same storage), with one additive change: an optional `source_url` query param (populating the `Song.source_url` field, currently unused by any code path) and, when present, `content_rights: "user-import-url"` (a new value alongside the existing three). Note this label is a UI hint, not an enforced trust boundary — it's set purely from whether the caller passed `source_url`, so don't treat it as authoritative anywhere downstream. Validate `source_url` itself as a real `http(s)` URL with a length cap before storing (Zod), not arbitrary text.
- Rate-limited per-user: reuse the exact sliding-window pattern already used for the feedback widget (`apps/api/src/feedback.ts:14-27`) — an in-memory `Map<userId, timestamp[]>`, e.g. 10/hour. This is the one genuinely new server-side risk surface in the feature (a fetch of a user-supplied address), so it gets the same "not a hard security boundary, but real abuse friction" treatment already established elsewhere in this codebase.

### UI

- `SongBrowserPage.tsx`'s existing upload dialog gains a second mode: "Import from URL" alongside "Upload file." Paste a URL → calls `fetch-url-preview` → on success, shows a "▶ Preview" button reusing the app's existing `parsePlayAlongSong`/`pianoSynth` utilities (the same pattern already used for "listen before you play" exercise previews) to play the fetched-but-not-yet-saved bytes → a small form (title/artist/genre, editable) → "Add to my library" commits via `/songs/upload` with `source_url` set.
- Byte-integrity note for implementers: the client previews bytes from `fetch-url-preview`, then separately re-sends bytes to `/songs/upload` for the commit. Since the commit re-runs `extractSongMetadata` independently, a mismatch between preview and commit bytes is harmless (it's the user's own private upload either way) — **no hash/integrity token between the two steps is needed**; don't add one.

## Testing

- `apps/api`: unit tests for `PATCH /songs/:id`'s ownership enforcement (owner can edit, non-owner 403s, editing a public/seeded song 403s, admin still uses its own route unaffected), and for the SSRF-safety layer specifically (a redirect to a private address is blocked, not just the initial URL) — this needs a controllable test fetch target (a local test server the suite spins up), not a real external URL.
- Manual/in-browser verification (per this project's established pattern): the full import-from-URL flow end to end with a real small public `.mid` file URL, confirming preview plays before commit and the imported song shows up only in the importing user's own library view.
