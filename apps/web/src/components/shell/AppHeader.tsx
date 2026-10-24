import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { useDailySummary } from "../../state/useDailySummary";
import { GlassSurface } from "../ui/GlassSurface";
import { ProgressRing } from "../ui/ProgressRing";
import { TabBar, type TabBarItem } from "../ui/TabBar";
import "./shell.css";

const icon = (path: string): ReactNode => (
  <svg viewBox="0 0 20 20" fill="currentColor" width="24" height="24">
    <path d={path} fillRule="evenodd" />
  </svg>
);

/** The top-level destinations, as flat tabs. Settings sits in the account cluster. */
export const NAV_ITEMS: TabBarItem[] = [
  {
    to: "/",
    label: "Today",
    end: true,
    icon: icon(
      "M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-7 2a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2H3Zm13 0a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2h-1ZM10 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.9 4.9a1 1 0 0 1 1.4 0l.7.7A1 1 0 0 1 5.6 7l-.7-.7a1 1 0 0 1 0-1.4Zm9.5 9.5a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4Zm1.4-9.5a1 1 0 0 1 0 1.4l-.7.7A1 1 0 0 1 13.7 5.6l.7-.7a1 1 0 0 1 1.4 0ZM6.3 14.4a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0Z",
    ),
  },
  {
    to: "/learn",
    label: "Learn",
    matches: ["/lessons"],
    icon: icon(
      "M9 4.8C7.6 3.9 5.6 3.5 3.5 3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1c2 0 3.8.4 5.5 1.4V4.8Zm2 12.1c1.7-1 3.5-1.4 5.5-1.4a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1c-2.1 0-4.1.4-5.5 1.3v12.1Z",
    ),
  },
  {
    to: "/practice",
    label: "Library",
    end: true,
    matches: ["/play"],
    icon: icon(
      "M3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 4.5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1ZM3 13a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm11-1.4 4 2.4-4 2.4v-4.8ZM3 17.5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Z",
    ),
  },
  {
    to: "/practice/gym",
    label: "Practice",
    matches: ["/practice/record", "/practice/notes"],
    icon: icon(
      "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    ),
  },
  {
    to: "/import",
    label: "Import",
    icon: icon(
      "M10 2.5a1 1 0 0 1 .7.3l3.5 3.5a1 1 0 1 1-1.4 1.4L11 5.9V12a1 1 0 1 1-2 0V5.9L7.2 7.7a1 1 0 0 1-1.4-1.4l3.5-3.5a1 1 0 0 1 .7-.3ZM3 12a1 1 0 0 1 1 1v2h12v-2a1 1 0 1 1 2 0v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-2a1 1 0 0 1 1-1Z",
    ),
  },
  {
    to: "/progress",
    label: "Progress",
    icon: icon(
      "M3 16a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1H4v-1Zm5-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5H9V8Zm5-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v9h-3V4Z",
    ),
  },
];

/** True once the page has scrolled down past the top and is still heading down. */
export function useCondensedOnScroll(): boolean {
  const [condensed, setCondensed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setCondensed(false);
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 24) setCondensed(false);
      else if (y > last + 6) setCondensed(true);
      else if (y < last - 6) setCondensed(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  return condensed;
}

/** Today's goal at a glance: ring, minutes and streak, linking to Today. */
function GoalChip({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const summary = useDailySummary(user?.daily_goal_minutes);
  if (!summary) return null;
  const { minutesToday, goalMinutes, met } = summary.dailyGoal;
  const minutes = Math.floor(minutesToday);
  return (
    <Link to="/" className="ks-goal-chip" data-testid="header-goal">
      {/* The name is built from the visible text plus screen-reader-only context, so
          what is read out always contains what is shown (WCAG 2.5.3). */}
      <span aria-hidden="true">
        <ProgressRing value={goalMinutes > 0 ? minutesToday / goalMinutes : 0} size={28} stroke={4} />
      </span>
      <span className="sr-only">Daily goal: </span>
      <span className="ks-goal-chip__text glass-text">
        {compact ? `${minutes}/${goalMinutes}` : `${minutes} of ${goalMinutes} min today`}
        {met && <span className="sr-only">, met</span>}
        {summary.streak.current > 0 && (
          <span className="ks-goal-chip__streak">
            {" "}
            <span aria-hidden="true">{"🔥"}</span>
            <span className="sr-only">streak </span>
            {summary.streak.current}
          </span>
        )}
      </span>
    </Link>
  );
}

const SETTINGS_ICON =
  "M8.3 2h3.4l.5 2 1.6.9 2-.6 1.7 3-1.5 1.4v1.8l1.5 1.4-1.7 3-2-.6-1.6.9-.5 2H8.3l-.5-2-1.6-.9-2 .6-1.7-3 1.5-1.4V8.7L2.5 7.3l1.7-3 2 .6 1.6-.9.5-2ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z";
const FEEDBACK_ICON =
  "M4 3h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3.5V14H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z";

/** A round 44px icon button in the account cluster: feedback and settings stay one tap away. */
function ClusterButton({ label, path, to, onClick }: { label: string; path: string; to?: string; onClick?: () => void }) {
  const glyph = (
    <svg viewBox="0 0 20 20" fill="currentColor" width="22" height="22" aria-hidden="true">
      <path d={path} fillRule="evenodd" />
    </svg>
  );
  return to ? (
    <Link to={to} aria-label={label} title={label} className="ks-cluster-button">
      {glyph}
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label} className="ks-cluster-button" onClick={onClick}>
      {glyph}
    </button>
  );
}

/** Feedback and Settings shortcuts that sit beside the account button. */
function ClusterActions({ onOpenFeedback }: { onOpenFeedback(): void }) {
  return (
    <>
      <ClusterButton label="Send feedback" path={FEEDBACK_ICON} onClick={onOpenFeedback} />
      <ClusterButton label="Settings" path={SETTINGS_ICON} to="/settings" />
    </>
  );
}

interface AccountMenuProps {
  isAdmin: boolean;
  displayName: string | null;
  onLogout(): void;
  onOpenFeedback(): void;
}

function AccountMenu({ isAdmin, displayName, onLogout, onOpenFeedback }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const initial = (displayName?.trim()[0] ?? "?").toUpperCase();
  return (
    <div ref={rootRef} className="ks-account">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="ks-account__button"
      >
        {initial}
      </button>
      {open && (
        <div id={menuId} className="ks-menu" role="group" aria-label="Account">
          {displayName && <p className="ks-menu__name">{displayName}</p>}
          <Link to="/settings" className="ks-menu__item">
            Settings
          </Link>
          {isAdmin && (
            <Link to="/admin/users" className="ks-menu__item">
              Admin
            </Link>
          )}
          <button
            type="button"
            className="ks-menu__item"
            onClick={() => {
              setOpen(false);
              onOpenFeedback();
            }}
          >
            Send feedback
          </button>
          <button type="button" className="ks-menu__item" onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export interface AppNavigationProps extends AccountMenuProps {
  /** The Play-Along stage owns the whole screen: no shell navigation is rendered. */
  performanceView: boolean;
}

/**
 * Floating navigation, laid out by device class. Phone and tablet get a bottom pill
 * with the goal and account at the top right; a laptop gets one capsule at the top
 * with the goal and account at its right end.
 */
export default function AppNavigation({ performanceView, ...account }: AppNavigationProps) {
  const { device } = useDeviceClass();
  const condensed = useCondensedOnScroll();

  // The practice screen has its own back and title module, so the shell steps aside.
  if (performanceView) return null;

  if (device === "desktop") {
    return (
      <>
        <div className="edge-top ks-edge ks-edge--top" aria-hidden="true" />
        <TabBar
          items={NAV_ITEMS}
          placement="top"
          trailing={
            <div className="ks-tabbar-trailing">
              <GoalChip />
              <ClusterActions onOpenFeedback={account.onOpenFeedback} />
              <AccountMenu {...account} />
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="edge-top ks-edge ks-edge--top" aria-hidden="true" />
      <div className="edge-bottom ks-edge ks-edge--bottom" aria-hidden="true" />
      <GlassSurface as="header" className="ks-float-cluster" data-device={device}>
        <GoalChip compact={device === "phone"} />
        <ClusterActions onOpenFeedback={account.onOpenFeedback} />
        <AccountMenu {...account} />
      </GlassSurface>
      <TabBar items={NAV_ITEMS} placement="bottom" condensed={condensed} />
    </>
  );
}
