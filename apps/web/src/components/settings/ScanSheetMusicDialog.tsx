import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  discardOmrJob,
  getOmrJob,
  getOmrJobNotation,
  saveOmrJob,
  SHEET_MUSIC_ACCEPT,
  SHEET_MUSIC_LIMIT_BYTES,
  submitSheetMusic,
  type OmrJob,
  type Song,
  type SongGenre,
} from "../../services/api";
import { formatDuration, GENRE_OPTIONS as GENRES } from "../../utils/songLibrary";
import { prepareSheetMusic } from "../../utils/sheetMusicImage";

// The ~7 MB Verovio chunk, only once there is something to show.
const VerovioNotation = lazy(() => import("../play/VerovioNotation"));

const POLL_MS = 2000;
/** Before the first recognition finishes there is no better estimate: ~15 s a page on the server. */
const SECONDS_PER_PAGE = 15;

type Stage =
  | { name: "pick" }
  | { name: "uploading" }
  | { name: "waiting"; job: OmrJob }
  | { name: "review"; job: OmrJob; mei: string }
  | { name: "saving"; job: OmrJob; mei: string }
  | { name: "saved"; song: Song };

export function BetaBadge() {
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      Beta
    </span>
  );
}

function elapsedSince(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 1000)) : 0;
}

function Progress({ job, onCancel }: { job: OmrJob; onCancel: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const queued = job.status === "queued";
  const elapsed = elapsedSince(job.started_at, now);
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-sm font-medium">
        {queued
          ? `Waiting for the reader — ${job.position} ${job.position === 1 ? "score" : "scores"} ahead of yours`
          : `Reading the music… ${elapsed} s`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
        <div className={`h-full rounded-full bg-felt-600 ${queued ? "w-1/12" : "w-full animate-pulse"}`} />
      </div>
      <p className="text-xs text-slate-500">
        A page usually takes {SECONDS_PER_PAGE}–30 seconds. You can leave this open; nothing is saved until you check it.
      </p>
      <button className="secondary-button text-sm" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function Review({
  job,
  mei,
  saving,
  error,
  onSave,
  onDiscard,
}: {
  job: OmrJob;
  mei: string;
  saving: boolean;
  error: string | null;
  onSave: (fields: { title: string; artist: string; genre: SongGenre }) => void;
  onDiscard: () => void;
}) {
  const result = job.result!;
  const [title, setTitle] = useState(result.title ?? "");
  const [artist, setArtist] = useState(result.composer ?? "");
  const [genre, setGenre] = useState<SongGenre>("classical");
  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  const bars = result.played_bars === result.bars ? `${result.bars} bars` : `${result.bars} bars (${result.played_bars} with repeats)`;
  return (
    <div className="space-y-3">
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
        <strong>Recognition may contain mistakes.</strong> Compare this with your sheet music before you practise from it: a wrong note
        here is a wrong note in the game.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {bars} · {result.note_count} notes · {formatDuration(result.duration_sec)} · {result.pages} {result.pages === 1 ? "page" : "pages"} read
      </p>
      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div role="img" aria-label="The recognised sheet music" className="[&_.ks-verovio]:max-h-[60vh]">
        <Suspense fallback={<p className="text-sm text-slate-500">Loading the engraving…</p>}>
          <VerovioNotation mei={mei} songTimeS={-1} />
        </Suspense>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs text-slate-500">
          Title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this piece" />
        </label>
        <label className="block text-xs text-slate-500">
          Composer
          <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Unknown" />
        </label>
        <label className="block text-xs text-slate-500">
          Genre
          <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
            {GENRES.filter((g) => g.value !== "all").map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="primary-button text-sm"
          disabled={!title.trim() || saving}
          onClick={() => onSave({ title: title.trim(), artist: artist.trim() || "Unknown", genre })}
        >
          {saving ? "Saving…" : "Save to my library"}
        </button>
        <button className="secondary-button text-sm" disabled={saving} onClick={onDiscard}>
          Discard
        </button>
      </div>
      <p className="text-xs text-slate-500">Saved scores are private to you.</p>
    </div>
  );
}

/**
 * Sheet music from a photo or a PDF (beta): upload, wait while the server reads it, then
 * check the engraving it made before saving it as a song.
 */
export default function ScanSheetMusicDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobId = stage.name === "waiting" ? stage.job.id : null;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll the job until it is ready or has failed.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const job = await getOmrJob(jobId);
        if (cancelled) return;
        if (job.status === "ready") {
          const mei = await getOmrJobNotation(jobId);
          if (!cancelled) setStage({ name: "review", job, mei });
          return;
        }
        if (job.status === "failed") {
          setError(job.error?.message ?? "The sheet music couldn't be read.");
          // The file input is shown afresh (empty), so forget the old pick too.
          setFile(null);
          setStage({ name: "pick" });
          return;
        }
        setStage({ name: "waiting", job });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Lost track of the recognition. Try again.");
        setFile(null);
        setStage({ name: "pick" });
        return;
      }
      timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    timer = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  const submit = async () => {
    if (!file) return;
    setError(null);
    if (file.size > SHEET_MUSIC_LIMIT_BYTES) {
      setError("That file is too large (the limit is 20 MB).");
      return;
    }
    setStage({ name: "uploading" });
    try {
      const job = await submitSheetMusic(await prepareSheetMusic(file));
      if (mounted.current) setStage({ name: "waiting", job });
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Upload failed");
      setStage({ name: "pick" });
    }
  };

  const discard = (job: OmrJob) => {
    void discardOmrJob(job.id).catch(() => undefined);
    setStage({ name: "pick" });
    setFile(null);
  };

  const save = async (job: OmrJob, mei: string, fields: { title: string; artist: string; genre: SongGenre }) => {
    setError(null);
    setStage({ name: "saving", job, mei });
    try {
      const song: Song = await saveOmrJob(job.id, fields);
      if (mounted.current) setStage({ name: "saved", song });
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Couldn't save it");
      setStage({ name: "review", job, mei });
    }
  };

  return (
    <section aria-label="Sheet music from a photo or PDF" className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Sheet music from a photo or PDF</h2>
        <BetaBadge />
      </div>

      {stage.name === "pick" || stage.name === "uploading" ? (
        <>
          <p className="text-xs text-slate-500">
            Printed piano music works best: a PDF (up to 6 pages), or a sharp, evenly lit photo of one page, taken straight on with the
            page flat. Handwritten music isn't supported. You'll see what was recognised before anything is saved.
          </p>
          <input
            type="file"
            aria-label="PDF or photo of sheet music"
            accept={SHEET_MUSIC_ACCEPT}
            disabled={stage.name === "uploading"}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-felt-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-felt-700 dark:text-slate-300 dark:file:bg-felt-900/40 dark:file:text-felt-300"
          />
          {error && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button className="primary-button text-sm" disabled={!file || stage.name === "uploading"} onClick={() => void submit()}>
              {stage.name === "uploading" ? "Uploading…" : "Read the music"}
            </button>
            <button className="secondary-button text-sm" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      ) : stage.name === "waiting" ? (
        <Progress job={stage.job} onCancel={() => discard(stage.job)} />
      ) : stage.name === "review" || stage.name === "saving" ? (
        <Review
          job={stage.job}
          mei={stage.mei}
          saving={stage.name === "saving"}
          error={error}
          onSave={(fields) => void save(stage.job, stage.mei, fields)}
          onDiscard={() => discard(stage.job)}
        />
      ) : (
        <div className="space-y-3" role="status">
          <p className="text-sm">
            Added “{stage.song.title}” to your library, with {stage.song.note_count} notes to play.
          </p>
          <div className="flex gap-2">
            <Link className="primary-button text-sm" to={`/play/${stage.song.id}`}>
              Play it now
            </Link>
            <button className="secondary-button text-sm" onClick={() => onDone(stage.song)}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
