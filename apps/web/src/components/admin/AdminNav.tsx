import { NavLink } from "react-router-dom";

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1 text-sm transition-colors ${
    isActive
      ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
  }`;

/** Sub-navigation shared by all admin pages. */
export default function AdminNav() {
  return (
    <nav aria-label="Admin sections" className="mb-4 flex gap-1 border-b border-slate-200 pb-2 dark:border-slate-800">
      <NavLink to="/admin/users" className={linkClasses}>Users</NavLink>
      <NavLink to="/admin/feedback" className={linkClasses}>Feedback</NavLink>
      <NavLink to="/admin/songs" className={linkClasses}>Songs</NavLink>
    </nav>
  );
}
