# Play-Along Mode, Song Library, Admin, and Feedback — Design Spec

Date: 2026-07-11
Status: Approved by Ramin (design conversation, this date)

## Overview

Four features added to Keyboard Sensei (pnpm monorepo: `apps/web` React/Vite/TS/Tailwind/Zustand,
`apps/api` Express 5/Prisma/PostgreSQL/JWT/Zod, `packages/*`):

1. **Admin role & user management** — a seeded admin account with everything unlocked and full
   user-management UI.
2. **Feedback widget** — a feedback/issue-report button on every page, with an admin review queue.
3. **Song library** — ~200 curated, recognisable piano MIDI files (classical public-domain +
   pop/film covers) plus user uploads.
4. **Play-along mode** — Synthesia-style falling-notes game over the existing virtual piano, with
   tempo scaling, look-ahead visibility control, wait mode, and a timing-accuracy score with
   difficulty multipliers.

## 1. Admin role & user management

### Schema
- `enum Role { user admin }`; `User.role Role @default(user)`.
- Seed an admin account: `admin@keyboardsensei.local`, display name "Sensei Admin". Password from
  `ADMIN_PASSWORD` env var; if unset, seed uses a default dev password `admin-sensei-dev` and the
  seed script prints a warning. Never commit a real password.

### Behavior
- JWT payload includes `role`. `requireAdmin` middleware (after existing auth middleware) guards
  all `/admin/*` routes.
- **Everything unlocked**: for `role=admin`, the progress-gating logic treats every lesson as
  unlocked *server-side at read time* (not by seeding UserProgress rows), so new lessons are
  automatically unlocked for admins too. Attempt submission/completion still records normally.
- Web: auth context exposes `role`; an **Admin** nav section renders only for admins. Non-admin
  requests to admin routes get 403; web redirects non-admins away from `/admin/*`.

### Admin → Users page
- Table of all users: email, display name, role, created date, lessons completed count.
- Per user: edit display name/email, reset password (admin types a new one), delete account
  (confirmation required; cascades via existing FK rules), change role.
- Per-user progress editor: list of all lessons with current status; admin can set any lesson to
  locked/unlocked/completed and reset best scores.

### API (all admin-only)
- `GET /admin/users` — list with progress summary.
- `PATCH /admin/users/:id` — email/display_name/role/password.
- `DELETE /admin/users/:id` — cannot delete own account (safety).
- `GET /admin/users/:id/progress`, `PUT /admin/users/:id/progress/:lessonId` — status/best_score.

## 2. Feedback widget

### Schema
```
model Feedback {
  id         String   @id @default(cuid())
  user_id    String?
  type       String   // "bug" | "idea" | "other"
  message    String
  page_path  String
  user_agent String
  status     String   @default("open") // "open" | "resolved"
  created_at DateTime @default(now())
  user       User?    @relation(fields: [user_id], references: [id], onDelete: SetNull)
}
```

### Behavior
- Floating button (bottom-right, felt-crimson pill with a small icon, unobtrusive, doesn't overlap
  the virtual piano) rendered in the app shell → present on every page including auth pages.
- Click opens a compact dialog: type selector (Bug / Idea / Other), message textarea, submit.
  Auto-captured: current route, logged-in user (nullable — feedback works on login page too),
  user-agent, timestamp. Success shows a brief "Thanks!" state then closes.
- `POST /feedback` — validated with Zod (message 1–2000 chars, type enum); rate-limited lightly
  (e.g. 10/hour/IP) to avoid accidental spam.
- **Admin → Feedback** page: list newest-first, filter by status/type, shows page, user, message,
  UA, timestamp; toggle open/resolved; `PATCH /admin/feedback/:id`.

## 3. Song library

### Schema
```
model Song {
  id             String   @id @default(cuid())
  title          String
  artist         String   // composer or performing artist
  genre          String   // "classical" | "pop" | "film" | "game" | "jazz" | "other"
  difficulty     Int      // 1-5, auto-estimated, admin-editable
  duration_sec   Float
  note_count     Int
  content_rights String   // "public-domain" | "cover-arrangement" | "user-upload"
  source_url     String?
  file_path      String   // on-disk .mid path under apps/api/data/midi-library
  uploader_id    String?  // null = seeded library
  created_at     DateTime @default(now())
  uploader       User?    @relation(fields: [uploader_id], references: [id], onDelete: Cascade)
  attempts       PlayAlongAttempt[]
}
```

### Storage & parsing
- Raw `.mid` files on disk under `apps/api/data/midi-library/` (same pattern as tts-cache; the
  directory is a Docker volume in deploy compose files, excluded from rsync like tts-cache).
- Server extracts metadata at seed/upload time using `@tonejs/midi` (works in Node): duration,
  note count, difficulty estimate (heuristic from notes/sec, polyphony, pitch span).
- **Client parses the raw MIDI itself** with `@tonejs/midi` for the game (decision: keeps DB light,
  uploads instant, game owns its timing model; cost is a small parser dep in the web bundle).

### Curated library (~200 pieces)
- `apps/api/scripts/midi-manifest.json`: hand-curated entries `{title, artist, genre, rights,
  url, sourceNote}`.
  - ~150 recognisable public-domain classical: piano-midi.de, Mutopia Project, Kunst der Fuge free
    tier (Für Elise, Moonlight Sonata mvts, Clair de Lune, Gymnopédies, Turkish March, Chopin
    nocturnes/waltzes/études staples, Bach preludes/inventions, Canon in D, etc.).
  - ~50 well-known pop/film/game piano arrangements from free MIDI sites, tagged
    `cover-arrangement`.
- `apps/api/scripts/fetch-midi-library.mjs`: downloads each manifest entry politely (sequential,
  small delay, honest UA), **validates** (parses with @tonejs/midi, contains ≥ 20 note events,
  duration 20s–15min, has a piano-range track), writes to the library dir, and emits a report of
  accepted/rejected files. Rejected entries are logged, never seeded. Quality over bulk: the goal
  is a validated, recognisable couple hundred — not a blind bulk dump.
- Seed script upserts Song rows from the fetched files + manifest metadata.

### API
- `GET /songs` — list (id, title, artist, genre, difficulty, duration, rights, uploader-is-me
  flag); seeded songs visible to all; user uploads visible to uploader + admins.
- `GET /songs/:id/file` — streams the .mid (auth required).
- `POST /songs/upload` — multipart .mid upload (any user, ≤ 1 MB, server-validated + metadata
  extraction); uploader can `DELETE /songs/:id` their own.
- Admin: `PATCH /admin/songs/:id` (metadata), `DELETE /admin/songs/:id` (any), upload with
  arbitrary metadata. **Admin → Songs** page for all of this.

## 4. Play-along mode (falling-notes game)

### Navigation & song picker
- New top-level nav item **Play**. `/play` = song browser: search box, genre filter, difficulty
  filter, sort (title/difficulty/duration); each row shows title, artist, genre chip, difficulty
  dots, duration, personal best score. Click → `/play/:songId`.

### Game screen (`/play/:songId`)
- Layout: waterfall canvas fills the area above the existing `VirtualPiano` (reused, full 88-key
  or auto-ranged to the song's pitch span); falling notes land exactly on their key's x-position.
- **Rendering**: single `<canvas>` (2D), requestAnimationFrame, time-based positions derived from
  `AudioContext.currentTime` so audio, visuals, and scoring share one clock. Notes are rounded
  rects; length ∝ duration; color by hand/track (felt crimson vs brass, matching design system);
  a hit-line sits at the piano edge; notes light the key as they cross when guide audio is on.
- **Parsing**: fetch `GET /songs/:id/file`, parse with `@tonejs/midi`, honor the tempo map,
  merge/flag tracks (track 0/1 → right/left hand heuristic; single-track songs all one color).
- **Audio**: song notes scheduled through the existing `utils/synth.ts` piano voice. Toggle
  **Guide audio**: on = the app plays the song as it falls; off = you only hear your own playing.
  User's own keypresses always sound (existing behavior).
- **Input**: MIDI keyboard (existing `MidiContext`) and virtual piano clicks/touches both feed the
  same note-on stream with timestamps mapped to the AudioContext clock.

### Settings (persisted per user in localStorage)
- **Tempo**: 25 / 50 / 75 / 100 % (song and note-fall scale together; scoring windows scale too).
- **Look-ahead**: how many seconds of upcoming notes are visible (e.g. 6s / 4s / 2.5s / 1.5s).
  Shorter = harder = higher multiplier.
- **Wait mode**: song pauses at each required note until the correct key is pressed. Practice
  only — attempts in wait mode are unscored (no multiplier games).

### Scoring
- Per falling note, nearest unconsumed keypress of the same pitch within the window:
  |Δt| ≤ 60ms Perfect (1.0) / ≤ 120ms Good (0.7) / ≤ 200ms OK (0.4) / else Miss (0). Windows scale
  inversely with tempo % (slower tempo = proportionally tighter real-time windows are NOT applied;
  windows are in *song time*, so slowing the song genuinely makes it easier).
- Wrong-pitch presses (not matching any live note) cost a small penalty and break the combo.
- Combo streak of consecutive Good-or-better shown live; contributes a small bonus (≤ 10%).
- Base score = weighted note accuracy (0–100). Final = base × tempo multiplier
  (25%→0.5, 50%→0.7, 75%→0.85, 100%→1.0) × look-ahead multiplier (6s→0.9, 4s→1.0, 2.5s→1.1,
  1.5s→1.2). Displayed with the breakdown at the end (accuracy, combo, multipliers).
- Live HUD: score, combo, accuracy %; end screen: grade (S/A/B/C/D), per-metric bars in the
  existing result-panel style, retry / back to library.
- Reuse `packages/midi-engine` pairing/scoring utilities where they fit; play-along-specific logic
  lives in a new `packages/midi-engine` module or `apps/web/src/utils/playalong.ts` (implementer's
  choice, but pairing math must be unit-tested).

### Persistence
```
model PlayAlongAttempt {
  id           String   @id @default(cuid())
  user_id      String
  song_id      String
  score        Float
  accuracy     Float
  tempo_pct    Int
  lookahead_s  Float
  wait_mode    Boolean
  created_at   DateTime @default(now())
  user         User     @relation(fields: [user_id], references: [id], onDelete: Cascade)
  song         Song     @relation(fields: [song_id], references: [id], onDelete: Cascade)
}
```
- `POST /songs/:id/attempts` (wait-mode attempts stored with `wait_mode=true`, score 0);
  `GET /songs/:id/attempts/me` for personal bests; Practice History page gains a Play-along tab.

## Error handling
- Unparseable/oversized MIDI upload → 422 with reason; game screen shows a friendly error state if
  a stored file fails to parse (with a feedback-button nudge).
- No MIDI device → game fully playable via virtual piano; status bar shows existing device state.
- Admin routes: 401 unauthenticated / 403 non-admin; UI hides admin nav for non-admins.

## Testing
- Unit: scoring windows/multipliers/combo math; difficulty estimator; manifest validator;
  admin gating (role checks); feedback validation.
- API integration: admin CRUD (users/progress/feedback/songs), upload validation, visibility
  rules (user sees own uploads only), attempt persistence.
- Existing suites must stay green. Browser verification per house rules (real Postgres, live app):
  play a song end-to-end with the virtual piano, verify score persists; verify admin unlock and
  feedback round-trip.

## Build order
1. **Phase 1 — foundations**: Prisma schema (Role, Feedback, Song, PlayAlongAttempt) + migration,
   admin seed, JWT role, requireAdmin, admin-unlock read logic.
2. **Phase 2 — feedback + admin UI**: widget, POST /feedback, Admin section (Users, Feedback).
3. **Phase 3 — library**: manifest + fetch script (run it), metadata extraction, seed, songs API,
   uploads, Admin → Songs.
4. **Phase 4 — game**: waterfall renderer, playback/clock, input matching, scoring, settings,
   HUD/end screen, attempts, Play browser page, History tab.

## Out of scope
- Multiplayer/leaderboards across users, MP3/audio-file playback, sheet-music sync in play-along,
  automatic hand-splitting beyond the track heuristic, sampled piano voice (separate roadmap item).
