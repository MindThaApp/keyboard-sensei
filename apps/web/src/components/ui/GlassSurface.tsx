import { createElement, forwardRef, useEffect, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import "./ui.css";

export type GlassVariant = "regular" | "clear-dark";

/** Spec section 3.8: more than this many blurred layers on one screen is a performance bug. */
export const MAX_BLURRED_LAYERS = 3;

let mountedLayers = 0;

/** Test hook: how many glass surfaces are currently mounted. */
export function getMountedGlassLayers(): number {
  return mountedLayers;
}

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  variant?: GlassVariant;
  as?: ElementType;
  /**
   * Glass nested inside another glass surface is a translucent fill, never a second blur,
   * so it does not count towards the layer budget.
   */
  nested?: boolean;
  children?: ReactNode;
}

/**
 * The only component allowed to apply `.glass`. `clear-dark` is for bars over dark content
 * (the practice stage, the keybed) and declares `data-glass="on-dark"` so nothing has to
 * sample what lies behind it.
 */
export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface(
  { variant = "regular", as = "div", nested = false, className, children, ...rest },
  ref,
) {
  useEffect(() => {
    if (nested) return;
    mountedLayers += 1;
    if (import.meta.env?.DEV && mountedLayers > MAX_BLURRED_LAYERS) {
      console.warn(
        `GlassSurface: ${mountedLayers} blurred layers are mounted; the budget is ${MAX_BLURRED_LAYERS} per screen.`,
      );
    }
    return () => {
      mountedLayers -= 1;
    };
  }, [nested]);

  return createElement(
    as,
    {
      ...rest,
      ref,
      className: cx("glass", "ks-glass", className),
      "data-glass": variant === "clear-dark" ? "on-dark" : undefined,
      "data-nested": nested ? "true" : undefined,
    },
    children,
  );
});
