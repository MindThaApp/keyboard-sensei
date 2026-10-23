import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, ErrorState, Skeleton } from "../ui";
import {
  STATUSES,
  STATUS_LABEL,
  TIERS,
  getCatalogueSongs,
  type CatalogueSong,
  type CurationStatus,
  type SongFilters,
  type Tier,
} from "./CatalogueApi";
import CatalogueBulkBar from "./CatalogueBulkBar";
import CatalogueSongTable from "./CatalogueSongTable";
import { fieldClass } from "./CatalogueUi";

const PAGE_SIZE = 50;
const SOURCES = ["essentials", "beginner", "piano-midi-de", "mutopia", "authored", "adl", "upload", "recording", "archive"];
const LICENCES = ["public-domain", "cc-by-sa", "cc-by", "cc-by-nc", "unknown"];

const toBool = (value: string): boolean | undefined => (value === "" ? undefined : value === "1");

/** The filterable catalogue table with bulk actions. */
export default function CatalogueSongs({ readOnly }: { readOnly: boolean }) {
  const [filters, setFilters] = useState<SongFilters>({ retired: "hide" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ songs: CatalogueSong[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const update = (patch: Partial<SongFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
    setSelected(new Set());
  };

  // Typing in the search box waits a beat so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.q === (search.trim() || undefined) ? current : { ...current, q: search.trim() || undefined }));
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getCatalogueSongs({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the catalogue");
      });
    return () => {
      cancelled = true;
    };
  }, [filters, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const select = (label: string, value: string, onChange: (value: string) => void, options: { value: string; label: string }[], any = "Any") => (
    <label className="block min-w-[140px] flex-1 text-xs text-label-2">
      {label}
      <select className={`${fieldClass} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{any}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[200px] flex-[2] text-xs text-label-2">
          Search
          <input type="search" className={`${fieldClass} mt-1`} placeholder="Title, artist, Work or id" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {select("Tier", filters.tier ?? "", (v) => update({ tier: (v || undefined) as Tier | undefined }), TIERS.map((t) => ({ value: t, label: t })))}
        {select("Status", filters.status ?? "", (v) => update({ status: (v || undefined) as CurationStatus | "none" | undefined }), [
          ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          { value: "none", label: "No Work" },
        ])}
        {select("Source", filters.source ?? "", (v) => update({ source: v || undefined }), SOURCES.map((s) => ({ value: s, label: s })))}
        {select("Licence", filters.licence ?? "", (v) => update({ licence: v || undefined }), LICENCES.map((s) => ({ value: s, label: s })))}
        {select("Public-eligible", filters.eligible === undefined ? "" : filters.eligible ? "1" : "0", (v) => update({ eligible: toBool(v) }), [
          { value: "1", label: "Yes" },
          { value: "0", label: "No" },
        ])}
        {select("Songs", filters.retired ?? "hide", (v) => update({ retired: v as SongFilters["retired"] }), [
          { value: "only", label: "Retired only" },
          { value: "all", label: "Include retired" },
        ], "Not retired")}
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-label">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[rgb(var(--tint-fill-rgb))]"
            checked={filters.nowork === true}
            onChange={(e) => update({ nowork: e.target.checked || undefined })}
          />
          No Work
        </label>
      </div>

      {error ? (
        <ErrorState title="Could not load the catalogue" message={error} action={<Button onClick={reload}>Try again</Button>} />
      ) : !data ? (
        <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} radius={12} />)}</div>
      ) : data.songs.length === 0 ? (
        <EmptyState title="No songs match" message="Loosen a filter to see more." />
      ) : (
        <>
          <p className="text-sm text-label-2" aria-live="polite">{data.total} song{data.total === 1 ? "" : "s"}</p>
          <CatalogueSongTable songs={data.songs} selected={selected} onSelectedChange={setSelected} readOnly={readOnly} />
          <nav aria-label="Pages" className="flex items-center justify-center gap-3">
            <Button disabled={page === 0} onClick={() => { setPage(page - 1); setSelected(new Set()); }}>Previous</Button>
            <span className="text-sm text-label-2">Page {page + 1} of {pages}</span>
            <Button disabled={page + 1 >= pages} onClick={() => { setPage(page + 1); setSelected(new Set()); }}>Next</Button>
          </nav>
        </>
      )}

      {!readOnly && selected.size > 0 && (
        <CatalogueBulkBar
          selected={[...selected]}
          actions={["publish", "in_review", "hide", "retire", "unretire", "tier", "tag", "assign"]}
          onClear={() => setSelected(new Set())}
          onDone={reload}
        />
      )}
    </div>
  );
}
