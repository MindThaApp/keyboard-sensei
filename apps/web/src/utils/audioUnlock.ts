/**
 * Browsers refuse to start an AudioContext until the user has actually
 * interacted with the page — and a MIDI note-on does NOT count as a user
 * gesture. Only a real pointer/keyboard/touch event does.
 *
 * That produced a genuinely confusing bug: pressing keys on a connected MIDI
 * keyboard lit up the on-screen keys but made no sound, because the context was
 * created by the note handler and its resume() was silently ignored. Clicking
 * "Play" (a real gesture) unlocked it, and from then on everything worked —
 * including after cancelling, which made it look like a play/stop bug rather
 * than an audio-permission one.
 *
 * Fix: every AudioContext in the app registers here, and the first genuine user
 * gesture resumes all of them. Contexts created later are resumed immediately if
 * a gesture has already happened.
 */

const contexts = new Set<AudioContext>();
let unlocked = false;
let listening = false;

const resumeAll = (): void => {
  unlocked = true;
  for (const ctx of contexts) {
    if (ctx.state === "suspended") void ctx.resume();
  }
  detach();
};

const EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

function detach(): void {
  if (!listening) return;
  listening = false;
  for (const type of EVENTS) window.removeEventListener(type, resumeAll);
}

function attach(): void {
  if (listening || unlocked || typeof window === "undefined") return;
  listening = true;
  // `once` is not enough on its own: several event types are registered, and we
  // want the first of ANY of them to unlock and then remove all of the others.
  for (const type of EVENTS) window.addEventListener(type, resumeAll, { passive: true });
}

/**
 * Register an AudioContext to be resumed on the first user gesture. If the user
 * has already interacted, it is resumed right away.
 */
export function registerAudioContext(ctx: AudioContext): void {
  contexts.add(ctx);
  if (unlocked) {
    if (ctx.state === "suspended") void ctx.resume();
  } else {
    attach();
  }
}

/** True once a real user gesture has unlocked audio. */
export const isAudioUnlocked = (): boolean => unlocked;

/** Whether any registered context is still suspended — i.e. the app is silent. */
export function isAudioBlocked(): boolean {
  for (const ctx of contexts) {
    if (ctx.state === "suspended") return true;
  }
  return false;
}
