import { describe, expect, it } from "vitest";
import type { Song } from "../services/api";
import {
  DEFAULT_FILTERS,
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
