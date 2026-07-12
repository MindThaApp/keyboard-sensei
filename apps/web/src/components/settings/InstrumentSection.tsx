import { useEffect, useState } from "react";
import { pianoSynth } from "../../utils/synth";
import * as api from "../../services/api";

/** Poll interval while an instrument is downloading its 88 samples. Local to
 *  this component only — not shared/context state, so it never touches the
 *  high-frequency-state-on-a-shared-context trap the rest of the app avoids. */
const LOAD_POLL_MS = 150;

interface InstrumentRowProps {
  instrument: api.InstrumentInfo;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function InstrumentRow({ instrument, selectedId, onSelect }: InstrumentRowProps) {
  const isSelected = selectedId === instrument.id;
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // While this instrument is the selected one and still downloading, poll the
  // facade's per-instrument load state so the progress bar advances.
  useEffect(() => {
    if (!isSelected) {
      setLoading(false);
      return;
    }
    const state = pianoSynth.instrumentLoadState(instrument.id);
    if (state.loaded) {
      setLoading(false);
      setProgress(1);
      return;
    }
    setLoading(true);
    const interval = setInterval(() => {
      const current = pianoSynth.instrumentLoadState(instrument.id);
      setProgress(current.progress);
      if (current.loaded) {
        setLoading(false);
        clearInterval(interval);
      }
    }, LOAD_POLL_MS);
    return () => clearInterval(interval);
  }, [isSelected, instrument.id]);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    try {
      await pianoSynth.previewInstrument(instrument.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview this instrument.");
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
        isSelected
          ? "border-felt-400 bg-felt-50 ring-1 ring-felt-400/50 dark:border-felt-600 dark:bg-felt-900/30 dark:ring-felt-600/50"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{instrument.name}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{instrument.description}</p>
        {isSelected && loading && (
          <div className="mt-1.5 h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-felt-500 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
        {isSelected && loading && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Loading samples ({Math.round(progress * 100)}%) — the on-screen synth plays until this finishes.
          </p>
        )}
        {error && <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={previewing}
          className="secondary-button px-2 py-1 text-xs"
        >
          {previewing ? "…" : "▶"} Preview
        </button>
        <button
          type="button"
          onClick={() => onSelect(instrument.id)}
          disabled={isSelected}
          className={
            isSelected
              ? "rounded-md bg-felt-600 px-2 py-1 text-xs font-medium text-white"
              : "primary-button px-2 py-1 text-xs"
          }
        >
          {isSelected ? "Selected" : "Select"}
        </button>
      </div>
    </div>
  );
}

export default function InstrumentSection() {
  const [instruments, setInstruments] = useState<api.InstrumentInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(pianoSynth.currentInstrumentId);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    api
      .getInstruments()
      .then((res) => {
        if (!cancelled) setInstruments(res.instruments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load instruments.");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSelect(id: string) {
    setSelectedId(id);
    void pianoSynth.useInstrument(id);
  }

  function handleUseDefaultSynth() {
    setSelectedId(null);
    void pianoSynth.useInstrument(null);
  }

  const curated = instruments.filter((i) => i.category === "piano" || i.category === "keys");
  const more = instruments.filter((i) => i.category === "more");

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Piano voice</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose a real sampled instrument, or stick with the built-in synthesized piano. The voice you pick
          plays across lessons, Practice Gym, and Play-Along.
        </p>
      </div>

      {error && <p className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
      {loadingList && <p className="text-sm text-slate-500 dark:text-slate-400">Loading instrument list…</p>}

      {!loadingList && (
        <>
          <div
            className={`flex items-center justify-between gap-2 rounded-md border p-3 ${
              selectedId === null
                ? "border-felt-400 bg-felt-50 ring-1 ring-felt-400/50 dark:border-felt-600 dark:bg-felt-900/30 dark:ring-felt-600/50"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Built-in synth</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">The default — no download, always available.</p>
            </div>
            <button
              type="button"
              onClick={handleUseDefaultSynth}
              disabled={selectedId === null}
              className={
                selectedId === null
                  ? "rounded-md bg-felt-600 px-2 py-1 text-xs font-medium text-white"
                  : "primary-button px-2 py-1 text-xs"
              }
            >
              {selectedId === null ? "Selected" : "Select"}
            </button>
          </div>

          <div className="space-y-2">
            {curated.map((instrument) => (
              <InstrumentRow key={instrument.id} instrument={instrument} selectedId={selectedId} onSelect={handleSelect} />
            ))}
          </div>

          {more.length > 0 && (
            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="text-sm font-medium text-felt-700 hover:underline dark:text-felt-400"
              >
                {showMore ? "▾" : "▸"} More instruments ({more.length})
              </button>
              {showMore && (
                <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {more.map((instrument) => (
                    <InstrumentRow key={instrument.id} instrument={instrument} selectedId={selectedId} onSelect={handleSelect} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
