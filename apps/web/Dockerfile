FROM node:22-alpine AS build

RUN npm install -g pnpm@10.12.1

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/midi-engine/package.json packages/midi-engine/package.json
COPY packages/music-theory/package.json packages/music-theory/package.json
COPY packages/lesson-engine/package.json packages/lesson-engine/package.json
COPY packages/playalong-core/package.json packages/playalong-core/package.json
COPY patches patches

RUN pnpm install --no-frozen-lockfile

COPY apps/web apps/web
COPY packages packages

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

WORKDIR /app/apps/web
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
