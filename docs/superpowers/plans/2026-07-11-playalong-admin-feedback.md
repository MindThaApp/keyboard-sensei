# Play-Along Mode, Song Library, Admin & Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin role with full user management, a site-wide feedback widget, a ~200-song curated MIDI library with uploads, and a Synthesia-style falling-notes play-along game with tempo/look-ahead/wait-mode settings and multiplier scoring.

**Architecture:** API stores raw `.mid` files on disk (tts-cache pattern) + metadata rows in Postgres; the web client parses MIDI with `@tonejs/midi` and renders a canvas waterfall over the existing `VirtualPiano`, clocked by `AudioContext.currentTime`. Pure scoring math lives in `packages/midi-engine/src/playalong.ts` (unit-tested). Admin routes live behind a DB-checked `requireAdmin` middleware.

**Tech Stack:** Existing stack (Express 5, Prisma/Postgres, Zod, React/Vite/Tailwind/Zustand, vitest) + `@tonejs/midi` (api & web). No multer — raw-body upload via `express.raw`.

**Spec:** `docs/superpowers/specs/2026-07-11-playalong-admin-feedback-design.md` (read it first; it is authoritative on behavior).

## Global Constraints

- pnpm workspace; run commands from repo root with `--filter` or inside the package dir.
- All lesson/quiz/exercise behavior must remain unchanged for non-admin users; existing 36+ tests stay green (`pnpm -r test`), typecheck green (`pnpm -r typecheck`).
- Design system: felt crimson accent, brass achievement color, `.card/.primary-button/.secondary-button` classes, works in light/dark/midnight themes.
- Error shape: `{ error: { code, message } }` like existing routes; Zod for all request validation.
- House verification bar: real Postgres + real browser E2E before claiming done. Codex sandbox verification is never sufficient.
- Never commit real passwords; admin seed password from `ADMIN_PASSWORD` env with dev fallback `admin-sensei-dev` + printed warning.
- MIDI library dir `apps/api/data/midi-library/` is gitignored (like tts-cache) and excluded from rsync deploys; deploy compose files mount it as a volume.

---

### Task 1: Schema, admin seed, role plumbing, admin-unlock

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migration via `pnpm --filter @keyboard-sensei/api exec prisma migrate dev --name admin-feedback-songs-playalong`
- Modify: `apps/api/prisma/seed.ts` (admin upsert)
- Modify: `apps/api/src/auth.ts` (requireAdmin)
- Modify: `apps/api/src/app.ts` (role in auth/user responses; admin unlock in GET /lessons, GET /lessons/:id)

**Interfaces produced:**
- Prisma models `Feedback`, `Song`, `PlayAlongAttempt`, `enum Role { user admin }`, `User.role Role @default(user)` + back-relations `User.feedback`, `User.songs`, `User.playalong_attempts`.
- `requireAdmin(req,res,next)` in `auth.ts`: after `requireAuth`, loads `prisma.user.findUnique({where:{id:req.userId},select:{role:true}})`; non-admin → 403 `{error:{code:"forbidden",message:"Admin access required"}}`. (DB check, not JWT, so role changes take effect without re-login.)
- Auth responses (`/auth/register`, `/auth/login`) and `GET /users/me` gain `role: "user"|"admin"`.
- Admin unlock: in `GET /lessons` + `GET /lessons/:id`, look up caller's role once; if admin, effective status = stored status if `completed`, else `unlocked`.

**Schema additions (exact):**
```prisma
enum Role { user admin }
// User gains: role Role @default(user), feedback Feedback[], songs Song[], playalong_attempts PlayAlongAttempt[]

model Feedback {
  id         String   @id @default(cuid())
  user_id    String?
  type       String
  message    String
  page_path  String
  user_agent String
  status     String   @default("open")
  created_at DateTime @default(now())
  user       User?    @relation(fields: [user_id], references: [id], onDelete: SetNull)
}

model Song {
  id             String   @id @default(cuid())
  title          String
  artist         String
  genre          String
  difficulty     Int
  duration_sec   Float
  note_count     Int
  content_rights String
  source_url     String?
  file_path      String
  uploader_id    String?
  created_at     DateTime @default(now())
  uploader       User?    @relation(fields: [uploader_id], references: [id], onDelete: Cascade)
  attempts       PlayAlongAttempt[]
}

model PlayAlongAttempt {
  id          String   @id @default(cuid())
  user_id     String
  song_id     String
  score       Float
  accuracy    Float
  tempo_pct   Int
  lookahead_s Float
  wait_mode   Boolean
  created_at  DateTime @default(now())
  user        User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  song        Song     @relation(fields: [song_id], references: [id], onDelete: Cascade)
}
```

**Seed addition:** upsert `admin@keyboardsensei.local` / "Sensei Admin" / `role: admin`, password `process.env.ADMIN_PASSWORD ?? "admin-sensei-dev"` (warn if fallback). No UserProgress seeding for admin (unlock is read-time).

**Steps:**
- [ ] Schema edit → migrate → generate.
- [ ] requireAdmin + role in responses + admin unlock logic.
- [ ] Verify: `pnpm --filter @keyboard-sensei/api typecheck`; reseed; `curl` login as admin → `role:"admin"`, GET /lessons shows all unlocked; demo user unchanged.
- [ ] Commit `feat(api): admin role, schema for feedback/songs/play-along`.

### Task 2: Feedback API + widget + admin feedback page

**Files:**
- Create: `apps/api/src/feedback.ts` (router: `POST /feedback` authed; `GET /admin/feedback`, `PATCH /admin/feedback/:id` admin)
- Modify: `apps/api/src/app.ts` (mount after requireAuth; admin subroutes behind requireAdmin)
- Create: `apps/web/src/components/feedback/FeedbackWidget.tsx`
- Create: `apps/web/src/components/admin/AdminFeedbackPage.tsx`
- Modify: `apps/web/src/App.tsx` (render widget in shell — also on AuthPage branch), `apps/web/src/services/api.ts` (submitFeedback, admin fns)

**Interfaces:**
- `POST /feedback` body `{ type: "bug"|"idea"|"other", message: string(1..2000), page_path: string(≤300) }`; server captures `user_agent` from header, `user_id` from token. Returns 201 `{ ok: true }`.
- Note: `/feedback` sits AFTER `requireAuth` (auth pages: widget still renders but submits only when logged in — on the login page the widget shows "log in to send feedback" state if no token; keep it simple).
- `GET /admin/feedback?status=open|resolved|all` → `{ feedback: [{ id, type, message, page_path, user_agent, status, created_at, user: { email, display_name } | null }] }` newest-first.
- `PATCH /admin/feedback/:id` body `{ status: "open"|"resolved" }`.
- Widget: fixed bottom-right pill button (z-40, `primary-button` styling, "Feedback" + 💬-style icon), opens a small card dialog with type segmented control, textarea, submit → success flash → auto-close. Uses `useLocation()` for page_path.

**Steps:**
- [ ] API routes + Zod schemas; light rate limit (in-memory Map by userId, 10/hour) on POST.
- [ ] Widget + api client fns; mount in App shell (both authenticated and auth-page branches — for auth pages render button but disabled tooltip if unauthenticated).
- [ ] Admin page: table w/ filters, resolve toggle; route `/admin/feedback` (admin-guarded).
- [ ] Verify in browser: submit from two pages, see them in admin, resolve one.
- [ ] Commit `feat: feedback widget + admin review queue`.

### Task 3: Admin users API + Admin Users page

**Files:**
- Create: `apps/api/src/admin-users.ts`
- Modify: `apps/api/src/app.ts` (mount `/admin/users` behind requireAdmin)
- Create: `apps/web/src/components/admin/AdminUsersPage.tsx`
- Modify: `apps/web/src/services/api.ts`, `apps/web/src/App.tsx` (Admin nav dropdown/section: Users, Feedback, Songs — visible only when `auth.user.role === "admin"`; routes `/admin/users` etc. redirect non-admins to `/`)
- Modify: `apps/web/src/contexts/AuthContext.tsx` (expose `role` on user)

**Interfaces:**
- `GET /admin/users` → `{ users: [{ id, email, display_name, role, created_at, completed_lessons, total_lessons }] }`.
- `PATCH /admin/users/:id` body any-of `{ email, display_name, role, password }` (password → bcrypt 12).
- `DELETE /admin/users/:id` — 400 `{code:"cannot_delete_self"}` if `:id === req.userId`.
- `GET /admin/users/:id/progress` → `{ progress: [{ lesson_id, title, order, status, best_score }] }` for ALL lessons (join, default locked).
- `PUT /admin/users/:id/progress/:lessonId` body `{ status: "locked"|"unlocked"|"completed", best_score?: number }` — upserts; `completed` sets completed_at now, `locked/unlocked` clears it.
- Users page: table + row expand for progress editor (per-lesson status select + reset button), edit modal for account fields, delete w/ confirm.

**Steps:**
- [ ] API routes; verify with curl (admin ok, non-admin 403, self-delete 400).
- [ ] AuthContext role + Admin nav + guarded routes + Users page.
- [ ] Browser verify: change demo user's progress from admin, log in as demo, see it.
- [ ] Commit `feat: admin user management`.

### Task 4: Songs backend — metadata extraction, CRUD, upload

**Files:**
- Create: `apps/api/src/songs.ts` (router + `extractSongMetadata`)
- Create: `apps/api/src/songs.test.ts` (unit: difficulty estimator + validation against fixture bytes)
- Modify: `apps/api/src/app.ts` (mount), `apps/api/package.json` (`@tonejs/midi`)
- Modify: `.gitignore` (`apps/api/data/midi-library`), `docker-compose*.yml` (volume, mirror tts-cache), `CLAUDE.md` rsync exclude note

**Interfaces:**
- `extractSongMetadata(bytes: Uint8Array): { durationSec, noteCount, difficulty }` — throws `InvalidMidiError` if unparseable, < 20 notes, duration outside 20s–15min, or no notes in 21..108 midi range. Difficulty heuristic:
```ts
const notesPerSec = noteCount / durationSec;
const polyphony = /* mean simultaneous notes, sampled at note starts */;
const raw = notesPerSec * 0.9 + polyphony * 0.8;
const difficulty = Math.max(1, Math.min(5, Math.round(raw)));
```
  (Tune constants so Für Elise ≈ 2-3, a Chopin étude ≈ 5; adjust at execution with real files and lock in with test fixtures.)
- `GET /songs` (authed) → `{ songs: [{ id, title, artist, genre, difficulty, duration_sec, note_count, content_rights, uploader_id, mine: boolean }] }` — seeded (uploader null) for everyone; uploads only to uploader/admin.
- `GET /songs/:id/file` → `audio/midi` bytes (same visibility rule).
- `POST /songs/upload?title=..&artist=..&genre=..` — `express.raw({ type: () => true, limit: "1mb" })` on this route only; body = .mid bytes; validates via extractSongMetadata; writes `apps/api/data/midi-library/upload-<cuid>.mid`; creates Song `{ content_rights: "user-upload", uploader_id }`. 422 `{code:"invalid_midi"}` on failure.
- `DELETE /songs/:id` — uploader may delete own upload; admin any (unlinks file too).
- Admin: `PATCH /admin/songs/:id` `{ title?, artist?, genre?, difficulty? }`.

**Steps:**
- [ ] TDD extractSongMetadata: write test with a tiny programmatically-built MIDI fixture (use `@tonejs/midi` `Midi` class to construct → `.toArray()`), assert metadata + rejections (empty file, 3-note file).
- [ ] Routes; file streaming with ENOENT → 404 (tts pattern).
- [ ] Verify: upload a real .mid via curl, list, fetch bytes back byte-identical, delete.
- [ ] Commit `feat(api): song library storage, upload, admin metadata`.

### Task 5: Curated library — manifest, fetch script, seed

**Files:**
- Create: `apps/api/scripts/midi-manifest.json`
- Create: `apps/api/scripts/fetch-midi-library.mjs`
- Modify: `apps/api/prisma/seed.ts` (upsert Songs from library dir + manifest)

**Interfaces:**
- Manifest entry: `{ "id": "kebab-slug", "title", "artist", "genre": "classical"|"pop"|"film"|"game"|"jazz"|"other", "rights": "public-domain"|"cover-arrangement", "url", "source": "piano-midi.de"|... }`. Song id in DB = `seed-<slug>` so seed is idempotent (Song.id supplied, not cuid, for seeded rows).
- Fetch script: sequential download (500ms delay, UA `KeyboardSensei-LibraryFetch/1.0 (personal use)`), validates every file with the same rules as `extractSongMetadata` (import it from `../src/songs.js` via tsx, or duplicate the parse-validate inline with @tonejs/midi), saves to `data/midi-library/<slug>.mid`, prints accepted/rejected report, exits nonzero if < 150 accepted.
- Seed: for each manifest entry whose file exists on disk, extract metadata and upsert Song (skip missing files with a warning — seed must not fail on a partial library).

**Execution notes (how to build the manifest — done at execution time, not hardcoded here):**
- ~150 classical from piano-midi.de: crawl its per-composer pages (albeniz, bach, balakirew, beethoven, borodin, brahms, burgmueller, chopin, clementi, debussy, godowsky, granados, grieg, haydn, liszt, mendelssohn, moszkowski, mozart, mussorgsky, rachmaninov, ravel, schubert, schumann, scriabin, tchaikovsky, …) and take all `.mid` links; titles/composers from link text/page. All public-domain compositions; tag `public-domain`, source_url per file.
- Ensure marquee recognisable pieces are present (Für Elise, Moonlight 1st/3rd, Turkish March, Clair de Lune, Gymnopédie 1 — Satie may need Mutopia/Kunst der Fuge if absent, Canon in D likewise).
- ~50 pop/film/game covers from free MIDI sites (bitmidi.com direct file URLs, freemidi.org, vgmusic.com for game themes): pick widely recognisable titles (film themes, classic pop/rock ballads, iconic game themes), tag `cover-arrangement`.
- If a source is unreachable, substitute — the acceptance bar is ≥ 150 valid classical + ≥ 30 valid covers, all recognisable titles.

**Steps:**
- [ ] Write fetch script + build manifest (crawl/curate), run it, review report.
- [ ] Seed integration; reseed; `GET /songs` returns the library.
- [ ] Commit manifest + script (NOT the .mid files — gitignored; note in CLAUDE.md that deploy requires running the fetch script server-side or rsyncing the library dir once).

### Task 6: Web song browser + admin songs page + upload UI

**Files:**
- Create: `apps/web/src/components/play/SongBrowserPage.tsx`
- Create: `apps/web/src/components/admin/AdminSongsPage.tsx`
- Modify: `apps/web/src/services/api.ts` (getSongs, getSongFile→ArrayBuffer, uploadSong, deleteSong, adminUpdateSong; playalong attempt fns later), `apps/web/src/App.tsx` (nav "Play" + routes `/play`, `/admin/songs`)

**Interfaces:**
- Browser page: search input (title/artist substring, client-side), genre filter chips, difficulty filter (1–5 dots), sort select (title|difficulty|duration); rows show title, artist, genre chip, difficulty dots, m:ss duration, personal best (from attempts endpoint, Task 9 — placeholder "—" until then); "Upload MIDI" button (file input → uploadSong with title/artist prompt fields in a small dialog); own uploads get a delete button. Row click → `/play/:songId`.
- Admin songs: table of ALL songs, inline edit of title/artist/genre/difficulty, delete, upload.

**Steps:**
- [ ] api.ts fns; pages; nav.
- [ ] Browser verify: library lists, search/filter work, upload a file and see it appear, delete it.
- [ ] Commit `feat(web): song browser + admin song management`.

### Task 7: Play-along scoring engine (pure, TDD)

**Files:**
- Create: `packages/midi-engine/src/playalong.ts`
- Create: `packages/midi-engine/src/playalong.test.ts`
- Modify: `packages/midi-engine/src/index.ts` (export)

**Interfaces produced (exact — Tasks 8–9 depend on these):**
```ts
export interface PlayAlongNote { midi: number; startS: number; durationS: number; hand: "left" | "right" }
export interface PlayAlongPress { midi: number; songTimeS: number }
export type PlayAlongJudgment = "perfect" | "good" | "ok" | "miss";
export interface PlayAlongResult {
  judgments: PlayAlongJudgment[];      // parallel to notes input
  wrongPressCount: number;             // presses matching no live note
  accuracyPct: number;                 // 0-100 weighted (perfect 1, good .7, ok .4)
  maxCombo: number;                    // longest good-or-better streak
  baseScore: number;                   // accuracy * (1 - wrongPenalty) * (1 + comboBonus), ≤ 100... see below
}
export const JUDGE_WINDOWS_S = { perfect: 0.06, good: 0.12, ok: 0.2 } as const;
export function judgePlayAlong(notes: PlayAlongNote[], presses: PlayAlongPress[]): PlayAlongResult;
export function tempoMultiplier(tempoPct: 25 | 50 | 75 | 100): number;       // .5 .7 .85 1.0
export function lookaheadMultiplier(lookaheadS: number): number;              // 6→0.9 4→1.0 2.5→1.1 1.5→1.2
export function finalScore(r: PlayAlongResult, tempoPct: 25|50|75|100, lookaheadS: number): number;
```
- Matching: process notes in startS order; each takes the unconsumed same-midi press minimizing |Δt| within ok-window; consumed presses can't match twice. wrongPressCount = unconsumed presses that are within NO note's window of the same pitch. Penalty `min(0.15, wrongPressCount * 0.01)`; comboBonus `0.10 * maxCombo / notes.length`; baseScore capped at 100. finalScore = baseScore × both multipliers, one decimal, NOT capped (hard settings can exceed 100 by design).
- Timing is in SONG seconds — tempo scaling is the caller's concern; slowing the song genuinely widens real-time windows.

**Test cases to write (all must pass):**
- All-perfect single-track song → accuracy 100, baseScore 100, judgments all "perfect".
- Press at +0.10s → "good"; +0.15s → "ok"; +0.5s → "miss".
- Two same-pitch notes 0.3s apart, one press between them → matches nearer note only, other missed.
- Extra press with no note → wrongPressCount 1, penalty applied.
- Combo: P P M P P P → maxCombo 3.
- Multipliers: finalScore(base 100, 100%, 1.5s) = 120; (base 100, 25%, 6s) = 45.

**Steps:** classic TDD loop, then `pnpm --filter @keyboard-sensei/midi-engine test` all green, commit `feat(midi-engine): play-along judging + multipliers`.

### Task 8: MIDI parsing + game clock utilities (web)

**Files:**
- Create: `apps/web/src/utils/playalongSong.ts`
- Modify: `apps/web/package.json` (`@tonejs/midi`)

**Interfaces produced:**
```ts
export interface ParsedPlayAlongSong { notes: PlayAlongNote[]; durationS: number; pitchMin: number; pitchMax: number }
export function parsePlayAlongSong(bytes: ArrayBuffer): ParsedPlayAlongSong;
```
- Uses `new Midi(bytes)`; flattens all tracks' notes to `{ midi, startS: note.time, durationS: note.duration }` (Tone's `.time` already honors the tempo map). Hand: if ≥ 2 tracks with notes, track with lower mean pitch = "left", others "right"; single track → split at midi 60 (< 60 left).
- Notes sorted by startS. Filter to midi 21..108.

**Steps:** unit test with a constructed 2-track Midi (vitest runs in node — @tonejs/midi works there), verify hand assignment + ordering; commit `feat(web): play-along MIDI parsing`.

### Task 9: Play-along game screen

**Files:**
- Create: `apps/web/src/components/play/PlayAlongPage.tsx` (route `/play/:songId` — orchestration: load+parse song, settings, state machine idle→countdown→playing→finished, HUD, end screen)
- Create: `apps/web/src/components/play/WaterfallCanvas.tsx` (pure renderer)
- Create: `apps/web/src/utils/playalongEngine.ts` (clock + synth scheduling + press collection + wait-mode pause logic)
- Modify: `apps/web/src/services/api.ts` (`submitPlayAlongAttempt`, `getMyPlayAlongBests`)
- Create: `apps/api/src/app.ts` additions or `apps/api/src/songs.ts`: `POST /songs/:id/attempts` `{ score, accuracy, tempo_pct, lookahead_s, wait_mode }` (Zod: score 0..150, accuracy 0..100, tempo enum, lookahead enum) and `GET /songs/attempts/me` → `{ bests: Record<songId, { score, accuracy }>, recent: [...] }`

**Engine design (`playalongEngine.ts`):**
- `createPlayAlongEngine({ song, tempoPct, waitMode, guideAudio, onTick, onJudgment, onFinish })` with `start()`, `stop()`, `pressKey(midi)` API.
- Song time: `songTime = (ctx.currentTime - startCtxTime) * tempoPct/100 - pausedOffset`. 3-second lead-in before the first note.
- Guide audio: look-ahead scheduler (rAF tick schedules synth notes ≤ 200ms ahead via existing `pianoSynth` with real durations scaled by 100/tempoPct).
- Live judging: incremental — same window math as `judgePlayAlong` (import constants), notes past `startS + ok window` unmatched become misses immediately (for live combo/HUD). At finish, run authoritative `judgePlayAlong` over collected presses for the persisted result.
- Wait mode: when `songTime` reaches an unplayed note's startS, freeze songTime (accumulate pausedOffset) until `pressKey` with that midi; multiple simultaneous notes all required; guide audio note fires on resume; no scoring.
- Input: `useMidiContext().subscribeRaw`-equivalent (check MidiContext's actual listener API and use it) for device noteon; `VirtualPiano`'s `onNoteOn` prop for clicks. Both call `engine.pressKey(midi)` AND play the synth (existing behavior for virtual piano; for MIDI devices match whatever MidiExercise does today).

**WaterfallCanvas:** props `{ notes, songTime, lookaheadS, judgments, width, height, keyGeometry }`; draws only notes with `startS + durationS > songTime && startS < songTime + lookaheadS`; y = `height - ((note.startS - songTime) / lookaheadS) * height` (hit line at bottom edge = piano top); note height = `durationS / lookaheadS * height`; x/width from the same key-layout math as VirtualPiano (extract/reuse its geometry — export a `keyLayout(range)` helper from VirtualPiano.tsx if needed); rounded rects, felt crimson = right hand, brass = left; judged notes flash green (good+) / red (miss) as they cross. Device-pixel-ratio-aware sizing.

**PlayAlongPage:** header (title/artist, back link), settings bar (tempo 25/50/75/100 segmented, look-ahead 6/4/2.5/1.5s segmented, wait-mode toggle, guide-audio toggle — persisted to localStorage `ks-playalong-settings`), Start → 3s countdown → play. HUD: score (live base × multipliers), combo, accuracy. End screen card: grade S≥110 / A≥90 / B≥70 / C≥50 / D, score breakdown (accuracy, combo bonus, wrong presses, ×tempo, ×look-ahead), Retry / Back. Submits attempt on finish (not in wait mode: wait mode submits `{score:0, accuracy:0, wait_mode:true}` or skips — decision: SKIP submission entirely in wait mode). Piano auto-ranges: octave-rounded range containing song's pitchMin..pitchMax (min 2 octaves).

**Steps:**
- [ ] Attempts API endpoints (+ curl verify).
- [ ] Engine + canvas + page, wire nav from browser page rows.
- [ ] Browser verify (the big one): pick a slow classical piece, 50% tempo, virtual-piano a few notes — see falling notes, hits flash, score/combo move, end screen shows breakdown, attempt persisted (check `GET /songs/attempts/me`), personal best appears in browser page. Verify wait mode freezes until correct key. Verify MIDI-device path if device present, else note it.
- [ ] Commit `feat: falling-notes play-along mode`.

### Task 10: History tab + polish + docs + full verification

**Files:**
- Modify: `apps/web/src/components/progress/PracticeHistoryPage.tsx` (tabs: Exercises | Play-along; play-along tab lists recent attempts w/ song title, score, settings)
- Modify: `docs/api-contract.yaml` (all new endpoints), `README.md` (features), `CLAUDE.md` (status update)
- Modify: `apps/api/src/songs.ts` GET /songs/attempts/me to include song titles + recent list (if not already)

**Steps:**
- [ ] History tab.
- [ ] `pnpm -r typecheck && pnpm -r test` green; full browser pass: admin login → users/feedback/songs pages; demo login → no admin nav, 403 on /admin/*; feedback round-trip; play-along E2E.
- [ ] Docs; final commit; push → CI green.

## Self-Review Notes
- Spec coverage: admin (T1,T3), feedback (T2), library (T4,T5,T6), game (T7,T8,T9), history/tests/docs (T10). Upload-own-midi (spec §3) in T4/T6. Wait-mode-unscored: T9 decides "skip submission" — spec allowed either; recorded here as the decision.
- Type consistency: `PlayAlongNote/Press/Result` defined once in T7, consumed in T8/T9 via `@keyboard-sensei/midi-engine` import.
- Known execution risk: piano-midi.de crawl format may vary; T5 has substitution rule + acceptance bar instead of hardcoded URLs.
