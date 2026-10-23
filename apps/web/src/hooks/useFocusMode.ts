import { useCallback, useEffect, useSyncExternalStore } from "react";
import { enterFullscreen, exitFullscreen, isFullscreen, keepScreenAwake, onFullscreenChange } from "../utils/fullscreen";

/**
 * Focus mode: the score or falling notes, the keyboard and a couple of controls, and
 * nothing else. The app shell hides the tab bar, floating bars, toasts and feedback
 * entry while it is on; a practice screen asks for it with `enter()` and swaps its own
 * controls for the two that stay (Play/Pause and Exit).
 *
 * State lives in one module-level store so the shell and any number of screens agree
 * without a provider. Side effects (fullscreen, wake lock, Esc, the back gesture) are
 * installed on enter and removed on exit, whichever way the exit happens.
 */

type Listener = () => void;

const FOCUS_ATTRIBUTE = "data-focus-mode";
/** Marks the history entry pushed on enter so the system back gesture exits focus first. */
const HISTORY_MARKER = "ksFocus";

let active = false;
const listeners = new Set<Listener>();

let teardown: (() => void) | null = null;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function setActive(next: boolean): void {
  if (active === next) return;
  active = next;
  if (next) document.documentElement.setAttribute(FOCUS_ATTRIBUTE, "true");
  else document.documentElement.removeAttribute(FOCUS_ATTRIBUTE);
  emit();
}

const pageScroller = (): HTMLElement | null => document.getElementById("main-content");

/** Enters focus mode. Safe to call twice. */
export function enterFocusMode(): void {
  if (active) return;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const innerScroll = pageScroller()?.scrollTop ?? 0;

  setActive(true);

  let enteredFullscreen = false;
  void enterFullscreen().then((entered) => {
    enteredFullscreen = entered && isFullscreen();
  });
  const stopFullscreenWatch = onFullscreenChange((fullscreen) => {
    // Leaving fullscreen by any route (Esc, the browser UI) leaves focus mode too.
    if (!fullscreen && enteredFullscreen) exitFocusMode();
  });
  const releaseWakeLock = keepScreenAwake();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !event.defaultPrevented) exitFocusMode();
  };
  window.addEventListener("keydown", onKeyDown);

  // The system back gesture should leave focus, not the page underneath it.
  window.history.pushState({ ...(window.history.state ?? {}), [HISTORY_MARKER]: true }, "");
  const onPopState = () => {
    exitFocusMode({ fromHistory: true });
  };
  window.addEventListener("popstate", onPopState);

  teardown = () => {
    stopFullscreenWatch();
    releaseWakeLock();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("popstate", onPopState);
    void exitFullscreen();
    // Put the page back exactly where it was once the hidden chrome is back in layout.
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
      const scroller = pageScroller();
      if (scroller) scroller.scrollTop = innerScroll;
    });
  };
}

/** Leaves focus mode. Safe to call when it is not on. */
export function exitFocusMode(options: { fromHistory?: boolean } = {}): void {
  if (!active) return;
  teardown?.();
  teardown = null;
  setActive(false);
  // Drop the history entry we pushed, unless the user's own back press already did.
  if (!options.fromHistory && window.history.state?.[HISTORY_MARKER]) {
    // The popstate listener is already removed, so this does not re-enter.
    window.history.back();
  }
}

export function toggleFocusMode(): void {
  if (active) exitFocusMode();
  else enterFocusMode();
}

const subscribe = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = (): boolean => active;

export interface FocusModeApi {
  /** True while focus mode is on. */
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
};

/**
 * @param options.hotkey When true, the `F` key toggles focus while this component is
 *   mounted. Only practice screens should turn it on.
 */
export function useFocusMode(options: { hotkey?: boolean } = {}): FocusModeApi {
  const isActive = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const hotkey = options.hotkey ?? false;

  useEffect(() => {
    if (!hotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      toggleFocusMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkey]);

  return {
    active: isActive,
    enter: useCallback(enterFocusMode, []),
    exit: useCallback(() => exitFocusMode(), []),
    toggle: useCallback(toggleFocusMode, []),
  };
}
