import { useEffect, useState } from "react";
import { getCatalogueWorks, type CatalogueWork } from "./CatalogueApi";
import { StatusChip, fieldClass } from "./CatalogueUi";

export interface CatalogueWorkPickerProps {
  /** Called with the Work the admin chose. */
  onPick: (work: CatalogueWork) => void;
  /** A Work that must not be offered (the one being merged away). */
  excludeId?: string;
  selectedId?: string | null;
}

/** Search-as-you-type list of Works; used to assign songs and to choose a merge target. */
export default function CatalogueWorkPicker({ onPick, excludeId, selectedId }: CatalogueWorkPickerProps) {
  const [q, setQ] = useState("");
  const [works, setWorks] = useState<CatalogueWork[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      getCatalogueWorks(q.trim())
        .then((response) => {
          if (!cancelled) {
            setWorks(response.works);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load Works");
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const visible = works?.filter((work) => work.id !== excludeId) ?? null;
  return (
    <div className="space-y-2">
      <input
        type="search"
        className={fieldClass}
        placeholder="Search Works by title, composer or alias"
        aria-label="Search Works"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ul className="max-h-72 divide-y divide-separator overflow-y-auto rounded-lg border border-separator" aria-label="Works">
        {visible?.map((work) => (
          <li key={work.id}>
            <button
              type="button"
              onClick={() => onPick(work)}
              aria-pressed={selectedId === work.id}
              className={`flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-fill ${selectedId === work.id ? "bg-fill" : ""}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-label">{work.title}</span>
                <span className="block truncate text-xs text-label-2a">
                  {[work.composer, work.catalogue, `${work.song_count} song${work.song_count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <StatusChip status={work.curation_status} />
            </button>
          </li>
        ))}
        {visible?.length === 0 && <li className="px-3 py-3 text-sm text-label-2a">No Work matches.</li>}
      </ul>
    </div>
  );
}
