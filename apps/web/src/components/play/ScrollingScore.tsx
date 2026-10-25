import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import NotationRenderer, { type NotationRendererHandle } from "../notation/NotationRenderer";
import { createFollowState, stepFollow, type FollowState } from "./scrollFollow";
import { engrave, type EngraveInputNote, type StaffName } from "../../utils/engraving";
import { barRangesFrom, type SongBeatGrid, type SongKeyChange, type TimeSignatureSegment } from "@keyboard-sensei/playalong-core";

export interface ScrollingScoreHandle {
  /** Called from the EXISTING play-along rAF loop, every frame — mutates the
   *  ribbon's transform directly on the DOM (a ref), never via setState, so
   *  this never triggers a React re-render at 60fps (see the "do not
   *  setState every frame" entry in docs/operations.md). The
   *  currently-sounding note IDs are also tracked here, but only mutate SVG
   *  classes when that SET actually changes (see activeIdsRef below). */
  setSongTime: (songTimeS: number) => void;
}

interface Props {
  notes: PlayAlongNote[];
  grid: SongBeatGrid;
  timeSignatureSegments: TimeSignatureSegment[];
  keys: SongKeyChange[];
  verticalRange?: { lowestNote: number; highestNote: number };
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
 * Lune's music is in 9/8) — converting via `4 / bar.denominator` keeps the
 * beat axis in the quarter-note units utils/engraving.ts expects.
 *
 * These SAME anchors are used both to quantize notes for rendering
 * (`engraveSong`, note.startS -> beat) and to place the highlight
 * (songTimeS -> beat, in ScrollingScore's setSongTime) — using one shared
 * mapping for both is what keeps the highlight landing on the note actually
 * sounding regardless of how the tempo wanders, instead of drifting the way
 * a fixed-BPM conversion would.
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

export interface ScrollNote {
  id: string;
  midi: number;
  hand: "left" | "right";
  /** Absolute quarter-note beat from song start (tempo-map-correct — see buildQuarterBeatAnchors). */
  startBeat: number;
  durationBeats: number;
}

/**
 * Engraves the whole song as a grand staff. Note times go to beats through
 * the tempo-map-correct anchors above (NOT a fixed BPM), then `engrave`
 * quantizes them to the meter's grid (sixteenths, or triplets where the
 * playing is in threes), spells them in the song's key(s), and lays out
 * chords, ties and rests. `legato` absorbs the small early releases of a
 * human performance that would otherwise be notated as rest clutter.
 */
export function engraveSong(
  notes: PlayAlongNote[],
  anchors: Point[],
  segments: TimeSignatureSegment[],
  keys: SongKeyChange[],
  barCount: number,
): { data: Record<string, unknown>; scrollNotes: ScrollNote[] } {
  const input: EngraveInputNote[] = notes.map((n, i) => ({
    id: `n${i}`,
    midi: n.midi,
    staff: n.hand === "left" ? "bass" : "treble",
    startBeat: lerpSeries(anchors, n.startS),
    endBeat: lerpSeries(anchors, n.startS + n.durationS),
  }));
  // A melody-only song (the beginner pack) gets one staff, not a grand staff
  // whose bass is nothing but whole rests.
  const staves: StaffName[] = (["treble", "bass"] as const).filter((staff) => input.some((n) => n.staff === staff));
  if (staves.length === 0) staves.push("treble");
  const result = engrave(input, staves, {
    meters: segments.map((seg) => ({ startBeat: seg.startBeat, numerator: seg.numerator, denominator: seg.denominator })),
    keys: keys.map((k) => ({ startBeat: k.startBeat, key: k.key })),
    showKeySignature: true,
    minMeasureCount: barCount,
    legato: true,
    clefChanges: true,
  });
  return {
    data:
      staves.length === 2
        ? { grandStaff: true, treble: result.staves.treble, bass: result.staves.bass }
        : { ...result.staves[staves[0]] },
    scrollNotes: result.quantized.map((q) => ({
      id: q.id,
      midi: q.midi,
      hand: q.staff === "bass" ? "left" : "right",
      startBeat: q.startBeat,
      durationBeats: q.durationBeats,
    })),
  };
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DEFAULT_VIEWPORT_HEIGHT_PX = 240;
// The viewport takes the rendered score's own height (a wide-ranging piece
// needs ledger lines a fixed 240px clipped off), within these bounds.
const MIN_VIEWPORT_HEIGHT_PX = 160;
const MAX_VIEWPORT_HEIGHT_PX = 340;

/**
 * A continuous, teleprompter-style scrolling score: one endless horizontal
 * ribbon of notation with the currently-sounding note(s) highlighted (via
 * NotationRenderer's `setActiveNoteIds`, a CSS-class toggle on the drawn
 * SVG). At the start the highlight moves
 * rightward while the ribbon stays still; once it reaches the viewport's
 * band (25-70% of the view) it drifts there while the ribbon scrolls
 * right-to-left at a steady, averaged speed; near the end (once the ribbon has
 * run out) the highlight resumes moving to the right edge. The camera maths is
 * in scrollFollow.ts.
 *
 * The WHOLE piece is rendered as one VexFlow system (no paging/windowing):
 * an earlier windowed design re-rendered every 32 bars from a fresh x-origin,
 * which visibly lurched the scroll at every window boundary — see this
 * file's git history / the feature's commit message for the measured
 * render times that justified dropping the window instead of trying to
 * paper over the seam.
 */
const ScrollingScore = forwardRef<ScrollingScoreHandle, Props>(function ScrollingScore(
  { notes, grid, timeSignatureSegments, keys, verticalRange },
  ref,
) {
  const anchors = useMemo(() => buildQuarterBeatAnchors(grid, timeSignatureSegments), [grid, timeSignatureSegments]);
  const { data, scrollNotes } = useMemo(
    () => engraveSong(notes, anchors, timeSignatureSegments, keys, grid.bars.length),
    [notes, anchors, timeSignatureSegments, keys, grid.bars.length],
  );
  const idToBeat = useMemo(() => new Map(scrollNotes.map((n) => [n.id, n.startBeat])), [scrollNotes]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const notationRef = useRef<NotationRendererHandle>(null);
  // Beat -> rendered x px, refreshed by NotationRenderer's onLayout whenever
  // it (re)draws (once, since the whole piece renders in a single pass).
  // Read every frame by setSongTime below but never itself causes a
  // re-render — the raw points are kept for the tests/debugging below, and
  // a monotone cubic built from them is what setSongTime actually evaluates
  // (see buildMonotoneCubic's docstring for why not a plain lerp).
  const beatXSplineRef = useRef<MonotoneCubicSpline>({ xs: [], ys: [], ms: [] });
  const followRef = useRef<FollowState>(createFollowState());
  const idToBeatRef = useRef(idToBeat);
  idToBeatRef.current = idToBeat;
  // The currently-highlighted note ids. Compared by VALUE every frame in
  // setSongTime; only mutates NotationRenderer's already-drawn SVG classes
  // when the SET actually changes — at the rate notes strike, not at 60fps.
  const activeIdsRef = useRef<Set<string>>(new Set());

  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT_PX);
  const handleLayout = useCallback((positions: { id: string; x: number }[]) => {
    const points: Point[] = [];
    for (const { id, x } of positions) {
      const beat = idToBeatRef.current.get(id);
      if (beat === undefined) continue;
      points.push({ x: beat, y: x });
    }
    beatXSplineRef.current = buildMonotoneCubic(points);
    followRef.current = createFollowState(); // a new layout invalidates the camera
    // Once per (re)draw, never per frame.
    const renderedHeight = ribbonRef.current?.offsetHeight ?? 0;
    if (renderedHeight > 0) {
      setViewportHeight(Math.min(MAX_VIEWPORT_HEIGHT_PX, Math.max(MIN_VIEWPORT_HEIGHT_PX, renderedHeight)));
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      setSongTime(songTimeS: number) {
        const t = Math.max(0, songTimeS);
        const beat = lerpSeries(anchors, t);

        // Which note ids are sounding right now — update the SVG class only on a real change.
        const nextActive = new Set<string>();
        for (const n of scrollNotes) {
          if (n.startBeat <= beat && beat < n.startBeat + n.durationBeats) nextActive.add(n.id);
        }
        const prevActive = activeIdsRef.current;
        const changed =
          nextActive.size !== prevActive.size || [...nextActive].some((id) => !prevActive.has(id));
        if (changed) {
          activeIdsRef.current = nextActive;
          notationRef.current?.setActiveNoteIds(nextActive);
        }

        const viewport = viewportRef.current;
        const ribbon = ribbonRef.current;
        const spline = beatXSplineRef.current;
        if (!viewport || !ribbon || spline.xs.length === 0) return;

        // Camera: a steady, averaged scroll speed with the playhead free to drift in a
        // comfortable band (see scrollFollow.ts), instead of pinning it to the centre.
        const viewportWidth = viewport.clientWidth;
        const maxOffset = Math.max(0, ribbon.scrollWidth - viewportWidth);
        const offset = stepFollow(followRef.current, {
          songTimeS: t,
          nowMs: performance.now(),
          xAt: (time) => evalMonotoneCubic(spline, lerpSeries(anchors, time)),
          viewWidth: viewportWidth,
          maxOffset,
          reducedMotion: prefersReducedMotion(),
        });
        ribbon.style.transform = `translate3d(${-offset}px, 0, 0)`;
      },
    }),
    [anchors, scrollNotes],
  );

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white/60 p-2 dark:border-slate-800 dark:bg-slate-900/40">
      <div ref={viewportRef} className="relative overflow-hidden" style={{ height: viewportHeight }}>
        <div ref={ribbonRef} className="absolute left-0 top-0 will-change-transform">
          <NotationRenderer
            ref={notationRef}
            data={data}
            maxSystemWidthPx={Infinity}
            onLayout={handleLayout}
            verticalRange={verticalRange}
          />
        </div>
      </div>
    </div>
  );
});

// Memoised: the score is expensive to engrave and its props only change with the song.
export default memo(ScrollingScore);
