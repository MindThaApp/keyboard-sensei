import { DEFAULT_FX_PRESET, FX_CUSTOM_START, isFxPresetId, paramsFor, sanitizeParams, type FxParams, type FxPresetId } from "./fxParams";

/**
 * The FX look the user picked: which preset, and the Custom look that remembers their
 * tweaks. Stored per device in localStorage like the other practice settings, and
 * observable so a running renderer picks changes up on its next frame.
 */
export interface FxState {
  preset: FxPresetId;
  custom: FxParams;
}

const KEY = "ks-playalong-fx";

export function loadFxState(): FxState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { preset: DEFAULT_FX_PRESET, custom: FX_CUSTOM_START };
    const parsed = JSON.parse(raw) as { preset?: unknown; custom?: unknown };
    return { preset: isFxPresetId(parsed.preset) ? parsed.preset : DEFAULT_FX_PRESET, custom: sanitizeParams(parsed.custom) };
  } catch {
    return { preset: DEFAULT_FX_PRESET, custom: FX_CUSTOM_START };
  }
}

function saveFxState(state: FxState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the look lasts for this visit only.
  }
}

let current: FxState | null = null;
const listeners = new Set<() => void>();

export function getFxState(): FxState {
  current ??= loadFxState();
  return current;
}

function commit(next: FxState): void {
  current = next;
  saveFxState(next);
  for (const listener of listeners) listener();
}

export function subscribeFx(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The numbers the renderer draws with right now. */
export function activeFxParams(state: FxState = getFxState()): FxParams {
  return paramsFor(state.preset, state.custom);
}

export function selectFxPreset(preset: FxPresetId): void {
  commit({ ...getFxState(), preset });
}

/**
 * A slider moved. On a preset this starts from that preset's numbers and switches to
 * Custom, so a tweak never silently edits a built-in look and Custom keeps it.
 */
export function tweakFx(change: Partial<FxParams>): void {
  const state = getFxState();
  const base = paramsFor(state.preset, state.custom);
  commit({ preset: "custom", custom: sanitizeParams({ ...base, ...change }, base) });
}

/** Test hook: forget the in-memory state so the next read loads from storage. */
export function resetFxStateCache(): void {
  current = null;
}
