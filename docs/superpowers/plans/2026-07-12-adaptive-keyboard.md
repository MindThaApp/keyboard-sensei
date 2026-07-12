# Adaptive Keyboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the on-screen keyboard mirror the user's real MIDI piano (inferred range), resizable via zoom/fit, with Play-Along's falling bars staying aligned at every zoom level — plus detect and surface MIDI device disconnects.

**Architecture:** Collapse the two duplicated key-geometry implementations (`waterfall.ts` and `VirtualPiano.tsx`, which each hardcode `WHITE_KEY_WIDTH_PX = 40` and are kept in sync *by hand* — see the comment at `waterfall.ts:14`) into one parameterised `keyboardGeometry(lowestNote, highestNote, whiteKeyWidthPx)`. Both the rendered keys and the waterfall lanes derive x-positions from that single result, so zoom cannot desync them. Device range is inferred from the MIDI device name plus auto-grow on out-of-range notes; zoom and range persist per device name in `localStorage`.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind, Vitest, Web MIDI API, Canvas 2D.

## Global Constraints

- **MIDI cannot report key count.** `MIDIInput` exposes only `id`, `name`, `manufacturer`, `state`, `connection`. Range is *inferred*, never "detected". Do not add UI implying detection.
- No setup modal asking the user their key count. Name lookup + auto-grow + drag handles only.
- Falling bars MUST stay aligned to keys at every zoom level. Both derive from one geometry call.
- Existing code style is terse/compact. Match neighbouring files.
- Do not add an `already ran` `useRef` guard on top of a `useEffect` dependency array without verifying it survives React 18 StrictMode double-invoke (documented gotcha in CLAUDE.md — it silently broke `OsmdNotation.tsx`).
- Run `pnpm -r typecheck` and `pnpm -r test` before every commit. Both must pass.

---

### Task 1: MIDI device health and reconnect guidance

Detect disconnects and stop failing silently. Independent of the geometry work; ship first.

**Files:**
- Modify: `apps/web/src/components/midi/MidiContext.tsx`
- Modify: `apps/web/src/components/midi/MidiStatusBar.tsx`
- Modify: `packages/midi-engine/src/adapters.ts`

**Interfaces:**
- Produces: `MidiContextValue` gains `lastNoteAtMs: number | null` (timestamp of most recent note-on, for the live activity indicator).
- Produces: `WebMidiAdapter.onStateChange(cb: (devices: MidiDeviceInfo[]) => void): void`

- [ ] **Step 1: Add a state-change hook to the adapter**

In `packages/midi-engine/src/adapters.ts`, `WebMidiAdapter` currently never listens for `statechange`, so the app cannot notice a keyboard being unplugged. Add:

```ts
  private stateChange: (devices: MidiDeviceInfo[]) => void = () => undefined;
  onStateChange(cb: (devices: MidiDeviceInfo[]) => void): void { this.stateChange = cb }
```

and inside `connect()`, after wiring `onmidimessage`:

```ts
    this.access.onstatechange = () => {
      this.access?.inputs.forEach(input => { input.onmidimessage = (event: MIDIMessageEvent) => this.handleMessage(event) });
      this.stateChange(this.listDevices());
    };
```

Re-binding `onmidimessage` inside the handler matters: a device that is unplugged and replugged is a *new* `MIDIInput` object, so without this the replugged keyboard sends nothing.

- [ ] **Step 2: Guard against a hanging requestMIDIAccess**

In `MidiContext.tsx`'s `connectWebMidi`, wrap the connect call so a promise that never settles surfaces instead of leaving the UI frozen (the user's reported "nothing happens when I click connect"):

```ts
      await Promise.race([
        webAdapterRef.current!.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("The browser didn't respond to the MIDI request. Unplug your keyboard, plug it back in, then reload the page.")), 5000),
        ),
      ]);
```

- [ ] **Step 3: React to disconnects and track note activity**

In the once-only registration effect in `MidiContext.tsx`, add:

```ts
    webAdapter.onStateChange((connectedDevices) => {
      setDevices(connectedDevices);
      setWebMidiConnected(connectedDevices.length > 0);
      setWebMidiError(connectedDevices.length === 0
        ? "Your MIDI keyboard was disconnected. Plug it back in — it should reconnect automatically."
        : null);
    });
```

Add `const [lastNoteAtMs, setLastNoteAtMs] = useState<number | null>(null);` and call `setLastNoteAtMs(Date.now())` inside the existing `webAdapter.onNoteOn` handler. Expose `lastNoteAtMs` on the context value (and add it to `MidiContextValue` and the `useMemo` dependency array).

- [ ] **Step 4: Improve the zero-device copy and add a live activity dot**

In `MidiStatusBar.tsx`, change the zero-device message to name the fix explicitly:

```
"MIDI access granted, but no keyboard was detected. Unplug the keyboard's USB cable, plug it back in, and click Connect again. (If it has two USB ports, use the one marked USB-to-HOST.)"
```

And when `webMidiConnected`, render a small dot that lights up for 400ms whenever `lastNoteAtMs` changes, with the text "Listening — play a key to test". This lets the user distinguish "connected but dead" from "connected and fine" without us having to guess.

- [ ] **Step 5: Verify and commit**

Run: `pnpm -r typecheck && pnpm -r test` → both pass.
**Live check (required, real hardware):** connect the keyboard, confirm the activity dot flashes on a key press; unplug it mid-session and confirm the bar switches to the disconnect message; replug and confirm notes register again *without* a page reload.

```bash
git add apps/web/src/components/midi/ packages/midi-engine/src/adapters.ts
git commit -m "feat: detect MIDI disconnects and guide the user to reconnect"
```

---

### Task 2: Unified, parameterised keyboard geometry

**Files:**
- Modify: `apps/web/src/components/play/waterfall.ts:1-42`
- Create: `apps/web/src/components/play/waterfall.test.ts`

**Interfaces:**
- Produces: `keyboardGeometry(lowestNote: number, highestNote: number, whiteKeyWidthPx?: number): KeyboardGeometry` — `whiteKeyWidthPx` defaults to `WHITE_KEY_WIDTH_PX` (40) so existing callers keep working.
- Produces: `KeyboardGeometry` gains `whiteKeyWidthPx: number` and `blackKeyWidthPx: number`.
- Produces: `fitWhiteKeyWidth(lowestNote: number, highestNote: number, containerPx: number): number`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/play/waterfall.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyboardGeometry, fitWhiteKeyWidth } from "./waterfall";

describe("keyboardGeometry (parameterised width)", () => {
  it("scales white key x-positions with whiteKeyWidthPx", () => {
    const g = keyboardGeometry(60, 72, 20);
    expect(g.xFor(60)).toEqual({ x: 0, width: 20 });
    expect(g.xFor(62)).toEqual({ x: 20, width: 20 });
    expect(g.whiteKeyWidthPx).toBe(20);
  });

  it("scales black keys proportionally and centres them on the white-key boundary", () => {
    const g = keyboardGeometry(60, 72, 20);
    const blackWidth = g.blackKeyWidthPx;
    expect(blackWidth).toBeCloseTo(20 * (26 / 40));
    // C#4 (61) sits on the boundary after one white key (C4)
    expect(g.xFor(61).x).toBeCloseTo(20 - blackWidth / 2);
  });

  it("defaults to the legacy 40px width when omitted", () => {
    expect(keyboardGeometry(60, 72).xFor(62)).toEqual({ x: 40, width: 40 });
  });

  it("total width scales with the key width", () => {
    expect(keyboardGeometry(60, 72, 20).widthPx).toBe(keyboardGeometry(60, 72, 40).widthPx / 2);
  });
});

describe("fitWhiteKeyWidth", () => {
  it("returns the width that makes the range exactly fill the container", () => {
    const width = fitWhiteKeyWidth(60, 72, 400);
    expect(keyboardGeometry(60, 72, width).widthPx).toBeCloseTo(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @keyboard-sensei/web test -- waterfall`
Expected: FAIL — `fitWhiteKeyWidth` is not exported; `whiteKeyWidthPx` is undefined.

- [ ] **Step 3: Implement**

In `waterfall.ts`, replace the geometry section (currently lines 1–42):

```ts
export const WHITE_KEY_WIDTH_PX = 40;
export const BLACK_KEY_WIDTH_PX = 26;
const BLACK_KEY_RATIO = BLACK_KEY_WIDTH_PX / WHITE_KEY_WIDTH_PX;

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
export const isBlackKey = (note: number): boolean => BLACK_KEY_PITCH_CLASSES.has(((note % 12) + 12) % 12);

export interface KeyboardGeometry {
  lowestNote: number;
  highestNote: number;
  widthPx: number;
  whiteKeyWidthPx: number;
  blackKeyWidthPx: number;
  /** x/width of each MIDI note's key. The single source of truth: both the
   *  rendered keys and the waterfall lanes read from this, so they cannot
   *  drift apart at any zoom level. */
  xFor: (note: number) => { x: number; width: number };
}

export function pianoRangeFor(pitchMin: number, pitchMax: number): { lowestNote: number; highestNote: number } {
  // unchanged — keep the existing body
}

export function keyboardGeometry(lowestNote: number, highestNote: number, whiteKeyWidthPx: number = WHITE_KEY_WIDTH_PX): KeyboardGeometry {
  const blackKeyWidthPx = whiteKeyWidthPx * BLACK_KEY_RATIO;
  const whiteNotes: number[] = [];
  for (let n = lowestNote; n <= highestNote; n++) if (!isBlackKey(n)) whiteNotes.push(n);
  const whiteIndex = new Map(whiteNotes.map((note, index) => [note, index]));

  const xFor = (note: number): { x: number; width: number } => {
    if (!isBlackKey(note)) return { x: (whiteIndex.get(note) ?? 0) * whiteKeyWidthPx, width: whiteKeyWidthPx };
    let whiteKeysBefore = 0;
    for (const white of whiteNotes) if (white < note) whiteKeysBefore++;
    return { x: whiteKeysBefore * whiteKeyWidthPx - blackKeyWidthPx / 2, width: blackKeyWidthPx };
  };

  return { lowestNote, highestNote, widthPx: whiteNotes.length * whiteKeyWidthPx, whiteKeyWidthPx, blackKeyWidthPx, xFor };
}

/** White-key width that makes [lowestNote, highestNote] exactly fill containerPx. */
export function fitWhiteKeyWidth(lowestNote: number, highestNote: number, containerPx: number): number {
  let whiteCount = 0;
  for (let n = lowestNote; n <= highestNote; n++) if (!isBlackKey(n)) whiteCount++;
  return whiteCount > 0 ? containerPx / whiteCount : WHITE_KEY_WIDTH_PX;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keyboard-sensei/web test -- waterfall` → PASS.
Run: `pnpm -r typecheck && pnpm -r test` → all pass (existing callers use the default width, so nothing regresses).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/play/waterfall.ts apps/web/src/components/play/waterfall.test.ts
git commit -m "refactor: parameterise keyboard geometry by white-key width"
```

---

### Task 3: Device range inference (name lookup + auto-grow + persistence)

**Files:**
- Create: `apps/web/src/utils/keyboardRange.ts`
- Create: `apps/web/src/utils/keyboardRange.test.ts`
- Modify: `apps/web/src/components/midi/MidiContext.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `DEFAULT_RANGE: KeyRange` = `{ lowestNote: 36, highestNote: 96 }` (61 keys, C2–C7)
- Produces: `interface KeyRange { lowestNote: number; highestNote: number }`
- Produces: `rangeForDeviceName(name: string): KeyRange` — falls back to `DEFAULT_RANGE`
- Produces: `growRange(range: KeyRange, note: number): KeyRange` — widens only, never shrinks
- Produces: `loadRange(deviceName: string): KeyRange | null` / `saveRange(deviceName: string, range: KeyRange): void`
- Produces: `MidiContextValue` gains `deviceRange: KeyRange` and `setDeviceRange: (r: KeyRange) => void`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/utils/keyboardRange.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RANGE, growRange, loadRange, rangeForDeviceName, saveRange } from "./keyboardRange";

describe("rangeForDeviceName", () => {
  it("recognises an 88-key model by name", () => {
    expect(rangeForDeviceName("Yamaha P-125")).toEqual({ lowestNote: 21, highestNote: 108 });
  });
  it("recognises a 25-key model by name", () => {
    expect(rangeForDeviceName("MPK Mini mk3")).toEqual({ lowestNote: 48, highestNote: 72 });
  });
  it("is case-insensitive", () => {
    expect(rangeForDeviceName("yamaha p-125")).toEqual({ lowestNote: 21, highestNote: 108 });
  });
  it("falls back to the 61-key default for an unknown device", () => {
    expect(rangeForDeviceName("USB MIDI Device")).toEqual(DEFAULT_RANGE);
  });
});

describe("growRange", () => {
  it("widens downward for a note below the range", () => {
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 40)).toEqual({ lowestNote: 40, highestNote: 72 });
  });
  it("widens upward for a note above the range", () => {
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 80)).toEqual({ lowestNote: 48, highestNote: 80 });
  });
  it("never shrinks for a note inside the range", () => {
    const range = { lowestNote: 48, highestNote: 72 };
    expect(growRange(range, 60)).toEqual(range);
  });
});

describe("persistence", () => {
  beforeEach(() => localStorage.clear());
  it("round-trips a range keyed on device name", () => {
    saveRange("My Piano", { lowestNote: 21, highestNote: 108 });
    expect(loadRange("My Piano")).toEqual({ lowestNote: 21, highestNote: 108 });
  });
  it("returns null for an unseen device", () => {
    expect(loadRange("Never Seen")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @keyboard-sensei/web test -- keyboardRange`
Expected: FAIL — module `./keyboardRange` does not exist.

- [ ] **Step 3: Implement**

Create `apps/web/src/utils/keyboardRange.ts`:

```ts
export interface KeyRange { lowestNote: number; highestNote: number }

/** 61 keys, C2-C7. Used when the device name isn't recognised. */
export const DEFAULT_RANGE: KeyRange = { lowestNote: 36, highestNote: 96 };

/**
 * MIDI cannot report a key count — no such message exists in the protocol.
 * The device *name* is all we get, so known models are matched by substring
 * and everything else falls back to DEFAULT_RANGE and grows via growRange().
 */
const KNOWN: ReadonlyArray<{ match: string; range: KeyRange }> = [
  { match: "p-125", range: { lowestNote: 21, highestNote: 108 } },
  { match: "p-45", range: { lowestNote: 21, highestNote: 108 } },
  { match: "fp-30", range: { lowestNote: 21, highestNote: 108 } },
  { match: "es-110", range: { lowestNote: 21, highestNote: 108 } },
  { match: "mpk mini", range: { lowestNote: 48, highestNote: 72 } },
  { match: "launchkey mini", range: { lowestNote: 48, highestNote: 72 } },
  { match: "minilab", range: { lowestNote: 48, highestNote: 72 } },
];

export function rangeForDeviceName(name: string): KeyRange {
  const needle = name.toLowerCase();
  return KNOWN.find((entry) => needle.includes(entry.match))?.range ?? DEFAULT_RANGE;
}

/** Widens to include `note`. Never shrinks — a stray low note should not hide keys. */
export function growRange(range: KeyRange, note: number): KeyRange {
  return {
    lowestNote: Math.min(range.lowestNote, note),
    highestNote: Math.max(range.highestNote, note),
  };
}

const key = (deviceName: string) => `keyboard-sensei-range:${deviceName}`;

export function saveRange(deviceName: string, range: KeyRange): void {
  localStorage.setItem(key(deviceName), JSON.stringify(range));
}

export function loadRange(deviceName: string): KeyRange | null {
  const raw = localStorage.getItem(key(deviceName));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KeyRange;
    return typeof parsed?.lowestNote === "number" && typeof parsed?.highestNote === "number" ? parsed : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @keyboard-sensei/web test -- keyboardRange` → PASS.

- [ ] **Step 5: Wire into MidiContext**

In `MidiContext.tsx`, add `deviceRange` state initialised to `DEFAULT_RANGE`. When `setDevices` runs with a non-empty list, resolve the range as `loadRange(name) ?? rangeForDeviceName(name)` and store it. In the `webAdapter.onNoteOn` handler, apply auto-grow:

```ts
      setDeviceRange((current) => {
        const grown = growRange(current, note);
        if (grown !== current && (grown.lowestNote !== current.lowestNote || grown.highestNote !== current.highestNote)) {
          const name = devicesRef.current[0]?.name;
          if (name) saveRange(name, grown);
          return grown;
        }
        return current;
      });
```

Keep a `devicesRef` mirror of `devices` so this callback (registered once) always sees the current device without being re-registered. Expose `deviceRange` and `setDeviceRange` on the context value and add both to the `useMemo` dependency array.

- [ ] **Step 6: Verify and commit**

Run: `pnpm -r typecheck && pnpm -r test` → all pass.

```bash
git add apps/web/src/utils/keyboardRange.ts apps/web/src/utils/keyboardRange.test.ts apps/web/src/components/midi/MidiContext.tsx
git commit -m "feat: infer the on-screen key range from the MIDI device name, and grow it as notes are played"
```

---

### Task 4: VirtualPiano — consume shared geometry, add zoom/fit and drag handles

**Files:**
- Modify: `apps/web/src/components/piano/VirtualPiano.tsx`

**Interfaces:**
- Consumes: `keyboardGeometry`, `fitWhiteKeyWidth` (Task 2); `deviceRange`, `setDeviceRange` from `useMidiContext()` (Task 3).
- Produces: `VirtualPianoProps` gains optional `zoomable?: boolean` (default `true`).

- [ ] **Step 1: Delete the duplicated geometry**

`VirtualPiano.tsx` currently hardcodes its own `WHITE_KEY_WIDTH_PX = 40` (line 35) and computes black-key `left` by hand (line 234) — the same maths as `waterfall.ts`, kept in sync manually. Remove both and import `keyboardGeometry` from `../play/waterfall`. Render every key from `geometry.xFor(note)`. This is the change that makes zoom safe.

- [ ] **Step 2: Add zoom state, defaulting to fit**

```ts
const MIN_KEY_PX = 12;
const MAX_KEY_PX = 72;
const zoomKey = (deviceName: string) => `keyboard-sensei-zoom:${deviceName}`;
```

Hold `whiteKeyWidthPx` in state. On mount (and on container resize, via `ResizeObserver`), if the user has no stored zoom for this device, set it to `fitWhiteKeyWidth(lowestNote, highestNote, containerWidth)`. Clamp all values to `[MIN_KEY_PX, MAX_KEY_PX]`. Persist to `localStorage` under `zoomKey(deviceName)` whenever the user changes it explicitly.

Remember the resize-listener leak fixed in a previous batch: the `ResizeObserver` MUST be disconnected in the effect's cleanup.

- [ ] **Step 3: Render the controls**

A small control row above the keys: `[−] [+] [Fit]`. `−`/`+` step the width by 4px and persist. `Fit` sets `fitWhiteKeyWidth(...)` for the current range and container, and persists. Give each an `aria-label` (`Zoom out`, `Zoom in`, `Fit whole keyboard`).

The key container gets `overflow-x: auto` so it scrolls when zoomed in past the container width.

- [ ] **Step 4: Drag handles**

Render a grab handle at each end of the keyboard. Dragging the left handle outward lowers `deviceRange.lowestNote` to the nearest C below; dragging inward raises it. Same for the right handle and `highestNote`. Clamp to MIDI 21–108 (a real piano's A0–C8). On release, call `setDeviceRange(...)` (which persists via Task 3).

- [ ] **Step 5: Verify and commit**

Run: `pnpm -r typecheck && pnpm -r test` → pass.
**Live check (required):** at min zoom, max zoom, and after `Fit`, the black keys still sit correctly between their white neighbours, and the keyboard scrolls rather than overflowing the page.

```bash
git add apps/web/src/components/piano/VirtualPiano.tsx
git commit -m "feat: zoomable, fit-to-width virtual piano driven by shared geometry"
```

---

### Task 5: Play-Along — device range, aligned bars, song-span framing

**Files:**
- Modify: `apps/web/src/components/play/PlayAlongPage.tsx:140-142`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Switch the keyboard to the device range**

`PlayAlongPage` currently derives its range from the song (`pianoRangeFor(parsed.pitchMin, parsed.pitchMax)`). Replace that with `deviceRange` from `useMidiContext()`, so the on-screen keyboard matches the physical instrument. Keep `parsed.pitchMin/pitchMax` — they're now used only for song-span framing and highlighting, not for sizing.

- [ ] **Step 2: Derive the waterfall from the same geometry object**

Pass the single `keyboardGeometry(deviceRange.lowestNote, deviceRange.highestNote, whiteKeyWidthPx)` result into BOTH `VirtualPiano` and `drawWaterfall`. The canvas width must be `geometry.widthPx`. This is the requirement that the bars stay aligned — they and the keys are now literally reading the same `xFor`.

- [ ] **Step 3: Auto-zoom to the song span on first load**

On first load of a song, set `whiteKeyWidthPx = fitWhiteKeyWidth(parsed.pitchMin, parsed.pitchMax, containerWidth)` so the notes the song actually uses are as large as possible, then scroll the container to bring `xFor(parsed.pitchMin).x` into view.

**Conflict rule (from the spec):** this applies ONLY on initial load. Once the user touches `+`, `−`, `Fit`, or a drag handle, their choice wins and auto-zoom must not override it again for that song. Track this with a `userAdjustedZoom` boolean.

- [ ] **Step 4: Shade the song's span**

Render a translucent overlay (or a bracket above the keys) covering `xFor(parsed.pitchMin).x` to `xFor(parsed.pitchMax).x + width`, so the player can see where to put their hands on a keyboard that may be much wider than the piece.

- [ ] **Step 5: Verify and commit**

Run: `pnpm -r typecheck && pnpm -r test` → pass.
**Live check (required — this is the one that matters):** play a song on real hardware. At default zoom, after zooming in, after zooming out, and after `Fit`, each falling bar must land exactly on its key. Verify in a real browser — a canvas/DOM alignment bug of this shape is invisible to typecheck and to mocked unit tests (see the CLAUDE.md Gotchas table).

```bash
git add apps/web/src/components/play/PlayAlongPage.tsx
git commit -m "feat: play-along keyboard mirrors the device range with aligned falling bars"
```

---

## Self-Review

**Spec coverage:** §1 unified geometry → Task 2 + Task 4 Step 1 + Task 5 Step 2. §2 device range (name lookup, default, auto-grow, drag handles, persistence) → Task 3 + Task 4 Step 4. §3 zoom/fit/persistence/first-load-fit → Task 4 Steps 2–3. §4 Play-Along device range, auto-zoom, conflict rule, span highlight → Task 5. Device-health/reconnect (added at user request after the spec was approved) → Task 1. No gaps.

**Type consistency:** `KeyRange` is used identically in Tasks 3, 4, 5. `keyboardGeometry(lowest, highest, whiteKeyWidthPx?)` and `fitWhiteKeyWidth(lowest, highest, containerPx)` keep the same signatures throughout. `deviceRange`/`setDeviceRange`/`lastNoteAtMs` are all added to `MidiContextValue`.

**Ordering note:** Task 1 is independent and can run in parallel with Task 2. Tasks 3, 4, 5 are strictly sequential (each consumes the previous). Task 4 and Task 5 both touch geometry consumers and must not run concurrently.
