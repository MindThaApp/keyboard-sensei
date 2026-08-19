import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { keyboardGeometry, fitWhiteKeyWidth, isBlackKey, type KeyboardGeometry } from "../play/waterfall";
import { PIANO_LOWEST, PIANO_HIGHEST, DEFAULT_RANGE, type KeyRange } from "../../utils/keyboardRange";

export const ZOOM_MIN_PX = 12;
export const ZOOM_MAX_PX = 72;
const DEFAULT_WHITE_KEY_WIDTH_PX = 40;
/** Pixels of drag movement per one-octave range change. */
const DRAG_STEP_PX = 50;
const MIN_RANGE_SPAN_SEMITONES = 12; // never let dragging collapse below one octave

export function clampZoomPx(px: number): number {
  return Math.min(ZOOM_MAX_PX, Math.max(ZOOM_MIN_PX, px));
}

function zoomStorageKey(key: string): string {
  return `keyboard-sensei-zoom:${key}`;
}

function loadZoom(key: string): number | null {
  try {
    const raw = localStorage.getItem(zoomStorageKey(key));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampZoomPx(parsed) : null;
  } catch {
    return null;
  }
}

function saveZoom(key: string, px: number): void {
  try {
    localStorage.setItem(zoomStorageKey(key), String(px));
  } catch {
    // Private browsing / storage disabled — zoom just won't persist this session.
  }
}

/** A range must begin/end on a white key, mirroring keyboardRange.ts's own snap rule. */
function snapDown(note: number): number {
  let n = Math.min(PIANO_HIGHEST, Math.max(PIANO_LOWEST, note));
  while (isBlackKey(n) && n > PIANO_LOWEST) n--;
  return n;
}
function snapUp(note: number): number {
  let n = Math.min(PIANO_HIGHEST, Math.max(PIANO_LOWEST, note));
  while (isBlackKey(n) && n < PIANO_HIGHEST) n++;
  return n;
}

/** Snaps both ends of a range outward onto white keys. Exported so callers can build a
 *  `tightRange` from raw MIDI pitch bounds (e.g. a song's exact pitchMin/pitchMax). */
export function snapRangeToWhiteKeys(range: KeyRange): KeyRange {
  return { lowestNote: snapDown(range.lowestNote), highestNote: snapUp(range.highestNote) };
}

function expandLow(range: KeyRange): KeyRange {
  return { ...range, lowestNote: snapDown(range.lowestNote - 12) };
}
function shrinkLow(range: KeyRange): KeyRange {
  const candidate = snapUp(range.lowestNote + 12);
  if (candidate > range.highestNote - MIN_RANGE_SPAN_SEMITONES) return range;
  return { ...range, lowestNote: candidate };
}
function expandHigh(range: KeyRange): KeyRange {
  return { ...range, highestNote: snapUp(range.highestNote + 12) };
}
function shrinkHigh(range: KeyRange): KeyRange {
  const candidate = snapDown(range.highestNote - 12);
  if (candidate < range.lowestNote + MIN_RANGE_SPAN_SEMITONES) return range;
  return { ...range, highestNote: candidate };
}

export function keyCountFor(range: KeyRange): number {
  return range.highestNote - range.lowestNote + 1;
}

export function rangeLabelFor(range: KeyRange): string {
  return `${midiNoteToName(range.lowestNote)}–${midiNoteToName(range.highestNote)}`;
}

export type FitStep = "default" | "tight" | "keyboard";

/** The step order "Auto-fit keys" cycles through; "tight" is skipped when the caller
 *  supplies no tightRange (e.g. Settings, Record have no song/exercise to fit to). */
export function stepsFor(hasTight: boolean): FitStep[] {
  return hasTight ? ["default", "tight", "keyboard"] : ["default", "keyboard"];
}

export interface NamedRangeContext {
  defaultRange: KeyRange;
  tightRange?: KeyRange;
  deviceRange: KeyRange;
  hasDevice: boolean;
}

/** The range a given named step resolves to, snapped to white-key edges. Pure — no
 *  component state, so the fit-cycle's range logic is directly unit-testable. */
export function resolveNamedRange(step: FitStep, ctx: NamedRangeContext): KeyRange {
  if (step === "default") return snapRangeToWhiteKeys(ctx.defaultRange);
  if (step === "tight") return snapRangeToWhiteKeys(ctx.tightRange ?? ctx.defaultRange);
  return snapRangeToWhiteKeys(ctx.hasDevice ? ctx.deviceRange : DEFAULT_RANGE);
}

/**
 * Where "Auto-fit keys" lands next. If the current range/width is "manual" (a pull-tab
 * or slider drag broke out of the cycle), the next press re-enters at the tight-fit step
 * (or keyboard, if no tight range) rather than literally advancing one position — see
 * the spec's "Auto-fit keys" section for why. Pure — takes the current cycle position
 * and "is this manual" as plain values, so the sequencing is directly unit-testable
 * without any component/hook machinery.
 */
export function nextFitIndex(currentIndex: number, isManual: boolean, steps: FitStep[]): number {
  if (isManual) return steps.includes("tight") ? steps.indexOf("tight") : steps.indexOf("keyboard");
  const safeIndex = currentIndex < steps.length ? currentIndex : 0;
  return (safeIndex + 1) % steps.length;
}

export interface UseKeyboardSizingOptions {
  /** Padded/default range. Shown automatically whenever this changes identity (a new
   *  song/exercise loaded) — always, unconditionally, regardless of prior manual state. */
  defaultRange: KeyRange;
  /** Exact range of notes actually needed (no octave padding), snapped to white keys
   *  internally. Omit to skip the "tight fit" cycle step entirely. */
  tightRange?: KeyRange;
  /** The physical/connected MIDI device's calibrated range, from MidiContext. */
  deviceRange: KeyRange;
  /** Whether a MIDI device is actually connected — the "keyboard" step falls back to
   *  DEFAULT_RANGE when this is false, and drag-to-resize only recalibrates the device
   *  (via onDeviceRangeChange) when this is true. */
  hasDevice: boolean;
  /** Measured width of whatever container the keyboard renders into. */
  containerWidthPx: number;
  /** Per-device localStorage key for width persistence. Omit (or null) to disable
   *  persistence entirely — Play-Along does this, so a fit-to-song width never leaks
   *  into another page's saved zoom for the same device. */
  persistenceKey?: string | null;
  /** Called on drag-release when the dragged range represents the device's own range,
   *  so it can be recalibrated and persisted (mirrors MidiContext.setDeviceRange).
   *  Omit for Play-Along, where a manual range never recalibrates the device. */
  onDeviceRangeChange?: (range: KeyRange) => void;
}

export interface KeyboardSizing {
  geometry: KeyboardGeometry;
  range: KeyRange;
  keyCount: number;
  rangeLabel: string;
  widthPx: number;
  setWidthPx: (px: number) => void;
  advanceFit: () => void;
  fitLabel: string;
  dragHandlers: {
    onLeftPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onRightPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

/**
 * Owns keyboard range + zoom state: the "Auto-fit keys" cycle (default -> tight fit ->
 * keyboard -> default -> ...), the width slider, and the pull-tab drag-to-resize
 * handles. This is the single source of truth a caller hands to two independent
 * renderers (Play-Along's piano AND its falling-note canvas) so they can never
 * compute two different geometries and drift apart — see
 * docs/superpowers/specs/2026-08-19-keyboard-sizing-controls-design.md.
 */
export function useKeyboardSizing({
  defaultRange,
  tightRange,
  deviceRange,
  hasDevice,
  containerWidthPx,
  persistenceKey = null,
  onDeviceRangeChange,
}: UseKeyboardSizingOptions): KeyboardSizing {
  const hasTight = tightRange != null;
  const steps = useMemo(() => stepsFor(hasTight), [hasTight]);

  const [namedIndex, setNamedIndex] = useState(0);
  const safeIndex = namedIndex < steps.length ? namedIndex : 0;

  const [manualRange, setManualRange] = useState<KeyRange | null>(null);
  const [isWidthFit, setIsWidthFit] = useState<boolean>(() => (persistenceKey ? loadZoom(persistenceKey) == null : true));
  const [manualWidthPx, setManualWidthPx] = useState<number>(
    () => (persistenceKey ? loadZoom(persistenceKey) : null) ?? DEFAULT_WHITE_KEY_WIDTH_PX,
  );

  function namedRangeFor(step: FitStep): KeyRange {
    return resolveNamedRange(step, { defaultRange, tightRange, deviceRange, hasDevice });
  }

  // Reset to the default range whenever it changes identity (a new song/exercise
  // loaded) — always, unconditionally, per the spec. Skipped on the very first render
  // since the initial state already reflects the default step.
  const defaultRangeKey = `${defaultRange.lowestNote}:${defaultRange.highestNote}`;
  const isFirstDefaultRangeRender = useRef(true);
  useEffect(() => {
    if (isFirstDefaultRangeRender.current) {
      isFirstDefaultRangeRender.current = false;
      return;
    }
    setNamedIndex(0);
    setManualRange(null);
    setIsWidthFit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRangeKey]);

  // Re-sync the persisted width preference when the persistence key's identity changes
  // after mount (e.g. a different MIDI keyboard connects) — never on initial mount,
  // which the lazy initializers above already handle without a read-after-write race.
  const prevPersistenceKeyRef = useRef(persistenceKey);
  useEffect(() => {
    if (prevPersistenceKeyRef.current === persistenceKey) return;
    prevPersistenceKeyRef.current = persistenceKey;
    if (!persistenceKey) {
      setIsWidthFit(true);
      return;
    }
    const stored = loadZoom(persistenceKey);
    if (stored != null) {
      setManualWidthPx(stored);
      setIsWidthFit(false);
    } else {
      setIsWidthFit(true);
    }
  }, [persistenceKey]);

  const range = manualRange ?? namedRangeFor(steps[safeIndex]);

  const fitWidthPx =
    containerWidthPx > 0
      ? clampZoomPx(fitWhiteKeyWidth(range.lowestNote, range.highestNote, containerWidthPx))
      : DEFAULT_WHITE_KEY_WIDTH_PX;
  const widthPx = isWidthFit ? fitWidthPx : manualWidthPx;

  // Persist every resulting width (fit-computed or manual), matching what VirtualPiano
  // did inline before this hook existed — not just explicit slider changes.
  useEffect(() => {
    if (!persistenceKey) return;
    saveZoom(persistenceKey, widthPx);
  }, [persistenceKey, widthPx]);

  const geometry = useMemo(
    () => keyboardGeometry(range.lowestNote, range.highestNote, widthPx),
    [range.lowestNote, range.highestNote, widthPx],
  );

  function setWidthPx(px: number) {
    setIsWidthFit(false);
    setManualWidthPx(clampZoomPx(px));
  }

  function advanceFit() {
    const isManual = manualRange !== null || !isWidthFit;
    setNamedIndex(nextFitIndex(safeIndex, isManual, steps));
    setManualRange(null);
    setIsWidthFit(true);
  }

  const dragRef = useRef<{
    pointerId: number;
    side: "left" | "right";
    lastX: number;
    accumulatedPx: number;
    /** Captured at drag-start: was the pre-drag range the device's own (default-while-
     *  connected, or explicitly the keyboard step)? Only then does releasing the drag
     *  recalibrate the device, mirroring the pre-extraction VirtualPiano behavior. */
    wasDeviceTracking: boolean;
  } | null>(null);

  function startDrag(side: "left" | "right", e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const currentStep = steps[safeIndex];
    dragRef.current = {
      pointerId: e.pointerId,
      side,
      lastX: e.clientX,
      accumulatedPx: 0,
      wasDeviceTracking: hasDevice && manualRange === null && currentStep !== "tight",
    };
    try {
      // Pointer capture can throw (e.g. the pointer was never "live" from the browser's
      // perspective) — that's not a reason to abandon the drag, just to skip the capture.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored — see above.
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const deltaX = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    // Positive accumulation = dragging outward (grows the range).
    drag.accumulatedPx += drag.side === "left" ? -deltaX : deltaX;

    setManualRange((current) => {
      let next = current ?? range;
      const before = next;
      while (drag.accumulatedPx >= DRAG_STEP_PX) {
        const stepped = drag.side === "left" ? expandLow(next) : expandHigh(next);
        if (stepped === next) break; // hit PIANO_LOWEST/PIANO_HIGHEST
        next = stepped;
        drag.accumulatedPx -= DRAG_STEP_PX;
      }
      while (drag.accumulatedPx <= -DRAG_STEP_PX) {
        const stepped = drag.side === "left" ? shrinkLow(next) : shrinkHigh(next);
        if (stepped === next) break; // hit the minimum span
        next = stepped;
        drag.accumulatedPx += DRAG_STEP_PX;
      }
      if (next !== before) setIsWidthFit(true);
      return next;
    });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (drag.wasDeviceTracking && onDeviceRangeChange) {
      // Functional form reads the true latest range rather than a possibly-stale
      // closure value — the pointerup handler is recreated every render, but this
      // guarantees correctness regardless.
      setManualRange((current) => {
        if (current) onDeviceRangeChange(current);
        return current;
      });
    }
  }

  return {
    geometry,
    range,
    keyCount: keyCountFor(range),
    rangeLabel: rangeLabelFor(range),
    widthPx,
    setWidthPx,
    advanceFit,
    fitLabel: "Auto-fit keys",
    dragHandlers: {
      onLeftPointerDown: (e) => startDrag("left", e),
      onRightPointerDown: (e) => startDrag("right", e),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
