# Operations

Deploying, maintaining and backing up the live OctaviApp server, plus the
engineering lessons the codebase has accumulated. Local development setup is in
the [README](../README.md).

## Server

The reference deployment runs on a home LAN server (Debian) under
Docker Compose. It is reachable at `https://<deploy-host>:8181` (Caddy reverse
proxy; the API is at `https://<deploy-host>:8181/api`), and via VPN subnet
routing when off the LAN.

The commands below use two shell variables for the server: `DEPLOY_HOST` (its
LAN address or hostname, also read by the Caddyfile and compose files) and
`DEPLOY_USER` (the SSH user). Export them first, e.g.
`export DEPLOY_HOST=<address> DEPLOY_USER=<user>`. Where this document says
`<deploy-host>`, use the same value. Put `DEPLOY_HOST=<address>` in the server's
`.env.deploy` as well so Caddy issues its certificate for that address.

## Deploy

**Always deploy from a clean worktree at `HEAD`, never from your working tree.**
Rsyncing a working tree ships whatever uncommitted work is in it. A broken deploy
happened exactly this way: a file was staged mid-edit and imported a module that
had not been committed yet.

```sh
git worktree add --detach /tmp/ks-deploy HEAD
cd /tmp/ks-deploy
rsync -az --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.pnpm-store' \
  --exclude '*.log' --exclude '.env' --exclude 'apps/api/.env' --exclude 'apps/web/.env' \
  --exclude '*.tsbuildinfo' \
  --exclude '.env.deploy' --exclude '.env.deploy.bak' --exclude 'keyboard-sensei-lan-ca.crt' \
  --exclude 'apps/api/data' \
  ./ "$DEPLOY_USER@$DEPLOY_HOST":~/apps/keyboard-sensei/
ssh "$DEPLOY_USER@$DEPLOY_HOST" "cd ~/apps/keyboard-sensei && docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build"
cd - && git worktree remove --force /tmp/ks-deploy
```

`--delete` removes server files that no longer exist in the repo. The excluded
paths are server-only (secrets, the LAN CA certificate, volume-mounted data), so
`--delete` leaves them alone.

Prisma migrations apply automatically on container start.

### Prebuilt images (alternative)

CI (`.github/workflows/ci.yml`) builds and pushes
`ghcr.io/mindthaapp/keyboard-sensei-{web,api}` on every push to `master`. To
deploy those instead of building on the server, use `docker-compose.ghcr.yml`.
The server first needs a one-time `docker login ghcr.io` with a personal access
token that has `read:packages` (the repo and images are private). That login is
not set up yet, so deploys currently use the build-on-server path
(`docker-compose.deploy.yml`).

## Server-side assets

These files are gitignored and volume-mounted, so they are in neither git nor
the images. Fetch or generate them on the server after a fresh deploy:

```sh
# 305 library songs
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-midi-library.ts'"
# 20 authored beginner tunes
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/generate-beginner-pack.ts'"
# Essentials pack: fetch the source MIDIs, then generate and verify the Full/Intermediate/Beginner levels
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-essentials-pack.ts'"
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/generate-essentials-pack.ts'"
# Source pack (piano-midi.de + Mutopia), as DRAFTS: fetches each pinned file, checks it, creates draft Works and Songs
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/import-pack.ts batch-a'"
# 128 sampled instruments (~256MB)
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-instrument-library.ts'"
# Studio Grand piano (VCSL Steinway B, ~5MB pack). Needs ffmpeg with libmp3lame, which the API image doesn't have:
# run `pnpm --filter @keyboard-sensei/api exec tsx scripts/fetch-vcsl-piano.ts` on a machine that does, then copy
# apps/api/data/instruments/vcsl_steinway_b and apps/api/scripts/vcsl-piano-manifest.json to the server's volumes.
# Seed (always last: it indexes what the scripts above wrote)
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'"
```

Content-only changes (no schema change) still need a reseed to reach the
deployed demo account:

```sh
ssh "$DEPLOY_USER@$DEPLOY_HOST" "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'"
```

## Backups and restore

Run `scripts/backup-keyboard-sensei.sh` on the server. It writes a PostgreSQL
custom-format dump plus a tarball of each data volume to
`$HOME/backups/keyboard-sensei` (override with `BACKUP_DIR`). Suggested
crontab entry:

```cron
30 3 * * * /home/<user>/apps/keyboard-sensei/scripts/backup-keyboard-sensei.sh >> /home/<user>/backups/keyboard-sensei/backup.log 2>&1
```

Restore steps (database dump and each volume, including the Caddy data volume
that holds the LAN CA root) are in
[scripts/restore-keyboard-sensei.md](../scripts/restore-keyboard-sensei.md).

### Off-box copies with rclone

A backup on the same disk as the data doesn't survive the disk, a fire or a
theft. When `RCLONE_REMOTE` is set, the script uploads the set it just made with
[rclone](https://rclone.org) and deletes remote `ks-*` files older than
`RCLONE_KEEP_DAYS` days (default 14, the same as the local rotation of 14 sets).
That keeps the privacy policy's promise that a deleted account leaves the
backups within 14 days. The local backup always completes first; an upload
failure only makes the script exit non-zero, so it shows in the cron log.

One-time setup on the server (as the deploy user, so cron uses the same config):

1. `sudo apt install rclone`
2. `rclone config` and create a remote. Either:
   - **Backblaze B2** (cheap, simple): type `b2`, with an application key limited
     to one private bucket (e.g. `ks-backups`). The destination is then
     `ks-b2:ks-backups/keyboard-sensei`.
   - **Google Drive**: type `drive`, scope `drive.file`. On a headless server use
     the "remote config" flow (`rclone authorize "drive"` on a machine with a
     browser). Destination: `ks-drive:keyboard-sensei-backups`.
3. Recommended: wrap it in an encrypting `crypt` remote (type `crypt`, remote
   `ks-b2:ks-backups/keyboard-sensei`, generate a password and a salt), so the
   provider only ever holds ciphertext. **Store both passwords somewhere other
   than the server** (a password manager): without them the copies are useless.
   Destination: `ks-crypt:`.
4. Check it: `rclone lsd ks-crypt:` (or your remote) answers without error.
5. Add the variable to the crontab line:

```cron
30 3 * * * RCLONE_REMOTE=ks-crypt: /home/<user>/apps/keyboard-sensei/scripts/backup-keyboard-sensei.sh >> /home/<user>/backups/keyboard-sensei/backup.log 2>&1
```

rclone reads `~/.config/rclone/rclone.conf`; set `RCLONE_CONFIG` to use another
file. The upload and pruning were tested against a real rclone with a local
folder as the remote (stubbed `docker`); they have not been run against any
cloud provider.

### Restore drill (do it once, then every few months)

A backup that has never been restored is a hope, not a backup. On a machine
other than the server (a laptop with Docker is enough):

1. List what's there: `rclone ls ks-crypt: | sort -k2 | tail`. Pick the newest
   date stamp, e.g. `2026-11-02_0330`.
2. Download that set: `rclone copy ks-crypt: ./restore --include '*2026-11-02_0330*'`.
3. Start a throwaway Postgres and restore the dump into it:

   ```sh
   docker run -d --name ks-restore -e POSTGRES_PASSWORD=x -e POSTGRES_USER=keyboard_sensei -e POSTGRES_DB=keyboard_sensei -p 55432:5432 postgres:17-alpine
   sleep 5
   docker exec -i ks-restore pg_restore -U keyboard_sensei -d keyboard_sensei --no-owner < restore/ks-db-2026-11-02_0330.dump
   ```

4. Check it's real data, not just a schema:
   `docker exec ks-restore psql -U keyboard_sensei -c 'select count(*) from "User"' -c 'select max(created_at) from "ExerciseAttempt"'`.
   The newest attempt should be from the day before the backup.
5. Check the archives open: `tar -tzf restore/ks-midi-library-2026-11-02_0330.tar.gz | head`.
6. Clean up: `docker rm -f ks-restore && rm -rf restore`.

A real restore onto the server follows
[scripts/restore-keyboard-sensei.md](../scripts/restore-keyboard-sensei.md),
using the files from step 2.

## LAN HTTPS and CA trust

The server is HTTPS only, using Caddy's internal CA. This is required: browsers
expose Web MIDI (hardware keyboard input) only in a secure context.

Each device that wants hardware MIDI must trust the Caddy CA root once:

1. Get the certificate, either from `/data/caddy/pki/authorities/local/root.crt`
   inside the `keyboard-sensei-caddy-1` container, or from the shared drive at
   `/home/<user>/shared/keyboard-sensei-lan-ca.crt`.
2. On macOS:
   `security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db <path>`
3. Fully quit and reopen the browser. A tab refresh does not pick up newly
   trusted certificates.

If every real client (curl, Chrome, Edge) fails the TLS handshake while
`openssl s_client` succeeds, check SNI before suspecting the network: clients
omit SNI for literal-IP connections, and Caddy needs `default_sni` to answer
them.

## Environment variables

The server's secrets live in `~/apps/keyboard-sensei/.env.deploy`, read by
`docker-compose.deploy.yml`. It is gitignored and never committed.

| Variable | Where | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env.deploy` | Used for the Postgres container and the API's `DATABASE_URL` |
| `JWT_SECRET` | `.env.deploy`, `apps/api/.env` | At least 16 characters |
| `ELEVENLABS_API_KEY` | `.env.deploy`, `apps/api/.env` | Lesson narration. Server-side only: never a `VITE_` variable |
| `ADMIN_PASSWORD` | `.env.deploy`, optional locally | The seeded admin's password. Local dev falls back to `admin-sensei-dev`; the seed refuses to run without it when `NODE_ENV=production` |
| `CORS_ORIGIN` | `.env.deploy`, `apps/api/.env` | The web origin |
| `VITE_API_URL` | `.env.deploy` (build arg), `apps/web/.env` | API base URL baked into the web build |
| `REGISTRATION_OPEN` | optional | `false` closes self-service sign-up |
| `TRUST_PROXY` | optional | Reverse-proxy hops; the deploy sets `2` (Caddy, nginx, api) |
| `TTS_USER_DAILY_LIMIT` | optional | Per-user daily narration characters (default `2500`) |
| `PUBLIC_CATALOGUE` | optional | `true` serves only the Essentials and beginner packs plus each user's own songs, and switches the piano archive off. Default `false`. See "Public release" |
| `REQUIRE_EMAIL_VERIFICATION` | optional | `true` blocks sign-in until a new account confirms its email. Default `false` |
| `APP_URL` | optional | Public web origin for links in emails. Default: the first `CORS_ORIGIN` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional | Outgoing email. Without `SMTP_HOST`, emails go to the API log |
| `GOOGLE_CLIENT_IDS` | optional | Comma-separated Google OAuth client IDs (Web, Android) accepted by `POST /auth/google`. Unset = Google sign-in off |
| `VITE_GOOGLE_CLIENT_ID` | `.env.deploy` (build arg), `apps/web/.env` | The Web client ID, baked into the web build. Unset = no Google button |
| `CLOUDFLARE_TUNNEL_TOKEN` | `.env.deploy` | Only for the `public` compose profile (Cloudflare Tunnel) |
| `SENTRY_DSN` | API env | DSN of the **api** Sentry project. Unset = API error reporting off |
| `SENTRY_TUNNEL_DSNS` | API env | Comma-separated DSNs of the **web** and **android** projects. The only destinations `POST /sentry-tunnel` forwards to (host, project id and key must match). Unset = the tunnel answers 404 |
| `SENTRY_TRACES_SAMPLE_RATE`, `VITE_SENTRY_TRACES_SAMPLE_RATE` | optional | 0..1, default `0` (tracing off) |
| `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` | API env, optional | Defaults: `production` when `NODE_ENV=production` else `development`; `keyboard-sensei@<version>+<git sha>` |
| `GIT_SHA` | `.env.deploy` / build arg | Full or short commit hash for the release name. The deploy rsyncs without `.git`, so pass it: `GIT_SHA=$(git rev-parse HEAD)` in the `docker compose` command (CI passes `github.sha`) |
| `VITE_SENTRY_DSN` | `.env.deploy` (build arg), `apps/web/.env` | DSN of the **web** project, baked into the web build. Unset = no monitoring in the website |
| `VITE_SENTRY_DSN_ANDROID` | Android build env | DSN of the **android** project; falls back to `VITE_SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN`, `SENTRY_PROJECT`, `SENTRY_ORG`, `SENTRY_URL` | build env / build args | Source-map upload (see "Error monitoring"). Only when `SENTRY_AUTH_TOKEN` is set; org defaults to `mindtheapp`, URL to `https://de.sentry.io` |
| `RCLONE_REMOTE`, `RCLONE_KEEP_DAYS` | crontab | Off-box backup destination and its retention (default 14 days) |
| `OMR_SERVICE_URL` | `.env.deploy`, `apps/api/.env` | Sheet-music recognition (beta): `http://omr:8090` with the `omr` compose profile, `http://localhost:8090` locally. Unset = the feature is hidden. See "Sheet-music recognition" |

Local development uses `apps/api/.env` and `apps/web/.env`, copied from their
`.env.example` files.

## Sheet-music recognition (beta)

"Photo or PDF of sheet music" (Settings → Library) turns a PDF (up to 6 pages) or a photo of
printed music into a private song. Off unless `OMR_SERVICE_URL` is set.

- **Engine:** [homr](https://github.com/liebharc/homr) (AGPL-3.0), installed unmodified at a
  pinned commit in `services/omr/Dockerfile` (keep `HOMR_COMMIT` in `apps/web/scripts/third-party-licenses.ts`
  in step; a test checks). It runs as its own container behind a small HTTP wrapper
  (`services/omr/server.py`) and is never linked into our code. If homr is ever *modified*,
  AGPL §13 requires offering the modified source to users.
- **Isolation and limits:** compose profile `omr`; only on the `internal: true` network `omr`
  shared with the API (no route out; models are baked in at build time). Read-only root, tmpfs
  `/tmp`, 2 CPUs, 2.5 GB, all capabilities dropped. One recognition at a time (the service
  answers 503 if busy); a 240 s limit per file. Inputs are checked by magic bytes: PDF ≤ 6 pages,
  JPEG/PNG 800 px – 50 MP, 20 MB.
- **Queue:** in the API process (`apps/api/src/omr/`), one worker, at most 5 waiting, one
  unfinished job per user, 10 uploads per user per hour. Results stay in memory, private to the
  uploader, for an hour; nothing is written until the user reviews the engraving and saves it
  (`content_rights = "user-score-scan"`, private like any upload). A restart drops queued and
  unsaved jobs.
- **Cost:** 1.7 to 1.9 GB peak. Per page with the 2-CPU limit: about 18.5 s on the arm64 Mac VM (2 vCPU), about
  11.5 s on an amd64 Ryzen 9 9900X (2 and 4 CPUs measured alike, 2-page Bach prelude), and an **estimate** of
  25 to 40 s on the server's Intel N150 (no measurement; the N150's single-thread speed is roughly a third to
  half of a 9900X's in public benchmarks). The 240 s limit therefore holds for 6 pages with margin on the
  Ryzen and probably on the N150, but measure there before enabling.
- **Threads:** homr creates its ONNX Runtime sessions with default options, so they size their pools to the
  host's cores; under a container CPU quota that was 8 times slower (157 s vs 22 s for the 2-page prelude on
  amd64). `services/omr/ortpatch/sitecustomize.py` (loaded only in the homr process, homr stays unmodified)
  sets intra-op threads to the cgroup CPU limit, one inter-op thread and no spinning. Overrides:
  `OMR_ORT_THREADS`, `OMR_ORT_SPIN=1`, `OMR_ORT_PATCH=0` (off). Disabling spinning made no measurable difference.
- **Turn on:** `docker compose --env-file .env.deploy -f docker-compose.deploy.yml --profile omr up -d --build`
  with `OMR_SERVICE_URL=http://omr:8090` in `.env.deploy`. Locally:
  `docker compose --profile omr up -d omr` and `OMR_SERVICE_URL=http://localhost:8090` in `apps/api/.env`.
- **Service tests:** `docker run --rm --network none <omr image> python -m unittest test_server`.

## Public release

Everything below is off by default, so the LAN deployment behaves exactly as
before until each setting is switched on.

### Song catalogue licensing (`PUBLIC_CATALOGUE`)

| Source | Licence finding | With `PUBLIC_CATALOGUE=true` |
|---|---|---|
| Essentials pack (`src/essentials/manifest.ts`) | Public-domain compositions; Mutopia editions are Public Domain, CC BY or CC BY-SA, each with its typesetter recorded | Public, with the `attribution` line shown on the song page and on `/third-party-licenses` |
| Beginner pack (`scripts/generate-beginner-pack.ts`) | Public-domain tunes, arranged here | Public |
| ADL library (`scripts/fetch-midi-library.ts`, 263 of the 305 still live after Essentials replacements) | **No licence.** The [ADL Piano MIDI](https://github.com/lucasnfe/adl-piano-midi) repository has no LICENSE file (GitHub reports none). It is derived from the Lakh MIDI Dataset, which is CC BY 4.0 as a *compilation*, but its MIDI files were scraped from the web with no per-file author or licence, and about 2,065 more files were "scraped from publicly-available sources". The `public-domain` label in `fetch-midi-library.ts` describes the *composition*, not the MIDI sequence, which can carry its own copyright. So no file, even of a Bach piece, has a licence we can rely on | **All hidden** from the song list and from the file, notation and attempt routes (a 404, like a missing song). Admins still see everything |
| PianoCoRe archive (`src/archive.ts`) | CC BY-NC-SA 4.0: non-commercial only. Our server fetches and serves the files, so we are the distributor | `/archive/*` answers 404 for everyone and the web app hides "Browse Archive". Songs users imported earlier stay private to them |
| Users' uploads and recordings | The user's responsibility (see the terms) | Private to the uploader, as always |

The rule lives in one predicate, `isPubliclyServable` / `canSeeSong` in
`apps/api/src/songs.ts`. The Today screen, the "Ready for you" shelf and the
achievements already read only Essentials songs, so they work unchanged.

Source packs (`scripts/import-pack.ts`, pins in `src/catalogue/packs/`) ingest
piano-midi.de and Mutopia files as **draft** Works and Songs, each with its
`attribution` line (for piano-midi.de: Bernd Krueger, the site, the copyright
year read from the file, CC BY-SA 3.0 DE and a link to it). A pack never
publishes anything: a reviewer sets the Work to published. Songs of a draft or
in-review Work are left out of the shared list and `/credits`. **piano-midi.de
songs are never `public_eligible` yet**: its licence is unconfirmed, so
`UNCONFIRMED_LICENCE_SOURCES` in `src/catalogue/backfill.ts` holds it back from
public builds. Check the licence on the site's copyright page in a browser,
then remove `piano-midi-de` from that set and re-run the seed. The site answers
scripted requests with HTTP 418, so the pinned files are fetched from the copy
Midiano serves (sha256-checked, and each must carry Bernd Krueger's copyright
notice). Their source should be added to
`apps/web/scripts/third-party-licenses.ts` alongside Essentials.

### Email (password reset and verification)

Without `SMTP_HOST` the API writes each email to its log ("console transport"),
which is fine on the LAN and useless in public: the API logs a warning at start
when `NODE_ENV=production` and no SMTP is set. Any SMTP service works (a
transactional provider such as Postmark, Amazon SES, Brevo or Mailgun, or a
mailbox's SMTP). Set in `.env.deploy`: `SMTP_HOST`, `SMTP_PORT` (587 for STARTTLS,
465 with `SMTP_SECURE=true`), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
(e.g. `OctaviApp <no-reply@yourdomain>`) and `APP_URL` (the public web
origin, used for the links). Add SPF and DKIM records for the sending domain as
the provider instructs, or the emails land in spam.

- Forgot password always answers `202` whether or not the address exists, and
  the lookup happens after the response, so timing doesn't tell either. Limits:
  5 requests per IP per 15 minutes, and at most 3 emails per address per hour.
- The token is 32 random bytes, single-use, valid for 30 minutes; only its
  SHA-256 is stored (`AuthToken`). A new request voids older links.
- `REQUIRE_EMAIL_VERIFICATION=true`: new sign-ups get a confirmation link (48
  hours) and can't sign in until they use it. Older accounts have no
  verification date, so turning this on locks them out until they confirm with
  "Send the link again" on the sign-in page (or reset their password, which also
  confirms the address). The seeded demo and admin accounts are marked verified.

### Account deletion

Settings → Account → Delete account (password, or Google for Google-linked
accounts), and the signed-out page `/delete-account` (email + password) both call
`deleteUserAccount` in `apps/api/src/account.ts`, as does admin user deletion.
It removes every row that references the user (all per-user tables cascade;
feedback is deleted explicitly because its foreign key only detaches) and their
files: uploads, recordings, score imports (the original score, its MEI and MIDI),
archive imports (MIDI and MusicXML), instrument packs and feedback screenshots. The shared demo account and the last admin can't
be deleted. Give Google Play `https://<your domain>/delete-account` as the
account-deletion URL.

### Google sign-in

`POST /auth/google` takes a Google ID token, verifies it with google-auth-library
against `GOOGLE_CLIENT_IDS`, and returns the app's normal session. It links by
`google_sub`, then by an existing account with the same address if Google says
the address is verified, else creates an account (only while
`REGISTRATION_OPEN` is true). It is token-based on purpose: the Android app will
need a native sign-in flow (Credential Manager) inside Capacitor, because Google
blocks its web sign-in inside WebViews, and that flow sends the same ID token to
the same route.

What to create in [Google Cloud Console](https://console.cloud.google.com/):

1. **Project**: create one, e.g. "OctaviApp".
2. **OAuth consent screen** (Google Auth Platform → Branding / Audience / Data access):
   - App name: OctaviApp. User support email: your address. App logo: optional
     (a logo triggers brand verification).
   - App domain: home page `https://<your domain>/`, privacy policy
     `https://<your domain>/privacy`, terms `https://<your domain>/terms`.
   - Authorised domains: `<your domain>` (the registrable domain).
   - Developer contact email: your address.
   - Audience: **External**. Publish the app ("In production"); while it is in
     "Testing" only listed test users can sign in.
   - Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`
     only. These are non-sensitive, so no Google verification review is needed.
3. **Web client** (Clients → Create client → Web application), e.g. "OctaviApp web":
   - Authorised JavaScript origins: `https://<your domain>`, plus
     `http://localhost:5173` for development. (Google sign-in won't work on the
     LAN address `https://<deploy-host>:8181`: Google doesn't accept IP addresses
     as origins.)
   - No redirect URIs are needed (the button uses the popup flow).
4. **Android client** (Create client → Android):
   - Package name: `com.midivory.app`.
   - SHA-1 certificate fingerprint: of the key that signs the app *as installed*.
     With Play App Signing, copy the "App signing key certificate" SHA-1 from Play
     Console → Test and release → App integrity. Create a second Android client
     with your upload/debug key's SHA-1 (`keytool -list -v -keystore <keystore>`)
     for builds you install yourself.
   - The Android app requests its ID token with the **Web** client ID as the
     server client ID; the Android client entry is what authorises the package
     and signature. Both IDs go in `GOOGLE_CLIENT_IDS`.
5. **Where the IDs go**:
   - `.env.deploy`: `GOOGLE_CLIENT_IDS=<web client id>,<android client id>` (API)
     and `VITE_GOOGLE_CLIENT_ID=<web client id>` (baked into the web build; then
     rebuild the web image).
   - No client secret is needed anywhere: ID-token verification uses Google's
     public keys.
   - Leaving either unset keeps the feature off: the API answers 503 and the web
     app shows no Google button.

### Public exposure with Cloudflare Tunnel

A tunnel serves the app at a public domain with a real certificate without
opening any port on the router. The `cloudflared` service in
`docker-compose.deploy.yml` sits behind the `public` profile, so it doesn't start
unless asked. Caddy and the LAN route on `https://<deploy-host>:8181` keep working
alongside it.

1. Put the domain on Cloudflare (free plan is fine).
2. Zero Trust → Networks → Tunnels → Create a tunnel (type Cloudflared), named
   e.g. `keyboard-sensei`. Copy the token into `.env.deploy` as
   `CLOUDFLARE_TUNNEL_TOKEN`.
3. In the tunnel, add a public hostname: `<your domain>` (or `app.<your domain>`),
   service type HTTP, URL `web:80`. The tunnel reaches the web container over the
   compose network, and nginx forwards `/api/` to the API exactly as for the LAN.
4. Set the variables below, then:
   `docker compose --env-file .env.deploy -f docker-compose.deploy.yml --profile public up -d --build`.
5. Check: `https://<your domain>/privacy` loads with a valid certificate, and
   `https://<your domain>/api/health` answers `{"status":"ok"}`.

What changes in `.env.deploy` when the app goes public:

| Setting | Value | Why |
|---|---|---|
| `CORS_ORIGIN` | `https://<your domain>,https://<deploy-host>:8181,https://localhost` | Every origin a browser calls the API from: the public site, the LAN site, and the Android app (Capacitor serves the app from `https://localhost`). Same-origin `/api` calls don't need CORS, but the Android app's do |
| `VITE_API_URL` | `/api` (unchanged) | Relative, so the same build works on the public domain and the LAN address |
| `APP_URL` | `https://<your domain>` | Links in emails must use the public origin, not the LAN one |
| `TRUST_PROXY` | stays `2` | Through the tunnel the chain is Cloudflare → cloudflared → nginx → API. Cloudflare puts the client address in `X-Forwarded-For`, nginx appends cloudflared's, so the client is 2 hops back, as on the LAN (Caddy → nginx → API). **Verify after going live**: from a phone on mobile data, fail the login 11 times (the 11th gets "Too many failed sign-in attempts"), then confirm a laptop on another network can still sign in. If the laptop is blocked too, every visitor is sharing one rate-limit bucket: set nginx to pass `CF-Connecting-IP` as the client address for requests from cloudflared |
| `REGISTRATION_OPEN` | `true` | Public sign-up. Abuse limits: 10 new accounts per IP per hour |
| `PUBLIC_CATALOGUE` | `true` | See "Song catalogue licensing". Required before the public can sign up |
| `REQUIRE_EMAIL_VERIFICATION` | `true` once SMTP works | Stops sign-ups with other people's addresses |
| `SMTP_*`, `MAIL_FROM` | your provider | Password reset must actually reach people |
| `ADMIN_PASSWORD` | a long random password | The seeded admin (`admin@keyboardsensei.local`) is reachable from the internet once public. The seed resets it to this value on every run |
| `GOOGLE_CLIENT_IDS`, `VITE_GOOGLE_CLIENT_ID` | from Google Cloud Console | Optional |

Rate limits that matter in public (all in-memory, per API process; a restart
resets them): failed logins 10 per IP per 15 minutes; sign-ups 10 per IP per
hour; forgot password and resend verification 5 per IP per 15 minutes (plus 3
emails per address per hour); token redemptions 20 per IP per 15 minutes;
Google sign-in 30 per IP per 15 minutes; failed account deletions 10 per 15
minutes; uploads 60 per user per hour; URL imports 10 per user per hour; new
narration 2,500 characters per user per day.

Also consider before launch:

- **The shared demo account.** "Start Demo" signs everyone into the same account
  (`demo@keyboardsensei.local` / `demo-password`, both public in the web bundle).
  Deletion is refused for it, but anyone can change its password (breaking the
  demo until the next reseed) or read what others did in it. Either hide "Start
  Demo" on the public site or make demo sessions per-visitor.
- **Narration costs.** Every new account gets 2,500 narration characters a day
  from the shared ElevenLabs quota; the monthly pool caps the total spend.
- Cloudflare in front means Cloudflare sees visitors' IP addresses; the privacy
  policy says so.

## Error monitoring (Sentry)

Sentry SaaS, **EU region**, organisation `mindtheapp`, three projects: **web**,
**api**, **android**. Everything is off unless a DSN is configured; tests and CI
never send events (the test setups clear the variables, and the web code ignores
`VITE_SENTRY_DSN` when `MODE=test`).

How it fits together:

- **Release** is `keyboard-sensei@<version>+<git sha>` (12 chars), identical in the
  Vite plugin, `Sentry.init` and the API. **Environment** is `development`,
  `production` or `android`.
- **Privacy.** `sendDefaultPii: false`, no session replay, no session tracking,
  tracing off. Every event, breadcrumb and feedback event goes through one
  redactor (`packages/shared-types/src/sentry.ts`) that removes emails, JWTs and
  bearer tokens, secret query parameters, auth headers and cookies, request
  bodies, home-directory paths and host names. The only user field kept is the
  internal account id.
- **Consent** is per device: Ask / Always / Never (Settings → Account → Crash
  reports). The website defaults to Always, the Android app asks once on first
  launch. The SDK is not even loaded until the choice is Always.
- **Tunnel.** The apps post envelopes to `POST /sentry-tunnel` on the API
  (`/api/sentry-tunnel` behind nginx, 5 MB limit, 60 per IP per minute), which
  forwards them to the EU ingest host. Ad blockers don't see it and Sentry never
  sees the user's IP. It only forwards envelopes whose DSN (host, project id and
  public key) is in `SENTRY_TUNNEL_DSNS`, and builds the destination from that
  configuration, never from the request.
- **API.** `@sentry/node`, initialised first (`src/instrument.ts`). Only 5xx errors
  from the central error handler are reported; 4xx are not. Events are flushed on
  shutdown.
- **Feedback.** The existing feedback form still saves to our database. After a
  successful save it also sends one Sentry feedback event through our own form
  (Sentry's floating widget is not used). The event carries the message and tags
  `feedback_kind`, `feedback_id` (our row id), `route`, `experience_mode`,
  `platform` (`web` or `android`) and `app_version` (release, including the git
  sha), plus `associatedEventId` when an error happened in the last 5 minutes.
  A contact email is sent only when the user typed one or ticked "Include my
  account email"; it is never added automatically and is the one address the
  redactor lets through (emails in the message text are still redacted). The
  screenshot is sent only if the user attached one, downscaled to at most 1280px
  as a JPEG (quality 0.75). A Sentry failure never affects the save or what the
  user sees. Find it in Sentry under **User Feedback** (or search
  `issue.category:feedback`). Suggested, **not configured yet**: an alert rule
  (Alerts, new alert, Issues, filter on `issue.category:feedback`, action: email)
  so new feedback reaches an inbox.
- **Source maps.** With `SENTRY_AUTH_TOKEN` set the web build is made with
  `sourcemap: "hidden"`, uploaded by `@sentry/vite-plugin` and then deleted from
  `dist`, so no map is ever served. Without the token no maps are produced and the
  build is unchanged. Remember: `vite.config.ts` only, never a `vite.config.js`.

CI settings (all optional; builds succeed without them):

| Where | Name | Kind |
|---|---|---|
| GitHub | `SENTRY_AUTH_TOKEN` | secret (org auth token with `project:releases`) |
| GitHub | `VITE_SENTRY_DSN` | variable (web DSN) |
| GitHub | `SENTRY_PROJECT_WEB`, `SENTRY_PROJECT_ANDROID` | variables (project slugs) |
| GitHub | `VITE_SENTRY_DSN_ANDROID` | variable (android DSN) |

To turn it on for the server: create the three projects, then in `.env.deploy` set
`SENTRY_DSN` (api), `SENTRY_TUNNEL_DSNS` (web DSN, android DSN),
`VITE_SENTRY_DSN` (web), `SENTRY_AUTH_TOKEN` and `SENTRY_PROJECT` (web slug), and
redeploy with `GIT_SHA=$(git rev-parse HEAD)` in the compose command's environment.

### Settings to enable in each Sentry project

Project Settings → Security & Privacy, and the org-wide equivalents:

- **Data Scrubber**: on. **Use Default Scrubbers**: on.
- **Prevent Storing of IP Addresses**: on. This also covers the Android app's
  native crash reports, which go straight to Sentry rather than through the tunnel.
- **Spike Protection**: on (org Settings → Subscription).
- **Client Keys → Rate Limits**: set a per-key limit on every project, e.g. web
  and android 60 events per minute, api 120 per minute, so a crash loop can't
  burn the quota.
- Data retention 90 days (matches the privacy policy).

## Performance budget in tests

`apps/api/src/catalogue/search.db.test.ts` measures catalogue search latency over 5,000 seeded Works and always logs the p95. The 50 ms p95 budget is asserted only when `PERF_ASSERT=1` is set, because the number is meaningless on a loaded machine. Run it on an idle machine before changing the search query or its indexes:

```sh
PERF_ASSERT=1 TEST_DATABASE_URL=postgresql://$(whoami)@localhost:5432/<test db> pnpm --filter @keyboard-sensei/api exec vitest run src/catalogue/search.db.test.ts
```

## Gotchas and lessons learned

| Issue | Cause | Prevention now in place |
|---|---|---|
| VexFlow sharp/flat glyphs positioned but never drawn | `Accidental` modifiers computed but never attached to the `StaveNote` | Content verification cross-checks MIDI note numbers against the *rendered* VexFlow output, not just theory. Bugs like this don't show up from reviewing note numbers alone |
| Accidentals clipped off-canvas on long note runs | Canvas width was a fixed 420px; a note late in a run formatted past the SVG edge | Width scales with note count (`computeStaveWidth` in `NotationRenderer.tsx`) |
| Magic numbers for layout | `NotationPreviewStrip` was clipped because a hardcoded `max-h` was too small; it was raised and then was too tall | Size to the measured content instead of guessing a constant in either direction |
| Stale hardcoded lesson-count strings (e.g. "12 lessons") | UI strings weren't made count-agnostic when content volume grew | Grep for hardcoded counts whenever content volume changes |
| CORS port mismatch; a logout state bug | — | Caught before shipping by live verification, not static checks |
| Passing typecheck and unit tests is not verification | Mocked tests and static checks cannot see real Postgres, real browser CORS, or real timing behaviour | Verify live against a real Postgres and a real browser before calling a change done. Most bugs in this table were invisible to static checks |
| Custom response headers (`x-song-*`) invisible to the browser cross-origin | `cors()` had no `exposedHeaders`; custom headers aren't CORS-safelisted by default. `curl` ignores CORS, so only a real browser fetch catches this | Any new custom response header a client reads via `response.headers.get(...)` must be added to the `cors({ exposedHeaders: [...] })` list in `apps/api/src/app.ts` |
| Adding a new npm dependency broke unrelated code's typecheck (`NotationRenderer.tsx`'s `vexflow` imports) | `opensheetmusicdisplay` transitively depends on old `vexflow@1.x` + `@types/vexflow`; that package's `declare module "vexflow"` block is global once loaded anywhere in the TS program, and shadowed the app's real `vexflow@4.x` types everywhere | `apps/web/tsconfig.json` has an explicit `"types": [...]` whitelist, so transitive `@types/*` packages can't leak in. The existing conflict is neutralised via `pnpm patch` (`patches/@types__vexflow@1.2.42.patch`) |
| A "prevent duplicate work" `useRef` guard silently broke a `useEffect` under React 18 StrictMode | Dev-mode double-invoke (mount, cleanup, mount): the throwaway first mount set the ref before cleanup ran, so the real second mount saw "already done" and skipped. No error, just blank notation (`OsmdNotation.tsx`) | Don't add a manual "already ran" ref on top of an effect's dependency array unless you've verified it survives StrictMode's double-invoke. The dependency array alone is usually enough |
| `scrollIntoView({behavior:"smooth"})` on a fast interval (~120ms) never visibly moved the page | Each call restarted the previous animation before it progressed, so `scrollY` stayed pinned even though the call fired every time | Use `behavior:"auto"` (instant) for auto-follow scrolling driven by a frequently updating value. Verify with a timed live check (`window.scrollY` before and after), not by confirming the call happened |
| Highlighting a note re-rendered the entire score | `NotationRenderer`'s draw effect had `activeNoteIds` in its deps, so every sounding-note change re-formatted and redrew all of VexFlow. On the scrolling score that is the whole piece (47,258px wide, 3065 notes on the largest song), once per note. Visible as stutter, not as an error | Highlighting is styling, not content: draw once, then toggle a CSS class on the rendered SVG elements. Never put a high-frequency prop in a render effect's deps |
| Do not setState every frame | A 60fps `requestAnimationFrame` loop that calls `setState` re-renders React every frame | Per-frame updates (e.g. the scrolling score's position) mutate the DOM directly through refs; React state changes only when the underlying set actually changes |
| A MIDI note-on is not a user gesture | The AudioContext created by the note handler stayed suspended and `resume()` was silently ignored. A hardware keyboard lit the on-screen keys but made no sound until something was clicked, which made it look like a play/stop bug | `apps/web/src/utils/audioUnlock.ts`: every AudioContext registers, and the first real pointer/key/touch event resumes them all |
| Hardware MIDI silently unwired on some pages | `WebMidiAdapter.connect()` (the only place `onmidimessage` is assigned) was reachable only from the Connect button in `MidiStatusBar`, which wasn't rendered on Play-Along or the lesson player. The virtual piano still worked, so it looked intermittent | The status bar renders on every page that takes input, and MIDI reconnects silently when permission is already granted. A flaky USB connection can coexist with a code bug; don't assume a single cause |
| Time-signature denominator silently discarded | The song parser read `timeSignatures[0].timeSignature[0]` (numerator only) and assumed a beat is a quarter note. 6/8 bars came out 2× too long, 2/2 bars 2× too short: 47 of 311 library files were wrong, including a Chopin nocturne off by 43s by bar 8 | Bar length in quarter notes = `numerator * (4 / denominator)`. 15 files change meter mid-piece, so `beatsPerBar` is not a scalar; walk `timeSignatureSegments` |
| Library MIDIs have no trustworthy BPM | `Song` has no BPM column; client-side BPM is `midi.header.tempos[0]?.bpm ?? 120`, which is fiction for rubato performance MIDIs | Play-Along uses a continuous % speed control, not BPM. Never backfill history as `tempo_pct × base_bpm`: there is no reliable base BPM to multiply by |
| Beat/bar grids built from `tempos[0]` drift within 1–2 bars | 31 of 311 library files have a real tempo map; a grid pinned to the first tempo event goes over a bar wrong on Coldplay/Queen tracks | Build the grid with the same `header.ticksToSeconds()` that places the notes. Same coordinate system by construction, so drift is impossible |
| `xFor()` returned `x = 0` for out-of-range notes | `whiteIndex.get(note) ?? 0`: every note outside the keyboard drew stacked on the lowest key and was unplayable | Returns `null`; callers skip. Play-Along sizes its keyboard to `union(deviceRange, songRange)` so it never fires |
| Canvas reallocated every frame at 60fps | `canvas.width` is an integer setter, but fit-to-width makes `geometry.widthPx` fractional, so `canvas.width !== widthPx * dpr` was never equal | Round both sides before comparing |
| CI was red for months, unnoticed | (1) `apps/api/src/config.ts` validates env with Zod at import time and CI sets no `DATABASE_URL`/`JWT_SECRET`/`ELEVENLABS_API_KEY`, so any import that reached it threw before a test ran; (2) web tests read MIDI fixtures from the gitignored `apps/api/data/midi-library` | `apps/api/vitest.setup.ts` supplies dummy env. `libraryFixtures.ts` probes for a specific seeded file, because `apps/api`'s upload tests write `.mid` files into that same dir, so "folder exists" and "contains any .mid" both give false positives |
| `apps/web/vite.config.js` was a stale compiled artifact | Committed in the initial commit. Vite resolves `.js` before `.ts`, so every build silently used the transpiled file | Deleted. If you add a Vite plugin, edit `vite.config.ts` and confirm no `.js` twin exists |
| Docker build broke after adding a `pnpm patch` | Both Dockerfiles ran `pnpm install` without `COPY patches/` first | The Dockerfiles copy `patches/` before installing. Do a fresh Docker build after any dependency change |
| A test can pass for the wrong reason | A rubato test used a Coldplay excerpt whose tempo happened to be locally constant, so naive and correct methods agreed and the test proved nothing | Pick fixtures that actually exercise the behaviour (Clair de Lune for rubato). A green test that proves nothing is worse than no test |
| `pnpm licenses list --json` paths point nowhere | pnpm 10 reports store paths without their `node_modules/.pnpm` segment, so reading each package's LICENSE file from them silently found nothing (0 of 232 at first) | `apps/web/scripts/third-party-licenses.ts` tries the real `node_modules/.pnpm/...` location first. Check the generated JSON's counts, not just that the script ran |
| Score import memory and limits (ABC, **kern) | **kern loads a second Verovio WASM module (`verovio/wasm-hum`, 12 MB on disk vs 7 MB for the standard one), on first use, costing about 125-170 MB RSS once; each ABC import creates and destroys its own module (Verovio keeps the last key signature between ABC loads), measured flat over 120 imports (about 1.85-1.9 GB RSS in the dev server, no per-import growth). ABC is single-voice only: several voices, `&` overlays and multi-tune files are refused | Keep ABC imports on a fresh module and kern on the hum module; do not share a module across ABC imports |
