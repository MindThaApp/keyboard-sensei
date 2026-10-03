# Runs the API via tsx (same as verified-working dev mode) since workspace
# packages export raw TypeScript (see packages/*/package.json "exports"),
# resolved by tsx/bundlers rather than a compiled dist output.
FROM node:22-alpine

RUN npm install -g pnpm@10.12.1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/midi-engine/package.json packages/midi-engine/package.json
COPY packages/music-theory/package.json packages/music-theory/package.json
COPY packages/lesson-engine/package.json packages/lesson-engine/package.json
COPY packages/playalong-core/package.json packages/playalong-core/package.json
COPY patches patches

RUN pnpm install --no-frozen-lockfile

COPY apps/api apps/api
COPY packages packages

WORKDIR /app/apps/api
RUN pnpm prisma:generate

EXPOSE 3001
# Applies pending migrations (safe/idempotent) on every start, then boots the server.
# Seeding is NOT run here since it resets demo-user progress on every rerun (see seed.ts
# upserts) — run it once manually after first deploy via `docker compose exec api pnpm seed`.
CMD ["sh", "-c", "pnpm prisma:migrate:deploy && pnpm exec tsx src/server.ts"]
