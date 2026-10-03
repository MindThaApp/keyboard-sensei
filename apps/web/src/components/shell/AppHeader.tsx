import { useEffect, useId, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

const NAV_ITEMS: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Lessons", end: true },
  { to: "/practice-gym", label: "Practice Gym" },
  { to: "/record", label: "Record" },
  { to: "/play", label: "Play" },
  { to: "/history", label: "History" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/settings", label: "Settings" },
];

function desktopLinkClasses({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-2.5 py-1.5 transition-colors ${
    isActive
      ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
  }`;
}

function menuLinkClasses({ isActive }: { isActive: boolean }): string {
  return `block rounded-md px-3 py-2.5 text-base transition-colors ${
    isActive
      ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
  }`;
}

const plainButtonClasses =
  "rounded-md px-2.5 py-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white";

interface AppHeaderProps {
  isAdmin: boolean;
  onLogout(): void;
  /** Rendered only on pages that hide the floating Feedback launcher (the Play-Along stage). */
  onOpenFeedback?: () => void;
  /** Tailwind classes that constrain the header's inner row — matches the page width below it. */
  widthClassName: string;
}

/**
 * The app's top bar. From the `nav` breakpoint (900px) up, every destination is an inline
 * link; below it the links collapse behind a Menu button, because seven links plus Log out
 * ran ~780px wide and pushed the whole page into horizontal scroll on phones and tablets.
 */
export default function AppHeader({ isAdmin, onLogout, onOpenFeedback, widthClassName }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuId = useId();

  // Following a link closes the menu.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const items = isAdmin ? [...NAV_ITEMS, { to: "/admin/users", label: "Admin" }] : NAV_ITEMS;

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 ${widthClassName}`}>
        <Link to="/" className="shrink-0 font-display text-lg font-semibold tracking-tight">
          Keyboard <span className="text-felt-600 dark:text-felt-400">Sensei</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 text-sm nav:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkClasses}>
              {item.label}
            </NavLink>
          ))}
          {onOpenFeedback && (
            <button type="button" onClick={onOpenFeedback} className={`ml-1 ${plainButtonClasses}`}>
              Feedback
            </button>
          )}
          <button type="button" onClick={onLogout} className={`ml-1 ${plainButtonClasses}`}>
            Log out
          </button>
        </nav>

        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 nav:hidden dark:border-slate-600 dark:text-slate-200"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
            {menuOpen ? (
              <path d="M5.3 4.3a1 1 0 0 0-1.4 1.4L8.6 10l-4.7 4.3a1 1 0 1 0 1.4 1.4L10 11.4l4.3 4.3a1 1 0 0 0 1.4-1.4L11.4 10l4.3-4.3a1 1 0 0 0-1.4-1.4L10 8.6 5.3 4.3Z" />
            ) : (
              <path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z" />
            )}
          </svg>
          Menu
        </button>
      </div>

      {menuOpen && (
        <nav id={menuId} aria-label="Main" className="border-t border-slate-200 px-4 pb-3 pt-2 nav:hidden dark:border-slate-800">
          <ul className="grid gap-0.5 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={menuLinkClasses}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
            {onOpenFeedback && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenFeedback();
                }}
              >
                Feedback
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onLogout}>
              Log out
            </button>
          </div>
        </nav>
      )}
      <div className="felt-strip" />
    </header>
  );
}
