# OctaviApp

Full-stack piano learning app. pnpm monorepo: `apps/web` (React/Vite/TypeScript/Tailwind/VexFlow/Zustand), `apps/api` (Express 5/Prisma/PostgreSQL/JWT/Zod), plus shared `packages/*` for domain types, MIDI capture/scoring, note naming, and lesson validation.

## What it does

- Three learning paths — Classical Technique, Reading & Rhythm, and Modern Chords — from foundation to intermediate, each lesson a graded set of scored exercises.
- MIDI exercise player: metronome count-in, ▶ Listen previews of the target, honest per-key feedback (green = right pitch, red = wrong/missed), pass/fail scoring.
- **Play-along mode**: Synthesia-style falling notes over the piano for a ~300-song curated library (public-domain classical + pop/film covers) plus your own MIDI uploads. Tempo scaling (25–100%), adjustable look-ahead visibility, wait mode, guide audio, timing-judged scoring (perfect/good/ok/miss, combos) with difficulty multipliers, and per-song personal bests. Fetch the library with `pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-midi-library.ts`.
- Play with an on-screen piano (mouse, touch, or computer keyboard) or real hardware via Web MIDI.
- Quizzes, TTS lesson narration (ElevenLabs), progress tracking, practice history (exercises + play-along), and three themes.
- **Feedback button on every page** (bug/idea reports) and an **admin area** (user management with per-lesson progress control, feedback queue, song library management). Admin login: `admin@keyboardsensei.local` / `ADMIN_PASSWORD` env (dev fallback `admin-sensei-dev`); admins see every lesson unlocked.

## Prerequisites

- Node.js 22+
- pnpm 10.12.1 (the version pinned by `packageManager`)
- Docker with Compose

Enable the pinned package manager, then install:

```sh
corepack enable
corepack prepare pnpm@10.12.1 --activate
pnpm install
```

If a Node distribution omits the Corepack executable, install/run Corepack through npm first: `npx corepack@0.34.0 enable`.

## Fresh setup

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm db:start
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Web: `http://localhost:5173`. API: `http://localhost:3001`. Run individual services with `pnpm dev:web` and `pnpm dev:api`.

Demo login: `demo@keyboardsensei.local` / `demo-password`.

## Commands

- `pnpm test` — all tests
- `pnpm typecheck` — all TypeScript projects
- `pnpm build` — all production builds
- `pnpm db:start` / `pnpm db:stop` — PostgreSQL lifecycle
- `pnpm db:migrate` — create/apply a development migration
- `pnpm db:migrate:deploy` — apply committed migrations
- `pnpm db:seed` — seed all lessons and the demo user

Backend env: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`. Frontend env: `VITE_API_URL`.

Optional backend env (see `apps/api/.env.example`):
- `REGISTRATION_OPEN` — `true` (default) or `false`. `false` closes self-service sign-up (`POST /auth/register` returns 403); admins can still create accounts in the admin area.
- `TRUST_PROXY` — number of reverse-proxy hops in front of the API (default `0`). Needed so the login/sign-up rate limits see real client IPs; the LAN deploy (Caddy → nginx → api) sets `2` in `docker-compose.deploy.yml`.
- `TTS_USER_DAILY_LIMIT` — max new narration characters per user per UTC day (default `2500`), on top of the shared 10,000-character monthly pool.
- `ADMIN_PASSWORD` — the seeded admin's password. The seed refuses to run without it when `NODE_ENV=production`.

Real-database tests: `apps/api/src/integration.db.test.ts` runs the real app against Postgres when `TEST_DATABASE_URL` is set in the shell (not `.env`), and is skipped otherwise. It truncates every table, so it refuses any database whose name doesn't contain `test`:

```sh
export TEST_DATABASE_URL=postgresql://keyboard_sensei:keyboard_sensei@localhost:5432/keyboard_sensei_test
DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @keyboard-sensei/api exec prisma migrate deploy
pnpm --filter @keyboard-sensei/api test
```

Lesson content: every lesson id is a permanent database key (user progress and attempts reference it), so ids are explicit literals in `apps/api/src/content/*` — never derived from position. Order is the lesson's position in `lessons` (`apps/api/src/content.ts`); new lessons can be inserted anywhere and should use a descriptive slug id (e.g. `lesson-hanon-1`). The seed reassigns orders in one transaction. Lessons/exercises removed from content are deleted only if no user data references them; otherwise they are kept, marked `retired_at`, and hidden (the seed prints a warning).

Progression (XP, stars, daily goal and streak, achievements) is awarded on the server when an attempt is saved; the formulas live in `apps/api/src/progression/` (XP table at the top of `xp.ts`). The XP ledger (`XpEvent`) is the source of truth, and every award is keyed by what earned it, so nothing pays twice. History saved before progression existed is backfilled by the seed, or on its own with `pnpm --filter @keyboard-sensei/api exec tsx scripts/backfill-progression.ts` — safe to re-run, it only adds what is missing.

The API contract is [docs/api-contract.yaml](docs/api-contract.yaml). Shared domain types, MIDI capture/scoring, note naming, and lesson validation live only in `packages/*`.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests, and builds on every push. Pushes to `master` additionally build Docker images and push them to `ghcr.io/mindthaapp/keyboard-sensei-web` and `ghcr.io/mindthaapp/keyboard-sensei-api`.

To deploy from those prebuilt images, use `docker-compose.ghcr.yml`. The server needs a one-time `docker login ghcr.io` with a personal access token that has the `read:packages` scope (the repo and images are private).

The alternative is building on the server itself with `docker-compose.deploy.yml` (rsync a clean checkout of `HEAD` over, then `docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build`). Prisma migrations apply automatically on container start.

## Operations

[docs/operations.md](docs/operations.md) covers the live server: the deploy procedure (always from a clean worktree at `HEAD`), the server-side asset fetch/generate commands (library songs, beginner tunes, Essentials pack, instruments), backups and restore, LAN HTTPS and CA trust for Web MIDI, environment variables, and a table of gotchas and lessons learned from past bugs. Read the gotchas before changing notation rendering, timing/tempo code, or the play-along render loop.

## Android app

`apps/mobile` wraps the web app in a Capacitor shell with native USB and Bluetooth MIDI. [docs/android.md](docs/android.md) covers the toolchain, local and CI builds, release signing, and the Play Console steps.
