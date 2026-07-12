# Keyboard Sensei — Project Status

Full-stack piano learning web app. pnpm monorepo: `apps/web` (React/Vite/TS/Tailwind/VexFlow/Zustand), `apps/api` (Express 5/Prisma/PostgreSQL/JWT/Zod), `packages/{shared-types,midi-engine,music-theory,lesson-engine}`. See `README.md` for local setup commands.

**Collaboration pattern:** detailed written spec → Codex background job (`node <codex-companion.mjs path> task --background --write --fresh "<prompt>"`, found via `codex:setup`) for backend/content work → Claude verifies live (real Postgres + browser), never trusts Codex's own "typecheck/tests passed" as sufficient — its sandbox has no Docker/Postgres/network, so it cannot do real E2E verification itself.

There is also a stale early-prototype copy at the parent directory root (`../apps/web` only, no api, no git repo, frozen ~2026-07-01) — not this project, safe to ignore or delete after confirming with Ramin.

## Commands

### Deploy
Live on the home LAN server at `192.168.4.4` (Debian, user `ramin`), Dockerized, reachable at `http://192.168.4.4:8181` (web) / `:3101` (api), via Tailscale subnet routing when off-LAN.

```sh
rsync -az --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.pnpm-store' \
  --exclude '*.log' --exclude '.env' --exclude 'apps/api/.env' --exclude 'apps/web/.env' \
  --exclude '*.tsbuildinfo' --exclude '.env.deploy' --exclude 'apps/api/data/tts-cache' \
  ./ ramin@192.168.4.4:~/apps/keyboard-sensei/
ssh ramin@192.168.4.4 "cd ~/apps/keyboard-sensei && docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build"
```

Prisma migrations apply automatically on container start. Content-only changes (no schema change) still need a reseed to reach the deployed demo account:
```sh
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'"
```

MIDI library files are NOT in git/images (gitignored, volume-mounted) — after a fresh deploy, run the fetch script once server-side then reseed:
```sh
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-midi-library.ts'"
```

`ELEVENLABS_API_KEY` lives in `apps/api/.env` (local) and the server's `~/apps/keyboard-sensei/.env.deploy` (gitignored both places, never committed, never a `VITE_` var). `ADMIN_PASSWORD` (server `.env.deploy`) sets the seeded admin's password; local dev fallback is `admin-sensei-dev`.

**Alternative: prebuilt GHCR images.** CI (`.github/workflows/ci.yml`) builds/pushes `ghcr.io/ramin-azizi/keyboard-sensei-{web,api}` on every push to `master`. To use those instead of building on the server: `docker-compose.ghcr.yml`, but the server needs a one-time `docker login ghcr.io` with a PAT that has `read:packages` (repo/images are private) — currently NOT set up (`gh auth refresh -s read:packages` would restore it); deploys use the build-on-server path (`docker-compose.deploy.yml`) until that's done.

## Gotchas / Lessons Learned

| Issue | Cause | Prevention now in place |
|---|---|---|
| VexFlow sharp/flat glyphs positioned but never drawn | `Accidental` modifiers computed but never attached to the `StaveNote` | Content verification cross-checks MIDI note numbers against the *rendered* VexFlow output, not just theory — invisible bugs like this don't show up from note-number review alone |
| Accidentals clipped off-canvas on long note runs | Canvas width was a fixed 420px; a note late in a run formatted past the SVG edge | Width scales with note count (`computeStaveWidth` in `NotationRenderer.tsx`) |
| Stale hardcoded lesson-count strings (e.g. "12 lessons") | UI strings weren't made count-agnostic when content volume grew | Grep for hardcoded counts whenever content volume changes |
| CORS port mismatch; a logout state bug | — | Caught pre-ship by live verification, not static checks |
| **Structural:** Codex's own "tests passed" report is never sufficient | Its sandbox has no Docker/Postgres/network | Claude always verifies live (real Postgres + browser) before accepting Codex's work as done — every bug above was invisible to static checks alone |
| Custom response headers (`x-song-*`) invisible to the browser cross-origin | `cors()` had no `exposedHeaders` — custom headers aren't CORS-safelisted by default; `curl` (which ignores CORS) can't catch this, only a real browser fetch can | Any new custom response header a client reads via `response.headers.get(...)` must be added to `apps/api/src/app.ts`'s `cors({ exposedHeaders: [...] })` list |
| Adding a new npm dependency broke unrelated existing code's typecheck (`NotationRenderer.tsx`'s `vexflow` imports) | `opensheetmusicdisplay` transitively depends on old `vexflow@1.x` + `@types/vexflow`; that package's `declare module "vexflow"` ambient block is global once loaded anywhere in the TS program, not scoped to the file that needed it — it shadowed this app's own real `vexflow@4.x` types everywhere | `apps/web/tsconfig.json` now has an explicit `"types": [...]` whitelist (prevents automatic `@types/*` pollution from any future transitive dependency); the one existing conflict was neutralized via `pnpm patch` (see `patches/@types__vexflow@1.2.42.patch`) |
| A "prevent duplicate work" `useRef` guard silently broke a `useEffect` under React 18 StrictMode | Dev-mode double-invoke (mount→cleanup→mount): the first throwaway mount set the ref before its cleanup ran, so the real second mount's guard saw it "already done" and skipped — no error, just silently broken (`OsmdNotation.tsx`, notation stayed blank) | Don't add a manual "already ran" ref check on top of a `useEffect`'s own dependency array unless you've specifically verified it survives StrictMode's double-invoke; the dependency array alone is usually sufficient |
| `scrollIntoView({behavior:"smooth"})` called on a fast-updating interval (~120ms) never visibly moved the page | Each call interrupted/restarted the previous animation before it could progress — `scrollY` stayed pinned even though the call fired correctly every time | Use `behavior:"auto"` (instant) for any auto-follow-scroll driven by a frequently-updating value; verify with a real timed live check (`window.scrollY` before/after), not just confirming the function was called |

## Roadmap (open items)

- Sampled piano voice (replacing the synth) — not started.
- Auth hardening: refresh tokens, authenticate the TTS audio route — not started (quiz-integrity half of this item is done: `correctIndex` no longer ships to the client).
- De-minify remaining one-liner-style files; delete the stale duplicate app copy at the parent root (see Commands section) — needs Ramin's confirmation on the delete.
- More content batches toward the ~100-hour target (34 lessons / repertoire+ear-training+technique batches shipped so far).
- Detailed phase-by-phase breakdown for dashboard/achievements, theory library, skill tree, scrolling sight-reading: `/Users/raminazizi/.claude/plans/gleaming-watching-origami.md` — scope each phase in detail immediately before it starts, not before.
- Long-term target: native iPhone/Android/tablet apps; the web app is the interim solution.
- **Not yet deployed to the production server** (192.168.4.4) — the 2026-07-12 MIDI-search/archive/toggles batch (see History) is merged to `master` and pushed to GitHub, but the live site is still running the pre-batch build. Needs: standard deploy (see Commands), then `pnpm exec tsx scripts/ingest-piano-archive.ts` run server-side once to populate the production `ArchiveEntry` table (5,625 rows) — the dev DB has this seeded locally but the deploy process doesn't run ingest scripts automatically.
- Deferred, low-priority cleanup items surfaced by the 2026-07-12 batch's reviews (none blocking, no action taken yet): no rate limit on `POST /archive/:id/import` (URL-import preview has one, archive import doesn't); large web bundle (~2.6MB minified, mostly OSMD) — dynamic `import()` code-splitting would help but wasn't done; a few IPv6/edge-case gaps in the SSRF IP blocklist (`apps/api/src/ssrf-safe-fetch.ts`) noted as low real-world risk; `SongGenre` includes `"game"` but the `GENRES` UI dropdown array omits it (cosmetic, not reachable in practice).

## History

One line per batch — full detail lives in `docs/superpowers/specs/*-design.md` (where one exists) and `git log`.

- **2026-07-12 — MIDI search/import: song library management, PianoCoRe bulk archive search, Play-Along view toggles (16 tasks + 4 same-day fix commits, 20 commits, merged to master, NOT yet deployed):** three plans built in parallel/sequence — (1) inline edit for your own uploaded songs + "Import from URL" (fetch a MIDI from an arbitrary user-supplied URL, preview + hear it before committing, SSRF-hardened via connect-time IP validation blocking private/loopback/link-local/cloud-metadata/CGNAT ranges); (2) a searchable 5,625-piece classical/piano archive (ingested from the public PianoCoRe dataset, metadata-only ingest — never bulk-downloading the ~16GB dataset; per-piece MIDI+MusicXML fetched on demand via HuggingFace's Datasets Server row API only at import time), private-per-user import, real OSMD (OpenSheetMusicDisplay) sheet-music rendering with live note highlighting for archive-imported songs specifically (falls back to the existing lightweight `NotationPreviewStrip` for everything else); (3) a highlight on/off toggle and a falling-bars/sheet-music/both view-mode toggle for Play-Along. Executed via a mix of Codex background jobs and, once Codex's usage ran low mid-session, direct implementation by Claude and Claude subagents (`general-purpose`, `opus`/`sonnet` per task complexity) — see `.superpowers/sdd2/progress.md` for the full per-task ledger (which implementer, what each review found). Unusually bug-dense for how much live verification happened: 8 real bugs found and fixed via live testing that stayed invisible to typecheck/mocked-unit-tests throughout, including a TLS-handshake-race DoS in the SSRF fetcher (uncaught process crash on any hostname-mismatched HTTPS host), undici silently miscategorizing a real SSRF block as an unrelated 500, a React 18 StrictMode bug that silently broke OSMD's initial load, a `scrollIntoView({smooth})` call that appeared to work but never actually moved the page, a missing CORS `exposedHeaders` that broke the URL-import preview's metadata display on every real (cross-origin) deployment, and a `notation_path` info-leak that would have exposed the real server filesystem path to clients (caught before shipping, not after). Every task got an individual task-scoped review; the whole branch also got one final cross-cutting review (Opus) before merge, which is what caught the CORS and OSMD-scroll-vs-piano-layout bugs — see the Gotchas table above for the two new dependency-conflict/StrictMode/scroll-timing lessons this batch produced. Specs: `docs/superpowers/specs/2026-07-12-*-design.md` (song library management, piano archive search, play-along view toggles, pianocore fetch mechanism findings); plans: `docs/superpowers/plans/2026-07-12-*.md`.
- **2026-07-11/12 — Multi-row notation, adjustable metronome, live-follow overlay, Play-Along preview strip:** barred/rest-aware notation with automatic multi-row wrapping for long pieces; metronome sound bank (click/wood/beep/cowbell) + volume + practice tempo % (25/50/75/100), all inline on the exercise page (a Settings-page version was tried then deliberately removed per product feedback — controls belong where they're used); supplementary real-time highlight+scoring overlay during lesson/gym exercises (authoritative scoring untouched); rolling quantized notation strip above the Play-Along waterfall. Built via subagent-driven-development (15 tasks, 3 needed fix cycles for real bugs — a live-follow note-ordering bug for two-handed exercises, a chord-merging bug in the preview strip, weak test coverage on a shared judging helper — all fixed and re-reviewed clean), plus one more real bug (`groupIntoMeasures` conflating measure array position with absolute bar number, misaligning grand-staff hands when one rests a full bar) found by the final whole-branch review and fixed before merge. Spec: `docs/superpowers/specs/2026-07-11-notation-metronome-live-follow-design.md`; plan: `docs/superpowers/plans/2026-07-11-notation-metronome-live-follow.md`.
- **2026-07-11 — Play-along mode, song library, admin, feedback:** admin role + user management, feedback widget, 305-song curated MIDI library (ADL Piano MIDI dataset, `apps/api/scripts/fetch-midi-library.ts`), falling-notes play-along game with tempo/look-ahead/wait-mode scoring, Practice History gained a Play-along tab. Spec: `docs/superpowers/specs/2026-07-11-playalong-admin-feedback-design.md`. Deployed live same day.
- **2026-07-10 (10-parallel-worker batch) — content + integrity:** lessons 24→34 (repertoire, ear training, technique II), untimed scoring mode, quiz `correctIndex` no longer shipped to clients, Practice History page, notation key signatures/measures/dotted-notes, virtual-piano glissando.
- **2026-07-10 (design review + overhaul) — practice loop rebuilt:** metronome count-in + honest per-key feedback (previously scored an unheard tempo with conflated timing/pitch errors), key-tracked synth voice, auto grand-staff notation, felt/brass/ivory design system, dashboard with per-level progress, CI to GHCR.
- **2026-07-01 — narration + content:** ElevenLabs TTS narration with shared quota, lessons 13→24 (chromatic → circle of fifths → minor → dominant 7th → inversions → arpeggios).
