# Play-Along View Toggles — Design Spec

Date: 2026-07-12
Status: Approved by Ramin (design conversation, 2026-07-12)

## Overview

Two small, independent UI toggles on top of the notation/metronome/live-follow batch that just shipped (`docs/superpowers/specs/2026-07-11-notation-metronome-live-follow-design.md`):

1. **View mode** on the Play-Along page: falling bars only / notation only / both — today `PlayAlongPage` always shows the `NotationPreviewStrip` above the waterfall with no way to hide either.
2. **Highlight on/off**: the live-follow note-highlighting (lessons/Practice Gym) and the notation preview strip's due-note tinting (Play-Along) are both currently always-on; make both toggleable.

Both are small, self-contained additions to already-shipped, already-reviewed code — no new backend surface, no data model changes.

## 1. Play-Along view mode

- New local UI state in `PlayAlongPage.tsx`, e.g. `viewMode: "falling" | "notation" | "both"` (default `"both"`, matching today's behavior), persisted to `localStorage` (same pattern as the existing Play-Along settings — tempo/look-ahead/wait-mode/guide-audio already persist this way via `SETTINGS_KEY`).
- A small segmented control (matching the existing tempo/look-ahead button-group styling already in the settings bar) — "Falling notes | Sheet music | Both."
- Conditionally render the `NotationPreviewStrip` and/or the waterfall `<canvas>` block based on `viewMode`. When `"notation"` only, the waterfall canvas (and its click-to-start button, currently anchored to the canvas) needs its start-button affordance relocated — resolve the exact layout during implementation, not guessed here.
- Once Phase 1b (PianoCoRe/OSMD) lands, "notation only" for a PianoCoRe-sourced song means full OSMD-rendered sheet music instead of the small quantized preview strip; for non-PianoCoRe songs it's still the existing preview strip, since that's all that's available for those. This spec doesn't block on Phase 1b — it works today against the existing preview strip and just also applies automatically once OSMD rendering exists.

## 2. Highlight on/off toggle

- **Lessons/Practice Gym** (`MidiExercise.tsx`): a checkbox alongside the existing metronome controls (same row as the "Metronome while playing" checkbox and `MetronomeControls`), e.g. "Highlight notes while playing," default on. When off, skip updating `activeNoteIds`/the live HUD entirely during recording (or simplest: keep the underlying judging/scoring logic running unchanged — it's supplementary and cheap — and just don't pass `activeNoteIds` to `NotationRenderer`/`VirtualPiano`, and don't render the live HUD block). Persist the choice the same way `metronomeSettings` already persists (`localStorage`).
- **Play-Along** (`PlayAlongPage.tsx` / `NotationPreviewStrip.tsx`): same idea — a toggle (in the same settings bar as tempo/look-ahead/wait-mode) controlling whether `activeNoteIds` gets passed to `NotationRenderer` inside `NotationPreviewStrip`. When off, the strip still shows the rolling window of notes, just without the due-note tint.
- Both toggles are purely presentational switches over already-built, already-reviewed logic (the live-follow scoring/judging itself, and the quantization/window computation) — no change to the underlying computation, just whether its highlight output gets rendered.

## Testing

- No automated tests needed beyond what already exists (these are conditional-rendering toggles over already-tested logic) — manual in-browser verification for both toggles, confirming: (a) each `viewMode` option renders the expected subset of UI, (b) turning highlighting off removes the tint but doesn't otherwise change scoring/HUD behavior, (c) both toggles' choices persist across a page reload.
