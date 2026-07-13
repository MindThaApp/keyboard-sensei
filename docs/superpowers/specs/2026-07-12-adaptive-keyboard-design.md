# Adaptive on-screen keyboard: device range, zoom, and fit

**Date:** 2026-07-12
**Status:** approved, not yet implemented

## Problem

The on-screen keyboard does not reflect the user's actual piano, and it cannot be resized.

- `VirtualPiano.tsx` hardcodes `WHITE_KEY_WIDTH_PX = 40` and defaults to a 2-octave range (`lowestNote = 48`, `highestNote = 72`). It overflows its container rather than fitting the screen.
- Play-Along sizes its keyboard to the *song's* note span via `pianoRangeFor(pitchMin, pitchMax)`, so what is on screen does not correspond to what is under the player's hands.
- There is no zoom control and no way to see a full 88-key range at once.

## Hard constraint: MIDI cannot report key count

This is the central fact the design must respect. The Web MIDI API exposes only `id`, `name`, `manufacturer`, `state`, and `connection` on a `MIDIInput`. The MIDI 1.0 protocol has no query for key range — a keyboard only ever reports that a given note number went down or up. MIDI 2.0 Capability Inquiry could in principle carry this, but consumer keyboards do not implement it and Web MIDI does not surface it.

Therefore key count is **inferred**, never detected. Any design that claims otherwise is lying to the user. The device *name*, however, **is** available and is already read by `WebMidiAdapter.listDevices()` and displayed by `MidiStatusBar`.

## Design

### 1. Unified keyboard geometry (the core change)

Today two independent systems compute key positions: `VirtualPiano`'s fixed 40px keys, and Play-Along's `keyboardGeometry(...)` for waterfall lanes. They can disagree, and any zoom feature would make them disagree at every zoom level.

Collapse them into one function:

```ts
keyboardGeometry(lowestNote: number, highestNote: number, whiteKeyWidthPx: number): KeyRect[]
```

Both the rendered keys **and** the Play-Along falling-bar lanes derive their x-positions from this single result. Zoom is then nothing more than changing `whiteKeyWidthPx`, and the falling bars track the keys automatically because they are computed from the same numbers.

**Requirement:** falling bars must remain aligned with their keys at every zoom level. Deriving both from one geometry makes misalignment structurally impossible rather than something to maintain.

### 2. Device range inference

Resolution order:

1. **Name lookup.** A table mapping known MIDI device-name substrings to ranges (e.g. `"P-125"` → A0–C8 / 88 keys; `"MPK Mini"` → C3–C5 / 25 keys). Keyed on the device name already available from `listDevices()`.
2. **Unknown device → sane default.** 61 keys (C2–C7).
3. **Auto-grow (the safety net).** Any note-on outside the current range widens the range to include it. This self-corrects a wrong table entry, an unknown device, or a bad default, and it is the reason no setup modal is needed. Implemented in the `MidiContext` note handler.
4. **Manual drag handles** at each end of the keyboard to extend or shrink the range explicitly.

The resolved range persists to `localStorage`, keyed on device name, so each keyboard is learned once.

**Explicitly rejected:** asking the user their key count in a setup modal. Auto-grow plus a name table makes it unnecessary.

### 3. Zoom and fit

- The keyboard uses the **full available screen width** by default.
- Controls: `[−] [+] [Fit]`.
- `Fit` computes the `whiteKeyWidthPx` that makes the current range exactly fill the container width.
- Zoom level persists per device.
- **First load with no stored preference:** fit-to-width, so the user immediately sees their whole range.

**Drag-to-expand behaviour.** Dragging a handle outward adds keys *and zooms out to keep the keyboard within the screen width* — i.e. the total rendered width stays pinned to the container and the keys get narrower as the range grows. Dragging inward removes keys and the keys get wider. After a drag, the user can still zoom in/out freely; the drag sets the *range*, zoom independently sets the *key size*. Dragging must never push the keyboard off-screen.

### 3a. Recommended-range indicator

The user needs to know how wide the keyboard actually *needs* to be for what they're currently playing, so they don't drag it wider than necessary and shrink the keys for no benefit.

On both **Play-Along** and the **lesson / exercise** pages, render a visual indicator of the **recommended range** for the current session — the note span the song or exercise actually uses (`pitchMin`..`pitchMax` for a song; the exercise's expected-note span for a lesson). Anything outside that span is not needed for this session.

The indicator marks the recommended span on the keyboard itself (shading or a bracket), so the user can see at a glance both where to put their hands and how far they could shrink the keyboard without losing anything.

### 4. Play-Along specifics

- The keyboard shows the **device's** range, not the song's, so it matches the physical instrument.
- On first opening a song, auto-zoom to frame the song's span, so the relevant keys are large.
- The song's span is visually indicated (shading/bracket) on the keyboard.

**Conflict rule:** auto-zoom applies only on initial load of a song. The moment the user touches `+`, `−`, or `Fit`, their choice wins and persists; auto-zoom never overrides a manual choice afterwards. Auto-zoom is a suggested starting point, not an ongoing behaviour.

### 5. Scope

`VirtualPiano` is the shared component across lessons, Practice Gym, and Play-Along, so all three inherit the device range, zoom, and fit. Only Play-Along additionally gets song-span framing and highlighting.

### 6. Play-Along vertical layout

Today the falling bars and the keyboard do not fit on one screen together, because the notation strip's container is taller than its content.

**Notation strip height.** `NotationPreviewStrip.tsx:99` hardcodes `max-h-[320px]`. This is a scar: an earlier bug clipped the bass staff because the cap was *too small*, and it was fixed by raising the magic number — overshooting. The fix here is to remove the magic number entirely and size the container to the **actual rendered SVG height**, which is by construction the smallest height that hides no notes. Do not simply pick a smaller constant; that re-opens the clipping bug.

**Number of staves is fixed at two.** The strip renders a grand staff — one treble (right hand) and one bass (left hand) — over a rolling 1–2 measure window. It never wraps to a second system, so there is never a third or fourth staff. The height is therefore bounded and can safely hug its content.

**Draggable waterfall height, bound to look-ahead.** The user can drag the *top border* of the falling-bar area to make it taller or shorter. This is not a cosmetic resize: the height of the waterfall *is* the visible look-ahead window, so dragging it directly sets `lookaheadS` — a taller area shows more of the song in advance (easier), a shorter one shows less (harder). Because look-ahead already feeds the score multiplier, dragging the border visibly changes the XP multiplier, and the UI must show that multiplier updating live as the user drags.

This makes `lookaheadS` **continuous** rather than the current four discrete tiers, which in turn requires `lookaheadMultiplier` to become a continuous function. See the separate continuous-difficulty spec — the existing four tiers fit `1 + 0.21·ln(4 / lookaheadS)` closely (1.5s→1.21, 2.5s→1.10, 4s→1.00, >4s→~0.90), so no new numbers need inventing. **This part is blocked on that spec and must not be built before it is agreed.**

## Known trade-off

At 88 keys fit-to-width on a typical laptop, white keys land around 26px and black keys around 16px — adequate for orientation, tight for reading individual keys. This is why `Fit` is a button rather than a permanent state, and why zoom exists.

## Testing

- Unit: `keyboardGeometry` returns correct key rects across ranges and widths; white/black key x-positions match expected offsets.
- Unit: auto-grow widens the range on an out-of-range note and never shrinks it implicitly.
- Unit: name-lookup resolves known models and falls back to the 61-key default for unknown ones.
- **Live (required):** falling bars visually align with their keys at minimum zoom, maximum zoom, and after `Fit` — verified in a real browser, not only by unit test. Alignment bugs of this shape do not show up in typecheck or mocked tests (see the Gotchas table in CLAUDE.md).
- **Live (required):** real MIDI hardware, confirming auto-grow expands the range when a note outside it is played.
