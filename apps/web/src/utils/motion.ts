import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const REDUCED_TRANSPARENCY_QUERY = "(prefers-reduced-transparency: reduce)";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** Live value of a media query. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const update = () => setValue(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);
  return value;
}

/**
 * True when the system asks for less motion. Canvas and JS-driven animation
 * (falling notes bursts, ring fills, scroll-follow) must check this; CSS transitions
 * are already collapsed globally in index.css.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}

/**
 * True when the system asks for less transparency. For the effective glass style —
 * which also covers the in-app "Solid" choice, high contrast and low-end devices — use
 * `useAppearance().resolved.glass === "solid"`.
 */
export function useReducedTransparency(): boolean {
  return useMediaQuery(REDUCED_TRANSPARENCY_QUERY);
}

/** Non-hook check for one-off decisions (e.g. inside a canvas draw setup). */
export function prefersReducedMotion(): boolean {
  return matches(REDUCED_MOTION_QUERY);
}
