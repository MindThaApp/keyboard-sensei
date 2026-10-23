import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";
import "./ui.css";

interface StateProps {
  title: string;
  message?: ReactNode;
  /** Usually a Button. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Nothing here yet. */
export function EmptyState({ title, message, action, icon, className }: StateProps) {
  return (
    <div className={cx("ks-state", className)}>
      {icon && <div aria-hidden="true">{icon}</div>}
      <h2 className="ks-state__title">{title}</h2>
      {message && <p className="ks-state__message">{message}</p>}
      {action && <div className="ks-state__action">{action}</div>}
    </div>
  );
}

/** A request failed. Replaces raw "Failed to fetch" text. */
export function ErrorState({ title, message, action, icon, className }: StateProps) {
  return (
    <div role="alert" className={cx("ks-state", "ks-state--error", className)}>
      {icon && <div aria-hidden="true">{icon}</div>}
      <h2 className="ks-state__title">{title}</h2>
      {message && <p className="ks-state__message">{message}</p>}
      {action && <div className="ks-state__action">{action}</div>}
    </div>
  );
}

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  className?: string;
}

/** Placeholder block while content loads. Hidden from assistive tech; the owner announces loading. */
export function Skeleton({ width = "100%", height = 16, radius, className }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span aria-hidden="true" className={cx("ks-skeleton", className)} style={style} />;
}
