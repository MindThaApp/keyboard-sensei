import { useEffect, useMemo, useState } from "react";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { useMidiContext } from "../midi/MidiContext";

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

function isBlackKey(note: number): boolean {
  return BLACK_KEY_PITCH_CLASSES.has(((note % 12) + 12) % 12);
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
              className={`relative h-40 flex items-end justify-center pb-2 rounded-b-md border border-slate-300 transition-colors ${keyColorClasses(
                note,
                false,
              )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
              style={{ width: WHITE_KEY_WIDTH_PX }}
              onMouseDown={() => press(note)}
              onMouseUp={() => release(note)}
              onMouseLeave={() => pressedNotes.has(note) && release(note)}
              onTouchStart={(e) => {
                e.preventDefault();
                press(note);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                release(note);
              }}
            >
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
              className={`absolute top-0 h-24 rounded-b-md border border-slate-900 z-10 transition-colors ${keyColorClasses(
                note,
                true,
              )} ${disabled ? "opacity-50" : "cursor-pointer active:brightness-95"}`}
              style={{ width: BLACK_KEY_WIDTH_PX, left }}
              onMouseDown={() => press(note)}
              onMouseUp={() => release(note)}
              onMouseLeave={() => pressedNotes.has(note) && release(note)}
              onTouchStart={(e) => {
                e.preventDefault();
                press(note);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                release(note);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

