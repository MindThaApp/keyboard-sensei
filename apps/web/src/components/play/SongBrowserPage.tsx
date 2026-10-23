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
import { Advanced, Button, EmptyState, ErrorState, Skeleton } from "../ui";
import { WorkFilterBar } from "../library/SongFilterBar";
import { ShelfCard, WorkCard, WorkRow } from "../library/WorkRow";
import {
  firstUnratedIndex,
  hasSeasonalShelf,
  isBrowsing,
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
        <Advanced>
          <Link
            to="/settings?tab=library&from=play"
            state={{ returnTo: `/practice${params.toString() ? `?${params.toString()}` : ""}` }}
            className="ml-auto min-h-[44px] content-center text-subhead text-label-2a underline"
          >
            Manage library →
          </Link>
        </Advanced>
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
    </div>
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
