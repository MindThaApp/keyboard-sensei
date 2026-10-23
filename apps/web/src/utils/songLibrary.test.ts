import { describe, expect, it } from "vitest";
import type { Song } from "../services/api";
import {
  DEFAULT_FILTERS,
  DEFAULT_WORK_FILTERS,
  composerShort,
  firstUnratedIndex,
  isBrowsing,
  isChristmasSeason,
  shelvesToLoad,
  workFiltersFromParams,
  workFiltersToParams,
  buildShelves,
  filterSongs,
  filtersFromParams,
  filtersToParams,
  formatDuration,
  hasActiveFilters,
  paginate,
  sortSongs,
} from "./songLibrary";

const song = (overrides: Partial<Song>): Song => ({
  id: "s",
  title: "Song",
  artist: "Artist",
  genre: "classical",
  difficulty: 1,
  duration_sec: 60,
  note_count: 100,
  content_rights: "public-domain",
  notation_path: null,
  mine: false,
  collection: null,
  ...overrides,
});

describe("formatDuration", () => {
  it("never rounds the minutes up (player showed 0:44 as 1:44)", () => {
    expect(formatDuration(44.2)).toBe("0:44");
    expect(formatDuration(104)).toBe("1:44");
    expect(formatDuration(624)).toBe("10:24");
  });

  it("carries a rounded-up 60 seconds into the minute", () => {
    expect(formatDuration(59.6)).toBe("1:00");
    expect(formatDuration(119.7)).toBe("2:00");
  });
});

describe("sortSongs: easiest first", () => {
  it("breaks difficulty ties by fewest notes, not by title (a leading digit used to win)", () => {
    const songs = [
      song({ id: "mai", title: "13Mai, cher Mai", difficulty: 1, note_count: 446, duration_sec: 624 }),
      song({ id: "buns", title: "Hot Cross Buns", difficulty: 1, note_count: 51 }),
      song({ id: "hard", title: "Allentown", difficulty: 5, note_count: 20 }),
    ];
    expect(sortSongs(songs, "difficulty").map((s) => s.id)).toEqual(["buns", "mai", "hard"]);
  });

  it("does not mutate its input", () => {
    const songs = [song({ id: "b", title: "B" }), song({ id: "a", title: "A" })];
    sortSongs(songs, "title");
    expect(songs.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("filterSongs", () => {
  const songs = [
    song({ id: "lib", title: "Clair de Lune", artist: "Claude Debussy" }),
    song({ id: "up", title: "My Tune", mine: true, content_rights: "user-upload", genre: "pop", difficulty: 3 }),
    song({ id: "rec", title: "Take 1", mine: true, content_rights: "user-recording" }),
  ];

  it("combines search, genre, difficulty and source", () => {
    expect(filterSongs(songs, { ...DEFAULT_FILTERS, query: "debussy" }).map((s) => s.id)).toEqual(["lib"]);
    expect(filterSongs(songs, { ...DEFAULT_FILTERS, genre: "pop" }).map((s) => s.id)).toEqual(["up"]);
    expect(filterSongs(songs, { ...DEFAULT_FILTERS, difficulty: 3 }).map((s) => s.id)).toEqual(["up"]);
    expect(filterSongs(songs, { ...DEFAULT_FILTERS, source: "recordings" }).map((s) => s.id)).toEqual(["rec"]);
    expect(filterSongs(songs, { ...DEFAULT_FILTERS, source: "library" }).map((s) => s.id)).toEqual(["lib"]);
  });

  it("knows when any filter is active (sort alone is not a filter)", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "title" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: " x " })).toBe(true);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 53 }, (_, i) => i);

  it("slices pages and reports the visible range", () => {
    const page = paginate(items, 3, 25);
    expect(page.items).toEqual([50, 51, 52]);
    expect(page).toMatchObject({ page: 3, pageCount: 3, from: 51, to: 53, total: 53 });
  });

  it("clamps out-of-range and junk page numbers", () => {
    expect(paginate(items, 99, 25).page).toBe(3);
    expect(paginate(items, Number.NaN, 25).page).toBe(1);
    expect(paginate([], 2, 25)).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe("URL params", () => {
  it("round-trips filters and page, writing only non-defaults", () => {
    const filters = { query: "bach", genre: "classical" as const, difficulty: 2, source: "library" as const, sort: "title" as const };
    const params = filtersToParams(filters, 2);
    expect(params.toString()).toBe("q=bach&genre=classical&difficulty=2&source=library&sort=title&page=2");
    expect(filtersFromParams(params)).toEqual(filters);
    expect(filtersToParams(DEFAULT_FILTERS, 1).toString()).toBe("");
  });

  it("ignores invalid values", () => {
    expect(filtersFromParams(new URLSearchParams("genre=metal&difficulty=9&sort=random&source=x"))).toEqual(DEFAULT_FILTERS);
  });
});

describe("buildShelves", () => {
  it("puts the songs the course unlocked first, in course order, skipping unknown ids", () => {
    const songs = [song({ id: "a" }), song({ id: "b" })];
    const shelves = buildShelves(songs, [], ["b", "missing", "a"]);
    expect(shelves[0]).toMatchObject({ id: "ready", title: "Ready for you" });
    expect(shelves[0]!.songs.map((s) => s.id)).toEqual(["b", "a"]);
  });

  const songs = [
    song({ id: "b1", collection: "beginner", difficulty: 2, note_count: 80 }),
    song({ id: "b2", collection: "beginner", difficulty: 1, note_count: 40 }),
    song({ id: "lib" }),
    song({ id: "mine", mine: true, content_rights: "user-upload" }),
  ];

  it("orders recently played by recency without repeats, and drops deleted songs", () => {
    const shelves = buildShelves(songs, [{ song_id: "lib" }, { song_id: "gone" }, { song_id: "b1" }, { song_id: "lib" }]);
    expect(shelves.find((s) => s.id === "recent")?.songs.map((s) => s.id)).toEqual(["lib", "b1"]);
  });

  it("sorts the beginner pack easiest first and lists the user's own songs", () => {
    const shelves = buildShelves(songs, []);
    expect(shelves.find((s) => s.id === "beginner")?.songs.map((s) => s.id)).toEqual(["b2", "b1"]);
    expect(shelves.find((s) => s.id === "uploads")?.songs.map((s) => s.id)).toEqual(["mine"]);
  });

  it("omits empty shelves — no Recently played, no Essentials placeholder", () => {
    expect(buildShelves(songs, []).map((s) => s.id)).toEqual(["beginner", "uploads"]);
    expect(buildShelves([song({ id: "e", collection: "essentials" })], []).map((s) => s.id)).toEqual(["essentials"]);
  });
});

describe("work filters", () => {
  it("round-trips through the URL and omits defaults", () => {
    const filters = workFiltersFromParams(new URLSearchParams("q=elise&level=2&length=1-3&unrated=1&sort=easiest"));
    expect(filters).toMatchObject({ query: "elise", level: 2, duration: "1-3", unrated: true, sort: "easiest" });
    expect(workFiltersToParams(filters).toString()).toBe("q=elise&level=2&length=1-3&sort=easiest&unrated=1");
    expect(workFiltersToParams(DEFAULT_WORK_FILTERS).toString()).toBe("");
  });

  it("ignores junk params", () => {
    expect(workFiltersFromParams(new URLSearchParams("level=9&sort=zzz&hands=x"))).toMatchObject({ level: 0, sort: "recommended", hands: "" });
  });

  it("only browses (shows shelves) with no search or narrowing filter", () => {
    expect(isBrowsing(DEFAULT_WORK_FILTERS)).toBe(true);
    expect(isBrowsing({ ...DEFAULT_WORK_FILTERS, unrated: true, sort: "title" })).toBe(true);
    expect(isBrowsing({ ...DEFAULT_WORK_FILTERS, level: 1 })).toBe(false);
    expect(isBrowsing({ ...DEFAULT_WORK_FILTERS, query: " x " })).toBe(false);
  });

  it("finds where the Unrated divider goes", () => {
    expect(firstUnratedIndex([{ best_tier: "verified" }, { best_tier: "good" }, { best_tier: "unrated" }])).toBe(2);
    expect(firstUnratedIndex([{ best_tier: "verified" }])).toBe(-1);
    expect(firstUnratedIndex([{ best_tier: "unrated" }])).toBe(-1);
  });

  it("shows Christmas from 15 November to 6 January", () => {
    expect(isChristmasSeason(new Date(2026, 10, 14))).toBe(false);
    expect(isChristmasSeason(new Date(2026, 10, 15))).toBe(true);
    expect(isChristmasSeason(new Date(2027, 0, 6))).toBe(true);
    expect(isChristmasSeason(new Date(2027, 0, 7))).toBe(false);
  });

  it("only loads shelves the catalogue has content for", () => {
    const facets = { eras: [], genres: [{ value: "folk", count: 3 }], tags: [], levels: [], unrated_extra: 0 };
    const ids = shelvesToLoad(facets, new Date(2026, 5, 1), false).map((shelf) => shelf.id);
    expect(ids).toEqual(["beginner-favourites", "featured", "folk"]);
    const withChristmas = { ...facets, tags: [{ id: "christmas", label: "Christmas", kind: "theme", count: 2 }] };
    expect(shelvesToLoad(withChristmas, new Date(2026, 5, 1), false).map((s) => s.id)).not.toContain("christmas");
    expect(shelvesToLoad(withChristmas, new Date(2026, 5, 1), true).map((s) => s.id)).toContain("christmas");
    expect(shelvesToLoad(withChristmas, new Date(2026, 11, 1), false).map((s) => s.id)).toContain("christmas");
  });

  it("shortens the composer to a surname", () => {
    expect(composerShort({ id: "x", name: "Ludwig van Beethoven", sort_name: "Beethoven, Ludwig van" })).toBe("Beethoven");
    expect(composerShort(null)).toBe("");
  });
});
