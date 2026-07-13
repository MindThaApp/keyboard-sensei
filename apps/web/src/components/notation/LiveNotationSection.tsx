import { useEffect, useMemo, useRef, useState } from "react";
import { midiToVexKey } from "../../utils/measureNotation";
import { useMidiContext } from "../midi/MidiContext";
import NotationRenderer from "./NotationRenderer";

interface NoteData {
  ids?: string[];
  keys: string[];
  duration: string;
}

interface SimpleStaveData {
  notes?: NoteData[];
  measures?: { notes: NoteData[] }[];
}

interface GrandStaffData {
  grandStaff: true;
  treble: SimpleStaveData;
  bass: SimpleStaveData;
}

const CANONICAL_VEX_KEY_TO_MIDI = new Map(Array.from({ length: 128 }, (_, note) => [midiToVexKey(note), note]));
const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function noteListsOf(stave: SimpleStaveData): NoteData[][] {
  if (stave.measures && stave.measures.length > 0) return stave.measures.map((measure) => measure.notes ?? []);
  return stave.notes && stave.notes.length > 0 ? [stave.notes] : [];
}

function vexKeyToMidi(key: string): number | null {
  const canonical = CANONICAL_VEX_KEY_TO_MIDI.get(key.toLowerCase());
  if (canonical !== undefined) return canonical;

  const match = /^([a-gA-G])([#b]{0,2}|n)?\/(-?\d+)$/.exec(key);
  if (!match) return null;
  const [, letter, accidental = "", octaveText] = match;
  const accidentalOffset = accidental.split("").reduce((sum, char) => sum + (char === "#" ? 1 : char === "b" ? -1 : 0), 0);
  return (Number(octaveText) + 1) * 12 + PITCH_CLASS[letter.toLowerCase()] + accidentalOffset;
}

export function activeNoteIdsForHeldPitches(heldMidiNotes: ReadonlySet<number>, data: Record<string, unknown>): Set<string> {
  const active = new Set<string>();
  const staves = data.grandStaff === true
    ? [(data as unknown as GrandStaffData).treble, (data as unknown as GrandStaffData).bass]
    : [data as unknown as SimpleStaveData];

  for (const stave of staves) {
    for (const notes of noteListsOf(stave)) {
      for (const note of notes) {
        if (!note.ids || note.ids.length === 0 || note.duration.includes("r")) continue;
        note.keys.forEach((key, keyIndex) => {
          const midi = vexKeyToMidi(key);
          if (midi === null || !heldMidiNotes.has(midi)) return;
          const id = note.ids?.[keyIndex];
          if (id) active.add(id);
          else note.ids?.forEach((fallbackId) => active.add(fallbackId));
        });
      }
    }
  }
  return active;
}

export default function LiveNotationSection({ data, title }: { data: Record<string, unknown>; title?: string }) {
  const { subscribe } = useMidiContext();
  const [heldMidiNotes, setHeldMidiNotes] = useState<Set<number>>(() => new Set());
  const heldMidiNotesRef = useRef<Set<number>>(new Set());

  useEffect(
    () =>
      subscribe((event) => {
        const current = heldMidiNotesRef.current;
        if (event.type === "noteon") {
          if (current.has(event.note)) return;
          const next = new Set(current).add(event.note);
          heldMidiNotesRef.current = next;
          setHeldMidiNotes(next);
          return;
        }
        if (!current.has(event.note)) return;
        const next = new Set(current);
        next.delete(event.note);
        heldMidiNotesRef.current = next;
        setHeldMidiNotes(next);
      }),
    [subscribe],
  );

  const activeNoteIds = useMemo(() => activeNoteIdsForHeldPitches(heldMidiNotes, data), [heldMidiNotes, data]);
  return <NotationRenderer data={data} title={title} activeNoteIds={activeNoteIds} />;
}
