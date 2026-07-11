import { useMemo } from "react";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import NotationRenderer from "../notation/NotationRenderer";
import { groupIntoMeasures, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";

export interface QuantizedSongNote {
  id: string;
  midi: number;
  hand: "left" | "right";
  startBeat: number;
  durationBeats: number;
}

const SIXTEENTHS_PER_BEAT = 4;

/**
 * Quantizes real (unquantized, human-performed) note times to the nearest
 * sixteenth note at the given tempo, for DISPLAY ONLY — the falling-notes
 * waterfall and its scoring keep using the exact original startS/durationS;
 * this is purely a readability aid for the notation preview strip above it.
 */
export function quantizeToBeats(notes: PlayAlongNote[], bpm: number): QuantizedSongNote[] {
  const secondsPerSixteenth = 60 / bpm / SIXTEENTHS_PER_BEAT;
  return notes.map((note, i) => ({
    id: `${i}`,
    midi: note.midi,
    hand: note.hand,
    startBeat: Math.round(note.startS / secondsPerSixteenth) / SIXTEENTHS_PER_BEAT,
    durationBeats: Math.max(0.25, Math.round(note.durationS / secondsPerSixteenth) / SIXTEENTHS_PER_BEAT),
  }));
}

interface Props {
  notes: QuantizedSongNote[];
  beatsPerBar: number;
  songTimeS: number;
  bpm: number;
}

const WINDOW_MEASURES = 2;

/** Rolling 1-2 measure grand-staff preview above the Play-Along waterfall — deliberately a small sliding window rather than full-piece transcription (see design spec §5). */
export default function NotationPreviewStrip({ notes, beatsPerBar, songTimeS, bpm }: Props) {
  const secondsPerBeat = 60 / bpm;
  const currentBeat = Math.max(0, songTimeS / secondsPerBeat);
  const windowStart = Math.floor(currentBeat / beatsPerBar) * beatsPerBar;
  const windowBeats = beatsPerBar * WINDOW_MEASURES;

  const { data, activeNoteIds } = useMemo(() => {
    const windowed = notes.filter((n) => n.startBeat >= windowStart && n.startBeat < windowStart + windowBeats);
    // Combine simultaneous notes (chords / both hands' overlapping notes within one hand's
    // part) that share a quantized startBeat into a single BeatEvent before calling
    // groupIntoMeasures — see that function's docstring for why: it counts one
    // durationBeats per BeatEvent toward a measure's beat total, so emitting one BeatEvent
    // per note (instead of per distinct startBeat) would double/triple-count elapsed beats
    // for chords and break trailing-rest calculation. Mirrors MidiExercise.tsx's beatEventsFor.
    const toBeatEvents = (hand: "left" | "right"): BeatEvent[] => {
      const groups = new Map<number, QuantizedSongNote[]>();
      for (const n of windowed.filter((n) => n.hand === hand)) {
        const startBeat = n.startBeat - windowStart;
        groups.set(startBeat, [...(groups.get(startBeat) ?? []), n]);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([startBeat, group]) => ({
          ids: group.map((n) => n.id),
          keys: group.map((n) => midiToVexKey(n.midi)),
          startBeat,
          durationBeats: Math.max(...group.map((n) => n.durationBeats)),
        }));
    };

    const active = new Set(
      notes.filter((n) => n.startBeat <= currentBeat && currentBeat < n.startBeat + n.durationBeats).map((n) => n.id),
    );

    const right = toBeatEvents("right");
    const left = toBeatEvents("left");
    // Each hand is grouped into measures independently, so a hand resting for
    // a full bar within the window needs a shared minMeasureCount to keep the
    // treble/bass arrays aligned bar-for-bar (see groupIntoMeasures' docstring).
    const measureCountFor = (events: BeatEvent[]): number =>
      events.length === 0 ? 0 : Math.floor(Math.max(...events.map((e) => e.startBeat)) / beatsPerBar) + 1;
    const sharedMeasureCount = Math.max(measureCountFor(right), measureCountFor(left));

    return {
      data: {
        grandStaff: true,
        treble: { clef: "treble", measures: groupIntoMeasures(right, beatsPerBar, sharedMeasureCount).map((noteList) => ({ notes: noteList })) },
        bass: { clef: "bass", measures: groupIntoMeasures(left, beatsPerBar, sharedMeasureCount).map((noteList) => ({ notes: noteList })) },
      },
      activeNoteIds: active,
    };
    // Recompute only when the current sixteenth-note slot changes, not every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, windowStart, windowBeats, beatsPerBar, Math.floor(currentBeat * 4)]);

  return (
    <div className="mb-2 max-h-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/40">
      <NotationRenderer data={data} activeNoteIds={activeNoteIds} />
    </div>
  );
}
