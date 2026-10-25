/**
 * Camera for the scrolling score: decides how far the ribbon is shifted for a given
 * song time. Pure maths (no DOM), driven once per animation frame by ScrollingScore.
 *
 * Why not "keep the playhead dead centre": the playhead's x follows note spacing, which is
 * uneven (a run of sixteenths is wide, a held chord is narrow), so pinning it made the
 * whole ribbon speed up and slow down with the density of the bar. Instead the ribbon
 * moves at a steady speed, the AVERAGE speed the playhead needs over the visible
 * stretch of the sheet (see averageSpeed), and the playhead is allowed to drift inside a
 * comfortable band. Only when it would leave the band is it eased back, gently.
 */

/** Playhead may drift between these fractions of the view width without any correction. */
export const BAND_MIN = 0.25;
export const BAND_MAX = 0.7;
/** Where a seek / loop / restart puts the playhead. */
export const SEEK_TARGET = 0.35;
/** Time constant (s) of the gentle band correction. */
const BAND_TAU_S = 0.7;
/** Time constant (s) of the glide after a seek: quick, but visibly animated. */
const SEEK_TAU_S = 0.16;
/** A jump in song time bigger than this (or any step backwards) is a seek, not playback. */
const SEEK_JUMP_S = 1.2;
/** The averaged speed is only recomputed when song time has moved this far. */
const SPEED_REFRESH_S = 0.2;

export interface FollowInput {
  /** Song time in seconds. */
  songTimeS: number;
  /** Wall-clock time in ms (performance.now()); drives easing, which continues while paused. */
  nowMs: number;
  /** Playhead x in ribbon pixels for a song time. */
  xAt: (songTimeS: number) => number;
  viewWidth: number;
  /** Largest allowed offset (ribbon width minus view width, never negative). */
  maxOffset: number;
  reducedMotion?: boolean;
}

export interface FollowState {
  offset: number;
  lastSongTimeS: number | null;
  lastNowMs: number | null;
  /** While set, the camera is gliding to this offset after a seek. */
  glideTo: number | null;
  speedPxPerS: number;
  speedAtS: number;
}

export function createFollowState(): FollowState {
  return { offset: 0, lastSongTimeS: null, lastNowMs: null, glideTo: null, speedPxPerS: 0, speedAtS: -Infinity };
}

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value));
/** Frame-rate independent exponential approach factor. */
const ease = (dtS: number, tauS: number): number => 1 - Math.exp(-dtS / tauS);

/**
 * Average playhead speed (px per song second) over the visible stretch of the sheet:
 * how long the playhead takes to cross one view width of ribbon, starting now, and the
 * ribbon speed that covers that width in that time. Dense and sparse bars inside the
 * window average out. Falls back to the local speed near the end of the song.
 */
export function averageSpeed(xAt: (t: number) => number, songTimeS: number, viewWidth: number): number {
  const x0 = xAt(songTimeS);
  const target = x0 + viewWidth;
  let lo = 0;
  let hi = 120;
  if (xAt(songTimeS + hi) < target) return Math.max(0, (xAt(songTimeS + hi) - x0) / hi);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (xAt(songTimeS + mid) < target) lo = mid;
    else hi = mid;
  }
  const span = (lo + hi) / 2;
  return span > 1e-6 ? viewWidth / span : 0;
}

/** Offset that puts the playhead at `fraction` of the view, clamped to the ribbon. */
function offsetFor(cursorX: number, fraction: number, input: FollowInput): number {
  return clamp(cursorX - input.viewWidth * fraction, 0, input.maxOffset);
}

/** Advances the camera one frame and returns the ribbon offset in px (mutates `state`). */
export function stepFollow(state: FollowState, input: FollowInput): number {
  const { songTimeS, nowMs, viewWidth, maxOffset } = input;
  const cursorX = input.xAt(songTimeS);
  const wallDt = state.lastNowMs === null ? 0 : clamp((nowMs - state.lastNowMs) / 1000, 0, 0.1);
  const songDt = state.lastSongTimeS === null ? 0 : songTimeS - state.lastSongTimeS;
  const first = state.lastSongTimeS === null;
  state.lastNowMs = nowMs;
  state.lastSongTimeS = songTimeS;

  if (first) {
    state.offset = offsetFor(cursorX, BAND_MIN, input);
    state.glideTo = null;
    state.speedAtS = -Infinity;
    return state.offset;
  }

  const seeked = songDt < 0 || songDt > SEEK_JUMP_S;
  if (seeked) {
    state.speedAtS = -Infinity;
    const target = offsetFor(cursorX, SEEK_TARGET, input);
    if (input.reducedMotion) {
      state.offset = target;
      state.glideTo = null;
      return state.offset;
    }
    state.glideTo = target;
  }

  if (state.glideTo !== null) {
    // Keep aiming at a sensible spot as the song keeps playing during the glide.
    state.glideTo = offsetFor(cursorX, SEEK_TARGET, input);
    state.offset += (state.glideTo - state.offset) * ease(wallDt, SEEK_TAU_S);
    if (Math.abs(state.glideTo - state.offset) < 0.5) {
      state.offset = state.glideTo;
      state.glideTo = null;
    }
    return (state.offset = clamp(state.offset, 0, maxOffset));
  }

  if (input.reducedMotion) {
    // No continuous motion: hold still, and when the playhead leaves the band re-place it.
    const pos = cursorX - state.offset;
    if (pos < viewWidth * BAND_MIN || pos > viewWidth * BAND_MAX) state.offset = offsetFor(cursorX, BAND_MIN, input);
    return state.offset;
  }

  // Steady drift at the averaged speed. Driven by song time, so Wait-mode pauses stop it
  // and tempo changes scale it without any special case.
  if (songTimeS - state.speedAtS >= SPEED_REFRESH_S || songTimeS < state.speedAtS) {
    state.speedPxPerS = averageSpeed(input.xAt, songTimeS, viewWidth);
    state.speedAtS = songTimeS;
  }
  // (At the very start the ribbon waits until the playhead has reached the band.)
  if (state.offset > 0 || cursorX > viewWidth * BAND_MIN) state.offset += state.speedPxPerS * songDt;

  // Gentle correction only when the playhead would leave the band.
  const pos = cursorX - state.offset;
  const lo = viewWidth * BAND_MIN;
  const hi = viewWidth * BAND_MAX;
  const error = pos < lo ? pos - lo : pos > hi ? pos - hi : 0;
  if (error !== 0) state.offset += error * ease(wallDt, BAND_TAU_S);

  return (state.offset = clamp(state.offset, 0, maxOffset));
}
