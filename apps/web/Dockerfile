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
# The third-party licences page lists the Essentials editions from the API's manifest.
COPY apps/api/src/essentials/manifest.ts apps/api/src/essentials/manifest.ts

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
# Optional: the Google OAuth Web client ID. Unset = no "Sign in with Google" button.
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}

# Optional error monitoring (Sentry). All unset = no monitoring and no source-map upload.
# The auth token only exists in this build stage; the nginx image below never sees it.
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ARG SENTRY_PROJECT
ENV SENTRY_PROJECT=${SENTRY_PROJECT}

WORKDIR /app/apps/web
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
