import type { PlayAlongAttemptSummary, Song, SongGenre } from "../services/api";

/** Filtering, sorting, paging and shelves for the song list on /play and in Settings → Library. */

export type GenreFilter = SongGenre | "all";
export type SourceFilter = "all" | "library" | "uploads" | "recordings";
export type SortKey = "difficulty" | "title" | "artist" | "duration";

export interface SongFilters {
  query: string;
  genre: GenreFilter;
  /** 0 = any difficulty, else 1-5. */
  difficulty: number;
  source: SourceFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: SongFilters = {
  query: "",
  genre: "all",
  difficulty: 0,
  source: "all",
  // Default to easiest-first so a new player isn't staring at Rachmaninoff on first load.
  sort: "difficulty",
};

export const GENRE_OPTIONS: { value: GenreFilter; label: string }[] = [
  { value: "all", label: "All genres" },
  { value: "classical", label: "Classical" },
  { value: "pop", label: "Pop" },
  { value: "film", label: "Film" },
  { value: "game", label: "Game" },
  { value: "jazz", label: "Jazz / Ragtime" },
  { value: "other", label: "Other" },
];

export const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "library", label: "Song library" },
  { value: "uploads", label: "My uploads" },
  { value: "recordings", label: "My recordings" },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "difficulty", label: "Easiest first" },
  { value: "duration", label: "Shortest first" },
  { value: "title", label: "Title A–Z" },
  { value: "artist", label: "Artist A–Z" },
];

export const DIFFICULTY_LABELS = ["Beginner", "Easy", "Intermediate", "Advanced", "Expert"] as const;

export const difficultyLabel = (level: number): string => DIFFICULTY_LABELS[Math.min(5, Math.max(1, level)) - 1]!;

export const matchesSource = (song: Song, source: SourceFilter): boolean => {
  if (source === "recordings") return song.mine && song.content_rights === "user-recording";
  if (source === "uploads") return song.mine && (song.content_rights === "user-upload" || song.content_rights === "user-import-url");
  if (source === "library") return !song.mine;
  return true;
};

/**
 * m:ss. Rounds the total first so 59.6s reads "1:00", not "0:60" — and never
 * rounds the minutes (the player used to show 0:44 as "1:44").
 */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const byTitle = (a: Song, b: Song) => a.title.localeCompare(b.title);

/**
 * "Easiest first": difficulty level, then fewer notes to learn (which folds
 * in both density and length), then title. Title alone used to decide ties,
 * so a leading digit ("13Mai…") floated a 10-minute piece to the top.
 */
export const compareEasiest = (a: Song, b: Song): number =>
  a.difficulty - b.difficulty || a.note_count - b.note_count || byTitle(a, b);

export function sortSongs(songs: Song[], sort: SortKey): Song[] {
  const sorted = [...songs];
  if (sort === "difficulty") sorted.sort(compareEasiest);
  if (sort === "title") sorted.sort(byTitle);
  if (sort === "artist") sorted.sort((a, b) => a.artist.localeCompare(b.artist) || byTitle(a, b));
  if (sort === "duration") sorted.sort((a, b) => a.duration_sec - b.duration_sec || byTitle(a, b));
  return sorted;
}

export function filterSongs(songs: Song[], filters: SongFilters): Song[] {
  const query = filters.query.trim().toLowerCase();
  return songs.filter(
    (song) =>
      (filters.genre === "all" || song.genre === filters.genre) &&
      matchesSource(song, filters.source) &&
      (filters.difficulty === 0 || song.difficulty === filters.difficulty) &&
      (!query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query)),
  );
}

export const hasActiveFilters = (filters: SongFilters): boolean =>
  filters.query.trim() !== "" || filters.genre !== "all" || filters.difficulty !== 0 || filters.source !== "all";

export interface Page<T> {
  items: T[];
  /** 1-based, clamped to [1, pageCount]. */
  page: number;
  pageCount: number;
  /** 1-based index of the first item shown (0 when empty). */
  from: number;
  to: number;
  total: number;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(pageCount, Math.max(1, Math.floor(page) || 1));
  const start = (current - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    page: current,
    pageCount,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
    total: items.length,
  };
}

/** URL <-> filters, so a filtered/paged list survives opening a song and coming back. */
export function filtersFromParams(params: URLSearchParams): SongFilters {
  const genre = params.get("genre");
  const source = params.get("source");
  const sort = params.get("sort");
  const difficulty = Number(params.get("difficulty"));
  return {
    query: params.get("q") ?? "",
    genre: GENRE_OPTIONS.some((option) => option.value === genre) ? (genre as GenreFilter) : DEFAULT_FILTERS.genre,
    source: SOURCE_OPTIONS.some((option) => option.value === source) ? (source as SourceFilter) : DEFAULT_FILTERS.source,
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? (sort as SortKey) : DEFAULT_FILTERS.sort,
    difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : 0,
  };
}

/** Only non-default values are written, so the bare /play URL stays clean. */
export function filtersToParams(filters: SongFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.genre !== DEFAULT_FILTERS.genre) params.set("genre", filters.genre);
  if (filters.difficulty !== 0) params.set("difficulty", String(filters.difficulty));
  if (filters.source !== DEFAULT_FILTERS.source) params.set("source", filters.source);
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  return params;
}

export interface Shelf {
  id: "recent" | "beginner" | "essentials" | "uploads";
  title: string;
  songs: Song[];
}

const SHELF_LIMIT = 20;

/**
 * Curated rows above the full list. A shelf with no songs is omitted, so the
 * "Essentials" shelf is invisible until the API tags songs with
 * `collection: "essentials"` — no placeholder.
 */
export function buildShelves(songs: Song[], recentAttempts: Pick<PlayAlongAttemptSummary, "song_id">[]): Shelf[] {
  const byId = new Map(songs.map((song) => [song.id, song]));
  const recentIds = [...new Set(recentAttempts.map((attempt) => attempt.song_id))];
  const recent = recentIds.map((id) => byId.get(id)).filter((song): song is Song => song !== undefined);

  const shelves: Shelf[] = [
    { id: "recent", title: "Recently played", songs: recent },
    { id: "beginner", title: "Beginner pack", songs: sortSongs(songs.filter((song) => song.collection === "beginner"), "difficulty") },
    { id: "essentials", title: "Essentials", songs: sortSongs(songs.filter((song) => song.collection === "essentials"), "difficulty") },
    { id: "uploads", title: "Your uploads", songs: songs.filter((song) => song.mine) },
  ];
  return shelves
    .map((shelf) => ({ ...shelf, songs: shelf.songs.slice(0, SHELF_LIMIT) }))
    .filter((shelf) => shelf.songs.length > 0);
}
