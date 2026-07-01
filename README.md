# Keyboard Sensei MVP

Canonical pnpm monorepo for the 12-lesson classical-technical Keyboard Sensei MVP.

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
- `pnpm db:seed` — seed 12 lessons and the demo user

Backend env: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`. Frontend env: `VITE_API_URL`.

The API contract is [docs/api-contract.yaml](docs/api-contract.yaml). Shared domain types, MIDI capture/scoring, note naming, and lesson validation live only in `packages/*`.

## Post-MVP TODO

- Full skill-tree graph and Theory Library
- Dashboard charts, achievements, and streaks
- Admin/content-authoring CRUD
- Ear training and scrolling sight-reading
- Refresh tokens and native mobile wrappers
- Additional learning paths and levels
