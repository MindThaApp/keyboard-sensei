import { describe, expect, it } from "vitest";
import { isTabActive } from "../ui/TabBar";
import { NAV_ITEMS } from "./AppHeader";

const activeLabels = (pathname: string) => NAV_ITEMS.filter((item) => isTabActive(item, pathname)).map((item) => item.label);

describe("top-level navigation", () => {
  it("lists flat destinations with Import first-class", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(["Today", "Learn", "Library", "Practice", "Import", "Progress"]);
  });

  it.each([
    ["/", "Today"],
    ["/lessons/lesson-01", "Learn"],
    ["/practice", "Library"],
    ["/play/song-1", "Library"],
    ["/practice/gym", "Practice"],
    ["/practice/record", "Practice"],
    ["/practice/notes", "Practice"],
    ["/import", "Import"],
    ["/progress", "Progress"],
  ])("%s marks only %s current", (pathname, label) => {
    expect(activeLabels(pathname)).toEqual([label]);
  });
});
