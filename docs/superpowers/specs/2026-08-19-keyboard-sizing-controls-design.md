# Keyboard Sizing Controls — Design Spec

Date: 2026-08-19
Status: Approved by Ramin (design conversation, 2026-08-19)

## Background

Commit `75fa6e9` fixed a real bug: on Play-Along, the falling-note canvas and the on-screen piano each computed their own `KeyboardGeometry` independently (different range, different key width), so bars landed on the wrong keys. The fix made `VirtualPiano` accept a `geometryOverride` and, when present, hide its zoom (−/+), Fit, and drag-to-resize (pull-tab) controls entirely — correct, but it also silently removed a feature Ramin used: resizing/re-ranging the Play-Along keyboard.

This spec restores that feature properly: the piano stays resizable and re-rangeable on every page that shows it (Settings, Practice Gym/lessons, Record, Play-Along), and on Play-Along specifically, resizing the piano now resizes the falling bars with it, because both read from the exact same shared state instead of two independent computations. That's what makes this safe to reintroduce without reopening the original bug.

## Architecture

Extract the range/zoom/fit/drag logic currently inline in `VirtualPiano.tsx` into a reusable hook, `useKeyboardSizing`, in `apps/web/src/components/piano/useKeyboardSizing.ts`. It owns: the current range, the current key width, the "Auto-fit keys" cycle state, and the pull-tab drag handlers. It returns a `KeyboardSizing` object: `{ geometry, range, keyCount, rangeLabel, widthPx, setWidthPx, advanceFit, fitLabel, dragHandlers }`.

Two ways it's used:

- **Uncontrolled** (Settings, Practice Gym, Record, lessons): `VirtualPiano` calls `useKeyboardSizing` itself, same as it manages state internally today.
- **Controlled** (Play-Along only): `PlayAlongPage` calls `useKeyboardSizing` itself and passes the resulting `KeyboardSizing` object into `VirtualPiano` via a new `sizing` prop. `VirtualPiano` renders from that instead of instantiating its own. This replaces the `geometryOverride` prop from `75fa6e9` — `PlayAlongPage` also uses `sizing.geometry` directly for the canvas, so the piano and the bars are reading the same numbers by construction, not by two components agreeing to compute the same thing.

`isBlackKey`, `keyboardGeometry`, `fitWhiteKeyWidth`, `KeyboardGeometry` in `waterfall.ts` are unchanged — the hook is built on top of them, same as `VirtualPiano` is today.

## The "Auto-fit keys" button

Replaces "Fit" / "Fit to song" / "Fit to my keyboard". Cycles through up to three named states, always in this order:

1. **Default** — the range passed in as `defaultRange` (padded to whole octaves, ≥ 2 octaves — `pianoRangeFor()`, unchanged). This is what's shown automatically whenever `defaultRange` changes identity (i.e. a new song loads on Play-Along, or a new exercise loads in a lesson) — always, unconditionally, regardless of anything the user did on the previous song.
2. **Tight fit** — only exists when the caller supplies a `tightRange` (Play-Along: the song's exact `pitchMin`–`pitchMax`, snapped to white-key edges, no octave padding; lessons: the exercise's exact required notes via the existing `recommendedRange` prop). Skipped entirely on pages with no such concept (Settings, Record) — those have only two states.
3. **Keyboard** — the physical/connected MIDI device's calibrated range (`deviceRange` from `MidiContext`), or `DEFAULT_RANGE` (36–96, the existing 61-key fallback already used elsewhere in `keyboardRange.ts`) if nothing is connected.

Pressing the button advances one step; after the last available step it wraps back to Default. Manually dragging a pull tab or the width slider breaks out of the cycle (the piano now shows a range/width the button didn't produce); the next "Auto-fit keys" press re-enters the cycle at the **tight fit** step if available, otherwise **keyboard**.

On pages with only two states (no `tightRange`), the button just toggles default ↔ keyboard, and — since "default" already equals "the current range fit to the container" there — its practical effect is closer to "reset zoom to fit" than a real range change; that's fine, it mirrors what "Fit" already did on those pages today.

## Width slider

Replaces the −/+ zoom buttons everywhere the piano is shown, one `<input type="range">` spanning the existing `ZOOM_MIN_PX`–`ZOOM_MAX_PX` bounds, live-updating `widthPx` as it's dragged (no separate confirm step, matching how the buttons behaved).

## Key-count indicator

A small label next to the slider, e.g. `32 keys · C3–G5`, sourced from the hook's `keyCount`/`rangeLabel`, always reflecting the *selected range* (not how many keys are actually visible in the viewport if zoomed in enough to require horizontal scrolling).

## Pull tabs (range handles)

Behavior unchanged from today: drag either end handle, and the range grows/shrinks by one octave per `DRAG_STEP_PX` of movement, snapped to white-key edges, floor of one octave span. Now driven by the hook's `dragHandlers` instead of `VirtualPiano`'s local drag state, so a controlled `VirtualPiano` (Play-Along) drags the *shared* range.

## Persistence

- **Uncontrolled pages** (Settings, Practice Gym, Record, lessons): unchanged from today. Manual width persists per device in `localStorage` (`keyboard-sensei-zoom:<device>`). Manually dragging pull tabs while showing your own connected device's range still recalibrates and persists that device's saved range via `MidiContext.setDeviceRange`, same as today.
- **Play-Along** (controlled): nothing persists across songs or reloads. Every song open starts at Default (its own padded range), full stop — no leaking a previous song's manual zoom or range into the next one, which is the same principle `75fa6e9` already established for Play-Along's width.

## Out of scope

- No change to `keyboardGeometry`/`fitWhiteKeyWidth`/`isBlackKey` (`waterfall.ts`) or to `drawWaterfall`'s contract — it already takes a `geometry` object and draws from it; it doesn't care that the geometry can now change more often (on a slider drag) instead of only on song load.
- No change to the MIDI calibration flow (press-lowest/press-highest) — that's a separate, already-shipped feature that continues to feed `deviceRange` via `MidiContext`, which this hook only reads.

## Testing

- Unit tests for `useKeyboardSizing`'s pure logic: the fit-cycle sequencing (with and without a `tightRange`), that a manual range/width change breaks the cycle and the next Auto-fit press re-enters at tight-fit (or keyboard, if no tight range), and that `keyCount`/`rangeLabel` match a given range.
- Manual in-browser verification (per this project's convention that typecheck/unit tests alone aren't sufficient for UI bugs): on Play-Along, confirm dragging the slider and the pull tabs visibly resizes the falling bars in lock-step with the keys, at multiple zoom levels and on at least one narrow-range song and one wide-range song; confirm the Auto-fit cycle order live; confirm Settings/Practice Gym/Record still render and resize correctly (no regression from the extraction).
