import type { PlayAlongJudgment, PlayAlongNote } from "@keyboard-sensei/midi-engine";
import type { BarGridEntry } from "@keyboard-sensei/playalong-core";
import type { NotePalette } from "../notePalette";
import type { KeyboardGeometry } from "../waterfall";

/**
 * One frame of the falling-notes stage. Times are run seconds (the engine's clock);
 * x positions come only from `geometry.xFor`, the same function that lays out the keys,
 * so no renderer can drift from the keyboard.
 */
export interface WaterfallFrame {
  notes: readonly PlayAlongNote[];
  judgments: readonly (PlayAlongJudgment | undefined)[];
  songTimeS: number;
  lookaheadS: number;
  geometry: KeyboardGeometry;
  heightPx: number;
  palette: NotePalette;
  /** Falling barlines, in run seconds (see buildBeatGrid). */
  bars?: readonly BarGridEntry[];
  /** Pitches wait mode is frozen on: their bars get the waiting outline. */
  waitingPitches?: readonly number[];
  /** performance.now() of this frame, for judgement animations. Defaults to now. */
  nowMs?: number;
  /** prefers-reduced-motion: no bursts or pulses, only static marks. */
  reducedMotion?: boolean;
}

/** What a judgement looks like on the stage; never colour alone. */
export type JudgementMark = "hit" | "early" | "late" | "miss";

/**
 * A notes style. The renderer reads frames; it never owns timing. Judging and audio
 * stay in the engine and the AudioContext clock, so when a frame runs long a renderer
 * drops visual work, never input or audio.
 *
 * Classic (2D canvas) lives in `waterfall.ts`. Neon 2D and Neon 3D implement the same
 * interface and are loaded with `import()` only when chosen, so they never weigh on
 * the main bundle.
 */
export interface WaterfallRenderer {
  mount(canvas: HTMLCanvasElement): void;
  /** CSS pixel size of the stage and the device pixel ratio. Must not reallocate when nothing changed. */
  resize(geometry: KeyboardGeometry, heightPx: number, dpr: number): void;
  draw(frame: WaterfallFrame): void;
  /** A note was judged (index into the frame's notes). Purely visual. */
  onJudgement(index: number, judgement: PlayAlongJudgment, note: PlayAlongNote): void;
  /** Forget pending animations, e.g. when a new run starts. */
  reset(): void;
  dispose(): void;
}

export type NotesStyle = "classic" | "neon2d" | "neon3d";

/**
 * Dispatched on `window` when a style cannot run as chosen and hands over to another one
 * (no WebGL 2, or too slow on this device). The page turns it into a toast.
 */
export const NOTES_STYLE_FALLBACK_EVENT = "ks:notes-style-fallback";

export interface NotesStyleFallback {
  style: NotesStyle;
  fallback: NotesStyle;
  /** unsupported: the device lacks what the style needs; performance: too slow here;
   *  unavailable: its code could not be fetched. */
  reason: "unsupported" | "performance" | "unavailable";
}
