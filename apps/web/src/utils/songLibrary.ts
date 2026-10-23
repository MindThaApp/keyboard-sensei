import type {
  LibraryFacets,
  PlayAlongAttemptSummary,
  Song,
  SongGenre,
  WorkDuration,
  WorkHands,
  WorkSort,
  WorksQuery,
  WorkSummary,
  WorkVersion,
} from "../services/api";

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
  id: "ready" | "recent" | "beginner" | "essentials" | "uploads";
  title: string;
  songs: Song[];
}

const SHELF_LIMIT = 20;

/**
 * Curated rows above the full list. A shelf with no songs is omitted, so the
 * "Essentials" shelf is invisible until the API tags songs with
 * `collection: "essentials"` — no placeholder.
 */
export function buildShelves(
  songs: Song[],
  recentAttempts: Pick<PlayAlongAttemptSummary, "song_id">[],
  /** Songs the course has unlocked ("Ready for you"), in the order the course reaches them. */
  readyIds: readonly string[] = [],
): Shelf[] {
  const byId = new Map(songs.map((song) => [song.id, song]));
  const pick = (ids: readonly string[]) => ids.map((id) => byId.get(id)).filter((song): song is Song => song !== undefined);
  const recent = pick([...new Set(recentAttempts.map((attempt) => attempt.song_id))]);

  const shelves: Shelf[] = [
    { id: "ready", title: "Ready for you", songs: pick(readyIds) },
    { id: "recent", title: "Recently played", songs: recent },
    { id: "beginner", title: "Beginner pack", songs: sortSongs(songs.filter((song) => song.collection === "beginner"), "difficulty") },
    { id: "essentials", title: "Essentials", songs: sortSongs(songs.filter((song) => song.collection === "essentials"), "difficulty") },
    { id: "uploads", title: "Your uploads", songs: songs.filter((song) => song.mine) },
  ];
  return shelves
    .map((shelf) => ({ ...shelf, songs: shelf.songs.slice(0, SHELF_LIMIT) }))
    .filter((shelf) => shelf.songs.length > 0);
}

/* ------------------------------------------------------------------------------------------
 * Works: the catalogue view of the library (one row per piece, versions inside it).
 * ---------------------------------------------------------------------------------------- */

export interface WorkFilters {
  query: string;
  /** 0 = any level, else 1-5. */
  level: number;
  genre: string;
  era: string;
  hands: "" | WorkHands;
  duration: "" | WorkDuration;
  /** A tag id from the facets, or "". */
  tag: string;
  sort: WorkSort;
  /** Include Unrated works (the API hides them by default). */
  unrated: boolean;
}

export const DEFAULT_WORK_FILTERS: WorkFilters = {
  query: "",
  level: 0,
  genre: "",
  era: "",
  hands: "",
  duration: "",
  tag: "",
  sort: "recommended",
  unrated: false,
};

export const WORK_SORT_OPTIONS: { value: WorkSort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "easiest", label: "Easiest first" },
  { value: "title", label: "Title A–Z" },
  { value: "featured", label: "Featured" },
];

export const HANDS_OPTIONS: { value: WorkFilters["hands"]; label: string }[] = [
  { value: "", label: "Any hands" },
  { value: "both", label: "Both hands" },
  { value: "right-hand-melody", label: "Right-hand tune" },
  { value: "single-line", label: "Single line" },
];

export const DURATION_OPTIONS: { value: WorkFilters["duration"]; label: string }[] = [
  { value: "", label: "Any length" },
  { value: "under-1", label: "Under 1 min" },
  { value: "1-3", label: "1–3 min" },
  { value: "3-6", label: "3–6 min" },
  { value: "over-6", label: "Over 6 min" },
];

/** Plain names for the catalogue's genre and era ids. Unknown ids fall back to a tidied id. */
const FACET_LABELS: Record<string, string> = {
  "classical-era": "Classical era",
  "early-20th-c": "Early 20th century",
  "hymn-carol": "Hymns and carols",
  childrens: "Children's",
};

export const facetLabel = (value: string): string =>
  FACET_LABELS[value] ?? value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());

/** Approximate grade hints; the API's own `grade_band` wins where a version has one. */
export const LEVEL_HINTS = [
  { level: 1, name: "Beginner", hint: "First tunes, simple rhythms" },
  { level: 2, name: "Easy", hint: "About grade 1" },
  { level: 3, name: "Intermediate", hint: "About grades 2–3" },
  { level: 4, name: "Advanced", hint: "About grades 4–5" },
  { level: 5, name: "Expert", hint: "Grade 6 and up" },
] as const;

export const levelHint = (level: number) => LEVEL_HINTS[Math.min(5, Math.max(1, level)) - 1]!;

const VERSION_LABELS: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", full: "Full" };

export const versionLabel = (version: Pick<WorkVersion, "arrangement_level">): string =>
  (version.arrangement_level && VERSION_LABELS[version.arrangement_level]) || "Original";

const parseChoice = <T extends string>(value: string | null, options: readonly { value: T }[], fallback: T): T =>
  options.some((option) => option.value === value) ? (value as T) : fallback;

export function workFiltersFromParams(params: URLSearchParams): WorkFilters {
  const level = Number(params.get("level"));
  return {
    query: params.get("q") ?? "",
    level: Number.isInteger(level) && level >= 1 && level <= 5 ? level : 0,
    genre: params.get("genre") ?? "",
    era: params.get("era") ?? "",
    hands: parseChoice(params.get("hands"), HANDS_OPTIONS, ""),
    duration: parseChoice(params.get("length"), DURATION_OPTIONS, ""),
    tag: params.get("tag") ?? "",
    sort: parseChoice(params.get("sort"), WORK_SORT_OPTIONS, "recommended"),
    unrated: params.get("unrated") === "1",
  };
}

/** Only non-default values are written, so the bare /practice URL stays clean. */
export function workFiltersToParams(filters: WorkFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.level) params.set("level", String(filters.level));
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.era) params.set("era", filters.era);
  if (filters.hands) params.set("hands", filters.hands);
  if (filters.duration) params.set("length", filters.duration);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.sort !== DEFAULT_WORK_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.unrated) params.set("unrated", "1");
  return params;
}

/** Filters that narrow the list (the sort and the unrated switch only reorder or widen it). */
export const activeWorkFilterCount = (filters: WorkFilters): number =>
  [filters.level, filters.genre, filters.era, filters.hands, filters.duration, filters.tag].filter(Boolean).length;

/** Shelves are for browsing; they step aside as soon as the player searches or filters. */
export const isBrowsing = (filters: WorkFilters): boolean =>
  filters.query.trim() === "" && activeWorkFilterCount(filters) === 0;

export function workFiltersToQuery(filters: WorkFilters): WorksQuery {
  return {
    q: filters.query,
    level: filters.level ? [filters.level] : undefined,
    genre: filters.genre ? [filters.genre] : undefined,
    era: filters.era ? [filters.era] : undefined,
    tags: filters.tag ? [filters.tag] : undefined,
    hands: filters.hands || undefined,
    duration: filters.duration || undefined,
    unrated: filters.unrated,
    sort: filters.sort === "recommended" ? undefined : filters.sort,
  };
}

/** The version a tap on the row opens: the easiest one in the work's best tier (the API's first). */
export const defaultVersion = (work: WorkSummary): WorkVersion | undefined => work.versions[0];

/** Best star count across a work's versions. */
export const workStars = (work: WorkSummary, stars: Record<string, { best: number }>): number =>
  work.versions.reduce((best, version) => Math.max(best, stars[version.id]?.best ?? 0), 0);

export const workBestScore = (work: WorkSummary, bests: Record<string, { score: number }>): number | undefined => {
  const scores = work.versions.map((version) => bests[version.id]?.score).filter((score): score is number => score !== undefined);
  return scores.length ? Math.max(...scores) : undefined;
};

export const levelLabel = (work: Pick<WorkSummary, "level_min" | "level_max">): string =>
  work.level_min === work.level_max ? `Level ${work.level_min}` : `Levels ${work.level_min}–${work.level_max}`;

/**
 * "Level 2 · Easy", or the version's own grade band when the catalogue has one. A piece that
 * spans several levels shows only the range: one version's band would misstate the others.
 */
export function levelChipText(work: WorkSummary): string {
  if (work.level_min !== work.level_max) return levelLabel(work);
  const grade = work.versions.find((version) => version.grade_band)?.grade_band;
  return `${levelLabel(work)} · ${grade ?? levelHint(work.level_min).name}`;
}

/** "Beethoven": the surname part of the sort name, which is what fits a phone row. */
export const composerShort = (composer: WorkSummary["composer"]): string =>
  composer ? (composer.sort_name.split(",")[0] ?? composer.name).trim() : "";

/** "Mozart · K. 545", for the second line of a row or card. */
export function workSubtitle(work: Pick<WorkSummary, "composer" | "catalogue" | "movement">): string {
  return [composerShort(work.composer), work.catalogue, work.movement].filter(Boolean).join(" · ");
}

/** Index of the first Unrated work in a list that mixes tiers, or -1. Used for the "Unrated" divider. */
export function firstUnratedIndex(works: Pick<WorkSummary, "best_tier">[]): number {
  const index = works.findIndex((work) => work.best_tier === "unrated");
  return index > 0 ? index : -1;
}

/** 15 November to 6 January. */
export function isChristmasSeason(date: Date): boolean {
  const month = date.getMonth();
  const day = date.getDate();
  return (month === 10 && day >= 15) || month === 11 || (month === 0 && day <= 6);
}

export interface WorkShelfDef {
  id: string;
  title: string;
  query: WorksQuery;
  /** Keep only works the catalogue has marked featured (otherwise the shelf would be arbitrary). */
  featuredOnly?: boolean;
  /** Christmas: shown in season, or under the Seasonal chip. */
  seasonal?: boolean;
  /** Whether the catalogue has anything for this shelf. */
  available: (facets: LibraryFacets) => boolean;
}

const hasTag = (id: string) => (facets: LibraryFacets) => facets.tags.some((tag) => tag.id === id);
const hasGenre = (value: string) => (facets: LibraryFacets) => facets.genres.some((genre) => genre.value === value);
const SHELF_SIZE = 12;

/** Catalogue shelves in display order. A shelf with no works is dropped. */
export const WORK_SHELVES: WorkShelfDef[] = [
  {
    id: "beginner-favourites",
    title: "Beginner favourites",
    query: { sort: "featured", tier: "verified", level: [1, 2], limit: SHELF_SIZE },
    available: () => true,
  },
  {
    id: "featured",
    title: "Featured",
    query: { sort: "featured", limit: SHELF_SIZE },
    featuredOnly: true,
    available: () => true,
  },
  {
    id: "christmas",
    title: "Christmas",
    query: { tags: ["christmas"], sort: "featured", limit: SHELF_SIZE },
    seasonal: true,
    available: hasTag("christmas"),
  },
  { id: "relaxing", title: "Relaxing", query: { tags: ["relaxing"], sort: "featured", limit: SHELF_SIZE }, available: hasTag("relaxing") },
  { id: "wedding", title: "Wedding", query: { tags: ["wedding"], sort: "featured", limit: SHELF_SIZE }, available: hasTag("wedding") },
  { id: "ragtime", title: "Ragtime", query: { genre: ["ragtime"], sort: "featured", limit: SHELF_SIZE }, available: hasGenre("ragtime") },
  { id: "folk", title: "Folk of the world", query: { genre: ["folk"], sort: "featured", limit: SHELF_SIZE }, available: hasGenre("folk") },
];

/** Shelves to request now: Christmas only in season or when the Seasonal chip is on. */
export function shelvesToLoad(facets: LibraryFacets, now: Date, seasonalOn: boolean): WorkShelfDef[] {
  return WORK_SHELVES.filter((shelf) => shelf.available(facets) && (!shelf.seasonal || seasonalOn || isChristmasSeason(now)));
}

/** True when the Seasonal chip has something to switch on out of season. */
export const hasSeasonalShelf = (facets: LibraryFacets, now: Date): boolean =>
  !isChristmasSeason(now) && WORK_SHELVES.some((shelf) => shelf.seasonal && shelf.available(facets));

const TIER_ORDER: Record<string, number> = { verified: 0, good: 1, unrated: 2, low: 3 };
const foldText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Songs that belong to no catalogue Work (the ADL library, archive imports, uploads), for the
 * "More songs" section under All songs: Good first, then Unrated, then Low. Low is for admins
 * only, as in the catalogue. Songs from a server that doesn't report tiers count as Unrated.
 * `query` matches title or artist, ignoring case and accents.
 */
export function moreSongs(songs: Song[], options: { isAdmin: boolean; query?: string }): Song[] {
  const query = foldText((options.query ?? "").trim());
  const tierOf = (song: Song) => song.quality_tier ?? "unrated";
  return songs
    .filter((song) => !song.work_id && (options.isAdmin || tierOf(song) !== "low"))
    .filter((song) => !query || foldText(song.title).includes(query) || foldText(song.artist).includes(query))
    .sort((a, b) => (TIER_ORDER[tierOf(a)] ?? 2) - (TIER_ORDER[tierOf(b)] ?? 2) || byTitle(a, b));
}

/** Songs the player added themselves (uploads, recordings, imports): "Your uploads". */
export const uploadedSongs = (songs: Song[]): Song[] => songs.filter((song) => song.mine).sort(byTitle);

/** Songs by id, in the order given, skipping ids that are not in the list. */
export function songsById(songs: Song[], ids: readonly string[]): Song[] {
  const byId = new Map(songs.map((song) => [song.id, song]));
  return ids.map((id) => byId.get(id)).filter((song): song is Song => song !== undefined);
}
