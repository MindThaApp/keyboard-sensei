import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useDailySummary } from "../../state/useDailySummary";
import { GoalRing } from "../progress/ProgressBits";

/**
 * Four destinations. Settings and Admin live behind the account menu. From the `nav`
 * breakpoint (900px) up they are inline links in the header; below it they move to a
 * bottom tab bar (four fits a phone comfortably), so the header never needs a menu.
 */
export const NAV_ITEMS: { to: string; label: string; end?: boolean; icon: ReactNode; matches?: string[] }[] = [
  {
    to: "/",
    label: "Today",
    end: true,
    icon: <path d="M10 2a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-7 2a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2H3Zm13 0a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2h-1ZM10 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM4.9 4.9a1 1 0 0 1 1.4 0l.7.7A1 1 0 0 1 5.6 7l-.7-.7a1 1 0 0 1 0-1.4Zm9.5 9.5a1 1 0 0 1 1.4 0l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 0-1.4Zm1.4-9.5a1 1 0 0 1 0 1.4l-.7.7A1 1 0 0 1 13.7 5.6l.7-.7a1 1 0 0 1 1.4 0ZM6.3 14.4a1 1 0 0 1 0 1.4l-.7.7a1 1 0 0 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0Z" />,
  },
  {
    to: "/learn",
    label: "Learn",
    matches: ["/lessons/"],
    icon: <path d="M9 4.8C7.6 3.9 5.6 3.5 3.5 3.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1c2 0 3.8.4 5.5 1.4V4.8Zm2 12.1c1.7-1 3.5-1.4 5.5-1.4a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1c-2.1 0-4.1.4-5.5 1.3v12.1Z" />,
  },
  {
    to: "/practice",
    label: "Practice",
    matches: ["/play/"],
    icon: <path d="M15.3 2.3a1 1 0 0 1 .7 1v10.2a2.5 2.5 0 1 1-2-2.45V6.2l-6 1.5v7.8A2.5 2.5 0 1 1 6 13.05V5a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .54.27Z" />,
  },
  {
    to: "/progress",
    label: "Progress",
    icon: <path d="M3 16a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1H4v-1Zm5-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v5H9V8Zm5-4a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v9h-3V4Z" />,
  },
];

const isActiveFor = (item: (typeof NAV_ITEMS)[number], pathname: string): boolean =>
  item.end ? pathname === item.to : pathname.startsWith(item.to) || (item.matches ?? []).some((prefix) => pathname.startsWith(prefix));

function desktopLinkClasses(active: boolean): string {
  return `rounded-md px-3 py-1.5 transition-colors ${
    active
      ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
  }`;
}

const menuItemClasses =
  "block w-full rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

interface AppHeaderProps {
  isAdmin: boolean;
  displayName: string | null;
  onLogout(): void;
  /** Rendered only on pages that hide the floating Feedback launcher (the Play-Along stage). */
  onOpenFeedback?: () => void;
  /** Tailwind classes that constrain the header's inner row — matches the page width below it. */
  widthClassName: string;
}

/** Today's goal at a glance: ring + streak, linking to Today. */
function GoalChip() {
  const summary = useDailySummary();
  if (!summary) return null;
  const { minutesToday, goalMinutes, met } = summary.dailyGoal;
  return (
    <Link
      to="/"
      className="flex items-center gap-1.5 rounded-full px-1.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      aria-label={`Daily goal: ${Math.floor(minutesToday)} of ${goalMinutes} minutes${met ? ", met" : ""}. Streak: ${summary.streak.current} days`}
      data-testid="header-goal"
    >
      <GoalRing minutes={minutesToday} goal={goalMinutes} size={28} stroke={3.5} />
      <span className="tabular-nums" aria-hidden>
        {Math.floor(minutesToday)}/{goalMinutes}m
      </span>
      <span className="tabular-nums" aria-hidden title="Goal streak">
        🔥{summary.streak.current}
      </span>
    </Link>
  );
}

function AccountMenu({ isAdmin, displayName, onLogout, onOpenFeedback }: Omit<AppHeaderProps, "widthClassName">) {
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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-felt-600 text-sm font-semibold text-white hover:bg-felt-500"
      >
        {initial}
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-11 z-50 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {displayName && <p className="truncate px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300">{displayName}</p>}
          <Link to="/settings" className={menuItemClasses}>
            Settings
          </Link>
          {isAdmin && (
            <Link to="/admin/users" className={menuItemClasses}>
              Admin
            </Link>
          )}
          {onOpenFeedback && (
            <button
              type="button"
              className={menuItemClasses}
              onClick={() => {
                setOpen(false);
                onOpenFeedback();
              }}
            >
              Feedback
            </button>
          )}
          <button type="button" className={menuItemClasses} onClick={onLogout}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ isAdmin, displayName, onLogout, onOpenFeedback, widthClassName }: AppHeaderProps) {
  const location = useLocation();
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className={`mx-auto flex items-center justify-between gap-3 px-4 py-2.5 ${widthClassName}`}>
        <Link to="/" className="shrink-0 font-display text-lg font-semibold tracking-tight">
          Keyboard <span className="text-felt-600 dark:text-felt-400">Sensei</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 text-sm nav:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActiveFor(item, location.pathname) ? "page" : undefined}
              className={desktopLinkClasses(isActiveFor(item, location.pathname))}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <GoalChip />
          <AccountMenu isAdmin={isAdmin} displayName={displayName} onLogout={onLogout} onOpenFeedback={onOpenFeedback} />
        </div>
      </div>
      <div className="felt-strip" />
    </header>
  );
}

/** Phone and tablet navigation: the same four destinations, at the bottom of the screen. */
export function BottomTabBar() {
  const location = useLocation();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur nav:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActiveFor(item, location.pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? "text-felt-700 dark:text-felt-300" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden>
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
