import { describe, expect, it } from "vitest";
import type { PlayedInstrument } from "@keyboard-sensei/shared-types";
import { filterByInstrument, normalizePlayed, parseActive } from "./playedInstrument";

const l = (id: string, instrument?: PlayedInstrument) => ({ id, instrument });

describe("filterByInstrument", () => {
  const course = [l("a"), l("b", "piano"), l("g1", "guitar"), l("v1", "violin")];
  it("shows lessons without an instrument as piano, so an upgraded profile sees today's list", () => {
    expect(filterByInstrument(course, "piano").map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("never mixes instruments", () => {
    expect(filterByInstrument(course, "guitar").map((x) => x.id)).toEqual(["g1"]);
    expect(filterByInstrument(course, "violin").map((x) => x.id)).toEqual(["v1"]);
  });
});

describe("parsing", () => {
  it("falls back to piano and drops unknown values", () => {
    expect(parseActive(null)).toBe("piano");
    expect(parseActive("banjo")).toBe("piano");
    expect(parseActive("violin")).toBe("violin");
    expect(normalizePlayed(["violin", "banjo", "piano", "piano"])).toEqual(["piano", "violin"]);
    expect(normalizePlayed("x")).toEqual([]);
  });
});
