import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { suggestWorks, type LibraryFacets, type LibrarySuggestion } from "../../services/api";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { Button, SegmentedControl, Toggle } from "../ui";
import {
  DIFFICULTY_LABELS,
  DURATION_OPTIONS,
  GENRE_OPTIONS,
  HANDS_OPTIONS,
  LEVEL_HINTS,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  WORK_SORT_OPTIONS,
  activeWorkFilterCount,
  facetLabel,
  levelHint,
  type GenreFilter,
  type SongFilters,
  type SortKey,
  type SourceFilter,
  type WorkFilters,
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

/* ------------------------------------------------------------------------------------------
 * The catalogue (Works) filter bar: search with suggestions, level chips, filters, sort, unrated.
 * ---------------------------------------------------------------------------------------- */

const FIELD_CLASS =
  "min-h-[44px] w-full rounded-control border-0 bg-fill px-3 text-[16px] text-label focus-visible:outline focus-visible:outline-2 focus-visible:outline-tint";

const SUGGEST_DEBOUNCE_MS = 150;
const COMMIT_DEBOUNCE_MS = 250;

interface SearchBoxProps {
  /** The committed query (from the URL). */
  value: string;
  onCommit: (query: string) => void;
}

/**
 * Search box with a suggestions list (titles, composers, aliases). The text is committed to the
 * URL shortly after typing stops, or at once on Enter or when a suggestion is picked.
 */
export function WorkSearchBox({ value, onCommit }: SearchBoxProps) {
  const [text, setText] = useState(value);
  const [suggestions, setSuggestions] = useState<LibrarySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastCommitted = useRef(value);

  // Follow the URL when something else changes it ("Clear filters", Back).
  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      suggestWorks(query, 6, controller.signal)
        .then((response) => setSuggestions(response.suggestions))
        .catch(() => undefined);
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  useEffect(() => () => clearTimeout(commitTimer.current), []);

  const commit = (next: string) => {
    clearTimeout(commitTimer.current);
    lastCommitted.current = next;
    onCommit(next);
  };

  const change = (next: string) => {
    setText(next);
    setOpen(true);
    setActive(-1);
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => commit(next), COMMIT_DEBOUNCE_MS);
  };

  const pick = (suggestion: LibrarySuggestion) => {
    setText(suggestion.text);
    setOpen(false);
    setActive(-1);
    commit(suggestion.text);
  };

  const showList = open && suggestions.length > 0 && text.trim().length >= 2;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && showList) {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && showList) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = showList ? suggestions[active] : undefined;
      if (chosen) pick(chosen);
      else {
        setOpen(false);
        commit(text);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <label>
        <span className="sr-only">Search songs, composers, nicknames</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Songs, composers…"
          value={text}
          onChange={(event) => change(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className={`${FIELD_CLASS} rounded-pill px-4`}
        />
      </label>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[60vh] overflow-auto rounded-group bg-cell py-1 shadow-[var(--shadow-2)]"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}-${suggestion.id}-${suggestion.text}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(suggestion);
              }}
              className={`flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-4 text-body text-label ${index === active ? "bg-fill" : ""}`}
            >
              <span className="min-w-0 truncate">{suggestion.text}</span>
              <span className="shrink-0 truncate text-footnote text-label-2a">{suggestion.detail ?? suggestion.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface WorkFilterBarProps {
  filters: WorkFilters;
  facets: LibraryFacets | null;
  onChange: (next: WorkFilters) => void;
  /** e.g. "42 songs"; a live region so filtering is announced. */
  summary?: string;
}

const LEVEL_OPTIONS = [
  { value: 0, label: "Any" },
  ...LEVEL_HINTS.map((item) => ({ value: item.level, label: String(item.level) })),
];

/** Search, level chips, the filter set (collapsed behind a button on a phone), sort and Show unrated. */
export function WorkFilterBar({ filters, facets, onChange, summary }: WorkFilterBarProps) {
  const { device } = useDeviceClass();
  const phone = device === "phone";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();
  const set = <K extends keyof WorkFilters>(key: K, value: WorkFilters[K]) => onChange({ ...filters, [key]: value });
  const count = activeWorkFilterCount(filters);
  const showPanel = !phone || filtersOpen;
  const tags = facets?.tags ?? [];
  const hint = filters.level ? levelHint(filters.level) : null;
  const unratedToggle = (
    <Toggle
      label="Show unrated"
      description={phone ? "Songs nobody has checked against the score yet" : undefined}
      checked={filters.unrated}
      onChange={(unrated) => set("unrated", unrated)}
      className="min-h-[44px] !w-auto gap-3"
    />
  );

  return (
    <div className="space-y-3" role="search" aria-label="Find a song">
      <WorkSearchBox value={filters.query} onCommit={(query) => set("query", query)} />

      <div className="space-y-1">
        <SegmentedControl<number>
          aria-label="Level"
          block
          className="[&_.ks-seg\_\_item]:min-w-0 [&_.ks-seg\_\_item]:px-1"
          options={LEVEL_OPTIONS}
          value={filters.level}
          onChange={(level) => set("level", level)}
        />
        <p className="px-1 text-footnote text-label-2a" aria-live="polite">
          {hint ? `Level ${hint.level} · ${hint.name}: ${hint.hint.toLowerCase()}` : "Level 1 is a first tune, level 5 is concert repertoire."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {phone && (
          <Button
            variant="gray"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            Filters{count > 0 ? ` (${count})` : ""}
          </Button>
        )}
        <label className={phone ? "min-w-0 flex-1" : "w-44"}>
          <span className="sr-only">Sort</span>
          <select value={filters.sort} onChange={(event) => set("sort", event.target.value as WorkFilters["sort"])} className={FIELD_CLASS}>
            {WORK_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Sort: {option.label}
              </option>
            ))}
          </select>
        </label>
        {!phone && unratedToggle}
      </div>

      {showPanel && (
        <div id={panelId} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:[&>label]:w-44">
          <label>
            <span className="sr-only">Genre</span>
            <select value={filters.genre} onChange={(event) => set("genre", event.target.value)} className={FIELD_CLASS}>
              <option value="">Any genre</option>
              {facets?.genres.map((genre) => (
                <option key={genre.value} value={genre.value}>
                  {facetLabel(genre.value)} ({genre.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Era</span>
            <select value={filters.era} onChange={(event) => set("era", event.target.value)} className={FIELD_CLASS}>
              <option value="">Any era</option>
              {facets?.eras.map((era) => (
                <option key={era.value} value={era.value}>
                  {facetLabel(era.value)} ({era.count})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Hands</span>
            <select value={filters.hands} onChange={(event) => set("hands", event.target.value as WorkFilters["hands"])} className={FIELD_CLASS}>
              {HANDS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Length</span>
            <select value={filters.duration} onChange={(event) => set("duration", event.target.value as WorkFilters["duration"])} className={FIELD_CLASS}>
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {tags.length > 1 && (
            <label>
              <span className="sr-only">Collection</span>
              <select value={filters.tag} onChange={(event) => set("tag", event.target.value)} className={FIELD_CLASS}>
                <option value="">Any collection</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.label} ({tag.count})
                  </option>
                ))}
              </select>
            </label>
          )}
          {phone && <div className="col-span-2">{unratedToggle}</div>}
        </div>
      )}

      {summary && (
        <p aria-live="polite" className="px-1 text-footnote text-label-2a">
          {summary}
        </p>
      )}
    </div>
  );
}
