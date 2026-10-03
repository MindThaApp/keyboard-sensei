/**
 * Vertical layout of the Play-Along stage: how the measured stage height is split
 * between the falling-notes canvas and the keyboard under it. Pure, so the split is
 * unit-testable without a browser.
 */

export type VisibilityMode = "note-size" | "window-size";

/** White keys are drawn 4x as tall as they are wide, as on VirtualPiano. */
const WHITE_KEY_HEIGHT_RATIO = 4;
/** The keyboard takes about a third of the stage, within these bounds. */
const PIANO_SHARE = 0.32;
const PIANO_MIN_HEIGHT_PX = 72;
const PIANO_MAX_HEIGHT_PX = 180;
/** Below this the falling notes are unreadable; the stage scrolls instead. */
export const WATERFALL_MIN_HEIGHT_PX = 120;
/** "window-size" mode holds the falling speed fixed at this many pixels per second. */
export const WINDOW_MODE_PX_PER_SECOND = 80;

export interface StageLayoutInput {
  /** Measured inner height of the stage (canvas + keyboard). 0 before the first measure. */
  stageHeightPx: number;
  whiteKeyWidthPx: number;
  visibilityMode: VisibilityMode;
  lookaheadS: number;
}

export interface StageLayout {
  /** White-key height, also the cap passed to VirtualPiano so both agree exactly. */
  pianoHeightPx: number;
  waterfallHeightPx: number;
}

export function stageLayout({ stageHeightPx, whiteKeyWidthPx, visibilityMode, lookaheadS }: StageLayoutInput): StageLayout {
  const pianoCap = Math.min(PIANO_MAX_HEIGHT_PX, Math.max(PIANO_MIN_HEIGHT_PX, stageHeightPx * PIANO_SHARE));
  const pianoHeightPx = Math.min(whiteKeyWidthPx * WHITE_KEY_HEIGHT_RATIO, pianoCap);
  const available = Math.max(WATERFALL_MIN_HEIGHT_PX, Math.floor(stageHeightPx - pianoHeightPx));

  // Both modes feed the same lookaheadS into scoring; this only decides how many pixels
  // it is drawn across. "note-size" fills the stage, so a longer look-ahead squeezes the
  // notes. "window-size" keeps the falling speed fixed, so the note area itself grows
  // with look-ahead — up to the space the stage has.
  if (visibilityMode === "window-size") {
    const wanted = Math.max(WATERFALL_MIN_HEIGHT_PX, lookaheadS * WINDOW_MODE_PX_PER_SECOND);
    return { pianoHeightPx, waterfallHeightPx: Math.min(wanted, available) };
  }
  return { pianoHeightPx, waterfallHeightPx: available };
}
