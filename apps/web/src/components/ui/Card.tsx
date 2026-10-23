import { createElement, forwardRef, type ElementType, type HTMLAttributes } from "react";
import { cx } from "./cx";
import "./ui.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Element or component to render, e.g. "section", "button", "a" or a router Link. */
  as?: ElementType;
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds the pressable look. Pair it with `as="button"` / `as="a"` (or a Link) so it is keyboard-operable. */
  interactive?: boolean;
  // Passed through for `as="a"`, a router Link or `as="button"`.
  href?: string;
  to?: string;
  type?: "button" | "submit" | "reset";
  target?: string;
  rel?: string;
  disabled?: boolean;
}

/** Solid content surface. Never glass. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as = "div", padding = "md", interactive = false, className, children, ...rest },
  ref,
) {
  const defaults = interactive && as === "button" ? { type: "button" } : null;
  return createElement(
    as,
    {
      ...defaults,
      ...rest,
      ref,
      className: cx("ks-card", `ks-card--pad-${padding}`, interactive && "ks-card--interactive", className),
    },
    children,
  );
});
