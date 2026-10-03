import { registerAudioContext } from "../utils/audioUnlock";
import { ClockMap } from "./clockMap";

/**
 * The app's ONE AudioContext, its master bus, and the one lookahead scheduler
 * every timed sound goes through (guide notes, accompaniment, previews, both
 * metronomes, recording playback).
 *
 * Why one context: separate contexts are separate clocks and separate output
 * paths. Two sounds meant to coincide (a guide note and a click) can drift apart,
 * and each context costs its own audio thread.
 *
 * Why a lookahead scheduler: JS timers and animation frames fire late by a few
 * milliseconds (and rAF stops entirely in a background tab). Web Audio can start
 * a sound at an exact sample. So a short timer runs every ~25ms and asks each
 * source for the sounds due in the next ~100ms, and those are scheduled at their
 * exact times. The window is short and re-derived from the caller's own clock
 * every tick, so nothing is pre-scheduled far enough ahead to drift, and a pause
 * or wait-mode freeze stops new sounds within one window.
 */

const TICK_MS = 25;
const HORIZON_MS = 100;
/**
 * A hidden tab may have its timers throttled to about once a second. Scheduling
 * further ahead while hidden keeps the audio continuous through that.
 */
const HIDDEN_HORIZON_MS = 1500;

let ctx: AudioContext | null = null;
let master: DynamicsCompressorNode | null = null;
const clock = new ClockMap();

/** The shared AudioContext. Created on first use and registered for gesture unlock. */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    // A MIDI note-on is NOT a user gesture, so resume() from a note handler is
    // ignored by the browser. audioUnlock resumes the context on the first real
    // pointer/key/touch event instead (see audioUnlock.ts).
    registerAudioContext(ctx);
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -18;
    master.knee.value = 12;
    master.ratio.value = 4;
    master.attack.value = 0.002;
    master.release.value = 0.2;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Compressed bus for instrument voices (chords don't clip). Clicks bypass it. */
export function getMasterBus(): AudioNode {
  getAudioContext();
  return master!;
}

/**
 * Converts a performance.now() time into AudioContext time, for scheduling.
 * Never returns a time in the past (Web Audio would play it "now" anyway, but a
 * past time makes envelope ramps start mid-curve).
 */
export function contextTimeAt(perfMs: number): number {
  const audio = getAudioContext();
  clock.sample(audio.currentTime, performance.now());
  return Math.max(audio.currentTime, clock.toContextTime(perfMs));
}

/** The inverse of contextTimeAt: when (performance.now() basis) a context time is reached. */
export function perfTimeAt(contextTime: number): number {
  const audio = getAudioContext();
  clock.sample(audio.currentTime, performance.now());
  return clock.toPerfMs(contextTime);
}

/**
 * Called on every scheduler tick with the current time and how far ahead to
 * schedule, both in performance.now() milliseconds. Schedule everything that
 * starts before `nowMs + horizonMs` and has not been scheduled yet.
 */
export type ScheduleSource = (nowMs: number, horizonMs: number) => void;

const sources = new Set<ScheduleSource>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  const audio = getAudioContext();
  const nowMs = performance.now();
  clock.sample(audio.currentTime, nowMs);
  const horizonMs = typeof document !== "undefined" && document.hidden ? HIDDEN_HORIZON_MS : HORIZON_MS;
  for (const source of [...sources]) {
    try {
      source(nowMs, horizonMs);
    } catch (error) {
      console.error("Audio scheduler source failed", error);
    }
  }
}

/**
 * Registers a source with the shared scheduler and runs it once immediately.
 * Returns the function that removes it. The timer only runs while at least one
 * source is registered.
 */
export function addScheduleSource(source: ScheduleSource): () => void {
  sources.add(source);
  if (timer === null) timer = setInterval(tick, TICK_MS);
  const audio = getAudioContext();
  const nowMs = performance.now();
  clock.sample(audio.currentTime, nowMs);
  source(nowMs, HORIZON_MS);
  return () => {
    sources.delete(source);
    if (sources.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Optional measurement hook: when a page sets `window.__ksScheduleTrace = []`,
 * every scheduled note start is recorded as intended (performance.now() ms) vs
 * scheduled (AudioContext seconds). Used to verify scheduling accuracy live.
 */
export function traceScheduled(kind: string, intendedPerfMs: number, contextTime: number): void {
  const trace = (globalThis as { __ksScheduleTrace?: unknown[] }).__ksScheduleTrace;
  if (!Array.isArray(trace)) return;
  trace.push({
    kind,
    intendedPerfMs,
    contextTime,
    scheduledAtMs: performance.now(),
    hidden: typeof document !== "undefined" && document.hidden,
  });
}
