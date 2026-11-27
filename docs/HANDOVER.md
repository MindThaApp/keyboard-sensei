# Music Portal handover, 2026-11-27

## What the app is
Music Portal (Play: "Music Portal: Piano & Guitar"; applicationId com.midivory.app, unchanged), formerly Midivory, Keyboard Sensei and OctaviApp. Plan: docs/specs/MUSIC-PORTAL.md. GitHub repo MindThaApp/keyboard-sensei.
Stack: pnpm monorepo. apps/web (React, Vite, TypeScript), apps/api (Express 5, Prisma, Postgres), apps/mobile (Capacitor 8), packages/playalong-core.
Layout: a keyboard-app folder holding OctaviApp (main checkout), worktrees and handover. Node 22 via nvm: run node/pnpm through `bash -ic`.

## Current state (checked 2026-11-27; no commits since 2026-10-26)
- Local master = 2e33994. Home server (address in the owner's local handover notes) runs 2e33994 per MERGE-LOG (deployed 2026-10-26, not re-verified).
- Working tree clean. No extra git worktrees (only the main checkout).
- Local branches from before the history rewrite are not pushed; only master and feat/fx-keyglow exist on origin.
- Branches (all local; none pushed except where noted):
  - master 2e33994: diverged from origin as above.
  - feat/fx-renderer fb11077, feat/shell-v2 069efe9, feat/play-screen-v2 ed00f3f, feat/fx-look-v3 43c2629, fix/sheet-centre a8eb146: fully merged into master, local only (old history).
  - feat/fx-keyglow 8164492: merged; origin/feat/fx-keyglow exists but is the rewritten history (ahead 504/behind 504).
  - build/omr-amd64 b810baa: NOT merged, 37 commits ahead of master (ABC and Humdrum kern score import, OMR amd64 build notes), 2026-10-24. Local only.
  - origin/feat/midi-connect-fix-and-admin-tools was deleted on the remote.

## Recent features (all merged and deployed)
FX renderer and Look v3 (cheaper effects), shell v2 (stored interface mode no longer hides features; only the Details list on PracticeResultSheet is hidden in Simple mode), play screen v2 (control strip, Look switcher, full screen, tabbed settings), sheet smooth scroll and centred highlight, key highlight, "only my notes" and "sound my key presses", FX key glow sourced from the bar impact point.

## How to work
Merge checklist: author MindThaApp with the noreply email 253346805+MindThaApp@users.noreply.github.com (set name and email repo-locally), no attribution lines anywhere. `merge --no-ff`; `pnpm install` + db:generate; typecheck; test; real-DB suite in apps/api: `TEST_DATABASE_URL=postgresql://keyboard_sensei:keyboard_sensei@127.0.0.1:5432/keyboard_sensei_test?connection_limit=5 pnpm exec vitest run` (about 553 pass / 108 skip; dev Postgres container octaviapp-postgres-1); `pnpm --filter ./apps/web build`; `node scripts/check-migration-prefixes.mjs`; push; `gh run watch`.
Deploy: clean detached worktree at the pushed SHA; server backup first with scripts/backup-keyboard-sensei.sh; rsync --delete DRY RUN first, excluding .env.deploy, .env.deploy.bak, keyboard-sensei-lan-ca.crt, apps/api/data, and local tool folders; build api image then web image one at a time with GIT_SHA; `up -d`; verify /api/health and web return 200. SSH key-based only, never passwords.

## Owner rules
Auto-deploy after every completed update that passes checklist + CI. No APK builds until the owner asks (plays on laptop). Never print .env/.env.deploy contents. Never commit the LAN CA cert. No reseed, don't touch OMR. Don't delete ~/handover/octaviapp on the server without asking. Remove worktrees only via git worktree remove/prune. Never force-push; never merge/push master without the rules above.

## Open questions for the owner
Mutopia + filtered PDMX sheet-music library import; Sentry check; launch-checklist artifact needs updating; Speed/Wait live mid-song; Mac app (Electron) not approved; enabling OMR; tie key glow to explosion intensity.
Possible follow-ups: smooth scroll/bold ink for Verovio/OSMD sheets, whole-keyboard bloom, real-GPU check, phone fullscreen while playing not screenshot-verified. iOS/macOS signing parked (needs a Mac).

## Devices
Galaxy Tab S10+ SM-X820, Yamaha PSR-E353 over USB. Laptop gets the top capsule nav, tablet the bottom TabBar.
