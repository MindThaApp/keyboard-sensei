import { useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import { pianoSynth } from "../../utils/synth";
import { Advanced } from "../ui";
import { describeInstrument } from "./instrumentText";
import { clearInstrumentPickerCache, groupInstruments } from "../instruments/InstrumentPicker";

const LOAD_POLL_MS = 150;
const CATEGORY_LABELS: Record<api.InstrumentCategory, string> = {
  piano: "Pianos",
  keys: "Keys",
  more: "More",
};

interface InstrumentRowProps {
  instrument: api.InstrumentInfo;
  selectedId: string | null;
  canDelete: boolean;
  onSelect: (id: string) => void;
  onDelete: (instrument: api.InstrumentInfo) => void;
}

function InstrumentRow({ instrument, selectedId, canDelete, onSelect, onDelete }: InstrumentRowProps) {
  const isSelected = selectedId === instrument.id;
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="text-xs text-slate-500 dark:text-slate-400">{describeInstrument(instrument)}</p>
        {isSelected && loading && (
          <>
            <div className="mt-1.5 h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-felt-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Loading samples ({Math.round(progress * 100)}%) — the on-screen synth plays until this finishes.
            </p>
          </>
        )}
        {error && <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => void handlePreview()} disabled={previewing} className="secondary-button px-2 py-1 text-xs">
          {previewing ? "…" : "▶"} Preview
        </button>
        <button
          type="button"
          onClick={() => onSelect(instrument.id)}
          disabled={isSelected}
          className={isSelected ? "rounded-md bg-felt-600 px-2 py-1 text-xs font-medium text-white" : "primary-button px-2 py-1 text-xs"}
        >
          {isSelected ? "Selected" : "Select"}
        </button>
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(instrument)}
            className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

function InstrumentImportPanel({
  mode,
  onDone,
  onCancel,
}: {
  mode: "upload" | "url";
  onDone: (instrument: api.InstrumentInfo) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<api.InstrumentCategory>("more");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";

  function pick(picked: File | null) {
    setFile(picked);
    if (picked && !name) setName(picked.name.replace(/\.[^.]+$/i, "").replace(/[-_]/g, " "));
  }

  async function submit() {
    if (!name.trim() || !description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const instrument =
        mode === "upload"
          ? await api.uploadInstrument(file!, { name: name.trim(), description: description.trim(), category })
          : await api.importInstrumentFromUrl({ url: url.trim(), name: name.trim(), description: description.trim(), category });
      clearInstrumentPickerCache();
      onDone(instrument);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add instrument.");
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h3 className="text-sm font-semibold">{mode === "upload" ? "Upload instrument pack" : "Import instrument from URL"}</h3>
      {mode === "upload" ? (
        <input
          type="file"
          accept=".mp3,.ogg,.wav,.flac,.js,audio/*"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-felt-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-felt-700 dark:text-slate-300 dark:file:bg-felt-900/40 dark:file:text-felt-300"
        />
      ) : (
        <input className={field} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/instrument.wav" />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">
          Name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-xs text-slate-500">
          Category
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value as api.InstrumentCategory)}>
            <option value="piano">Pianos</option>
            <option value="keys">Keys</option>
            <option value="more">More</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-slate-500">
        Description
        <input className={field} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this instrument sounds like" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="primary-button text-sm"
          disabled={saving || !name.trim() || !description.trim() || (mode === "upload" ? !file : !url.trim())}
          onClick={() => void submit()}
        >
          {saving ? "Adding…" : "Add instrument"}
        </button>
        <button type="button" className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

export default function InstrumentSection() {
  const { user } = useAuth();
  const [instruments, setInstruments] = useState<api.InstrumentInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(pianoSynth.currentInstrumentId);
  const [showMore, setShowMore] = useState(false);
  const [adding, setAdding] = useState<"upload" | "url" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const isAdmin = user?.role === "admin";

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

  function handleSelect(id: string | null) {
    setSelectedId(id);
    void pianoSynth.useInstrument(id);
  }

  async function removeInstrument(instrument: api.InstrumentInfo) {
    if (!window.confirm(`Permanently delete "${instrument.name}"? This cannot be undone.`)) return;
    await api.deleteInstrument(instrument.id);
    clearInstrumentPickerCache();
    setInstruments((current) => current.filter((row) => row.id !== instrument.id));
    if (selectedId === instrument.id) handleSelect(null);
  }

  const grouped = groupInstruments(instruments);

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Instruments</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose the sampled voice used across lessons, Practice Gym, and Play-Along, or manage your custom packs.
          </p>
        </div>
        <Advanced>
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="secondary-button text-sm" onClick={() => setAdding((value) => (value === "upload" ? null : "upload"))}>
              Upload pack
            </button>
            <button type="button" className="secondary-button text-sm" onClick={() => setAdding((value) => (value === "url" ? null : "url"))}>
              Import URL
            </button>
          </div>
        </Advanced>
      </div>

      {adding && (
        <InstrumentImportPanel
          mode={adding}
          onDone={(instrument) => {
            setInstruments((current) => [instrument, ...current]);
            setAdding(null);
          }}
          onCancel={() => setAdding(null)}
        />
      )}

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
              <p className="text-xs text-slate-500 dark:text-slate-400">The default voice; no download required.</p>
            </div>
            <button
              type="button"
              onClick={() => handleSelect(null)}
              disabled={selectedId === null}
              className={selectedId === null ? "rounded-md bg-felt-600 px-2 py-1 text-xs font-medium text-white" : "primary-button px-2 py-1 text-xs"}
            >
              {selectedId === null ? "Selected" : "Select"}
            </button>
          </div>

          {(["piano", "keys"] as const).map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABELS[category]}</h3>
              {grouped[category].map((instrument) => (
                <InstrumentRow
                  key={instrument.id}
                  instrument={instrument}
                  selectedId={selectedId}
                  canDelete={instrument.mine || isAdmin}
                  onSelect={handleSelect}
                  onDelete={(item) => void removeInstrument(item)}
                />
              ))}
            </div>
          ))}

          {grouped.more.length > 0 && (
            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setShowMore((value) => !value)}
                className="text-sm font-medium text-felt-700 hover:underline dark:text-felt-400"
              >
                {showMore ? "▾" : "▸"} More instruments ({grouped.more.length})
              </button>
              {showMore && (
                <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {grouped.more.map((instrument) => (
                    <InstrumentRow
                      key={instrument.id}
                      instrument={instrument}
                      selectedId={selectedId}
                      canDelete={instrument.mine || isAdmin}
                      onSelect={handleSelect}
                      onDelete={(item) => void removeInstrument(item)}
                    />
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
