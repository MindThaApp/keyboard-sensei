import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getLibraryFacets,
  getMyPlayAlongAttempts,
  getMySongStars,
  getSongs,
  getWorks,
  type LibraryFacets,
  type PlayAlongAttemptSummary,
  type Song,
  type SongStars,
  type WorkSummary,
} from "../../services/api";
import { useDeviceClass } from "../../contexts/AppearanceContext";
import { useAuth } from "../../contexts/AuthContext";
import { useServerConfig } from "../../services/serverConfig";
import { Button, Chip, EmptyState, ErrorState, Skeleton } from "../ui";
import { WorkFilterBar } from "../library/SongFilterBar";
import { ShelfCard, TierChip, WorkCard, WorkRow } from "../library/WorkRow";
import {
  activeWorkFilterCount,
  firstUnratedIndex,
  formatDuration,
  hasSeasonalShelf,
  isBrowsing,
  moreSongs,
  shelvesToLoad,
  songsById,
  uploadedSongs,
  workFiltersFromParams,
  workFiltersToParams,
  workFiltersToQuery,
  type WorkFilters,
  type WorkShelfDef,
} from "../../utils/songLibrary";

const PAGE_SIZE = 30;
const MORE_PAGE_SIZE = 30;

interface ShelfProps {
  id: string;
  title: string;
  children: ReactNode;
}

/** A titled row of tiles that scrolls sideways inside itself, never the page. */
function Shelf({ id, title, children }: ShelfProps) {
  const { device } = useDeviceClass();
  const headingId = `shelf-${id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-title3 text-label">
        {title}
      </h2>
      {/* `relative` matters: without a positioned ancestor, the absolutely positioned sr-only
          spans in off-screen tiles escape the scroller and widen a phone's layout viewport. */}
      <ul
        className="relative flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-device={device}
      >
        {children}
      </ul>
    </section>
  );
}

function ShelfItem({ children }: { children: ReactNode }) {
  const { device } = useDeviceClass();
  return <li className={`shrink-0 snap-start ${device === "phone" ? "w-[148px]" : "w-[176px]"}`}>{children}</li>;
}

const songCard = (song: Song, stars: Record<string, SongStars>) => (
  <ShelfItem key={song.id}>
    <ShelfCard
      to={`/play/${song.id}`}
      title={song.title}
      subtitle={song.artist}
      durationSec={song.duration_sec}
      stars={stars[song.id]?.best ?? 0}
    />
  </ShelfItem>
);

const workCard = (work: WorkSummary, stars: Record<string, SongStars>) => (
  <ShelfItem key={work.id}>
    <WorkCard work={work} stars={stars} />
  </ShelfItem>
);

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} height={76} radius={16} />
      ))}
    </div>
  );
}

export default function SongBrowserPage() {
  const { device } = useDeviceClass();
  const [songs, setSongs] = useState<Song[]>([]);
  const [bests, setBests] = useState<Record<string, { score: number; accuracy: number }>>({});
  const [recent, setRecent] = useState<PlayAlongAttemptSummary[]>([]);
  const [stars, setStars] = useState<Record<string, SongStars>>({});
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const [facets, setFacets] = useState<LibraryFacets | null>(null);
  const [shelves, setShelves] = useState<Record<string, WorkSummary[]>>({});
  const [seasonalOn, setSeasonalOn] = useState(false);

  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [moreShown, setMoreShown] = useState(MORE_PAGE_SIZE);
  const { user } = useAuth();
  const serverConfig = useServerConfig();

  // Filters live in the URL, so opening a song and pressing Back returns to the same list.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => workFiltersFromParams(params), [params]);
  const updateFilters = (next: WorkFilters) => setParams(workFiltersToParams(next), { replace: true });
  const browsing = isBrowsing(filters);

  useEffect(() => {
    getSongs()
      .then((response) => setSongs(response.songs))
      .catch(() => undefined);
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
    getLibraryFacets()
      .then(setFacets)
      .catch(() => undefined);
  }, []);

  // Catalogue shelves: one request each, once the facets say which have content.
  const now = useMemo(() => new Date(), []);
  const shelfDefs = useMemo(() => (facets ? shelvesToLoad(facets, now, seasonalOn) : []), [facets, now, seasonalOn]);
  useEffect(() => {
    const missing = shelfDefs.filter((shelf) => shelves[shelf.id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map((shelf) =>
        getWorks(shelf.query)
          .then((response) => [shelf.id, shelf.featuredOnly ? response.works.filter((work) => work.featured_rank !== null) : response.works] as const)
          .catch(() => [shelf.id, [] as WorkSummary[]] as const),
      ),
    ).then((entries) => {
      if (!cancelled) setShelves((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [shelfDefs, shelves]);

  // The "All songs" list: restarts on every filter change, appends with the cursor.
  const queryKey = JSON.stringify(workFiltersToQuery(filters));
  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    getWorks({ ...workFiltersToQuery(filters), limit: PAGE_SIZE }, controller.signal)
      .then((response) => {
        setWorks(response.works);
        setTotal(response.total);
        setNextCursor(response.next_cursor);
        setListState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setListState("error");
      });
    return () => controller.abort();
    // `filters` is captured through `queryKey`, which changes exactly when the request would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadKey]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    getWorks({ ...workFiltersToQuery(filters), limit: PAGE_SIZE, cursor: nextCursor })
      .then((response) => {
        setWorks((current) => [...current, ...response.works]);
        setNextCursor(response.next_cursor);
      })
      .catch(() => setListState("error"))
      .finally(() => setLoadingMore(false));
  }, [filters, loadingMore, nextCursor]);

  const songShelves = useMemo(() => {
    const recentIds = [...new Set(recent.map((attempt) => attempt.song_id))];
    return {
      ready: songsById(songs, readyIds),
      recent: songsById(songs, recentIds),
      uploads: uploadedSongs(songs),
    };
  }, [songs, readyIds, recent]);

  // Songs with no catalogue Work (the ADL library, imports, uploads) stay reachable, below the
  // curated list. A public deployment never serves them, and the narrowing filters only apply
  // to catalogue Works, so the section steps aside for those too.
  const showMore = serverConfig !== null && !serverConfig.publicCatalogue && activeWorkFilterCount(filters) === 0;
  const extraSongs = useMemo(
    () => (showMore ? moreSongs(songs, { isAdmin: user?.role === "admin", query: filters.query }) : []),
    [showMore, songs, user?.role, filters.query],
  );
  useEffect(() => setMoreShown(MORE_PAGE_SIZE), [filters.query]);

  const unratedAt = filters.unrated ? firstUnratedIndex(works) : -1;
  const summary = listState === "ready" && total > 0 ? `${total} ${total === 1 ? "song" : "songs"}` : undefined;

  const workShelf = (shelf: WorkShelfDef) => {
    const items = shelves[shelf.id];
    if (!items || items.length === 0) return null;
    return (
      <Shelf key={shelf.id} id={shelf.id} title={shelf.title}>
        {items.map((work) => workCard(work, stars))}
      </Shelf>
    );
  };

  return (
    <div className={device === "phone" ? "space-y-5" : "space-y-6"}>
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-large-title text-label">Songs</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link to="/import" className="ks-btn ks-btn--filled ks-btn--md">
            <span className="ks-btn__label">Add a song</span>
          </Link>
          <Link
            to="/settings?tab=library&from=play"
            state={{ returnTo: `/practice${params.toString() ? `?${params.toString()}` : ""}` }}
            className="min-h-[44px] content-center px-2 text-subhead text-label-2a underline"
          >
            Manage library
          </Link>
        </div>
      </div>

      <WorkFilterBar filters={filters} facets={facets} onChange={updateFilters} />

      {browsing && (
        <div className="space-y-5">
          {songShelves.ready.length > 0 && (
            <Shelf id="ready" title="Ready for you">
              {songShelves.ready.slice(0, 20).map((song) => songCard(song, stars))}
            </Shelf>
          )}
          {songShelves.recent.length > 0 && (
            <Shelf id="continue" title="Continue">
              {songShelves.recent.slice(0, 20).map((song) => songCard(song, stars))}
            </Shelf>
          )}
          {shelfDefs.map(workShelf)}
          {facets && hasSeasonalShelf(facets, now) && (
            <Button variant={seasonalOn ? "tinted" : "gray"} size="sm" aria-pressed={seasonalOn} onClick={() => setSeasonalOn((on) => !on)}>
              Seasonal
            </Button>
          )}
          {songShelves.uploads.length > 0 && (
            <Shelf id="uploads" title="Your uploads">
              {songShelves.uploads.slice(0, 20).map((song) => songCard(song, stars))}
            </Shelf>
          )}
        </div>
      )}

      <section aria-labelledby="all-songs" className="space-y-3">
        <h2 id="all-songs" className="text-title3 text-label">
          {browsing ? "All songs" : "Results"}
          {summary && <span className="ml-2 text-subhead font-normal text-label-2a">{summary}</span>}
        </h2>
        {listState === "loading" && works.length === 0 && <ListSkeleton />}
        {listState === "error" && (
          <ErrorState
            title="Couldn't load songs"
            message="Check your connection and try again."
            action={<Button variant="tinted" onClick={() => setReloadKey((key) => key + 1)}>Try again</Button>}
          />
        )}
        {listState === "ready" && works.length === 0 && (
          <EmptyState
            title="No songs match"
            message="Try a different spelling, another level, or clear the filters."
            action={
              <Button variant="tinted" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear filters
              </Button>
            }
          />
        )}
        {works.length > 0 && listState !== "error" && (
          <ul className={`ks-list ${listState === "loading" ? "opacity-60" : ""}`} aria-busy={listState === "loading"}>
            {works.map((work, index) => (
              <WorkListItem
                key={work.id}
                work={work}
                stars={stars}
                bests={bests}
                dividerBefore={index === unratedAt}
              />
            ))}
          </ul>
        )}
        {nextCursor && listState === "ready" && (
          <Button variant="gray" size="lg" loading={loadingMore} onClick={loadMore}>
            Show more ({total - works.length} left)
          </Button>
        )}
      </section>

      {extraSongs.length > 0 && (
        <section aria-labelledby="more-songs" className="space-y-3">
          <h2 id="more-songs" className="text-title3 text-label">
            More songs
            <span className="ml-2 text-subhead font-normal text-label-2a">{extraSongs.length}</span>
          </h2>
          <p className="text-footnote text-label-2a">From the wider library. Best-checked files come first.</p>
          <ul className="ks-list" data-testid="more-songs">
            {extraSongs.slice(0, moreShown).map((song) => (
              <SongListItem key={song.id} song={song} stars={stars} bests={bests} />
            ))}
          </ul>
          {extraSongs.length > moreShown && (
            <Button variant="gray" size="lg" onClick={() => setMoreShown((count) => count + MORE_PAGE_SIZE)}>
              Show more ({extraSongs.length - moreShown} left)
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** One unlinked song: no versions, just a title, artist, tier and length. */
function SongListItem({ song, stars, bests }: { song: Song; stars: Record<string, SongStars>; bests: Record<string, { score: number }> }) {
  const best = bests[song.id]?.score;
  return (
    <li className="ks-row" data-testid="more-song-row">
      <Link to={`/play/${song.id}`} className="ks-row__main items-start">
        <span className="ks-row__text">
          <span className="ks-row__title font-medium">{song.title}</span>
          <span className="ks-row__subtitle truncate">{song.artist}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <TierChip tier={song.quality_tier ?? "unrated"} />
            {song.quality_tier === "low" && <Chip>Low</Chip>}
            <Chip>{formatDuration(song.duration_sec)}</Chip>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <span aria-hidden="true" className="text-callout leading-none text-warning">
            {"★".repeat(stars[song.id]?.best ?? 0)}
          </span>
          {(stars[song.id]?.best ?? 0) > 0 && <span className="sr-only">{stars[song.id]?.best} of 3 stars</span>}
          {best !== undefined && (
            <span className="text-footnote tabular-nums text-label-2a">
              <span className="sr-only">Your best score </span>
              {Math.round(best)}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function WorkListItem({
  work,
  stars,
  bests,
  dividerBefore,
}: {
  work: WorkSummary;
  stars: Record<string, SongStars>;
  bests: Record<string, { score: number }>;
  dividerBefore: boolean;
}) {
  return (
    <>
      {dividerBefore && (
        <li role="presentation" className="bg-fill px-4 py-2 text-footnote uppercase text-label-2a">
          Unrated: not yet checked against the score
        </li>
      )}
      <WorkRow work={work} stars={stars} bests={bests} />
    </>
  );
}
