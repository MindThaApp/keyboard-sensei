import { useEffect, useState } from "react";
import { getAdminFeedback, setFeedbackStatus, type FeedbackItem } from "../../services/api";
import AdminNav from "./AdminNav";

const TYPE_BADGE: Record<string, string> = {
  bug: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  idea: "bg-brass-100 text-brass-700 dark:bg-brass-700/30 dark:text-brass-300",
  other: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export default function AdminFeedbackPage() {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (status: typeof filter) => {
    setError(null);
    getAdminFeedback(status)
      .then((response) => setItems(response.feedback))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load feedback"));
  };

  useEffect(() => load(filter), [filter]);

  const toggle = async (item: FeedbackItem) => {
    const next = item.status === "open" ? "resolved" : "open";
    await setFeedbackStatus(item.id, next);
    setItems((current) => current?.map((row) => (row.id === item.id ? { ...row, status: next } : row)) ?? null);
  };

  return (
    <div className="space-y-4">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Feedback</h1>
        <div className="flex gap-1 text-sm">
          {(["open", "resolved", "all"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`rounded-md px-2.5 py-1 capitalize transition-colors ${
                filter === status
                  ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {items && items.length === 0 && <p className="text-sm text-slate-500">No {filter === "all" ? "" : filter} feedback yet.</p>}
      <ul className="space-y-3">
        {items?.map((item) => (
          <li key={item.id} className="card space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className={`rounded px-1.5 py-0.5 font-medium capitalize ${TYPE_BADGE[item.type] ?? TYPE_BADGE.other}`}>{item.type}</span>
              <span className="font-mono">{item.page_path}</span>
              <span>·</span>
              <span>{item.user ? `${item.user.display_name} (${item.user.email})` : "Deleted user"}</span>
              <span>·</span>
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              <button
                onClick={() => void toggle(item)}
                className={`ml-auto rounded-md px-2 py-1 text-xs font-medium ${
                  item.status === "open"
                    ? "bg-brass-100 text-brass-700 hover:bg-brass-300 dark:bg-brass-700/30 dark:text-brass-300"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {item.status === "open" ? "Mark resolved" : "Reopen"}
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm">{item.message}</p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500" title={item.user_agent}>{item.user_agent}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
