import type { ReactNode } from "react";
import { cx } from "./cx";
import "./ui.css";

export interface ChipProps {
  tone?: "neutral" | "tint" | "success";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 24px read-only label. Not interactive: use a Button for anything pressable. */
export function Chip({ tone = "neutral", icon, children, className }: ChipProps) {
  return (
    <span className={cx("ks-chip", tone !== "neutral" && `ks-chip--${tone}`, className)}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

export interface BadgeProps {
  count: number;
  /** Counts above this show as "99+". */
  max?: number;
  className?: string;
}

/** Notification count. Renders nothing for zero. */
export function Badge({ count, max = 99, className }: BadgeProps) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span className={cx("ks-badge", className)} role="status" aria-label={`${count} new`}>
      {text}
    </span>
  );
}
