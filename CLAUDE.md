# Keyboard Sensei — Project Status

Full-stack piano learning web app. pnpm monorepo: `apps/web` (React/Vite/TS/Tailwind/VexFlow/Zustand), `apps/api` (Express 5/Prisma/PostgreSQL/JWT/Zod), `packages/{shared-types,midi-engine,music-theory,lesson-engine}`. See `README.md` for local setup commands.

**Collaboration pattern in this project:** detailed written spec → Codex background job (`node <codex-companion.mjs path> task --background --write --fresh "<prompt>"`, found via `codex:setup`) for backend/content work → Claude verifies live (real Postgres + browser), never trusts Codex's own "typecheck/tests passed" as sufficient — its sandbox has no Docker/Postgres/network, so it cannot do real E2E verification itself. This has caught real bugs every time it's been skipped-then-caught (CORS port mismatch, a logout state bug, and — most recently — VexFlow accidentals silently not rendering plus a canvas-width clipping bug, both invisible until content with real sharps/flats existed).

## Deployment

Live on the home LAN server at `192.168.4.4` (Debian, user `ramin`), Dockerized, reachable at `http://192.168.4.4:8181` (web) / `:3101` (api), via Tailscale subnet routing when off-LAN. Deploy:

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

`ELEVENLABS_API_KEY` lives in `apps/api/.env` (local) and the server's `~/apps/keyboard-sensei/.env.deploy` (gitignored both places, never committed, never a `VITE_` var).

### Alternative: pull prebuilt images from GHCR (CI-built)

CI (`.github/workflows/ci.yml`) typechecks, tests, builds, and pushes Docker images to
`ghcr.io/ramin-azizi/keyboard-sensei-{web,api}` on every push to `master`. To deploy those instead
of building on the server, use `docker-compose.ghcr.yml`; the server must first
`docker login ghcr.io` with a PAT that has `read:packages` (repo and images are private).

## Last update — 2026-07-11: play-along mode, song library, admin, feedback

Built inline (spec → plan → 10 tasks, superpowers flow) on `feature/playalong-admin-feedback`, merged to
master. Spec/plan in `docs/superpowers/{specs,plans}/2026-07-11-*`. All verified locally in-browser
(chrome-devtools MCP) + curl against real Postgres; 56 tests green.

- **Admin role**: `User.role` enum, seeded `admin@keyboardsensei.local` (password from `ADMIN_PASSWORD`,
  dev fallback `admin-sensei-dev`), `requireAdmin` middleware (DB-checked, not JWT), read-time unlock of
  ALL lessons for admins (completed stays completed). Verified: admin sees 34/34 unlocked, demo unchanged.
- **Admin area** (`/admin/*`, role-gated nav + routes): Users (edit email/name/role/password, delete
  with self-delete guard, per-lesson progress editor), Feedback queue (filter, resolve), Songs (edit
  metadata, delete).
- **Feedback widget** on every page incl. auth (floating pill, bug/idea/other, captures route+UA, 10/hr
  rate limit, admin queue round-trip verified in-browser).
- **Song library**: `Song` model + raw `.mid` files in `apps/api/data/midi-library/` (gitignored,
  volume-mounted in both deploy composes like tts-cache). **305 curated songs seeded** (212 public-domain
  classical/ragtime, 93 pop/film covers) from the ADL Piano MIDI dataset via
  `apps/api/scripts/fetch-midi-library.ts` + committed `midi-manifest.json` (piano-midi.de blocks
  non-browser clients — 418). Difficulty heuristic calibrated (Für Elise d2, Clair de Lune d4,
  Entertainer d5; spread 5/74/100/67/59). Upload endpoint (raw bytes + query params, 422 on invalid,
  byte-identical roundtrip verified); uploads private to uploader, seeded songs public.
- **Play-along game** (`/play`, `/play/:songId`): searchable/filterable browser with difficulty dots and
  personal bests; canvas waterfall aligned to VirtualPiano geometry (left hand brass, right felt,
  hit/miss flashes, octave guides); engine on performance.now clock scaled by tempo; settings = tempo
  25/50/75/100%, look-ahead 6/4/2.5/1.5s, wait mode (freezes on due notes, highlights required keys,
  unscored), guide audio; live HUD (score/accuracy/combo); scoring in
  `packages/midi-engine/src/playalong.ts` (judgePlayAlong greedy nearest-match, windows 60/120/200ms,
  combo bonus ≤10%, wrong-press penalty, tempo × look-ahead multipliers, S/A/B/C/D grades, max 120);
  attempts persisted (`PlayAlongAttempt`), History page grew an Exercises|Play-along tab switcher.
- **Deploy note**: the library files are NOT in git/images — after deploying, run the fetch script once
  server-side (`docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx
  scripts/fetch-midi-library.ts'`) then reseed; files persist in the `keyboard-sensei-midi-library`
  volume.

## Previous update — 2026-07-10 (later): 10-parallel-worker batch

Ten parallel Fable workers (disjoint file ownership; content pre-split into `apps/api/src/content/*` batch
files) delivered, all integrated and verified locally in-browser; CI green; images on GHCR:

- **Content 24 → 34 lessons**: repertoire 25–27 (Ode to Joy, Mozart "Ah! vous dirai-je, maman" two-hands,
  Minuet in G/Petzold — all public-domain `contentRights`, notation and MIDI generated from one source
  array), ear training 28–30 (hear-then-play via the ▶ Listen button, deliberately no notation), technique
  II 31–34 (A major, F major/first flat, A harmonic minor, broken-chord accompaniment).
- **Untimed scoring** end-to-end (`MidiExercise.scoring: "untimed"`): pitch-only scoring, no count-in,
  timing/rhythm UI hidden; exercise-01 flagged untimed. Verified: sloppy-timing correct notes = 100.
- **Quiz integrity**: `correctIndex` stripped from lesson payloads, returned in the answer response;
  verified no leak via live API probe.
- **GET /users/me/attempts** + Practice History page (stats tiles + attempt list, /history nav).
- **Notation**: key signatures with redundant-accidental suppression (verified: Minuet shows key-sig F♯,
  no inline sharp), `measures` + barlines support, dotted-note glyphs (Dot.buildAndAttach); player's
  derived notation now emits `hd/qd/8d`.
- **Virtual piano**: pointer-event glissando (drag across keys, multi-touch), middle-C marker dot.
- **Auth/assessment/settings pages** restyled to the felt/brass system; `app.ts` de-minified; README and
  docs/api-contract.yaml refreshed; content tests made count-agnostic.

**Deploy state**: build-on-server deploys are now blocked by policy (user chose GitHub-built images).
Live server still runs the morning's 24-lesson build. To ship this batch the server needs a ONE-TIME
`docker login ghcr.io` (PAT with `read:packages`, done by Ramin), then:
`docker compose --env-file .env.deploy -f docker-compose.ghcr.yml pull && docker compose --env-file .env.deploy -f docker-compose.ghcr.yml up -d`
then reseed (`docker exec keyboard-sensei-api-1 sh -c 'cd /app/apps/api && pnpm exec tsx prisma/seed.ts'`).
Roadmap items 1 (first batch), 2, 3, 4 (first batch), 6 (quiz part), 8 are now DONE; still open: sampled
piano, refresh tokens/TTS auth, de-minify content files, stale duplicate root copy deletion, more content.

## Previous update — 2026-07-10: design-engineer review + overhaul

A full chief-design-engineer review (UI/UX/design/engineering/content) was done against the live app,
followed by a same-day overhaul. All changes verified locally in-browser AND live post-deploy.

### Review findings (state before the overhaul)

1. **Practice loop was musically broken (worst issue):** exercises scored timing against `tempoBpm`
   that the UI never displayed — no metronome, no count-in, no pulse. Playing the correct notes at an
   unknowable tempo produced 63/100 with the *correct* keys flashed red (feedback conflated timing
   mistakes with wrong pitches). No pass threshold shown, no completion moment, no way to hear the
   target before playing.
2. **Notation bugs:** exercise notation used one heuristic-chosen clef for everything — lesson 1
   rendered C4/C5 floating on ledger lines above a *bass* staff. Stark-white half-empty canvas in dark
   themes. Still open: no barlines/measures, no key signatures (chromatic accidentals everywhere).
3. **Sound:** bare triangle-wave oscillator.
4. **No journey:** 24 identical rows, locked ≈ unlocked visually, no "continue", no per-level progress.
5. **Content:** template objectives ("Understand X"), no repertoire despite the branch label, no ear
   training, rhythm lessons taught without an audible pulse. Music theory itself checked out clean
   (chromatic fingering, scale spellings, G7 voicing, inversions all verified correct).
6. **Engineering debt:** half the files in minified one-liner style; quiz `correctIndex` shipped to the
   client (trivial cheating); quiz endpoint scans all lessons per answer; JWT in localStorage, no
   refresh; TTS audio endpoint unauthenticated; stale duplicate app copy at the parent directory root.

### Shipped in this overhaul (all verified)

- **Musical practice loop** (`MidiExercise.tsx`, new `utils/metronome.ts`): tempo chip (♩ = N) +
  "70 to pass" shown up front; ▶ Listen plays the target with keys lighting; 4-beat count-in with
  sample-accurate metronome clicks and beat dots (felt during count-in, brass while recording);
  optional metronome during capture; honest per-key feedback (green = right pitch, red = wrong/missed
  only — timing critique stays in text); pass/fail-framed result panel with per-metric bars; cancel.
- **Piano voice** (`utils/synth.ts`): 3 layered partials → key-tracked lowpass (bright attack settling
  mellow), velocity-sensitive two-stage decay, shared compressor.
- **Notation** (`NotationRenderer.tsx` + `notationFor` in MidiExercise): auto grand staff when an
  exercise spans registers (fixes the C5-on-bass-clef bug); card sized to content, ivory score-paper look.
- **Design system**: felt crimson (piano key-felt) accent + brass (pedals) achievement color + ivory
  paper + serif display stack (`font-display`); felt-strip signature rule under header; focus rings;
  `.card/.primary-button/.secondary-button` components; active nav states. Works in all 3 themes.
- **Dashboard** (`LessonListPage.tsx`): "Up next / Continue practicing" hero + overall progress;
  lessons grouped by level with per-level progress bars; completed (brass ✓ + score) / up-next (felt
  ring) / locked (dimmed lock) states.
- **Lesson player** (`LessonPlayerPage.tsx`): breadcrumb "N of 24", best score, "Lesson passed" banner
  with next-lesson CTA immediately on passing, fetch error handling.
- **Content**: hand-written objectives for all 24 lessons (in `OBJECTIVES` map in `content.ts`).
- **CI**: GitHub Actions — typecheck/test/build on every push/PR; Docker images to GHCR on master.
- Favicon (data-URI ♪) — killed the only console error.

### Verification notes for this session

Playing lesson-01's three Cs *with* the count-in at the shown tempo now scores 100 with green keys and
fires the pass banner + unlock (was 63 + red keys for the same correct notes). Grand staff renders with
brace: C3 on bass, C4/C5 on treble. Confirmed live at 192.168.4.4:8181 after deploy + reseed.

## Roadmap to world-class (agreed priority order, next sessions)

1. **Repertoire** — real public-domain pieces (Bach minuets, Burgmüller, Clementi) as multi-phrase
   lessons; the emotional payoff serious piano apps center on. Same content-verification bar: MIDI
   numbers checked against real theory AND against the VexFlow notation.
2. **Per-exercise scoring profiles** — untimed "find the notes" drills (e.g. exercise-01) shouldn't
   score timing at all; add a `scoring: "timed" | "untimed"` field through shared-types → lesson-engine
   schema → scoring engine → player UI (skip count-in when untimed).
3. **Barlines + key signatures** in notation (VexFlow supports both; needs measure-aware content data).
4. **Ear training branch** — interval/chord-quality recognition reusing the MIDI loop in reverse.
5. **Sampled piano** — small self-hosted sample set (e.g. Salamander subset) replacing the synth.
6. **Quiz integrity + auth hardening** — stop shipping `correctIndex` (return it in the answer response
   instead; client currently uses it for highlighting), refresh tokens, authenticate TTS audio route.
7. **De-minify** remaining one-liner files (`app.ts`, `content.ts`, auth pages); delete the stale
   duplicate app copy at the parent "Keyboard Sensei/" root (after confirming with Ramin).
8. **Practice history** — attempts already stored server-side; surface as a progress chart.
9. More content batches toward the 100-hour target (24 lessons / ~5h so far).

## Previous update — 2026-07-01

Shipped and verified (local + redeployed live):
- **Lesson narration (TTS)**: ElevenLabs voice picker (4 curated voices, free previews) in Settings, shared-quota usage bar (10,000 free chars/month, app-wide not per-user), server-cached narration (`GET/POST /tts/*`), "read aloud" buttons wired into lesson sections.
- **Content batch**: 12 new intermediate lessons (`lesson-13` through `lesson-24`, 3h57m), covering chromatic scale → G/D major → circle of fifths → natural minor → dominant 7th → inversions → syncopation → contrary motion → pedal → arpeggios → assessments. All new exercises' MIDI note numbers were independently checked against real theory (scale spellings, chord tones) and cross-checked against their VexFlow notation — no errors found.
- **Two real bugs found via live verification, now fixed** in `apps/web/src/components/notation/NotationRenderer.tsx`:
  1. VexFlow `Accidental` modifiers were never attached — sharp/flat symbols were positioned correctly but never drawn. Invisible until now because none of the original 12 lessons had accidentals.
  2. Fixed canvas width (420px) was silently clipping accidentals that landed late in longer note runs (found by tracing a missing flat's SVG element to x=651 on a canvas that only extended to x=632). Canvas width now scales with note count (`computeStaveWidth`).
- Two hardcoded "12 lessons" strings (lesson list header, auth landing page) were stale; made dynamic / count-agnostic.

Total content so far: 24 lessons / ~5 hours toward the 100-hour target the user asked for.

## Next steps

1. **More content batches** toward 100 hours — 24 lessons/~5h so far is a small fraction; this needs many more Codex content rounds. Same verification bar each time: check MIDI note numbers against real theory, not just that it typechecks. Re-check for the same class of VexFlow rendering issue if any batch introduces something new (e.g. key signatures, multi-voice notation, triplets) that earlier content never exercised.
2. Roadmap phases 2–6 (dashboard/achievements, theory library, ear training, skill tree, scrolling sight-reading) are scoped at a high level only — see `/Users/raminazizi/.claude/plans/gleaming-watching-origami.md` for the phase breakdown. Each gets scoped in detail immediately before it starts, not before.
3. `README.md`'s "12-lesson" framing in its title/intro is now stale (project has 24 lessons across foundation→intermediate) — worth a pass next time README is touched.
4. iPhone/Android/tablet native apps are the long-term target per the user's original ask; the web app on the home server is the interim solution.
