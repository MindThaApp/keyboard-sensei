// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import type { NotationSection } from "@keyboard-sensei/shared-types";
import { lessons } from "../../../../api/src/content";
import GuitarSection, { isGuitarSection } from "./GuitarSection";
import NotationRenderer from "./NotationRenderer";

/**
 * Every guitar and violin notation section in the course, drawn the way the lesson page draws it
 * (LessonPlayerPage: guitar kinds go to GuitarSection, everything else to the staff renderer).
 */

// jsdom has no SVG text measurement; VexFlow only needs plausible numbers.
beforeAll(() => {
  (SVGElement.prototype as unknown as { getBBox: () => unknown }).getBBox = () => ({ x: 0, y: 0, width: 8, height: 12 });
});

const sectionsOf = (instrument: "guitar" | "violin") =>
  lessons
    .filter((lesson) => lesson.instrument === instrument)
    .flatMap((lesson) => lesson.sections.filter((s): s is NotationSection => s.type === "notation").map((section) => ({ lesson, section })));

const draw = (section: NotationSection) =>
  isGuitarSection(section.vexflowData)
    ? render(<GuitarSection data={section.vexflowData} title={section.title} />)
    : render(<NotationRenderer data={section.vexflowData as never} />);

describe("guitar lesson notation renders", () => {
  for (const { lesson, section } of sectionsOf("guitar")) {
    it(`${lesson.id}: ${section.title}`, () => {
      const data = section.vexflowData;
      expect(isGuitarSection(data), "guitar sections use a guitar kind").toBe(true);
      const { container, unmount } = draw(section);
      if (data.kind === "chord-diagrams") {
        // One box per chord, barre and power chords included (a barre shape may be keyed by
        // its fret, "G3", and labelled with its chord name, "G").
        const drawn = [...container.querySelectorAll("svg[data-chord]")].map((svg) => svg.getAttribute("data-chord"));
        expect(drawn.length).toBe((data.chords as string[]).length);
        drawn.forEach((symbol, i) => expect((data.chords as string[])[i]!.startsWith(symbol!), `${symbol}`).toBe(true));
      } else if (data.kind === "guitar") {
        expect(container.querySelector("svg .vf-tabnote"), "tab is drawn").not.toBeNull();
      }
      unmount();
    });
  }

  it("draws the tier 4 barre and power chord boxes", () => {
    const symbols = sectionsOf("guitar").flatMap(({ section }) => (section.vexflowData.kind === "chord-diagrams" ? (section.vexflowData.chords as string[]) : []));
    for (const symbol of ["F", "Bm", "Bb", "E5", "A5", "G5"]) expect(symbols).toContain(symbol);
  });
});

describe("violin lesson notation renders", () => {
  const texts: string[] = [];
  for (const { lesson, section } of sectionsOf("violin")) {
    it(`${lesson.id}: ${section.title}`, () => {
      const { container, unmount } = draw(section);
      if ("fingerboard" in section.vexflowData) {
        unmount();
        return;
      }
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.querySelectorAll(".vf-stavenote").length).toBeGreaterThan(0);
      texts.push(...[...svg!.querySelectorAll("text")].map((t) => t.textContent ?? ""));
      unmount();
    });
  }

  it("prints position changes for the third position lessons", () => {
    expect(texts).toContain("3rd pos.");
    expect(texts).toContain("1st pos.");
  });
});
