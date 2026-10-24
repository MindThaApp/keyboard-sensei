import { useEffect, useState } from "react";

/** How long the controls stay after the last touch, pointer move or key press. */
export const AUTO_HIDE_DELAY_MS = 3000;

/** Pointer presses inside an element with this attribute (the keys) are playing, not asking for controls. */
export const AUTO_HIDE_IGNORE_ATTRIBUTE = "data-autohide-ignore";

interface Options {
  /** Hiding is on (full screen). Off, the controls are always shown. */
  enabled: boolean;
  /** Something needs the controls (a popover or sheet is open, the pointer is over them). */
  hold: boolean;
  delayMs?: number;
}

const isPlayingTheKeys = (event: Event): boolean => {
  const target = event.target;
  return target instanceof Element && target.closest(`[${AUTO_HIDE_IGNORE_ATTRIBUTE}]`) !== null;
};

/**
 * Whether full-screen controls are showing. They hide after `delayMs` with no input and
 * come back on any touch, pointer move or key press. They never hide while held, while a
 * pointer is pressed, or when hiding is off. Pressing the on-screen keys is playing: a
 * touch there does not bring the controls back (a mouse moving over them does).
 */
export function useAutoHide({ enabled, hold, delayMs = AUTO_HIDE_DELAY_MS }: Options): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    if (!enabled || hold) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let pressing = false;
    const schedule = () => {
      clearTimeout(timer);
      if (!pressing) timer = setTimeout(() => setVisible(false), delayMs);
    };
    const wake = () => {
      setVisible(true);
      schedule();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && isPlayingTheKeys(event)) return;
      wake();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (isPlayingTheKeys(event)) return;
      pressing = true;
      wake();
    };
    const onPointerUp = () => {
      if (!pressing) return;
      pressing = false;
      schedule();
    };

    schedule();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true });
    window.addEventListener("keydown", wake);
    window.addEventListener("wheel", wake, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [enabled, hold, delayMs]);

  return !enabled || hold || visible;
}
