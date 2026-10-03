# Operations

Deploying, maintaining and backing up the live Keyboard Sensei server, plus the
engineering lessons the codebase has accumulated. Local development setup is in
the [README](../README.md).

## Server

The app runs on a home LAN server at `192.168.4.4` (Debian, user `ramin`) under
Docker Compose. It is reachable at `https://192.168.4.4:8181` (Caddy reverse
proxy; the API is at `https://192.168.4.4:8181/api`), and via Tailscale subnet
routing when off the LAN.

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
  ./ ramin@192.168.4.4:~/apps/keyboard-sensei/
ssh ramin@192.168.4.4 "cd ~/apps/keyboard-sensei && docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build"
cd - && git worktree remove --force /tmp/ks-deploy
```

`--delete` removes server files that no longer exist in the repo. The excluded
paths are server-only (secrets, the LAN CA certificate, volume-mounted data), so
`--delete` leaves them alone.

Prisma migrations apply automatically on container start.

### Prebuilt images (alternative)

CI (`.github/workflows/ci.yml`) builds and pushes
`ghcr.io/ramin-azizi/keyboard-sensei-{web,api}` on every push to `master`. To
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
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-midi-library.ts'"
# 20 authored beginner tunes
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/generate-beginner-pack.ts'"
# Essentials pack: fetch the source MIDIs, then generate and verify the Full/Intermediate/Beginner levels
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-essentials-pack.ts'"
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/generate-essentials-pack.ts'"
# 128 sampled instruments (~256MB)
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx scripts/fetch-instrument-library.ts'"
# Seed (always last: it indexes what the scripts above wrote)
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'"
```

Content-only changes (no schema change) still need a reseed to reach the
deployed demo account:

```sh
ssh ramin@192.168.4.4 "docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'"
```

## Backups and restore

Run `scripts/backup-keyboard-sensei.sh` on the server. It writes a PostgreSQL
custom-format dump plus a tarball of each data volume to
`/home/ramin/backups/keyboard-sensei` (override with `BACKUP_DIR`). Suggested
crontab entry:

```cron
30 3 * * * /home/ramin/apps/keyboard-sensei/scripts/backup-keyboard-sensei.sh >> /home/ramin/backups/keyboard-sensei/backup.log 2>&1
```

Restore steps (database dump and each volume, including the Caddy data volume
that holds the LAN CA root) are in
[scripts/restore-keyboard-sensei.md](../scripts/restore-keyboard-sensei.md).

## LAN HTTPS and CA trust

The server is HTTPS only, using Caddy's internal CA. This is required: browsers
expose Web MIDI (hardware keyboard input) only in a secure context.

Each device that wants hardware MIDI must trust the Caddy CA root once:

1. Get the certificate, either from `/data/caddy/pki/authorities/local/root.crt`
   inside the `keyboard-sensei-caddy-1` container, or from the shared drive at
   `/home/ramin/shared/keyboard-sensei-lan-ca.crt`.
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

Local development uses `apps/api/.env` and `apps/web/.env`, copied from their
`.env.example` files.

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
