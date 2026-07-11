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

## Roadmap (open items)

- Sampled piano voice (replacing the synth) — not started.
- Auth hardening: refresh tokens, authenticate the TTS audio route — not started (quiz-integrity half of this item is done: `correctIndex` no longer ships to the client).
- De-minify remaining one-liner-style files; delete the stale duplicate app copy at the parent root (see Commands section) — needs Ramin's confirmation on the delete.
- More content batches toward the ~100-hour target (34 lessons / repertoire+ear-training+technique batches shipped so far).
- Detailed phase-by-phase breakdown for dashboard/achievements, theory library, skill tree, scrolling sight-reading: `/Users/raminazizi/.claude/plans/gleaming-watching-origami.md` — scope each phase in detail immediately before it starts, not before.
- Long-term target: native iPhone/Android/tablet apps; the web app is the interim solution.
- Next feature (queued, not started): search the web for MIDI files, preview, import into the song library, plus user library management. Open question flagged, not yet resolved: where the search actually sources from — the existing 305-song library was deliberately curated from one license-aware dataset specifically to avoid copyright ambiguity, and a true open-web search reintroduces that problem. Brainstorm this as its own cycle before starting.

## History

One line per batch — full detail lives in `docs/superpowers/specs/*-design.md` (where one exists) and `git log`.

- **2026-07-11/12 — Multi-row notation, adjustable metronome, live-follow overlay, Play-Along preview strip:** barred/rest-aware notation with automatic multi-row wrapping for long pieces; metronome sound bank (click/wood/beep/cowbell) + volume + practice tempo % (25/50/75/100), all inline on the exercise page (a Settings-page version was tried then deliberately removed per product feedback — controls belong where they're used); supplementary real-time highlight+scoring overlay during lesson/gym exercises (authoritative scoring untouched); rolling quantized notation strip above the Play-Along waterfall. Built via subagent-driven-development (15 tasks, 3 needed fix cycles for real bugs — a live-follow note-ordering bug for two-handed exercises, a chord-merging bug in the preview strip, weak test coverage on a shared judging helper — all fixed and re-reviewed clean), plus one more real bug (`groupIntoMeasures` conflating measure array position with absolute bar number, misaligning grand-staff hands when one rests a full bar) found by the final whole-branch review and fixed before merge. Spec: `docs/superpowers/specs/2026-07-11-notation-metronome-live-follow-design.md`; plan: `docs/superpowers/plans/2026-07-11-notation-metronome-live-follow.md`.
- **2026-07-11 — Play-along mode, song library, admin, feedback:** admin role + user management, feedback widget, 305-song curated MIDI library (ADL Piano MIDI dataset, `apps/api/scripts/fetch-midi-library.ts`), falling-notes play-along game with tempo/look-ahead/wait-mode scoring, Practice History gained a Play-along tab. Spec: `docs/superpowers/specs/2026-07-11-playalong-admin-feedback-design.md`. Deployed live same day.
- **2026-07-10 (10-parallel-worker batch) — content + integrity:** lessons 24→34 (repertoire, ear training, technique II), untimed scoring mode, quiz `correctIndex` no longer shipped to clients, Practice History page, notation key signatures/measures/dotted-notes, virtual-piano glissando.
- **2026-07-10 (design review + overhaul) — practice loop rebuilt:** metronome count-in + honest per-key feedback (previously scored an unheard tempo with conflated timing/pitch errors), key-tracked synth voice, auto grand-staff notation, felt/brass/ivory design system, dashboard with per-level progress, CI to GHCR.
- **2026-07-01 — narration + content:** ElevenLabs TTS narration with shared quota, lessons 13→24 (chromatic → circle of fifths → minor → dominant 7th → inversions → arpeggios).
