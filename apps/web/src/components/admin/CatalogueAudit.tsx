import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, EmptyState, ErrorState, Skeleton, useToast } from "../ui";
import { getCatalogueEvents, isUndoable, undoCatalogueEvent, type CatalogueEvent } from "./CatalogueApi";
import { fieldClass, formatWhen } from "./CatalogueUi";

const PAGE_SIZE = 50;
const ACTIONS = ["publish", "hide", "status", "retire", "unretire", "override_tier", "edit", "merge"];

const show = (value: unknown): string => {
  if (value === null || value === undefined) return "none";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "object" && item !== null && "alias" in item ? String((item as { alias: unknown }).alias) : String(item))).join(", ") || "none";
  return String(value);
};

/** "title: A → B" per changed key. */
function Change({ event }: { event: CatalogueEvent }) {
  const keys = Object.keys(event.after ?? event.before ?? {});
  if (event.action === "merge") {
    const before = event.before as { from_id?: string; songs?: string[] } | null;
    return <p className="text-xs text-label-2a">Merged {before?.from_id} into this Work ({before?.songs?.length ?? 0} songs moved)</p>;
  }
  return (
    <ul className="space-y-0.5 text-xs text-label-2a">
      {keys.map((key) => (
        <li key={key}>
          <span className="text-label-2">{key.replace(/_/g, " ")}:</span> {show(event.before?.[key])} → {show(event.after?.[key])}
        </li>
      ))}
    </ul>
  );
}

/** Every catalogue change, newest first, with undo for edits, tiers and status changes. */
export default function CatalogueAudit({ readOnly }: { readOnly: boolean }) {
  const toast = useToast();
  const [songId, setSongId] = useState("");
  const [workId, setWorkId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ events: CatalogueEvent[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setError(null);
      getCatalogueEvents({
        song_id: songId.trim() || undefined,
        work_id: workId.trim() || undefined,
        action: action || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
        .then((response) => {
          if (!cancelled) setData(response);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the log");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [songId, workId, action, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const undo = async (event: CatalogueEvent) => {
    setBusyId(event.id);
    try {
      await undoCatalogueEvent(event.id);
      toast.show({ tone: "info", title: "Change undone" });
      reload();
    } catch (e) {
      toast.show({ tone: "error", title: e instanceof Error ? e.message : "Could not undo" });
    } finally {
      setBusyId(null);
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const reset = (apply: () => void) => {
    apply();
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[160px] flex-1 text-xs text-label-2">
          Song id
          <input className={`${fieldClass} mt-1`} value={songId} onChange={(e) => reset(() => setSongId(e.target.value))} />
        </label>
        <label className="block min-w-[160px] flex-1 text-xs text-label-2">
          Work id
          <input className={`${fieldClass} mt-1`} value={workId} onChange={(e) => reset(() => setWorkId(e.target.value))} />
        </label>
        <label className="block min-w-[160px] flex-1 text-xs text-label-2">
          Action
          <select className={`${fieldClass} mt-1`} value={action} onChange={(e) => reset(() => setAction(e.target.value))}>
            <option value="">Any</option>
            {ACTIONS.map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <ErrorState title="Could not load the audit log" message={error} action={<Button onClick={reload}>Try again</Button>} />
      ) : !data ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={12} />)}</div>
      ) : data.events.length === 0 ? (
        <EmptyState title="Nothing logged yet" message="Every publish, retire, tier change, edit and merge is recorded here." />
      ) : (
        <>
          <p className="text-sm text-label-2" aria-live="polite">{data.total} event{data.total === 1 ? "" : "s"}</p>
          <Card padding="none">
            <ul className="divide-y divide-separator">
              {data.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="tint">{event.action.replace(/_/g, " ")}</Chip>
                      <span className="truncate text-[15px] text-label">{event.song_title ?? event.work_title ?? event.song_id ?? event.work_id ?? "—"}</span>
                    </div>
                    <p className="text-xs text-label-2a">
                      {formatWhen(event.at)} · {event.actor_name ?? "system"}
                      {event.reason ? ` · “${event.reason}”` : ""}
                    </p>
                    <Change event={event} />
                  </div>
                  {!readOnly && isUndoable(event) && (
                    <Button size="sm" loading={busyId === event.id} onClick={() => void undo(event)}>Undo</Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <nav aria-label="Pages" className="flex items-center justify-center gap-3">
            <Button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-label-2">Page {page + 1} of {pages}</span>
            <Button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </nav>
        </>
      )}
    </div>
  );
}
