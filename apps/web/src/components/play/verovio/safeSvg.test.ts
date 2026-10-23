// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { safeSvgPage } from "./safeSvg";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" id="page">
  <style>#page path {stroke:currentColor}</style>
  <defs><g id="E050"><path d="M0 0"/></g></defs>
  <svg class="definition-scale" color="black">
    <g id="n1" class="note" onclick="alert(1)"><use xlink:href="#E050"/></g>
    <g class="dir"><a xlink:href="javascript:alert(1)"><text>Allegro</text></a></g>
    <script>alert(1)</script>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
    <image href="https://example.com/track.png"/>
  </svg>
</svg>`;

describe("safeSvgPage", () => {
  const page = safeSvgPage(SVG)!;

  it("keeps the engraving: notes, glyph references and Verovio's own CSS", () => {
    expect(page.querySelector("g#n1.note")).not.toBeNull();
    expect(page.querySelector("use")?.getAttribute("xlink:href")).toBe("#E050");
    expect(page.querySelector("style")?.textContent).toContain("currentColor");
    expect(page.textContent).toContain("Allegro");
  });

  it("drops anything that runs code, navigates or loads from elsewhere", () => {
    expect(page.querySelector("script")).toBeNull();
    expect(page.querySelector("foreignObject")).toBeNull();
    expect(page.querySelector("a")).toBeNull();
    expect(page.querySelector("g#n1")?.getAttribute("onclick")).toBeNull();
    expect(page.querySelector("image")?.getAttribute("href")).toBeNull();
  });

  it("refuses markup that isn't SVG", () => {
    expect(safeSvgPage("<html/>")).toBeNull();
    expect(safeSvgPage("<svg")).toBeNull();
  });
});
