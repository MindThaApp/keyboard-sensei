import { useCallback, useEffect, useState } from "react";

/**
 * Local stand-in for the app-wide `useFocusMode()` (redesign spec 8.2) until it lands in
 * hooks/useFocusMode.ts. Same shape, so adopting the real hook is a one-line import swap.
 * Marks `<html data-focus-mode>` so the shell can hide its chrome and locks page scrolling
 * while active; the focused view is a fixed overlay, so the scroll position is untouched.
 */
export interface FocusMode {
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

export function useFocusMode(): FocusMode {
  const [active, setActive] = useState(false);

  const enter = useCallback(() => {
    setActive(true);
    document.documentElement.requestFullscreen?.({ navigationUI: "hide" })?.catch(() => undefined);
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit]);

  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.focusMode = "true";
    // The page underneath stays put (the focused view is a fixed overlay); just stop it scrolling.
    const overflowBefore = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) exit();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      delete document.documentElement.dataset.focusMode;
      document.documentElement.style.overflow = overflowBefore;
    };
  }, [active, exit]);

  return { active, enter, exit, toggle };
}
