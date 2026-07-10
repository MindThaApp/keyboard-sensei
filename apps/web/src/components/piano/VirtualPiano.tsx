import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "../midi/MidiContext";

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function isBlackKey(note: number): boolean {
  return BLACK_KEY_PITCH_CLASSES.has(((note % 12) + 12) % 12);
}

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
  /** Notes to highlight as "play these next" — never shown as raw MIDI numbers, just visual key highlighting. */
  expectedNotes?: number[];
  /** Post-attempt feedback coloring, keyed by MIDI note number. */
  feedbackByNote?: Record<number, "correct" | "incorrect">;
  showLabels?: boolean;
  disabled?: boolean;
}

const WHITE_KEY_WIDTH_PX = 40;
const BLACK_KEY_WIDTH_PX = 26;

/**
 * Clickable/touchable on-screen piano. Emits noteon/noteoff through the
 * shared MockMidiAdapter (via MidiContext) — this is what makes the whole
 * app demoable without real MIDI hardware. Also reflects real hardware
 * input, since it listens to the same combined event stream it emits into.
 */
export default function VirtualPiano({
  lowestNote = 48,
  highestNote = 72,
  expectedNotes = [],
  feedbackByNote = {},
  showLabels = true,
  disabled = false,
}: VirtualPianoProps) {
  const { mockAdapter, subscribe } = useMidiContext();
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

  const notes = useMemo(() => {
    const list: number[] = [];
    for (let n = lowestNote; n <= highestNote; n++) list.push(n);
    return list;
  }, [lowestNote, highestNote]);

  const whiteNotes = useMemo(() => notes.filter((n) => !isBlackKey(n)), [notes]);
  const blackNotes = useMemo(() => notes.filter((n) => isBlackKey(n)), [notes]);
  const expectedSet = useMemo(() => new Set(expectedNotes), [expectedNotes]);

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
      if (note < lowestNote || note > highestNote) return null;
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
  }, [disabled, lowestNote, highestNote]);

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

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div
        className="relative mx-auto select-none"
        style={{ width: whiteNotes.length * WHITE_KEY_WIDTH_PX, minWidth: whiteNotes.length * WHITE_KEY_WIDTH_PX }}
        role="group"
        aria-label="Virtual piano keyboard"
      >
        <div className="flex">
          {whiteNotes.map((note) => (
            <button
              key={note}
              type="button"
              aria-label={midiNoteToName(note)}
              aria-pressed={pressedNotes.has(note)}
              className={`relative h-40 flex items-end justify-center pb-2 rounded-b-md border border-slate-300 transition-colors touch-none ${keyColorClasses(
                note,
                false,
              )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
              style={{ width: WHITE_KEY_WIDTH_PX }}
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
          ))}
        </div>
        {blackNotes.map((note) => {
          const whiteKeysBefore = whiteNotes.filter((n) => n < note).length;
          const left = whiteKeysBefore * WHITE_KEY_WIDTH_PX - BLACK_KEY_WIDTH_PX / 2;
          return (
            <button
              key={note}
              type="button"
              aria-label={midiNoteToName(note)}
              aria-pressed={pressedNotes.has(note)}
              className={`absolute top-0 h-24 rounded-b-md border border-slate-900 z-10 transition-colors touch-none ${keyColorClasses(
                note,
                true,
              )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
              style={{ width: BLACK_KEY_WIDTH_PX, left }}
              onPointerDown={(e) => handlePointerDown(note, e)}
              onPointerEnter={(e) => handlePointerEnter(note, e)}
              onPointerLeave={(e) => handlePointerLeave(note, e)}
            />
          );
        })}
      </div>
      {!disabled && (
        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          No MIDI keyboard? Use your computer keyboard: A S D F G H J K (white keys), W E T Y U (black keys).
        </p>
      )}
    </div>
  );
}

