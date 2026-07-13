import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import NotationRenderer, { BARLINE_WIDTH_PX, NOTE_WIDTH_PX, STAVE_MARGIN_PX } from "../notation/NotationRenderer";
import { groupIntoMeasures, measureIndexForBeat, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";
import { barRangeContaining, barRangesFrom, type TimeSignatureSegment } from "../../utils/playalongSong";

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
  /**
   * Every time-signature segment in the piece (denominator-aware bar
   * lengths in quarter notes), not just a single scalar — 15/311 library
   * files change meter mid-piece, so the window/measure grouping below
   * must be able to cross a meter change without misplacing barlines.
   */
  timeSignatureSegments: TimeSignatureSegment[];
  songTimeS: number;
  bpm: number;
  verticalRange?: { lowestNote: number; highestNote: number };
}

const MIN_WINDOW_MEASURES = 1;
const MAX_WINDOW_MEASURES = 8;
const DEFAULT_WINDOW_MEASURES = 2; // used only before the container has been measured once

// Everything NotationRenderer adds around the notes themselves for a grand
// staff system: STAVE_MARGIN_PX (clef/key-sig gutter, baked into its own
// width math) + its own `renderer.resize` pad + this component's and
// NotationRenderer's own padding/border. Approximate on purpose — this only
// decides how many measures to *try* to fit, NotationRenderer's real
// per-system width computation (systemWidth) is what actually lays it out.
const RENDER_CHROME_OVERHEAD_PX = STAVE_MARGIN_PX + 20 + 24 + 16;

/** Distinct quantized start-beats for one hand within [start, end) — chords share a startBeat and count once, matching how toBeatEvents groups them below. */
function distinctBeatCount(notes: QuantizedSongNote[], hand: "left" | "right", start: number, end: number): number {
  const beats = new Set<number>();
  for (const n of notes) {
    if (n.hand === hand && n.startBeat >= start && n.startBeat < end) beats.add(n.startBeat);
  }
  return beats.size;
}

/**
 * Chooses how many upcoming measures should fit in one system given the
 * container's measured width, walking forward bar-by-bar (crossing meter
 * changes via barRangeContaining) and estimating each bar's width with the
 * same per-note arithmetic NotationRenderer uses (NOTE_WIDTH_PX per tickable
 * + BARLINE_WIDTH_PX), so denser bars naturally admit fewer measures and
 * sparse ones admit more. Always includes at least one measure even if it
 * alone doesn't fit (avoids an empty strip), and never exceeds
 * MAX_WINDOW_MEASURES regardless of how much room is available.
 */
function estimateWindowMeasures(
  notes: QuantizedSongNote[],
  timeSignatureSegments: TimeSignatureSegment[],
  windowStart: number,
  containerWidthPx: number,
): number {
  if (containerWidthPx <= 0) return DEFAULT_WINDOW_MEASURES;
  const availableWidthPx = containerWidthPx - RENDER_CHROME_OVERHEAD_PX;
  let cursor = windowStart;
  let usedWidthPx = 0;
  let count = 0;
  while (count < MAX_WINDOW_MEASURES) {
    const bar = barRangeContaining(timeSignatureSegments, cursor);
    const noteCount = Math.max(
      distinctBeatCount(notes, "right", bar.start, bar.end),
      distinctBeatCount(notes, "left", bar.start, bar.end),
      1,
    );
    const barWidthPx = noteCount * NOTE_WIDTH_PX + BARLINE_WIDTH_PX;
    if (count > 0 && usedWidthPx + barWidthPx > availableWidthPx) break;
    usedWidthPx += barWidthPx;
    count += 1;
    cursor = bar.end;
  }
  return Math.max(MIN_WINDOW_MEASURES, count);
}

const SCALE_MIN = 0.75;
const SCALE_MAX = 1.5;
const SCALE_STEP = 0.125;
const DEFAULT_SCALE = 1;
const SCALE_STORAGE_KEY = "ks-notation-strip-scale";

function loadScale(): number {
  try {
    const raw = localStorage.getItem(SCALE_STORAGE_KEY);
    const value = raw ? Number(raw) : DEFAULT_SCALE;
    return Number.isFinite(value) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, value)) : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

/** Rolling grand-staff preview above the Play-Along waterfall. The measure window adapts to fill the available width (see estimateWindowMeasures) while always rendering as exactly one system — maxSystemWidthPx={Infinity} below — so its footprint never jumps as note density changes bar to bar. */
export default function NotationPreviewStrip({ notes, timeSignatureSegments, songTimeS, bpm, verticalRange }: Props) {
  const secondsPerBeat = 60 / bpm;
  const currentBeat = Math.max(0, songTimeS / secondsPerBeat);
  const currentBar = barRangeContaining(timeSignatureSegments, currentBeat);
  const windowStart = currentBar.start;

  // Measure the OUTER container's width (never the element whose size we set
  // from this observation — that would be a ResizeObserver feedback loop).
  // This container's width is set by page layout, not by the notation
  // content inside it, so observing it here is safe.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidthPx(entry.contentRect.width));
    observer.observe(node);
    setContainerWidthPx(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const windowMeasureCount = useMemo(
    () => estimateWindowMeasures(notes, timeSignatureSegments, windowStart, containerWidthPx),
    [notes, timeSignatureSegments, windowStart, containerWidthPx],
  );
  // Walk forward windowMeasureCount bars from the current bar's start, correctly
  // crossing a meter change if one falls inside this window.
  const windowRanges = barRangesFrom(timeSignatureSegments, windowStart, windowMeasureCount);
  const windowBeats = windowRanges[windowRanges.length - 1].end - windowStart;
  // Per-measure-index bar lengths (relative to windowStart), for groupIntoMeasures.
  const barLengths = windowRanges.map((r) => r.beatsPerBar);
  const barLengthsKey = barLengths.join(",");

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
      events.length === 0 ? 0 : measureIndexForBeat(barLengths, Math.max(...events.map((e) => e.startBeat))) + 1;
    const sharedMeasureCount = Math.max(measureCountFor(right), measureCountFor(left));

    return {
      data: {
        grandStaff: true,
        treble: { clef: "treble", measures: groupIntoMeasures(right, barLengths, sharedMeasureCount).map((noteList) => ({ notes: noteList })) },
        bass: { clef: "bass", measures: groupIntoMeasures(left, barLengths, sharedMeasureCount).map((noteList) => ({ notes: noteList })) },
      },
      activeNoteIds: active,
    };
    // Recompute only when the current sixteenth-note slot changes, not every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, windowStart, windowBeats, barLengthsKey, Math.floor(currentBeat * 4)]);

  // Zoom control: scales the rendered notation, persisted across sessions.
  const [scale, setScale] = useState(loadScale);
  useEffect(() => {
    try {
      localStorage.setItem(SCALE_STORAGE_KEY, String(scale));
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [scale]);

  // Measure the notation's own natural (unscaled) size — CSS transform does
  // not change an element's own layout box, so this stays accurate even
  // while `scale` is applied to the same node — to size the scroll container
  // around the scaled visual output without leaving a stale gap.
  const notationBoxRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = notationBoxRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setNaturalSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(node);
    setNaturalSize({ width: node.offsetWidth, height: node.offsetHeight });
    return () => observer.disconnect();
  }, []);

  const decreaseScale = () => setScale((s) => Math.max(SCALE_MIN, Math.round((s - SCALE_STEP) * 1000) / 1000));
  const increaseScale = () => setScale((s) => Math.min(SCALE_MAX, Math.round((s + SCALE_STEP) * 1000) / 1000));

  return (
    <div
      ref={containerRef}
      className="relative mb-2 rounded-lg border border-slate-200 bg-white/60 p-1 dark:border-slate-800 dark:bg-slate-900/40"
    >
      {/* Overlaid, not stacked: as its own row this toolbar pushed the staff down
          by its full height, which read as dead space above the notes. */}
      <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded bg-white/80 px-1 backdrop-blur-sm dark:bg-slate-900/80">
        <span className="text-[11px] text-slate-400">Sheet size</span>
        <button
          type="button"
          aria-label="Decrease sheet music size"
          onClick={decreaseScale}
          disabled={scale <= SCALE_MIN}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium leading-none text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          −
        </button>
        <span className="w-9 text-center text-[11px] tabular-nums text-slate-500">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label="Increase sheet music size"
          onClick={increaseScale}
          disabled={scale >= SCALE_MAX}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium leading-none text-slate-600 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          +
        </button>
      </div>
      <div
        className="overflow-x-auto"
        style={{
          width: naturalSize.width > 0 ? naturalSize.width * scale : undefined,
          height: naturalSize.height > 0 ? naturalSize.height * scale : undefined,
        }}
      >
        <div ref={notationBoxRef} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: "fit-content" }}>
          <NotationRenderer
            data={data}
            activeNoteIds={activeNoteIds}
            maxSystemWidthPx={Infinity}
            verticalRange={verticalRange}
          />
        </div>
      </div>
    </div>
  );
}
