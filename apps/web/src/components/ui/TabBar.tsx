import type { ReactNode } from "react";
import { Link, matchPath, useLocation } from "react-router-dom";
import { Badge } from "./Chip";
import { cx } from "./cx";
import { GlassSurface } from "./GlassSurface";
import "./ui.css";

export interface TabBarItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Match only the exact path (use for a "/" home tab). */
  end?: boolean;
  badge?: number;
  /** Extra path prefixes that also mark this tab current, e.g. "/lessons" for a Learn tab. */
  matches?: string[];
}

/** True when the location is on the tab's own route or under one of its extra prefixes. */
export function isTabActive(item: TabBarItem, pathname: string): boolean {
  const own = matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null;
  return own || (item.matches ?? []).some((prefix) => matchPath({ path: prefix, end: false }, pathname) !== null);
}

export interface TabBarProps {
  items: TabBarItem[];
  /** "bottom": floating pill above the safe area (phone, tablet). "top": centred capsule (desktop). "inline": no fixed positioning. */
  placement?: "bottom" | "top" | "inline";
  /** The shell sets this while the page scrolls down: 52px tall, labels faded out. */
  condensed?: boolean;
  /** Slot at the right end, e.g. the daily-goal ring on desktop. */
  trailing?: ReactNode;
  "aria-label"?: string;
  className?: string;
}

/** Primary navigation. A `nav` landmark of router links; the current page carries aria-current. */
export function TabBar({
  items,
  placement = "bottom",
  condensed = false,
  trailing,
  className,
  "aria-label": ariaLabel = "Main",
}: TabBarProps) {
  const { pathname } = useLocation();
  return (
    <nav className={cx("ks-tabbar", className)} aria-label={ariaLabel} data-placement={placement} data-condensed={condensed}>
      <GlassSurface className="ks-tabbar__bar">
        <ul className="ks-tabbar__list">
          {items.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="ks-tab" aria-current={isTabActive(item, pathname) ? "page" : undefined}>
                <span className="ks-tab__icon">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.badge ? <Badge count={item.badge} className="ks-tab__badge" /> : null}
                </span>
                <span className="ks-tab__label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        {trailing && <div className="ks-tabbar__trailing">{trailing}</div>}
      </GlassSurface>
    </nav>
  );
}
