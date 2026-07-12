import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, useCallback } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "../midi/MidiContext";
import { keyboardGeometry, fitWhiteKeyWidth, isBlackKey } from "../play/waterfall";
import { PIANO_LOWEST, PIANO_HIGHEST, type KeyRange, unionRange } from "../../utils/keyboardRange";

const MIDDLE_C = 60;
/** Classic "typing keyboard as piano" layout, one row of white/black keys starting at C4. */
const KEY_TO_SEMITONE_OFFSET: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16,
};

function isTypingIntoFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export interface VirtualPianoProps {
  lowestNote?: number;
  highestNote?: number;
  /** Overrides lowestNote/highestNote when provided. Also the range that drag-to-resize mutates. */
  range?: KeyRange;
  /** Shaded band over the keys actually needed for the current piece, so the user doesn't
   *  drag the range wider than necessary and shrink every key for nothing. */
  recommendedRange?: KeyRange;
  /** Notes to highlight as "play these next" — never shown as raw MIDI numbers, just visual key highlighting. */
  expectedNotes?: number[];
  /** Post-attempt feedback coloring, keyed by MIDI note number. */
  feedbackByNote?: Record<number, "correct" | "incorrect">;
  showLabels?: boolean;
  disabled?: boolean;
  /** False when a parent (e.g. Play-Along) already wraps this piano AND another element (a
   *  waterfall canvas) in one shared horizontal scroll container — an inner scroller here
   *  would let the piano scroll independently and visually detach from that other element. */
  scrollable?: boolean;
}

const ZOOM_MIN_PX = 12;
const ZOOM_MAX_PX = 72;
const ZOOM_STEP_PX = 4;
const DEFAULT_WHITE_KEY_WIDTH_PX = 40;
/** Key height scales with key width so narrow zoom levels don't render absurdly tall keys. */
const WHITE_KEY_HEIGHT_RATIO = 4; // matches the previous fixed 40px-wide / 160px-tall (h-40) keys
const BLACK_KEY_HEIGHT_RATIO = 24 / 40; // matches the previous fixed h-24 vs h-40 ratio
/** Pixels of drag movement per one-octave range change. */
const DRAG_STEP_PX = 50;

function clampZoom(px: number): number {
  return Math.min(ZOOM_MAX_PX, Math.max(ZOOM_MIN_PX, px));
}

function zoomStorageKey(deviceName: string): string {
  return `keyboard-sensei-zoom:${deviceName}`;
}

function loadZoom(deviceName: string): number | null {
  try {
    const raw = localStorage.getItem(zoomStorageKey(deviceName));
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampZoom(parsed) : null;
  } catch {
    return null;
  }
}

function saveZoom(deviceName: string, px: number): void {
  try {
    localStorage.setItem(zoomStorageKey(deviceName), String(px));
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

const MIN_RANGE_SPAN_SEMITONES = 12; // never let dragging collapse below one octave

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

/**
 * Clickable/touchable on-screen piano. Emits noteon/noteoff through the
 * shared MockMidiAdapter (via MidiContext) — this is what makes the whole
 * app demoable without real MIDI hardware. Also reflects real hardware
 * input, since it listens to the same combined event stream it emits into.
 */
export default function VirtualPiano({
  lowestNote = 48,
  highestNote = 72,
  range: rangeProp,
  recommendedRange,
  expectedNotes = [],
  feedbackByNote = {},
  showLabels = true,
  disabled = false,
  scrollable = true,
}: VirtualPianoProps) {
  const { mockAdapter, subscribe, devices, deviceRange, setDeviceRange } = useMidiContext();
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    return subscribe((event) => {
      setPressedNotes((prev) => {
        const next = new Set(prev);
        if (event.type === "noteon") next.add(event.note);
        else next.delete(event.note);
        return next;
      });
    });
  }, [subscribe]);

  // range prop wins outright. Otherwise: only trust deviceRange when a device is actually
  // connected — falling back to it with zero devices would silently grow every lesson's
  // 25-key keyboard to 61 keys for a device that doesn't exist.
  const baseRange: KeyRange = useMemo(() => {
    if (rangeProp) return rangeProp;
    if (devices.length > 0) return deviceRange;
    return { lowestNote, highestNote };
  }, [rangeProp, devices.length, deviceRange, lowestNote, highestNote]);

  const [range, setRange] = useState<KeyRange>(baseRange);
  useEffect(() => {
    setRange(baseRange);
  }, [baseRange.lowestNote, baseRange.highestNote]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Observe the OUTER container, never the keyboard element whose width this effect
    // itself sets — observing the element you resize creates a
    // "ResizeObserver loop completed with undelivered notifications" feedback loop.
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const deviceName = devices[0]?.name ?? "default";
  // Lazy initializers read localStorage exactly once, at the state's real creation — an
  // effect-based read here would race the persist-effect below under React 18 StrictMode's
  // dev-only double-invoke (mount -> cleanup -> mount): the first pass's persist effect
  // writes the just-created default width to localStorage, and a second "restore" effect
  // invocation would then read that back and mistake it for a real stored user preference,
  // permanently locking Fit mode off. (Same double-invoke family of bug as the OsmdNotation
  // ref-guard issue — verified live in a real browser, not just by inspection.)
  const [whiteKeyWidthPx, setWhiteKeyWidthPx] = useState<number>(() => loadZoom(deviceName) ?? DEFAULT_WHITE_KEY_WIDTH_PX);
  const [isFitMode, setIsFitMode] = useState<boolean>(() => loadZoom(deviceName) == null);

  // Re-sync the zoom preference only when the device identity actually changes after mount
  // (e.g. a MIDI keyboard gets connected) — never on the initial mount itself, which the lazy
  // initializers above already handle without the read-after-write race described above.
  const prevDeviceNameRef = useRef(deviceName);
  useEffect(() => {
    if (prevDeviceNameRef.current === deviceName) return;
    prevDeviceNameRef.current = deviceName;
    const stored = loadZoom(deviceName);
    if (stored != null) {
      setWhiteKeyWidthPx(stored);
      setIsFitMode(false);
    } else {
      setIsFitMode(true);
    }
  }, [deviceName]);

  // While in Fit mode (default, or after clicking Fit), recompute on every container resize
  // so the whole keyboard stays visible without a manual re-zoom.
  useEffect(() => {
    if (!isFitMode || !containerWidth) return;
    setWhiteKeyWidthPx(clampZoom(fitWhiteKeyWidth(range.lowestNote, range.highestNote, containerWidth)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFitMode, containerWidth, range.lowestNote, range.highestNote]);

  useEffect(() => {
    saveZoom(deviceName, whiteKeyWidthPx);
  }, [deviceName, whiteKeyWidthPx]);

  function zoomOut() {
    setIsFitMode(false);
    setWhiteKeyWidthPx((w) => clampZoom(w - ZOOM_STEP_PX));
  }
  function zoomIn() {
    setIsFitMode(false);
    setWhiteKeyWidthPx((w) => clampZoom(w + ZOOM_STEP_PX));
  }
  function zoomToFit() {
    setIsFitMode(true);
    if (containerWidth) {
      setWhiteKeyWidthPx(clampZoom(fitWhiteKeyWidth(range.lowestNote, range.highestNote, containerWidth)));
    }
  }

  const geometry = useMemo(
    () => keyboardGeometry(range.lowestNote, range.highestNote, whiteKeyWidthPx),
    [range.lowestNote, range.highestNote, whiteKeyWidthPx],
  );

  const notes = useMemo(() => {
    const list: number[] = [];
    for (let n = range.lowestNote; n <= range.highestNote; n++) list.push(n);
    return list;
  }, [range.lowestNote, range.highestNote]);

  const whiteNotes = useMemo(() => notes.filter((n) => !isBlackKey(n)), [notes]);
  const blackNotes = useMemo(() => notes.filter((n) => isBlackKey(n)), [notes]);
  const expectedSet = useMemo(() => new Set(expectedNotes), [expectedNotes]);

  const whiteKeyHeightPx = whiteKeyWidthPx * WHITE_KEY_HEIGHT_RATIO;
  const blackKeyHeightPx = whiteKeyHeightPx * BLACK_KEY_HEIGHT_RATIO;

  function press(note: number) {
    if (disabled) return;
    mockAdapter.triggerNoteOn(note, 100);
  }
  function release(note: number) {
    if (disabled) return;
    mockAdapter.triggerNoteOff(note);
  }

  // Glissando via Pointer Events: each active pointer maps to the note it is
  // currently sounding (null while the pointer has slid off the keys but is
  // still down). Visual pressed state comes from the subscribed event stream,
  // so a ref (no re-render) is all we need here.
  const activePointersRef = useRef<Map<number, number | null>>(new Map());

  function handlePointerDown(note: number, e: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    e.preventDefault();
    // Touch pointers get implicitly captured by the element they went down on,
    // which would pin all subsequent events to this key and stop pointerenter
    // from ever firing on sibling keys — release the capture so drags can
    // glissando across the keyboard.
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    activePointersRef.current.set(e.pointerId, note);
    press(note);
  }

  function handlePointerEnter(note: number, e: ReactPointerEvent<HTMLButtonElement>) {
    const active = activePointersRef.current;
    if (!active.has(e.pointerId)) return; // plain hover, no press in progress
    const prev = active.get(e.pointerId);
    if (prev === note) return;
    if (prev != null) release(prev);
    active.set(e.pointerId, note);
    press(note);
  }

  function handlePointerLeave(note: number, e: ReactPointerEvent<HTMLButtonElement>) {
    const active = activePointersRef.current;
    if (active.get(e.pointerId) !== note) return;
    release(note);
    // Keep the drag alive: the next key the pointer enters will press again.
    active.set(e.pointerId, null);
  }

  // pointerup/pointercancel can land anywhere (off the key, off the page),
  // so the drag has to end from window-level listeners.
  useEffect(() => {
    const active = activePointersRef.current;
    function endDrag(e: PointerEvent) {
      const note = active.get(e.pointerId);
      if (note === undefined) return;
      active.delete(e.pointerId);
      if (note !== null) mockAdapter.triggerNoteOff(note);
    }
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      for (const note of active.values()) {
        if (note !== null) mockAdapter.triggerNoteOff(note);
      }
      active.clear();
    };
  }, [mockAdapter]);

  // Computer-keyboard input for when no MIDI keyboard is available. Ignored while
  // typing into a form field so it doesn't interfere with the Settings page etc.
  useEffect(() => {
    const heldKeys = new Set<string>();

    function noteForEvent(e: KeyboardEvent): number | null {
      const offset = KEY_TO_SEMITONE_OFFSET[e.key.toLowerCase()];
      if (offset === undefined) return null;
      const note = MIDDLE_C + offset;
      if (note < range.lowestNote || note > range.highestNote) return null;
      return note;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (disabled || e.repeat || isTypingIntoFormField(e.target)) return;
      const note = noteForEvent(e);
      if (note === null || heldKeys.has(e.key.toLowerCase())) return;
      heldKeys.add(e.key.toLowerCase());
      press(note);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (isTypingIntoFormField(e.target)) return;
      const note = noteForEvent(e);
      if (note === null) return;
      heldKeys.delete(e.key.toLowerCase());
      release(note);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      for (const key of heldKeys) {
        const offset = KEY_TO_SEMITONE_OFFSET[key];
        if (offset !== undefined) release(MIDDLE_C + offset);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, range.lowestNote, range.highestNote]);

  function keyColorClasses(note: number, isBlack: boolean): string {
    const feedback = feedbackByNote[note];
    const isPressed = pressedNotes.has(note);
    const isExpected = expectedSet.has(note);

    if (feedback === "correct") return isBlack ? "bg-emerald-600" : "bg-emerald-200";
    if (feedback === "incorrect") return isBlack ? "bg-rose-600" : "bg-rose-200";
    if (isPressed) return isBlack ? "bg-slate-500" : "bg-slate-300";
    if (isExpected) return isBlack ? "bg-sky-700" : "bg-sky-100";
    return isBlack ? "bg-slate-900" : "bg-white";
  }

  // Drag-to-resize: pointer moves accumulate, stepping the range by one octave (to the
  // next/previous C) every DRAG_STEP_PX. Each step immediately refits whiteKeyWidthPx to
  // the container so the keyboard never spills off-screen mid-drag — only the 12px zoom
  // floor can still force a scrollbar, which is expected on very narrow screens.
  const dragRef = useRef<{ pointerId: number; side: "left" | "right"; lastX: number; accumulatedPx: number } | null>(
    null,
  );

  function handleHandlePointerDown(side: "left" | "right", e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = { pointerId: e.pointerId, side, lastX: e.clientX, accumulatedPx: 0 };
    try {
      // Pointer capture can throw (e.g. the pointer was never "live" from the browser's
      // perspective) — that's not a reason to abandon the drag, just to skip the capture.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored — see above.
    }
  }

  function handleHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const deltaX = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    // Positive accumulation = dragging outward (grows the range).
    drag.accumulatedPx += drag.side === "left" ? -deltaX : deltaX;

    setRange((current) => {
      let next = current;
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
      if (next !== current && containerWidth) {
        setIsFitMode(true);
        setWhiteKeyWidthPx(clampZoom(fitWhiteKeyWidth(next.lowestNote, next.highestNote, containerWidth)));
      }
      return next;
    });
  }

  function handleHandlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (devices.length > 0) {
      setRange((current) => {
        setDeviceRange(current);
        return current;
      });
    }
  }

  // A shaded band across the keys was tried first and was simply ugly — a big
  // amber overlay sitting on top of the piano whenever the range wasn't an exact
  // match. A button is quieter: it says what it does, and it disappears once the
  // keyboard already covers the piece.
  const fitsPiece =
    !recommendedRange ||
    (range.lowestNote <= recommendedRange.lowestNote && range.highestNote >= recommendedRange.highestNote);

  const fitToPiece = useCallback(() => {
    if (!recommendedRange) return;
    const next = unionRange(range, recommendedRange);
    setRange(next);
    if (devices.length > 0) setDeviceRange(next);
  }, [recommendedRange, range, devices.length, setDeviceRange]);

  return (
    <div ref={containerRef} className="w-full">
      <div className="mb-1 flex items-center justify-end gap-1">
        {recommendedRange && !fitsPiece && (
          <button
            type="button"
            onClick={fitToPiece}
            title="Widen the keyboard so every note this piece uses is on screen"
            className="mr-auto rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Fit to piece
          </button>
        )}
        <button
          type="button"
          aria-label="Zoom out"
          onClick={zoomOut}
          disabled={whiteKeyWidthPx <= ZOOM_MIN_PX}
          className="h-6 w-6 rounded border border-slate-300 text-xs leading-none text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
        >
          −
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          onClick={zoomIn}
          disabled={whiteKeyWidthPx >= ZOOM_MAX_PX}
          className="h-6 w-6 rounded border border-slate-300 text-xs leading-none text-slate-600 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Fit whole keyboard"
          onClick={zoomToFit}
          className="h-6 rounded border border-slate-300 px-2 text-[11px] leading-none text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Fit
        </button>
      </div>
      <div className={scrollable ? "w-full overflow-x-auto pb-1" : "w-full"}>
        <div
          className="relative mx-auto select-none"
          style={{ width: geometry.widthPx, minWidth: geometry.widthPx, height: whiteKeyHeightPx }}
          role="group"
          aria-label="Virtual piano keyboard"
        >

          <div className="flex" style={{ height: whiteKeyHeightPx }}>
            {whiteNotes.map((note) => {
              const rect = geometry.xFor(note);
              if (!rect) return null;
              return (
                <button
                  key={note}
                  type="button"
                  aria-label={midiNoteToName(note)}
                  aria-pressed={pressedNotes.has(note)}
                  className={`relative flex items-end justify-center pb-2 rounded-b-md border border-slate-300 transition-colors touch-none ${keyColorClasses(
                    note,
                    false,
                  )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
                  style={{ width: rect.width, height: whiteKeyHeightPx }}
                  onPointerDown={(e) => handlePointerDown(note, e)}
                  onPointerEnter={(e) => handlePointerEnter(note, e)}
                  onPointerLeave={(e) => handlePointerLeave(note, e)}
                >
                  {note === MIDDLE_C && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-7 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-400/70"
                    />
                  )}
                  {showLabels && <span className="text-[10px] text-slate-500">{midiNoteToName(note)}</span>}
                </button>
              );
            })}
          </div>
          {blackNotes.map((note) => {
            const rect = geometry.xFor(note);
            if (!rect) return null;
            return (
              <button
                key={note}
                type="button"
                aria-label={midiNoteToName(note)}
                aria-pressed={pressedNotes.has(note)}
                className={`absolute top-0 rounded-b-md border border-slate-900 z-10 transition-colors touch-none ${keyColorClasses(
                  note,
                  true,
                )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
                style={{ width: rect.width, height: blackKeyHeightPx, left: rect.x }}
                onPointerDown={(e) => handlePointerDown(note, e)}
                onPointerEnter={(e) => handlePointerEnter(note, e)}
                onPointerLeave={(e) => handlePointerLeave(note, e)}
              />
            );
          })}
          <div
            role="slider"
            aria-label="Lower end of keyboard range"
            aria-valuenow={range.lowestNote}
            aria-valuemin={PIANO_LOWEST}
            aria-valuemax={PIANO_HIGHEST}
            className="absolute top-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded bg-slate-400/40 hover:bg-slate-400/70"
            style={{ left: 0, height: whiteKeyHeightPx }}
            onPointerDown={(e) => handleHandlePointerDown("left", e)}
            onPointerMove={handleHandlePointerMove}
            onPointerUp={handleHandlePointerUp}
            onPointerCancel={handleHandlePointerUp}
          />
          <div
            role="slider"
            aria-label="Upper end of keyboard range"
            aria-valuenow={range.highestNote}
            aria-valuemin={PIANO_LOWEST}
            aria-valuemax={PIANO_HIGHEST}
            className="absolute top-0 z-30 w-3 -translate-x-1/2 cursor-ew-resize touch-none rounded bg-slate-400/40 hover:bg-slate-400/70"
            style={{ left: geometry.widthPx, height: whiteKeyHeightPx }}
            onPointerDown={(e) => handleHandlePointerDown("right", e)}
            onPointerMove={handleHandlePointerMove}
            onPointerUp={handleHandlePointerUp}
            onPointerCancel={handleHandlePointerUp}
          />
        </div>
      </div>
      {!disabled && (
        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          No MIDI keyboard? Use your computer keyboard: A S D F G H J K (white keys), W E T Y U (black keys).
        </p>
      )}
    </div>
  );
}
