import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMyPlayAlongAttempts, getMySongStars, getSongs, type SongStars, type PlayAlongAttemptSummary, type Song } from "../../services/api";
import SongFilterBar from "../library/SongFilterBar";
import Pagination from "../library/Pagination";
import { StarRating } from "../progress/ProgressBits";
import {
  buildShelves,
  difficultyLabel,
  filterSongs,
  filtersFromParams,
  filtersToParams,
  formatDuration,
  hasActiveFilters,
  paginate,
  sortSongs,
  type Shelf,
  type SongFilters,
} from "../../utils/songLibrary";

const PAGE_SIZE = 25;

function DifficultyDots({ level }: { level: number }) {
  return (
    <span role="img" aria-label={`Difficulty ${level} of 5: ${difficultyLabel(level)}`} title={difficultyLabel(level)} className="inline-flex shrink-0 gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          className={`h-1.5 w-1.5 rounded-full ${dot <= level ? "bg-felt-500" : "bg-slate-300 dark:bg-slate-600"}`}
        />
      ))}
    </span>
  );
}

const BADGE = "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium";

/** Only things that tell you something about THIS song. (The old "Generated"
 *  badge was on every library row — it meant "sheet music reconstructed from
 *  the MIDI", which is simply the default — so only the exception is shown.) */
function SongBadges({ song }: { song: Song }) {
  return (
    <>
      {song.collection === "beginner" && (
        <span className={`${BADGE} bg-felt-50 text-felt-700 dark:bg-felt-900/40 dark:text-felt-300`}>Beginner pack</span>
      )}
      {song.notation_path !== null && (
        <span
          title="Ships with real engraved sheet music (MusicXML), not notation reconstructed from the MIDI"
          className={`${BADGE} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`}
        >
          Engraved score
        </span>
      )}
      {song.content_rights === "archive-import" && (
        <span
          title="Imported from the community archive; rights filtering is best-effort, not guaranteed"
          className={`${BADGE} bg-brass-100 text-brass-700 dark:bg-brass-700/30 dark:text-brass-300`}
        >
          From archive
        </span>
      )}
      {song.content_rights === "user-recording" && (
        <span className={`${BADGE} bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300`}>Recording</span>
      )}
    </>
  );
}

function BestScore({ score }: { score: number | undefined }) {
  if (score === undefined) return null;
  return (
    <span className="shrink-0 text-xs font-medium tabular-nums text-brass-700 dark:text-brass-300" title="Your best play-along score">
      <span aria-hidden="true">★ </span>
      <span className="sr-only">Your best score </span>
      {Math.round(score)}
    </span>
  );
}

function SongRow({ song, best, stars }: { song: Song; best: number | undefined; stars: number }) {
  return (
    <li>
      <Link
        to={`/play/${song.id}`}
        className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ivory-50 dark:hover:bg-slate-800/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{song.title}</p>
          <p className="truncate text-xs text-slate-600 dark:text-slate-300">
            {song.artist}
            <span className="hidden capitalize sm:inline"> · {song.genre}</span>
          </p>
        </div>
        <div className="hidden flex-wrap justify-end gap-1 md:flex">
          <SongBadges song={song} />
        </div>
        {stars > 0 && <StarRating stars={stars} className="text-sm" />}
        <BestScore score={best} />
        <DifficultyDots level={song.difficulty} />
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">
          <span className="sr-only">Length </span>
          {formatDuration(song.duration_sec)}
        </span>
      </Link>
    </li>
  );
}

function ShelfRow({ shelf, bests, stars }: { shelf: Shelf; bests: Record<string, { score: number }>; stars: Record<string, SongStars> }) {
  const headingId = `shelf-${shelf.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
        {shelf.title}
        <span aria-hidden="true" className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-300">{shelf.songs.length}</span>
      </h2>
      {/* `relative` matters: without a positioned ancestor, the absolutely
          positioned sr-only spans in off-screen cards escape the scroller and
          widen a phone's layout viewport (390px laid out as 651px). */}
      <ul className="relative -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {shelf.songs.map((song) => (
          <li key={song.id} className="w-40 shrink-0 snap-start sm:w-48">
            <Link
              to={`/play/${song.id}`}
              className="card flex h-full flex-col gap-1.5 p-3 transition-colors hover:border-felt-500"
            >
              <span className="line-clamp-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">{song.title}</span>
              <span className="truncate text-xs text-slate-600 dark:text-slate-300">{song.artist}</span>
              <span className="mt-auto flex items-center gap-2 pt-1">
                <DifficultyDots level={song.difficulty} />
                <span className="text-xs tabular-nums text-slate-600 dark:text-slate-300">{formatDuration(song.duration_sec)}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {(stars[song.id]?.best ?? 0) > 0 && <StarRating stars={stars[song.id]!.best} />}
                  <BestScore score={bests[song.id]?.score} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function SongBrowserPage() {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [bests, setBests] = useState<Record<string, { score: number; accuracy: number }>>({});
  const [recent, setRecent] = useState<PlayAlongAttemptSummary[]>([]);
  const [stars, setStars] = useState<Record<string, SongStars>>({});
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  // Filters and page live in the URL, so opening a song and pressing Back
  // returns to the same filtered page.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const requestedPage = Number(params.get("page") ?? "1");

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load songs"));
    getMyPlayAlongAttempts()
      .then((response) => {
        setBests(response.bests);
        setRecent(response.recent);
      })
      .catch(() => undefined);
    getMySongStars()
      .then((response) => {
        setStars(response.stars);
        setReadyIds(response.readyForYou.map((ready) => ready.songId));
      })
      .catch(() => undefined);
  }, []);

  const matching = useMemo(() => (songs ? sortSongs(filterSongs(songs, filters), filters.sort) : null), [songs, filters]);
  const page = useMemo(() => (matching ? paginate(matching, requestedPage, PAGE_SIZE) : null), [matching, requestedPage]);
  const shelves = useMemo(() => (songs ? buildShelves(songs, recent, readyIds) : []), [songs, recent, readyIds]);
  const showShelves = !hasActiveFilters(filters) && (page?.page ?? 1) === 1;

  const updateFilters = (next: SongFilters) => setParams(filtersToParams(next, 1), { replace: true });
  const goToPage = (next: number) => {
    setParams(filtersToParams(filters, next));
    listTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };

  const summary = page && songs
    ? page.total === 0
      ? "No songs match"
      : `Showing ${page.from}–${page.to} of ${page.total}${page.total !== songs.length ? ` matching (${songs.length} total)` : " songs"}`
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Play along</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Pick a song, watch the notes fall, play them as they land.
          </p>
        </div>
        <Link
          to="/settings?tab=library&from=play"
          state={{ returnTo: `/practice${params.toString() ? `?${params.toString()}` : ""}` }}
          className="ml-auto text-sm text-slate-600 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Manage library →
        </Link>
      </div>

      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {!songs && !error && <p className="text-sm text-slate-600 dark:text-slate-300">Loading library…</p>}

      {showShelves && shelves.map((shelf) => <ShelfRow key={shelf.id} shelf={shelf} bests={bests} stars={stars} />)}

      {songs && (
        <section aria-labelledby="all-songs" className="space-y-3">
          <div ref={listTopRef} className="scroll-mt-20">
            <h2 id="all-songs" className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">All songs</h2>
          </div>
          <SongFilterBar filters={filters} onChange={updateFilters} summary={summary} />
          {page && page.items.length > 0 && (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {page.items.map((song) => (
                <SongRow key={song.id} song={song} best={bests[song.id]?.score} stars={stars[song.id]?.best ?? 0} />
              ))}
            </ul>
          )}
          {page && page.total === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No songs match those filters.{" "}
              <button type="button" className="underline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </button>
            </p>
          )}
          {page && <Pagination page={page.page} pageCount={page.pageCount} onPageChange={goToPage} />}
        </section>
      )}
    </div>
  );
}
