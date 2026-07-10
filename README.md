# Keyboard Sensei

Full-stack piano learning app. pnpm monorepo: `apps/web` (React/Vite/TypeScript/Tailwind/VexFlow/Zustand), `apps/api` (Express 5/Prisma/PostgreSQL/JWT/Zod), plus shared `packages/*` for domain types, MIDI capture/scoring, note naming, and lesson validation.

## What it does

- Growing Classical Technical Path: 24+ lessons spanning foundation to intermediate, with repertoire, ear-training, and technique batches landing over time.
- MIDI exercise player: metronome count-in, ▶ Listen previews of the target, honest per-key feedback (green = right pitch, red = wrong/missed), pass/fail scoring.
- Play with an on-screen piano (mouse, touch, or computer keyboard) or real hardware via Web MIDI.
- Quizzes, TTS lesson narration (ElevenLabs), progress tracking, and three themes.

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

The API contract is [docs/api-contract.yaml](docs/api-contract.yaml). Shared domain types, MIDI capture/scoring, note naming, and lesson validation live only in `packages/*`.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests, and builds on every push. Pushes to `master` additionally build Docker images and push them to `ghcr.io/ramin-azizi/keyboard-sensei-web` and `ghcr.io/ramin-azizi/keyboard-sensei-api`.

To deploy from those prebuilt images, use `docker-compose.ghcr.yml`. The server needs a one-time `docker login ghcr.io` with a personal access token that has the `read:packages` scope (the repo and images are private).

The alternative is building on the server itself with `docker-compose.deploy.yml` (rsync the repo over, then `docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build`). Prisma migrations apply automatically on container start.

## Roadmap

The maintained roadmap and current project status live in [CLAUDE.md](CLAUDE.md).
