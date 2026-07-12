import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { deleteSong, fetchUrlPreview, getMyPlayAlongAttempts, getSongs, updateSong, uploadSong, type Song, type SongGenre, type UrlPreview } from "../../services/api";
import { parsePlayAlongSong } from "../../utils/playalongSong";
import { pianoSynth } from "../../utils/synth";

const GENRES: { value: SongGenre | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "classical", label: "Classical" },
  { value: "pop", label: "Pop" },
  { value: "film", label: "Film" },
  { value: "jazz", label: "Jazz / Ragtime" },
  { value: "other", label: "Other" },
];

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function DifficultyDots({ level }: { level: number }) {
  return (
    <span aria-label={`Difficulty ${level} of 5`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-felt-500" : "bg-slate-200 dark:bg-slate-700"}`}
        />
      ))}
    </span>
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

  const fetchPreview = async () => {
    if (!url.trim()) return;
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
    setState("playing");
    const parsed = parsePlayAlongSong(preview.bytes);
    let lastEnd = 0;
    for (const note of parsed.notes) {
      const onMs = note.startS * 1000;
      const offMs = onMs + note.durationS * 1000;
      lastEnd = Math.max(lastEnd, offMs);
      setTimeout(() => pianoSynth.playNote(note.midi, 90), onMs);
      setTimeout(() => pianoSynth.stopNote(note.midi), offMs);
    }
    setTimeout(() => setState("idle"), lastEnd + 150);
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
        <button className="secondary-button whitespace-nowrap text-sm" disabled={!url.trim() || state === "fetching"} onClick={() => void fetchPreview()}>
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

function UploadDialog({ onDone, onCancel }: { onDone: (song: Song) => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [genre, setGenre] = useState<SongGenre>("other");
  const [state, setState] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);

  const pick = (picked: File | null) => {
    setFile(picked);
    if (picked && !title) setTitle(picked.name.replace(/\.midi?$/i, ""));
  };

  const submit = async () => {
    if (!file || !title.trim()) return;
    setState("uploading");
    setError(null);
    try {
      onDone(await uploadSong(file, { title: title.trim(), artist: artist.trim() || "Unknown", genre }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setState("idle");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <section aria-label="Upload MIDI" className="card space-y-3 p-4">
      <h2 className="text-sm font-semibold">Upload your own MIDI</h2>
      <input
        type="file"
        accept=".mid,.midi,audio/midi"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-felt-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-felt-700 dark:text-slate-300 dark:file:bg-felt-900/40 dark:file:text-felt-300"
      />
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
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" disabled={!file || !title.trim() || state === "uploading"} onClick={() => void submit()}>
          {state === "uploading" ? "Uploading…" : "Upload"}
        </button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function EditSongRow({ song, onSaved, onCancel }: { song: Song; onSaved: (song: Song) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState<SongGenre>(song.genre);
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) return;
    setState("saving");
    setError(null);
    try {
      onSaved(await updateSong(song.id, { title: title.trim(), artist: artist.trim() || "Unknown", genre }));
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
      <button className="primary-button px-2 py-1 text-xs" disabled={!title.trim() || state === "saving"} onClick={() => void save()}>
        {state === "saving" ? "Saving…" : "Save"}
      </button>
      <button className="secondary-button px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>
      {error && <p role="alert" className="w-full text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </li>
  );
}

export default function SongBrowserPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [bests, setBests] = useState<Record<string, { score: number; accuracy: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState<SongGenre | "all">("all");
  const [difficulty, setDifficulty] = useState<number | 0>(0);
  const [sort, setSort] = useState<"title" | "artist" | "difficulty" | "duration">("artist");
  const [uploading, setUploading] = useState<"file" | "url" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load songs"));
    getMyPlayAlongAttempts()
      .then((response) => setBests(response.bests))
      .catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    if (!songs) return null;
    const query = search.trim().toLowerCase();
    const filtered = songs.filter(
      (song) =>
        (genre === "all" || song.genre === genre) &&
        (difficulty === 0 || song.difficulty === difficulty) &&
        (!query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)),
    );
    const sorted = [...filtered];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "artist") sorted.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    if (sort === "difficulty") sorted.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
    if (sort === "duration") sorted.sort((a, b) => a.duration_sec - b.duration_sec);
    return sorted;
  }, [songs, search, genre, difficulty, sort]);

  const removeSong = async (song: Song) => {
    if (!window.confirm(`Delete your upload "${song.title}"?`)) return;
    await deleteSong(song.id);
    setSongs((current) => current?.filter((row) => row.id !== song.id) ?? null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Play along</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick a song, watch the notes fall, play them as they land.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "file" ? null : "file")); }}>
            Upload MIDI
          </button>
          <button className="secondary-button text-sm" onClick={() => { setUploading((v) => (v === "url" ? null : "url")); }}>
            Import from URL
          </button>
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search title or artist…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56 rounded-md border border-slate-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-slate-600"
        />
        <div className="flex gap-1">
          {GENRES.map((item) => (
            <button
              key={item.value}
              onClick={() => setGenre(item.value)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                genre === item.value
                  ? "bg-felt-50 font-medium text-felt-700 dark:bg-felt-900/40 dark:text-felt-300"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Difficulty filter"
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          className="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
        >
          <option value={0}>Any difficulty</option>
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>Difficulty {level}</option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-md border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-600"
        >
          <option value="artist">By artist</option>
          <option value="title">By title</option>
          <option value="difficulty">Easiest first</option>
          <option value="duration">Shortest first</option>
        </select>
        {visible && <span className="text-xs text-slate-400">{visible.length} songs</span>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!songs && !error && <p className="text-sm text-slate-500">Loading library…</p>}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.map((song) => {
          const best = bests[song.id];
          if (editingId === song.id) {
            return (
              <EditSongRow
                key={song.id}
                song={song}
                onSaved={(updated) => {
                  setSongs((current) => current?.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)) ?? null);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <li key={song.id}>
              <Link
                to={`/play/${song.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ivory-50 dark:hover:bg-slate-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-xs text-slate-500">{song.artist}</p>
                </div>
                {song.mine && (
                  <>
                    <button
                      onClick={(e) => { e.preventDefault(); setEditingId(song.id); }}
                      className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); void removeSong(song); }}
                      className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                    >
                      Delete
                    </button>
                  </>
                )}
                <span className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-xs capitalize text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400">
                  {song.genre}
                </span>
                <DifficultyDots level={song.difficulty} />
                <span className="w-10 text-right text-xs tabular-nums text-slate-500">{formatDuration(song.duration_sec)}</span>
                <span className="w-14 text-right text-xs tabular-nums">
                  {best ? (
                    <span className="font-medium text-brass-600 dark:text-brass-400">★ {Math.round(best.score)}</span>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {visible && visible.length === 0 && <p className="text-sm text-slate-500">No songs match those filters.</p>}
    </div>
  );
}
