import { useServerConfig } from "../../services/serverConfig";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SongDownloadButtons from "./SongDownloadButtons";
import {
  adminDeleteSong,
  adminUpdateSong,
  deleteSong,
  fetchUrlPreview,
  getSongs,
  isScoreFile,
  importArchiveEntry,
  searchArchive,
  updateSong,
  uploadScore,
  uploadSong,
  type ArchiveEntryResult,
  type ScoreImportReport,
  type Song,
  type SongGenre,
  type UrlPreview,
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import { parsePlayAlongSong } from "@keyboard-sensei/playalong-core";
import { playSequence } from "../../audio/noteSequence";
import {
  DEFAULT_FILTERS,
  GENRE_OPTIONS as GENRES,
  filterSongs,
  formatDuration,
  paginate,
  type SongFilters,
} from "../../utils/songLibrary";
import SongFilterBar from "../library/SongFilterBar";
import Pagination from "../library/Pagination";
import ScanSheetMusicDialog, { BetaBadge } from "./ScanSheetMusicDialog";

const PAGE_SIZE = 50;

function DifficultyDots({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Difficulty ${level} of 5`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-felt-500" : "bg-slate-200 dark:bg-slate-700"}`}
        />
      ))}
    </span>
  );
}

function ArchiveBadge() {
  return (
    <span
      title="Imported from the community archive; rights filtering is best-effort, not guaranteed"
      className="rounded bg-brass-100 px-1.5 py-0.5 text-xs font-medium text-brass-700 dark:bg-brass-700/30 dark:text-brass-300"
    >
      From archive
    </span>
  );
}

function RecordingBadge() {
  return (
    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
      Recording
    </span>
  );
}

const ARCHIVE_PAGE_SIZE = 30;

function BrowseArchiveDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveEntryResult[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    setOffset(0);
  }, [query]);

  useEffect(() => {
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchArchive(query.trim(), offset, ARCHIVE_PAGE_SIZE)
        .then((response) => {
          if (!cancelled) {
            setResults(response.results);
            setError(null);
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Search failed");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, offset]);

  const importEntry = async (entry: ArchiveEntryResult) => {
    setImportingId(entry.id);
    setError(null);
    try {
      const result = await importArchiveEntry(entry.id);
      onDone({
        id: result.id,
        title: result.title,
        artist: result.artist,
        genre: "classical",
        difficulty: entry.difficulty,
        duration_sec: entry.duration_sec,
        note_count: entry.note_count,
        content_rights: "archive-import",
        notation_path: null,
        mine: true,
        collection: null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <section aria-label="Browse archive" className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Browse the archive</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Browse or search 5,625 classical/piano pieces from the community archive. Imported copies are private to you, and rights
        filtering is best-effort, not guaranteed — you're responsible for making sure you're allowed to use whatever
        you import.
      </p>
      <input
        className={field}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by title or composer…"
        autoFocus
      />
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {searching && <p className="text-xs text-slate-500">Loading archive…</p>}
      {results && (
        <>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {results.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.title}</p>
                  <p className="truncate text-xs text-slate-500">{entry.composer}</p>
                </div>
                <ArchiveBadge />
                <DifficultyDots level={entry.difficulty} />
                <span className="w-10 text-right text-xs tabular-nums text-slate-500">{formatDuration(entry.duration_sec)}</span>
                <button
                  className="secondary-button whitespace-nowrap px-2 py-1 text-xs"
                  disabled={importingId === entry.id}
                  onClick={() => void importEntry(entry)}
                >
                  {importingId === entry.id ? "Importing…" : "Import"}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-3 py-2 text-xs text-slate-500">No matches.</li>}
          </ul>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {results.length > 0 ? `Showing ${offset + 1}-${offset + results.length}` : "No entries"}
              {query.trim() ? " for this search" : " from the archive"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="secondary-button px-2 py-1 text-xs"
                disabled={offset === 0 || searching}
                onClick={() => setOffset((value) => Math.max(0, value - ARCHIVE_PAGE_SIZE))}
              >
                Prev
              </button>
              <button
                type="button"
                className="secondary-button px-2 py-1 text-xs"
                disabled={results.length < ARCHIVE_PAGE_SIZE || searching}
                onClick={() => setOffset((value) => value + ARCHIVE_PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button className="secondary-button text-sm" onClick={onCancel}>Close</button>
      </div>
    </section>
  );
}

function ImportFromUrlDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<UrlPreview | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [state, setState] = useState<"idle" | "fetching" | "playing" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  // Stops the preview -- called on unmount and before every new preview/fetch,
  // so navigating away or re-fetching mid-playback can't leave notes sounding.
  const stopPreviewRef = useRef<(() => void) | null>(null);

  const clearScheduledPreview = () => {
    stopPreviewRef.current?.();
    stopPreviewRef.current = null;
  };

  useEffect(() => clearScheduledPreview, []);

  const fetchPreview = async () => {
    if (!url.trim()) return;
    clearScheduledPreview();
    setState("fetching");
    setError(null);
    setPreview(null);
    try {
      const result = await fetchUrlPreview(url.trim());
      setPreview(result);
      if (!title) {
        const guess = url.split("/").pop()?.replace(/\.midi?$/i, "").replace(/[-_]/g, " ") ?? "Imported song";
        setTitle(guess);
      }
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not fetch that URL");
      setState("idle");
    }
  };

  const playPreview = () => {
    if (!preview) return;
    clearScheduledPreview();
    setState("playing");
    const parsed = parsePlayAlongSong(preview.bytes);
    stopPreviewRef.current = playSequence(parsed.notes, {
      onEnd: () => {
        stopPreviewRef.current = null;
        setState("idle");
      },
    });
  };

  const confirmImport = async () => {
    if (!preview || !title.trim()) return;
    setState("saving");
    setError(null);
    try {
      const blob = new Blob([preview.bytes], { type: "audio/midi" });
      onDone(await uploadSong(blob, { title: title.trim(), artist: artist.trim() || "Unknown", genre, source_url: url.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
      setState("idle");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <section aria-label="Import from URL" className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Import from a URL</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Paste a link to a .mid file. Imported songs are private to you, and unverified for rights — you're responsible for making sure you're allowed to use whatever you import.
      </p>
      <div className="flex gap-2">
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/song.mid"
        />
        <button className="secondary-button whitespace-nowrap text-sm" disabled={!url.trim() || state === "fetching" || state === "playing"} onClick={() => void fetchPreview()}>
          {state === "fetching" ? "Fetching…" : "Fetch"}
        </button>
      </div>
      {preview && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-500">Title
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-xs text-slate-500">Artist
              <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Unknown" />
            </label>
          </div>
          <label className="block text-xs text-slate-500">Genre
            <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
              {GENRES.filter((g) => g.value !== "all").map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            {formatDuration(preview.durationSec)} · {preview.noteCount} notes · difficulty {preview.difficulty}
          </p>
          <button className="secondary-button text-sm" disabled={state === "playing"} onClick={playPreview}>
            {state === "playing" ? "Playing…" : "▶ Preview"}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" disabled={!preview || !title.trim() || state === "saving"} onClick={() => void confirmImport()}>
          {state === "saving" ? "Adding…" : "Add to my library"}
        </button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

/** What became of an uploaded score: bars played, and anything the uploader should know. */
function ScoreImportSummary({ song, report, onDone }: { song: Song; report: ScoreImportReport; onDone: () => void }) {
  const repeats =
    report.playedMeasures === report.printedMeasures
      ? `${report.playedMeasures} bars`
      : `${report.printedMeasures} bars, ${report.playedMeasures} with the repeats played out`;
  return (
    <section aria-label="Score imported" className="card space-y-3 p-4" role="status">
      <h2 className="text-sm font-semibold">Added “{song.title}”</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {repeats} · {song.note_count} notes to play · private to you.
      </p>
      {report.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-700 dark:text-amber-300">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Link className="primary-button text-sm" to={`/play/${song.id}`}>
          Play it now
        </Link>
        <button className="secondary-button text-sm" onClick={onDone}>
          Done
        </button>
      </div>
    </section>
  );
}

const MIDI_NAME = /\.midi?$/i;

function UploadDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [state, setState] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ song: Song; report: ScoreImportReport } | null>(null);
  const score = file !== null && isScoreFile(file.name);

  const pick = (picked: File | null) => {
    setFile(picked);
    setError(null);
    // A score names its own title; a MIDI file's name is the best guess there is.
    if (picked && !title && !isScoreFile(picked.name)) setTitle(picked.name.replace(MIDI_NAME, ""));
  };

  const submit = async () => {
    if (!file || (!score && !title.trim())) return;
    setState("uploading");
    setError(null);
    try {
      if (score) {
        const { import_report: report, ...song } = await uploadScore(file, { title: title.trim() || undefined, artist: artist.trim() || undefined, genre });
        setImported({ song, report });
      } else {
        onDone(await uploadSong(file, { title: title.trim(), artist: artist.trim() || "Unknown", genre }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setState("idle");
    }
  };

  if (imported) return <ScoreImportSummary song={imported.song} report={imported.report} onDone={() => onDone(imported.song)} />;

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <section aria-label="Upload song file" className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Upload your own song file</h2>
      <p className="text-xs text-slate-500">
        MIDI (.mid), MusicXML (.musicxml, .xml, .mxl), MEI (.mei), ABC (.abc) or Humdrum **kern (.krn). A score is engraved as sheet music and played with its repeats. An ABC or kern file holds one tune or movement, and ABC must be a single voice.
      </p>
      <input
        type="file"
        aria-label="MIDI or score file"
        accept=".mid,.midi,audio/midi,.musicxml,.xml,.mxl,.mei,.abc,.krn,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-felt-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-felt-700 dark:text-slate-300 dark:file:bg-felt-900/40 dark:file:text-felt-300"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-slate-500">Title
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={score ? "From the score" : undefined} />
        </label>
        <label className="block text-xs text-slate-500">Artist
          <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder={score ? "From the score" : "Unknown"} />
        </label>
      </div>
      <label className="block text-xs text-slate-500">Genre
        <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
          {GENRES.filter((g) => g.value !== "all").map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" disabled={!file || (!score && !title.trim()) || state === "uploading"} onClick={() => void submit()}>
          {state === "uploading" ? (score ? "Reading the score…" : "Uploading…") : "Upload"}
        </button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function EditSongRow({ song, isAdmin, onSaved, onCancel }: { song: Song; isAdmin: boolean; onSaved: (song: Song) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState<SongGenre>(song.genre);
  const [difficulty, setDifficulty] = useState(song.difficulty);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const useAdminRoute = isAdmin && !song.mine;

  const save = async () => {
    if (!title.trim()) return;
    setState("saving");
    setError(null);
    try {
      const fields = { title: title.trim(), artist: artist.trim() || "Unknown", genre };
      onSaved(useAdminRoute ? await adminUpdateSong(song.id, { ...fields, difficulty }) : await updateSong(song.id, fields));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save changes");
      setState("idle");
    }
  };

  const field = "rounded-md border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600";
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      <input className={field} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
      <select className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
        {GENRES.filter((g) => g.value !== "all").map((g) => (
          <option key={g.value} value={g.value}>{g.label}</option>
        ))}
      </select>
      {useAdminRoute && (
        <label className="flex items-center gap-1 text-xs text-slate-500">
          Difficulty
          <input
            className={`${field} w-16`}
            type="number"
            min={1}
            max={5}
            value={difficulty}
            onChange={(e) => setDifficulty(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      )}
      <button className="primary-button px-2 py-1 text-xs" disabled={!title.trim() || state === "saving"} onClick={() => void save()}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button className="secondary-button px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>
      {error && <p role="alert" className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </li>
  );
}

export default function SongLibrarySection() {
  const { user } = useAuth();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SongFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState<"file" | "url" | "archive" | "scan" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const isAdmin = user?.role === "admin";
  // A public deployment can't redistribute the (non-commercial) archive: no entry point.
  const serverConfig = useServerConfig();
  const archiveAvailable = serverConfig !== null && !serverConfig.publicCatalogue;
  const scanAvailable = serverConfig?.sheetMusicRecognition === true;

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load songs"));
  }, []);

  // Managing the library is an artist-ordered catalogue, so no sort control here.
  const matching = useMemo(
    () => (songs ? filterSongs(songs, filters).sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title)) : null),
    [songs, filters],
  );
  const visible = matching ? paginate(matching, page, PAGE_SIZE) : null;
  const updateFilters = (next: SongFilters) => {
    setFilters(next);
    setPage(1);
  };

  const removeSong = async (song: Song) => {
    if (!window.confirm(`Permanently delete "${song.title}"? This cannot be undone.`)) return;
    await (song.mine ? deleteSong(song.id) : adminDeleteSong(song.id));
    setSongs((current) => current?.filter((row) => row.id !== song.id) ?? null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Manage library</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Upload, import, and edit the songs available to play.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "file" ? null : "file")); }}>
            Upload song file
          </button>
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "url" ? null : "url")); }}>
            Import from URL
          </button>
          {scanAvailable && (
            <button className="secondary-button inline-flex items-center gap-2 text-sm" onClick={() => { setUploading((v) => (v === "scan" ? null : "scan")); }}>
              Photo or PDF of sheet music <BetaBadge />
            </button>
          )}
          {archiveAvailable && (
            <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "archive" ? null : "archive")); }}>
              Browse Archive
            </button>
          )}
        </div>
      </div>

      {uploading === "file" && (
        <UploadDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(null); }}
          onCancel={() => setUploading(null)}
        />
      )}
      {uploading === "url" && (
        <ImportFromUrlDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(null); }}
          onCancel={() => setUploading(null)}
        />
      )}
      {uploading === "scan" && scanAvailable && (
        <ScanSheetMusicDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); setUploading(null); }}
          onCancel={() => setUploading(null)}
        />
      )}
      {uploading === "archive" && archiveAvailable && (
        <BrowseArchiveDialog
          onDone={(song) => { setSongs((current) => (current ? [song, ...current] : [song])); }}
          onCancel={() => setUploading(null)}
        />
      )}

      <SongFilterBar
        filters={filters}
        onChange={updateFilters}
        showSort={false}
        summary={visible && songs ? (visible.total === 0 ? "No songs match" : `Showing ${visible.from}–${visible.to} of ${visible.total}`) : undefined}
      />

      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!songs && !error && <p className="text-sm text-slate-600 dark:text-slate-300">Loading library…</p>}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.items.map((song) => {
          if (editingId === song.id) {
            return (
              <EditSongRow
                key={song.id}
                song={song}
                isAdmin={isAdmin}
                onSaved={(updated) => {
                  setSongs((current) => current?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) ?? null);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <li key={song.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{song.title}</p>
                <p className="truncate text-xs text-slate-500">{song.artist}</p>
              </div>
              <SongDownloadButtons song={song} />
              {(song.mine || isAdmin) && (
                <>
                  <button
                    onClick={() => setEditingId(song.id)}
                    className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void removeSong(song)}
                    className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  >
                    Delete
                  </button>
                </>
              )}
              {song.content_rights === "archive-import" && <ArchiveBadge />}
              {song.content_rights === "user-recording" && <RecordingBadge />}
              <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400">
                {song.genre}
              </span>
              <DifficultyDots level={song.difficulty} />
              <span className="w-10 text-right text-xs tabular-nums text-slate-500">{formatDuration(song.duration_sec)}</span>
            </li>
          );
        })}
      </ul>
      {visible && visible.total === 0 && <p className="text-sm text-slate-600 dark:text-slate-300">No songs match those filters.</p>}
      {visible && <Pagination page={visible.page} pageCount={visible.pageCount} onPageChange={setPage} />}
    </div>
  );
}
