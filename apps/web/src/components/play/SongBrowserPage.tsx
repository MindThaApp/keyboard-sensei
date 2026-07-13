import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getMyPlayAlongAttempts, getSongs, type Song, type SongGenre } from "../../services/api";

const GENRES: { value: SongGenre | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "classical", label: "Classical" },
  { value: "pop", label: "Pop" },
  { value: "film", label: "Film" },
  { value: "game", label: "Game" },
  { value: "jazz", label: "Jazz / Ragtime" },
  { value: "other", label: "Other" },
];

type SourceFilter = "all" | "recordings" | "uploads" | "library";

const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "recordings", label: "My recordings" },
  { value: "uploads", label: "My uploads" },
  { value: "library", label: "Library" },
];

const matchesSource = (song: Song, source: SourceFilter): boolean => {
  if (source === "recordings") return song.mine && song.content_rights === "user-recording";
  if (source === "uploads") return song.mine && (song.content_rights === "user-upload" || song.content_rights === "user-import-url");
  if (source === "library") return !song.mine;
  return true;
};

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/**
 * Whether the sheet music is REAL engraved notation shipped with the song
 * (MusicXML, from an archive import) or reconstructed from the MIDI. The API
 * returns notation_path as a presence indicator only ("available" | null) — it
 * never leaks the real filesystem path.
 */
function NotationBadge({ engraved }: { engraved: boolean }) {
  return engraved ? (
    <span
      title="Ships with real engraved sheet music (MusicXML) — what you see is the published score"
      className="hidden shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 sm:inline dark:bg-emerald-900/40 dark:text-emerald-300"
    >
      Engraved
    </span>
  ) : (
    <span
      title="Sheet music is reconstructed from the MIDI — accurate pitches and rhythm, but not a published engraving"
      className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline dark:bg-slate-800 dark:text-slate-400"
    >
      Generated
    </span>
  );
}

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

export default function SongBrowserPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [bests, setBests] = useState<Record<string, { score: number; accuracy: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState<SongGenre | "all">("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [difficulty, setDifficulty] = useState<number | 0>(0);
  // 327 songs including 20 beginner tunes at difficulty 1-2 -- default to
  // easiest-first so a new player isn't staring at Rachmaninoff on first load.
  const [sort, setSort] = useState<"difficulty" | "title" | "artist" | "duration">("difficulty");

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
        matchesSource(song, source) &&
        (difficulty === 0 || song.difficulty === difficulty) &&
        (!query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)),
    );
    const sorted = [...filtered];
    if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "artist") sorted.sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    if (sort === "difficulty") sorted.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title));
    if (sort === "duration") sorted.sort((a, b) => a.duration_sec - b.duration_sec);
    return sorted;
  }, [songs, search, genre, source, difficulty, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Play along</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick a song, watch the notes fall, play them as they land.
          </p>
        </div>
        <Link to="/settings?tab=library" className="ml-auto text-sm text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          Manage library →
        </Link>
      </div>

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
        <div className="flex gap-1">
          {SOURCES.map((item) => (
            <button
              key={item.value}
              onClick={() => setSource(item.value)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                source === item.value
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
          <option value="difficulty">Easiest first</option>
          <option value="artist">By artist</option>
          <option value="title">By title</option>
          <option value="duration">Shortest first</option>
        </select>
        {visible && <span className="text-xs text-slate-400">{visible.length} songs</span>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!songs && !error && <p className="text-sm text-slate-500">Loading library…</p>}

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {visible?.map((song) => {
          const best = bests[song.id];
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
                {song.content_rights === "archive-import" && <ArchiveBadge />}
                {song.content_rights === "user-recording" && <RecordingBadge />}
                <NotationBadge engraved={song.notation_path !== null} />
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
