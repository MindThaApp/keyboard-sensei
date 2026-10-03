import {
  DIFFICULTY_LABELS,
  GENRE_OPTIONS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  type GenreFilter,
  type SongFilters,
  type SortKey,
  type SourceFilter,
} from "../../utils/songLibrary";

const SELECT_CLASS =
  "min-h-[40px] w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

interface SongFilterBarProps {
  filters: SongFilters;
  onChange: (next: SongFilters) => void;
  /** e.g. "42 of 312 songs"; rendered as a live region so filtering is announced. */
  summary?: string;
  /** Settings → Library always lists by artist, so it hides the sort control. */
  showSort?: boolean;
}

/** One filter bar for the song list: search, genre, difficulty, source, sort. */
export default function SongFilterBar({ filters, onChange, summary, showSort = true }: SongFilterBarProps) {
  const set = <K extends keyof SongFilters>(key: K, value: SongFilters[K]) => onChange({ ...filters, [key]: value });

  return (
    <div className="space-y-2" role="search" aria-label="Filter songs">
      <div className={`grid grid-cols-2 gap-2 ${showSort ? "lg:grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(8rem,1fr))]" : "lg:grid-cols-[minmax(12rem,2fr)_repeat(3,minmax(8rem,1fr))]"}`}>
        <label className="col-span-2 lg:col-span-1">
          <span className="sr-only">Search title or artist</span>
          <input
            type="search"
            placeholder="Search title or artist…"
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            className={SELECT_CLASS}
          />
        </label>
        <label>
          <span className="sr-only">Genre</span>
          <select value={filters.genre} onChange={(e) => set("genre", e.target.value as GenreFilter)} className={SELECT_CLASS}>
            {GENRE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Difficulty</span>
          <select value={filters.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))} className={SELECT_CLASS}>
            <option value={0}>Any difficulty</option>
            {DIFFICULTY_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>{index + 1} · {label}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Source</span>
          <select value={filters.source} onChange={(e) => set("source", e.target.value as SourceFilter)} className={SELECT_CLASS}>
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {showSort && (
          <label>
            <span className="sr-only">Sort</span>
            <select value={filters.sort} onChange={(e) => set("sort", e.target.value as SortKey)} className={SELECT_CLASS}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>Sort: {option.label}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {summary && (
        <p aria-live="polite" className="text-xs text-slate-600 dark:text-slate-300">
          {summary}
        </p>
      )}
    </div>
  );
}
