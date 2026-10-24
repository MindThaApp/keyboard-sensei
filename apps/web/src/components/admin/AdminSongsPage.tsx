import { useEffect, useMemo, useState } from "react";
import { adminUpdateSong, deleteSong, getSongs, type Song, type SongGenre } from "../../services/api";
import AdminNav from "./AdminNav";
import SongDownloadButtons from "../settings/SongDownloadButtons";

const GENRES: SongGenre[] = ["classical", "pop", "film", "game", "jazz", "other"];

function EditRow({ song, onSaved, onCancel }: { song: Song; onSaved: (song: Song) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState<SongGenre>(song.genre);
  const [difficulty, setDifficulty] = useState(song.difficulty);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      onSaved(await adminUpdateSong(song.id, { title, artist, genre, difficulty }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-600";
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input aria-label="Title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input aria-label="Artist" className={field} value={artist} onChange={(e) => setArtist(e.target.value)} />
        <select aria-label="Genre" className={field} value={genre} onChange={(e) => setGenre(e.target.value as SongGenre)}>
          {GENRES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select aria-label="Difficulty" className={field} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((level) => <option key={level} value={level}>difficulty {level}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-xs" onClick={() => void save()}>Save</button>
        <button className="secondary-button text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function AdminSongsPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load songs"));
  }, []);

  const visible = useMemo(() => {
    if (!songs) return null;
    const query = search.trim().toLowerCase();
    return songs.filter((song) => !query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query));
  }, [songs, search]);

  const remove = async (song: Song) => {
    if (!window.confirm(`Delete "${song.title}" (${song.artist}) from the library?`)) return;
    try {
      await deleteSong(song.id);
      setSongs((current) => current?.filter((row) => row.id !== song.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminNav />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">Songs</h1>
        <input
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto w-56 rounded-md border border-slate-300 bg-transparent px-2.5 py-1.5 text-sm dark:border-slate-600"
        />
        {visible && <span className="text-xs text-slate-400">{visible.length} songs</span>}
      </div>
      <p className="text-sm text-slate-500">
        Upload happens on the Play page (uploads land as private user songs; seeded library comes from the fetch script).
      </p>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.map((song) => (
          <li key={song.id} className="px-4 py-2">
            {editing === song.id ? (
              <EditRow
                song={song}
                onSaved={(updated) => {
                  setSongs((current) => current?.map((row) => (row.id === song.id ? { ...row, ...updated } : row)) ?? null);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                  <p className="truncate text-xs text-slate-500">{song.artist} · {song.genre} · d{song.difficulty} · {song.content_rights}</p>
                </div>
                <SongDownloadButtons song={song} />
                <button className="secondary-button text-xs" onClick={() => setEditing(song.id)}>Edit</button>
                <button
                  className="rounded px-1.5 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30"
                  onClick={() => void remove(song)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
