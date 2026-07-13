import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../services/api";
import { pianoSynth } from "../../utils/synth";

const CATEGORY_LABELS: Record<api.InstrumentCategory, string> = {
  piano: "Pianos",
  keys: "Keys",
  more: "More",
};

let cachedInstruments: api.InstrumentInfo[] | null = null;
let loadingPromise: Promise<api.InstrumentInfo[]> | null = null;

async function loadInstruments(): Promise<api.InstrumentInfo[]> {
  if (cachedInstruments) return cachedInstruments;
  loadingPromise ??= api.getInstruments().then((response) => {
    cachedInstruments = response.instruments;
    return response.instruments;
  });
  return loadingPromise;
}

export function clearInstrumentPickerCache() {
  cachedInstruments = null;
  loadingPromise = null;
}

export function groupInstruments(instruments: api.InstrumentInfo[]) {
  return {
    piano: instruments.filter((instrument) => instrument.category === "piano"),
    keys: instruments.filter((instrument) => instrument.category === "keys"),
    more: instruments.filter((instrument) => instrument.category === "more"),
  };
}

interface InstrumentPickerProps {
  compact?: boolean;
  onSelected?: (id: string | null) => void;
}

export default function InstrumentPicker({ compact = false, onSelected }: InstrumentPickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [instruments, setInstruments] = useState<api.InstrumentInfo[]>(cachedInstruments ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(pianoSynth.currentInstrumentId);
  const [loading, setLoading] = useState(cachedInstruments === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadInstruments()
      .then((items) => {
        if (!cancelled) setInstruments(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load instruments.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selected = useMemo(
    () => instruments.find((instrument) => instrument.id === selectedId) ?? null,
    [instruments, selectedId],
  );
  const grouped = useMemo(() => groupInstruments(instruments), [instruments]);

  function selectInstrument(id: string | null) {
    setSelectedId(id);
    setOpen(false);
    onSelected?.(id);
    void pianoSynth.useInstrument(id);
  }

  const buttonLabel = selected?.name ?? "Built-in synth";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          compact
            ? "h-6 rounded border border-slate-300 px-2 text-[11px] leading-none text-slate-600 dark:border-slate-600 dark:text-slate-300"
            : "secondary-button text-sm"
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change instrument"
      >
        {compact ? `Voice: ${buttonLabel}` : buttonLabel}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {loading && <p className="px-2 py-1 text-xs text-slate-500">Loading instruments…</p>}
          {error && <p role="alert" className="px-2 py-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
          <div role="listbox" aria-label="Instrument voices" className="max-h-96 overflow-y-auto">
            <button
              type="button"
              role="option"
              aria-selected={selectedId === null}
              onClick={() => selectInstrument(null)}
              className={`w-full rounded px-2 py-1.5 text-left ${selectedId === null ? "bg-felt-50 dark:bg-felt-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
            >
              <span className="block text-sm font-medium">Built-in synth</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">The default voice; no download required.</span>
            </button>
            {(["piano", "keys"] as const).map((category) => (
              <div key={category} className="mt-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {CATEGORY_LABELS[category]}
                </p>
                {grouped[category].map((instrument) => (
                  <button
                    key={instrument.id}
                    type="button"
                    role="option"
                    aria-selected={selectedId === instrument.id}
                    onClick={() => selectInstrument(instrument.id)}
                    className={`w-full rounded px-2 py-1.5 text-left ${selectedId === instrument.id ? "bg-felt-50 dark:bg-felt-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                  >
                    <span className="block text-sm font-medium">{instrument.name}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{instrument.description}</span>
                  </button>
                ))}
              </div>
            ))}
            {grouped.more.length > 0 && (
              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMore((value) => !value)}
                  className="w-full px-2 py-1 text-left text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {showMore ? "Hide" : "Show"} more instruments ({grouped.more.length})
                </button>
                {showMore &&
                  grouped.more.map((instrument) => (
                    <button
                      key={instrument.id}
                      type="button"
                      role="option"
                      aria-selected={selectedId === instrument.id}
                      onClick={() => selectInstrument(instrument.id)}
                      className={`w-full rounded px-2 py-1.5 text-left ${selectedId === instrument.id ? "bg-felt-50 dark:bg-felt-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                    >
                      <span className="block text-sm font-medium">{instrument.name}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{instrument.description}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
