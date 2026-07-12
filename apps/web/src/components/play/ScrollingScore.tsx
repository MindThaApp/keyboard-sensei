import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import NotationRenderer from "../notation/NotationRenderer";
import { groupIntoMeasures, measureIndexForBeat, midiToVexKey, type BeatEvent } from "../../utils/measureNotation";
import { barRangesFrom, type SongBeatGrid, type TimeSignatureSegment } from "../../utils/playalongSong";

export interface ScrollingScoreHandle {
  /** Called from the EXISTING play-along rAF loop, every frame — mutates the
   *  ribbon's transform directly on the DOM (a ref), never via setState, so
   *  this never triggers a React re-render at 60fps (see
   *  docs/agent-briefing.md's "do not setState every frame" lesson). The
   *  currently-sounding note IDs are also tracked here, but only setState
   *  when that SET actually changes (see activeIdsRef below). */
  setSongTime: (songTimeS: number) => void;
}

interface Props {
  notes: PlayAlongNote[];
  grid: SongBeatGrid;
  timeSignatureSegments: TimeSignatureSegment[];
}

interface Point {
  x: number;
  y: number;
}

/** Linear interpolation through a series of points sorted ascending by `x`; extrapolates past either end using the nearest segment's slope. */
export function lerpSeries(points: Point[], x: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].y;
  let lo: number;
  let hi: number;
  if (x <= points[0].x) {
    lo = 0;
    hi = 1;
  } else if (x >= points[points.length - 1].x) {
    hi = points.length - 1;
    lo = hi - 1;
  } else {
    lo = 0;
    hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid].x <= x) lo = mid;
      else hi = mid;
    }
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.x - a.x || 1;
  return a.y + ((x - a.x) / span) * (b.y - a.y);
}

export interface MonotoneCubicSpline {
  xs: number[];
  ys: number[];
  ms: number[];
}

/**
 * Builds a monotone cubic Hermite spline (Fritsch–Carlson) through `points`.
 * Piecewise-LINEAR interpolation through unevenly-spaced anchors makes the
 * interpolated value's velocity (its derivative) jump at every anchor —
 * imperceptible for a static value, but visible as a jerk when the value
 * drives a scroll position every frame. VexFlow spaces notes by its own
 * layout rules, not proportionally to time, so beat→x anchors ARE unevenly
 * spaced; a plain lerp (see lerpSeries above) therefore produces a
 * repeatedly-jerky scroll wherever note density changes.
 *
 * A monotone cubic Hermite spline is C1-continuous (no velocity steps) AND
 * provably monotone between any two anchors with the same sign of slope
 * (Fritsch & Carlson 1980) — unlike a natural/Catmull-Rom cubic spline, it
 * cannot overshoot and briefly reverse direction between anchors, which
 * would be a far worse artifact (the cursor visibly moving backwards). It
 * still passes exactly through every anchor, so the highlighted note is
 * still exactly under the interpolated position at that note's own beat.
 */
export function buildMonotoneCubic(points: Point[]): MonotoneCubicSpline {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of sorted) {
    if (xs.length > 0 && p.x - xs[xs.length - 1] < 1e-9) {
      ys[ys.length - 1] = p.y; // duplicate x (shouldn't normally happen): keep the later value
      continue;
    }
    xs.push(p.x);
    ys.push(p.y);
  }
  const n = xs.length;
  if (n < 2) return { xs, ys, ms: xs.map(() => 0) };

  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) secants.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));

  const m: number[] = new Array(n);
  m[0] = secants[0];
  m[n - 1] = secants[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = secants[i - 1] * secants[i] <= 0 ? 0 : (secants[i - 1] + secants[i]) / 2;
  }

  // Fritsch–Carlson monotonicity correction: clamp each segment's tangents
  // so the Hermite curve can't overshoot past its endpoints' y values.
  for (let i = 0; i < n - 1; i++) {
    const d = secants[i];
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d;
    const b = m[i + 1] / d;
    if (a < 0) m[i] = 0;
    if (b < 0) m[i + 1] = 0;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d;
      m[i + 1] = t * b * d;
    }
  }
  return { xs, ys, ms: m };
}

/** Evaluates a monotone cubic spline at `x`, extrapolating linearly past either end using that end's tangent. */
export function evalMonotoneCubic(spline: MonotoneCubicSpline, x: number): number {
  const { xs, ys, ms } = spline;
  const n = xs.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];
  if (x <= xs[0]) return ys[0] + ms[0] * (x - xs[0]);
  if (x >= xs[n - 1]) return ys[n - 1] + ms[n - 1] * (x - xs[n - 1]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const h = xs[hi] - xs[lo];
  const t = (x - xs[lo]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * ys[lo] + h10 * h * ms[lo] + h01 * ys[hi] + h11 * h * ms[hi];
}

/**
 * Builds (quarterNoteBeat, songSeconds) anchor points from the song's beat
 * grid. `grid.beats[i].timeS` already comes from `ticksToSeconds` across the
 * FULL tempo map (see `buildBeatGrid` in playalongSong.ts) — tempo-map-
 * correct for any rubato, not a fixed-BPM approximation. Denominator-aware:
 * a notated beat in 9/8 is 2/3 of a quarter note, not a whole one (Clair de
 * Lune, this feature's rubato verification piece, is in 9/8) — converting via
 * `4 / bar.denominator` keeps the beat axis in the same quarter-note units
 * `groupIntoMeasures`/`measureIndexForBeat` (measureNotation.ts) expect.
 *
 * These SAME anchors are used both to quantize notes for rendering
 * (`quantizeNotesToGrid`, note.startS -> beat) and to place the highlight
 * (songTimeS -> beat, in ScrollingScore's setSongTime) — using one shared
 * mapping for both is what keeps the highlight landing on the note actually
 * sounding regardless of how the tempo wanders, instead of drifting the way
 * a fixed-BPM conversion would (see NotationPreviewStrip's quantizeToBeats,
 * which accepts that drift because it's "display only").
 */
export function buildQuarterBeatAnchors(grid: SongBeatGrid, segments: TimeSignatureSegment[]): Point[] {
  if (grid.bars.length === 0) return [{ x: 0, y: 0 }];
  const barBeatRanges = barRangesFrom(segments, 0, grid.bars.length);
  const anchors: Point[] = [];
  let barPtr = -1;
  for (const beat of grid.beats) {
    // Bars/beats are built by the same nested loop in buildBeatGrid (for each
    // bar { push bar; for each beatInBar { push beat } }), so an isDownbeat
    // beat (beatInBar === 0) always marks the start of the next bar in time
    // order — this reconstructs the bar association without needing the two
    // arrays interleaved.
    if (beat.isDownbeat) barPtr = Math.min(barPtr + 1, grid.bars.length - 1);
    const bar = grid.bars[Math.max(barPtr, 0)];
    const quarterPerNotatedBeat = 4 / bar.denominator;
    const barStartBeat = barBeatRanges[Math.max(barPtr, 0)].start;
    anchors.push({ x: beat.timeS, y: barStartBeat + beat.beatInBar * quarterPerNotatedBeat });
  }
  if (anchors.length === 0 || anchors[0].x > 1e-6) anchors.unshift({ x: 0, y: 0 });
  return anchors;
}

const SIXTEENTH = 0.25;
const snapToSixteenth = (beats: number): number => Math.round(beats / SIXTEENTH) * SIXTEENTH;

export interface ScrollNote {
  id: string;
  midi: number;
  hand: "left" | "right";
  /** Absolute quarter-note beat from song start (tempo-map-correct — see buildQuarterBeatAnchors). */
  startBeat: number;
  durationBeats: number;
}

/** Quantizes note times to beats via the tempo-map-correct anchors above (NOT a fixed BPM). */
export function quantizeNotesToGrid(notes: PlayAlongNote[], anchors: Point[]): ScrollNote[] {
  return notes.map((n, i) => {
    const startBeat = snapToSixteenth(lerpSeries(anchors, n.startS));
    const endBeat = snapToSixteenth(lerpSeries(anchors, n.startS + n.durationS));
    return {
      id: `n${i}`,
      midi: n.midi,
      hand: n.hand,
      startBeat,
      durationBeats: Math.max(SIXTEENTH, endBeat - startBeat),
    };
  });
}

const VIEWPORT_HEIGHT_PX = 240;

/**
 * A continuous, teleprompter-style scrolling score: one endless horizontal
 * ribbon of notation with the currently-sounding note(s) highlighted (via
 * NotationRenderer's existing `activeNoteIds`, same mechanism
 * NotationPreviewStrip already uses). At the start the highlight moves
 * rightward while the ribbon stays still; once it reaches the viewport's
 * horizontal centre it pins there and the ribbon scrolls right-to-left
 * underneath it instead; near the end (once the ribbon has run out) the
 * highlight resumes moving, travelling the last stretch to the right edge.
 * See setSongTime below for the single formula that produces all three
 * phases.
 *
 * The WHOLE piece is rendered as one VexFlow system (no paging/windowing):
 * an earlier windowed design re-rendered every 32 bars from a fresh x-origin,
 * which visibly lurched the scroll at every window boundary — see this
 * file's git history / the feature's commit message for the measured
 * render times that justified dropping the window instead of trying to
 * paper over the seam.
 */
const ScrollingScore = forwardRef<ScrollingScoreHandle, Props>(function ScrollingScore(
  { notes, grid, timeSignatureSegments },
  ref,
) {
  const anchors = useMemo(() => buildQuarterBeatAnchors(grid, timeSignatureSegments), [grid, timeSignatureSegments]);
  const scrollNotes = useMemo(() => quantizeNotesToGrid(notes, anchors), [notes, anchors]);
  const barLengths = useMemo(
    () => barRangesFrom(timeSignatureSegments, 0, grid.bars.length).map((r) => r.beatsPerBar),
    [timeSignatureSegments, grid.bars.length],
  );
  const barLengthsKey = barLengths.join(",");

  const viewportRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  // Beat -> rendered x px, refreshed by NotationRenderer's onLayout whenever
  // it (re)draws (once, since the whole piece renders in a single pass).
  // Read every frame by setSongTime below but never itself causes a
  // re-render — the raw points are kept for the tests/debugging below, and
  // a monotone cubic built from them is what setSongTime actually evaluates
  // (see buildMonotoneCubic's docstring for why not a plain lerp).
  const beatXSplineRef = useRef<MonotoneCubicSpline>({ xs: [], ys: [], ms: [] });
  const idToBeatRef = useRef<Map<string, number>>(new Map());
  // The currently-highlighted note ids. Compared by VALUE every frame in
  // setSongTime; only calls setState (and so only re-renders
  // NotationRenderer) when the SET actually changes — at the rate notes
  // strike, not at 60fps.
  const activeIdsRef = useRef<Set<string>>(new Set());
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

  const data = useMemo(() => {
    const idToBeat = new Map<string, number>();
    const toBeatEvents = (hand: "left" | "right"): BeatEvent[] => {
      const groups = new Map<number, ScrollNote[]>();
      for (const n of scrollNotes.filter((note) => note.hand === hand)) {
        groups.set(n.startBeat, [...(groups.get(n.startBeat) ?? []), n]);
      }
      return [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([startBeat, group]) => {
          for (const n of group) idToBeat.set(n.id, n.startBeat);
          return {
            ids: group.map((n) => n.id),
            keys: group.map((n) => midiToVexKey(n.midi)),
            startBeat,
            durationBeats: Math.max(...group.map((n) => n.durationBeats)),
          };
        });
    };

    const right = toBeatEvents("right");
    const left = toBeatEvents("left");
    const measureCountFor = (events: BeatEvent[]): number =>
      events.length === 0 ? 0 : measureIndexForBeat(barLengths, Math.max(...events.map((e) => e.startBeat))) + 1;
    const sharedMeasureCount = Math.max(measureCountFor(right), measureCountFor(left), barLengths.length);

    idToBeatRef.current = idToBeat;
    return {
      grandStaff: true,
      treble: { clef: "treble", measures: groupIntoMeasures(right, barLengths, sharedMeasureCount).map((n) => ({ notes: n })) },
      bass: { clef: "bass", measures: groupIntoMeasures(left, barLengths, sharedMeasureCount).map((n) => ({ notes: n })) },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollNotes, barLengthsKey]);

  const handleLayout = useCallback((positions: { id: string; x: number }[]) => {
    const points: Point[] = [];
    for (const { id, x } of positions) {
      const beat = idToBeatRef.current.get(id);
      if (beat === undefined) continue;
      points.push({ x: beat, y: x });
    }
    beatXSplineRef.current = buildMonotoneCubic(points);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setSongTime(songTimeS: number) {
        const t = Math.max(0, songTimeS);
        const beat = lerpSeries(anchors, t);

        // Which note ids are sounding right now — setState only on a real change.
        const nextActive = new Set<string>();
        for (const n of scrollNotes) {
          if (n.startBeat <= beat && beat < n.startBeat + n.durationBeats) nextActive.add(n.id);
        }
        const prevActive = activeIdsRef.current;
        const changed =
          nextActive.size !== prevActive.size || [...nextActive].some((id) => !prevActive.has(id));
        if (changed) {
          activeIdsRef.current = nextActive;
          setActiveIds(nextActive);
        }

        const viewport = viewportRef.current;
        const ribbon = ribbonRef.current;
        const spline = beatXSplineRef.current;
        if (!viewport || !ribbon || spline.xs.length === 0) return;

        const cursorX = evalMonotoneCubic(spline, beat);
        const viewportWidth = viewport.clientWidth;
        const ribbonWidth = ribbon.scrollWidth;
        const maxOffset = Math.max(0, ribbonWidth - viewportWidth);
        // One formula for all three phases: before the highlight reaches
        // centre, cursorX - viewportWidth/2 is negative, so offset clamps to
        // 0 (ribbon still, highlight moves). Through the middle of the piece
        // it's the normal positive offset (ribbon scrolls, highlight pinned
        // at centre). Near the end it saturates at maxOffset (ribbon can't
        // scroll further), so cursorX - offset grows past centre again — the
        // highlight resumes moving for the final stretch to the right edge.
        const offset = Math.min(maxOffset, Math.max(0, cursorX - viewportWidth / 2));
        ribbon.style.transform = `translateX(${-offset}px)`;
      },
    }),
    [anchors, scrollNotes],
  );

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/40">
      <div ref={viewportRef} className="relative overflow-hidden" style={{ height: VIEWPORT_HEIGHT_PX }}>
        <div ref={ribbonRef} className="absolute left-0 top-0 will-change-transform">
          <NotationRenderer data={data} activeNoteIds={activeIds} maxSystemWidthPx={Infinity} onLayout={handleLayout} />
        </div>
      </div>
    </div>
  );
});

export default ScrollingScore;
