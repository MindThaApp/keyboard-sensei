import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "../midi/MidiContext";
import { isBlackKey } from "../play/waterfall";
import { PIANO_LOWEST, PIANO_HIGHEST, type KeyRange } from "../../utils/keyboardRange";
import { useKeyboardSizing, ZOOM_MIN_PX, ZOOM_MAX_PX, type KeyboardSizing } from "./useKeyboardSizing";
import InstrumentPicker from "../instruments/InstrumentPicker";
import { useExperienceMode } from "../ui/useExperienceMode";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { useMediaQuery } from "../../utils/motion";
import "./keybed.css";

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
  /** The keys the current song/exercise needs; the "Auto-fit keys" cycle's tight-fit step. */
  recommendedRange?: KeyRange;
  /** Notes to highlight as "play these next" — never shown as raw MIDI numbers, just visual key highlighting. */
  expectedNotes?: number[];
  /** Notes the app is playing (e.g. a Listen preview), drawn as held down. */
  soundingNotes?: number[];
  /** Post-attempt feedback coloring, keyed by MIDI note number. */
  feedbackByNote?: Record<number, "correct" | "incorrect">;
  showLabels?: boolean;
  disabled?: boolean;
  /** False when a parent (e.g. Play-Along) already wraps this piano AND another element (a
   *  waterfall canvas) in one shared horizontal scroll container — an inner scroller here
   *  would let the piano scroll independently and visually detach from that other element. */
  scrollable?: boolean;
  /**
   * Forces rendering (and the range/zoom/fit/drag controls) from this externally-owned
   * KeyboardSizing instead of instantiating one internally — required whenever another
   * element (Play-Along's falling-note canvas) must draw notes on these same key
   * positions. The controls still render and stay interactive; they just mutate the
   * caller's shared state instead of a private one, so nothing can drift apart.
   */
  sizing?: KeyboardSizing;
  /** Upper bound for the white keys' height. Key height otherwise scales with key width
   *  (4:1), which made a fit-to-width 14-key keyboard ~290px tall. */
  maxWhiteKeyHeightPx?: number;
  /** The key-size / instrument / auto-fit row. Defaults to on in Advanced mode only; pass
   *  false when a parent renders `KeyboardSizingControls` itself (Play-Along puts them in
   *  its settings panel). */
  showControls?: boolean;
  /** False hides the "use your computer keyboard" hint line. */
  showHint?: boolean;
  /** `keybed` (default): the dark case, felt line and pressable keys. `flat`: a
   *  depth-free keyboard for thumbnails; hides the range handles, controls and hint
   *  unless asked for. */
  variant?: "keybed" | "flat";
  /** Which hand a lit key is tinted for (right when absent). */
  handByNote?: Record<number, "left" | "right">;
}

/** A key is wide enough for a label on every white key (Simple mode). */
const ALL_LABELS_MIN_KEY_PX = 28;
/** Below this a label would not fit on the key at all. */
const LABEL_MIN_KEY_PX = 20;

type KeyTint = "right" | "left" | "ok" | "bad" | "none";

interface KeyProps {
  note: number;
  black: boolean;
  x: number;
  width: number;
  height: number;
  down: boolean;
  tint: KeyTint;
  expected: boolean;
  label: string | null;
  middleC: boolean;
  glyph: string | null;
  onDown: (note: number, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onEnter: (note: number, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onLeave: (note: number, e: ReactPointerEvent<HTMLButtonElement>) => void;
}

/** One key. Memoised on primitives so a press re-renders only the keys that changed. */
const PianoKey = memo(function PianoKey({
  note, black, x, width, height, down, tint, expected, label, middleC, glyph, onDown, onEnter, onLeave,
}: KeyProps) {
  const name = midiNoteToName(note);
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={down}
      data-down={down}
      data-tint={tint}
      className={`ks-key absolute top-0 ${black ? "ks-key-black z-10" : "ks-key-white"}`}
      style={{ width, height, left: x }}
      onPointerDown={(e) => onDown(note, e)}
      onPointerEnter={(e) => onEnter(note, e)}
      onPointerLeave={(e) => onLeave(note, e)}
    >
      {expected && <span aria-hidden="true" className="ks-key-dot" />}
      {middleC && !expected && (
        <span aria-hidden="true" className="absolute bottom-7 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-slate-400/70" />
      )}
      {glyph && (
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 -translate-x-1/2 text-xs font-bold text-slate-900">
          {glyph}
        </span>
      )}
      {/* White keys are white in every theme, so the label can't use the themed muted grey. */}
      {label && (
        <span className="absolute bottom-1.5 left-0 right-0 z-[1] text-center text-xs leading-none text-slate-600">
          {label}
        </span>
      )}
    </button>
  );
});

const DEFAULT_MAX_WHITE_KEY_HEIGHT_PX = 180;
/** An upright phone is narrow but tall: keys keep a playable height however many are fitted in. */
const PHONE_PORTRAIT_MIN_WHITE_KEY_HEIGHT_PX = 168;

/**
 * Key count + range label, instrument picker, key-size slider and the Auto-fit cycle
 * button. Exported so a page can show them somewhere other than under the keys.
 */
export function KeyboardSizingControls({ sizing }: { sizing: KeyboardSizing }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
      <span className="mr-auto text-xs tabular-nums text-slate-500">
        {sizing.keyCount} keys · {sizing.rangeLabel}
      </span>
      <InstrumentPicker compact />
      <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        Key size
        <input
          type="range"
          min={ZOOM_MIN_PX}
          max={ZOOM_MAX_PX}
          value={sizing.widthPx}
          onChange={(e) => sizing.setWidthPx(Number(e.target.value))}
          className="h-6 w-24"
        />
      </label>
      <button
        type="button"
        onClick={sizing.advanceFit}
        className="h-7 rounded border border-slate-300 px-2 text-xs leading-none text-slate-700 dark:border-slate-600 dark:text-slate-200"
      >
        {sizing.fitLabel}
      </button>
    </div>
  );
}

/** Key height scales with key width so narrow zoom levels don't render absurdly tall keys. */
const WHITE_KEY_HEIGHT_RATIO = 4; // matches the previous fixed 40px-wide / 160px-tall (h-40) keys
const BLACK_KEY_HEIGHT_RATIO = 24 / 40; // matches the previous fixed h-24 vs h-40 ratio

/**
 * Clickable/touchable on-screen piano. Emits noteon/noteoff through the
 * shared MockMidiAdapter (via MidiContext) — this is what makes the whole
 * app demoable without real MIDI hardware. Also reflects real hardware
 * input, since it listens to the same combined event stream it emits into.
 */
function VirtualPiano({
  lowestNote = 48,
  highestNote = 72,
  range: rangeProp,
  recommendedRange,
  expectedNotes = [],
  soundingNotes = [],
  feedbackByNote = {},
  showLabels = true,
  disabled = false,
  scrollable = true,
  sizing: sizingProp,
  maxWhiteKeyHeightPx = DEFAULT_MAX_WHITE_KEY_HEIGHT_PX,
  showControls,
  showHint,
  variant = "keybed",
  handByNote,
}: VirtualPianoProps) {
  const flat = variant === "flat";
  const experience = useExperienceMode();
  const { device, orientation } = useDeviceClass();
  const phonePortrait = device === "phone" && orientation === "portrait" && !flat && !sizingProp;
  const finePointer = useMediaQuery("(pointer: fine)");
  const { mockAdapter, subscribe, devices, deviceRange, setDeviceRange, currentDeviceKey } = useMidiContext();
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

  const deviceName = currentDeviceKey ?? "default";
  const hasDevice = devices.length > 0;
  // range prop wins outright. Otherwise: only trust deviceRange when a device is actually
  // connected — falling back to it with zero devices would silently grow every lesson's
  // 25-key keyboard to 61 keys for a device that doesn't exist.
  const defaultRange: KeyRange = rangeProp ?? (hasDevice ? deviceRange : { lowestNote, highestNote });

  // Hooks can't be called conditionally, so this always runs — its output is simply
  // ignored (and its persistence disabled) whenever a parent supplies its own `sizing`.
  // See the `sizing` prop doc above for why a parent needs to own this instead.
  const ownSizing = useKeyboardSizing({
    defaultRange,
    tightRange: recommendedRange,
    deviceRange,
    hasDevice,
    containerWidthPx: containerWidth,
    persistenceKey: sizingProp ? null : deviceName,
    onDeviceRangeChange: sizingProp ? undefined : setDeviceRange,
    keepTightRangeVisible: true,
    simpleFit: experience === "simple" && !sizingProp && !flat,
    // On an upright phone the exercise's whole range fits on screen (narrow keys, no
    // sideways scroll) instead of stopping at the comfortable-key-width floor.
    fitFloorPx: phonePortrait ? ZOOM_MIN_PX : undefined,
  });
  const sizing = sizingProp ?? ownSizing;
  const { geometry } = sizing;

  // When the keys are wider than the screen, start with the notes this exercise needs in
  // view instead of the bottom of the keyboard (lesson 1's C3/C4/C5 used to start
  // off-screen to the right). Re-centres only when the layout changes, never on a press.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const focusLow = recommendedRange?.lowestNote ?? null;
  const focusHigh = recommendedRange?.highestNote ?? null;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !scrollable || focusLow === null || focusHigh === null) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const low = geometry.xFor(focusLow);
    const high = geometry.xFor(focusHigh);
    if (!low || !high) return;
    const centre = (low.x + high.x + high.width) / 2;
    const keys = scroller.firstElementChild;
    if (!keys) return;
    // Where the keys start inside the scroll content (measured, not assumed: the drag
    // handles overhang the keys and change scrollWidth).
    const keysOffset = keys.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    scroller.scrollLeft = Math.max(0, Math.round(keysOffset + centre - scroller.clientWidth / 2));
  }, [geometry, focusLow, focusHigh, scrollable, containerWidth]);

  const notes: number[] = [];
  for (let n = geometry.lowestNote; n <= geometry.highestNote; n++) notes.push(n);
  const whiteNotes = notes.filter((n) => !isBlackKey(n));
  const blackNotes = notes.filter((n) => isBlackKey(n));
  const expectedSet = new Set(expectedNotes);
  const soundingSet = new Set(soundingNotes);

  const naturalKeyHeightPx = geometry.whiteKeyWidthPx * WHITE_KEY_HEIGHT_RATIO;
  const whiteKeyHeightPx = Math.min(
    phonePortrait ? Math.max(naturalKeyHeightPx, PHONE_PORTRAIT_MIN_WHITE_KEY_HEIGHT_PX) : naturalKeyHeightPx,
    maxWhiteKeyHeightPx,
  );
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
      if (note < geometry.lowestNote || note > geometry.highestNote) return null;
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
  }, [disabled, geometry.lowestNote, geometry.highestNote]);

  function tintFor(note: number): KeyTint {
    const feedback = feedbackByNote[note];
    if (feedback === "correct") return "ok";
    if (feedback === "incorrect") return "bad";
    if (pressedNotes.has(note) || soundingSet.has(note)) return handByNote?.[note] ?? "right";
    return "none";
  }

  const whiteWidth = geometry.whiteKeyWidthPx;
  function labelFor(note: number): string | null {
    if (!showLabels || whiteWidth < LABEL_MIN_KEY_PX) return null;
    const isC = note % 12 === 0;
    if (isC || (experience === "simple" && whiteWidth >= ALL_LABELS_MIN_KEY_PX)) return midiNoteToName(note);
    return null;
  }

  function renderKey(note: number, black: boolean) {
    const rect = geometry.xFor(note);
    if (!rect) return null;
    const feedback = feedbackByNote[note];
    return (
      <PianoKey
        key={note}
        note={note}
        black={black}
        x={rect.x}
        width={rect.width}
        height={black ? blackKeyHeightPx : whiteKeyHeightPx}
        down={pressedNotes.has(note) || soundingSet.has(note)}
        tint={tintFor(note)}
        expected={expectedSet.has(note)}
        label={black ? null : labelFor(note)}
        middleC={note === MIDDLE_C}
        glyph={feedback === "correct" ? "✓" : feedback === "incorrect" ? "✕" : null}
        onDown={handlePointerDown}
        onEnter={handlePointerEnter}
        onLeave={handlePointerLeave}
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full">
      <div
        ref={scrollerRef}
        className={`${scrollable ? "w-full overflow-x-auto pb-1" : "w-full"} ${flat ? "ks-flat" : "ks-case"} ks-keybed ${
          disabled ? "opacity-50" : ""
        }`}
      >
        <div
          className="relative mx-auto select-none"
          style={{ width: geometry.widthPx, minWidth: geometry.widthPx, height: whiteKeyHeightPx }}
          role="group"
          aria-label="Virtual piano keyboard"
        >

          <div className="flex" style={{ height: whiteKeyHeightPx }}>
            {whiteNotes.map((note) => renderKey(note, false))}
          </div>
          {blackNotes.map((note) => renderKey(note, true))}
          {!flat && <div aria-hidden="true" className="ks-case-felt" />}
          {!flat && (
          <div
            role="slider"
            aria-label="Lower end of keyboard range"
            aria-valuenow={geometry.lowestNote}
            aria-valuemin={PIANO_LOWEST}
            aria-valuemax={PIANO_HIGHEST}
            className="absolute top-0 z-30 w-3 cursor-ew-resize touch-none rounded bg-slate-400/40 hover:bg-slate-400/70"
            style={{ left: 0, height: whiteKeyHeightPx }}
            onPointerDown={sizing.dragHandlers.onLeftPointerDown}
            onPointerMove={sizing.dragHandlers.onPointerMove}
            onPointerUp={sizing.dragHandlers.onPointerUp}
            onPointerCancel={sizing.dragHandlers.onPointerCancel}
          />
          )}
          {!flat && (
          <div
            role="slider"
            aria-label="Upper end of keyboard range"
            aria-valuenow={geometry.highestNote}
            aria-valuemin={PIANO_LOWEST}
            aria-valuemax={PIANO_HIGHEST}
            className="absolute top-0 z-30 w-3 -translate-x-full cursor-ew-resize touch-none rounded bg-slate-400/40 hover:bg-slate-400/70"
            style={{ left: geometry.widthPx, height: whiteKeyHeightPx }}
            onPointerDown={sizing.dragHandlers.onRightPointerDown}
            onPointerMove={sizing.dragHandlers.onPointerMove}
            onPointerUp={sizing.dragHandlers.onPointerUp}
            onPointerCancel={sizing.dragHandlers.onPointerCancel}
          />
          )}
        </div>
      </div>
      {(showControls ?? (!flat && experience === "advanced")) && (
        <div className="mt-1">
          <KeyboardSizingControls sizing={sizing} />
        </div>
      )}
      {(showHint ?? (!flat && finePointer)) && !disabled && (
        <p className="mt-2 text-center text-xs text-slate-500">
          No MIDI keyboard? Use your computer keyboard: A S D F G H J K (white keys), W E T Y U (black keys).
        </p>
      )}
    </div>
  );
}

// Memoised so a parent re-render (a score tick, a live-follow highlight elsewhere on
// the page) does not re-render all 88 keys when the piano's own props are unchanged.
export default memo(VirtualPiano);
