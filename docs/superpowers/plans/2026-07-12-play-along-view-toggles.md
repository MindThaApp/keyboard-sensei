# Play-Along View Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent toggles over already-shipped, already-reviewed code: a highlight on/off switch for the live-follow overlay (lessons/Practice Gym), and a falling-bars/notation/both view-mode switch for Play-Along.

**Architecture:** Both are thin, purely presentational additions — no change to the underlying live-follow judging/scoring logic or the notation quantization logic, just whether their visual output gets rendered.

**Tech Stack:** `apps/web` (React 18/Vite/TS/Tailwind).

## Global Constraints

- No automated tests exist for either touched file (`MidiExercise.tsx`, `PlayAlongPage.tsx`) — no React component-testing library in this repo. Manual in-browser verification is the established, correct bar for these changes, not a gap.
- Both toggle choices persist to `localStorage`, matching the existing pattern already used for metronome settings and Play-Along settings in these same files.
- Preserve all existing behavior when a toggle is left at its default (highlight on, view mode "both") — these are additive, not behavior changes for anyone who doesn't touch the new controls.

---

### Task 1: Highlight on/off toggle in `MidiExercise.tsx`

**Files:**
- Modify: `apps/web/src/components/midi/MidiExercise.tsx`

**Interfaces:**
- Produces: `highlightEnabled` boolean state, gating `activeNoteIds` passed to `NotationRenderer`, `expectedNotes` passed to `VirtualPiano` during capture, and the live HUD block's visibility.

- [ ] **Step 1: Add persisted `highlightEnabled` state**

Near the top of the file, alongside the other top-level constants (e.g. near `COUNT_IN_BEATS`), add:

```tsx
const HIGHLIGHT_ENABLED_KEY = "ks-highlight-enabled";
function loadHighlightEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_ENABLED_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}
```

Alongside the component's other `useState` declarations (with `metronomeSettings`, before the `if (!exercise) return` early return), add:

```tsx
const [highlightEnabled, setHighlightEnabled] = useState<boolean>(loadHighlightEnabled);
```

- [ ] **Step 2: Gate the notation highlight**

Find:

```tsx
      {notation && <NotationRenderer data={notation} title="Read and play" activeNoteIds={capturing ? activeNoteIds : undefined} />}
```

Replace with:

```tsx
      {notation && (
        <NotationRenderer
          data={notation}
          title="Read and play"
          activeNoteIds={capturing && highlightEnabled ? activeNoteIds : undefined}
        />
      )}
```

- [ ] **Step 3: Gate the piano spotlight**

Find:

```tsx
      <VirtualPiano
        lowestNote={lowestNote}
        highestNote={highestNote}
        expectedNotes={capturing && !untimed ? liveDueMidis : phase !== "scored" ? notes : []}
        feedbackByNote={feedback}
      />
```

Replace with:

```tsx
      <VirtualPiano
        lowestNote={lowestNote}
        highestNote={highestNote}
        expectedNotes={capturing && !untimed && highlightEnabled ? liveDueMidis : phase !== "scored" ? notes : []}
        feedbackByNote={feedback}
      />
```

(When highlighting is off during capture, this falls through to the `phase !== "scored" ? notes : []` branch — the same "show all expected notes as a guide" behavior the app had before the live-follow overlay existed, not blank.)

- [ ] **Step 4: Gate the live HUD block**

Find:

```tsx
            {capturing && !untimed && (
              <div className="flex items-center gap-3 text-xs">
                <span className="tabular-nums">
                  <span className="text-slate-500">Live </span>
```

Replace just the opening condition:

```tsx
            {capturing && !untimed && highlightEnabled && (
              <div className="flex items-center gap-3 text-xs">
                <span className="tabular-nums">
                  <span className="text-slate-500">Live </span>
```

(No other change to this block's contents — only the surrounding condition.)

- [ ] **Step 5: Add the toggle checkbox**

Find:

```tsx
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
```

Replace with:

```tsx
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input type="checkbox" checked={metronomeOn} onChange={(e) => setMetronomeOn(e.target.checked)} />
              Metronome while playing
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <input
                type="checkbox"
                checked={highlightEnabled}
                onChange={(e) => {
                  setHighlightEnabled(e.target.checked);
                  try {
                    localStorage.setItem(HIGHLIGHT_ENABLED_KEY, String(e.target.checked));
                  } catch {
                    // localStorage unavailable (private browsing, etc.) — setting still applies for this session.
                  }
                }}
              />
              Highlight notes while playing
            </label>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 7: Manual verification**

Run: `pnpm dev`, open a timed lesson exercise, start it. Confirm the "Highlight notes while playing" checkbox appears next to the metronome checkbox, defaulting checked. Uncheck it, start the exercise again: confirm no notehead/key spotlight and no "Live" HUD appear during recording, but the final submitted score/result panel is unchanged. Reload the page: confirm the unchecked state persisted.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/midi/MidiExercise.tsx
git commit -m "feat(web): add highlight on/off toggle for the live-follow overlay"
```

---

### Task 2: Play-Along view-mode toggle (falling bars / notation / both)

**Files:**
- Modify: `apps/web/src/components/play/PlayAlongPage.tsx`

**Interfaces:**
- Produces: `Settings.viewMode: "falling" | "notation" | "both"`, persisted alongside the existing Play-Along settings.

- [ ] **Step 1: Add `viewMode` to `Settings`**

Find:

```tsx
interface Settings {
  tempoPct: PlayAlongTempoPct;
  lookaheadS: number;
  waitMode: boolean;
  guideAudio: boolean;
}

const DEFAULT_SETTINGS: Settings = { tempoPct: 100, lookaheadS: 4, waitMode: false, guideAudio: true };
```

Replace with:

```tsx
type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];

interface Settings {
  tempoPct: PlayAlongTempoPct;
  lookaheadS: number;
  waitMode: boolean;
  guideAudio: boolean;
  viewMode: ViewMode;
}

const DEFAULT_SETTINGS: Settings = { tempoPct: 100, lookaheadS: 4, waitMode: false, guideAudio: true, viewMode: "both" };
```

- [ ] **Step 2: Validate `viewMode` in `loadSettings`**

Find:

```tsx
    return {
      tempoPct: TEMPOS.includes(parsed.tempoPct as PlayAlongTempoPct) ? (parsed.tempoPct as PlayAlongTempoPct) : 100,
      lookaheadS: LOOKAHEADS.some((option) => option.value === parsed.lookaheadS) ? (parsed.lookaheadS as number) : 4,
      waitMode: Boolean(parsed.waitMode),
      guideAudio: parsed.guideAudio !== false,
    };
```

Replace with:

```tsx
    return {
      tempoPct: TEMPOS.includes(parsed.tempoPct as PlayAlongTempoPct) ? (parsed.tempoPct as PlayAlongTempoPct) : 100,
      lookaheadS: LOOKAHEADS.some((option) => option.value === parsed.lookaheadS) ? (parsed.lookaheadS as number) : 4,
      waitMode: Boolean(parsed.waitMode),
      guideAudio: parsed.guideAudio !== false,
      viewMode: VIEW_MODES.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : "both",
    };
```

- [ ] **Step 3: Add the view-mode segmented control**

Find:

```tsx
        <span className="ml-auto text-xs text-slate-400">
          ×{(tempoMultiplier(settings.tempoPct) * lookaheadMultiplier(settings.lookaheadS)).toFixed(2)} score multiplier
        </span>
      </div>
```

Replace with:

```tsx
        <div className="flex items-center gap-1" role="radiogroup" aria-label="View">
          <span className="mr-1 text-xs text-slate-500">View</span>
          {([
            { value: "falling" as const, label: "Falling notes" },
            { value: "notation" as const, label: "Sheet music" },
            { value: "both" as const, label: "Both" },
          ]).map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={settings.viewMode === option.value}
              onClick={() => setSettings((s) => ({ ...s, viewMode: option.value }))}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                settings.viewMode === option.value
                  ? "bg-felt-600 font-medium text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          ×{(tempoMultiplier(settings.tempoPct) * lookaheadMultiplier(settings.lookaheadS)).toFixed(2)} score multiplier
        </span>
      </div>
```

(Unlike tempo/look-ahead, this control is not disabled during `phase === "playing"` — changing the view mid-run is harmless since it's purely which elements render, not a scoring parameter.)

- [ ] **Step 4: Relocate the "▶ Start" button and gate the strip/canvas by view mode**

The start button currently lives as an absolute overlay centered on the waterfall canvas — if the canvas is hidden in "notation" mode, that button needs a home that doesn't depend on the canvas rendering. Move it to its own row, shown whenever the page is ready to start, regardless of view mode.

Find:

```tsx
      <NotationPreviewStrip notes={quantizedNotes} beatsPerBar={parsed.beatsPerBar} songTimeS={Math.max(0, songTimeS)} bpm={parsed.bpm} />

      {/* Waterfall + piano, sharing one horizontal scroll context */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          <div className="relative">
            <canvas
              ref={canvasRef}
              style={{ width: geometry.widthPx, height: WATERFALL_HEIGHT_PX, display: "block" }}
              aria-label="Falling notes"
            />
            {phase === "ready" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button className="primary-button px-6 py-2.5 text-base" onClick={start}>
                  ▶ Start
                </button>
              </div>
            )}
          </div>
          <VirtualPiano lowestNote={range.lowestNote} highestNote={range.highestNote} showLabels={false} expectedNotes={waitingNotes} />
        </div>
      </div>
```

Replace with:

```tsx
      {phase === "ready" && (
        <div className="flex justify-center">
          <button className="primary-button px-6 py-2.5 text-base" onClick={start}>
            ▶ Start
          </button>
        </div>
      )}

      {settings.viewMode !== "falling" && (
        <NotationPreviewStrip notes={quantizedNotes} beatsPerBar={parsed.beatsPerBar} songTimeS={Math.max(0, songTimeS)} bpm={parsed.bpm} />
      )}

      {/* Waterfall + piano, sharing one horizontal scroll context */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          {settings.viewMode !== "notation" && (
            <canvas
              ref={canvasRef}
              style={{ width: geometry.widthPx, height: WATERFALL_HEIGHT_PX, display: "block" }}
              aria-label="Falling notes"
            />
          )}
          <VirtualPiano lowestNote={range.lowestNote} highestNote={range.highestNote} showLabels={false} expectedNotes={waitingNotes} />
        </div>
      </div>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @keyboard-sensei/web typecheck`
Expected: PASS.

- [ ] **Step 6: Manual verification**

Run: `pnpm dev`, open `/play`, pick a song. Confirm: the "▶ Start" button appears above the strip/waterfall area (not overlaying the canvas) before starting. Switch view to "Falling notes": the notation strip disappears, waterfall shows, piano still shows. Switch to "Sheet music": waterfall disappears, strip shows, piano still shows. Switch to "Both" (default): both show, matching today's existing behavior exactly. Start a song in each mode to confirm the game still runs correctly (falling notes animate / notation strip advances) regardless of which is visually hidden. Reload the page: confirm the last-selected view mode persisted.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/play/PlayAlongPage.tsx
git commit -m "feat(web): add Play-Along view-mode toggle (falling bars / notation / both)"
```

---

## Self-Review

**Spec coverage:** both items from `docs/superpowers/specs/2026-07-12-play-along-view-toggles-design.md` are covered — Task 1 is §2's lesson/Practice Gym half, Task 2 is §1 plus §2's Play-Along half (the notation-tinting toggle for Play-Along is deferred: `NotationPreviewStrip` always tints when visible, no separate on/off there yet — the spec's §2 focus for Play-Along was really about the strip's overall visibility via view mode, which Task 2 delivers; a finer-grained "strip visible but untinted" mode was not part of what was actually asked and would be scope creep here).

**Placeholder scan:** none — every step has complete code and exact commands.

**Type consistency:** `ViewMode` is defined once in `PlayAlongPage.tsx` and used consistently in `Settings`, `loadSettings`, and the new control's options array.
