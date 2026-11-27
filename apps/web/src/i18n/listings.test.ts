import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../../../docs/store/listings");

const MS = ["en-US", "de-DE", "fr-FR", "es-ES", "it-IT", "pt-BR", "ja-JP", "zh-Hans", "zh-Hant", "ko-KR", "ru-RU", "pl-PL", "nl-NL", "tr-TR", "ar-SA", "hi-IN", "id-ID", "vi-VN", "th-TH", "sv-SE"];
const PLAY = ["en-US", "hi-IN", "id-ID", "pt-BR", "es-419", "ru-RU", "ar", "tr-TR", "ja-JP", "de-DE", "fr-FR", "vi-VN", "ko-KR", "zh-Hans", "it-IT", "th-TH", "pl-PL", "bn-BD", "ur-PK", "fil-PH"];

/** The text under a `## heading`, up to the next heading. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  expect(start, heading).toBeGreaterThan(-1);
  const rest = markdown.slice(start + heading.length + 3);
  const end = rest.indexOf("\n## ");
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}
const chars = (s: string) => [...s].length;

describe.each(PLAY)("Play listing %s", (locale) => {
  const file = join(root, locale, "play.md");
  it("exists and respects the Play limits", () => {
    expect(existsSync(file)).toBe(true);
    const md = readFileSync(file, "utf8");
    const title = section(md, "App name (30 characters or fewer)").split("\n")[0]!;
    const short = section(md, "Short description (80 characters or fewer)").split("\n")[0]!;
    const full = section(md, "Full description (4,000 characters or fewer)");
    const news = section(md, "What's new (500 characters or fewer)");
    expect(chars(title)).toBeLessThanOrEqual(30);
    expect(chars(short)).toBeLessThanOrEqual(80);
    expect(chars(full)).toBeLessThanOrEqual(4000);
    expect(chars(news)).toBeLessThanOrEqual(500);
    expect(title.length).toBeGreaterThan(0);
    expect(section(md, "Keywords").length).toBeGreaterThan(0);
  });
});

describe.each(MS)("Microsoft Store listing %s", (locale) => {
  const file = join(root, locale, "microsoft-store.md");
  it("exists with the required fields", () => {
    expect(existsSync(file)).toBe(true);
    const md = readFileSync(file, "utf8");
    expect(section(md, "Product name")).toBe("Music Portal");
    expect(chars(section(md, "Short description"))).toBeGreaterThan(20);
    expect(chars(section(md, "Description"))).toBeGreaterThan(500);
    expect(section(md, "Features (one line each)").split("\n").filter((l) => l.startsWith("- ")).length).toBeGreaterThanOrEqual(10);
    expect(section(md, "Search terms").length).toBeGreaterThan(0);
  });
});

describe("every listing", () => {
  const all = [...PLAY.map((l) => join(root, l, "play.md")), ...MS.map((l) => join(root, l, "microsoft-store.md"))];
  it("has no prices, contact addresses or store identifiers", () => {
    for (const file of all) {
      const md = readFileSync(file, "utf8");
      expect(md, file).not.toMatch(/[$€£¥₹₺₩]\s?\d|\d\s?[$€£¥₹₺₩]/);
      expect(md, file).not.toMatch(/\bUSD\b|\bEUR\b|\bGBP\b/);
      expect(md, file).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(md, file).not.toMatch(/\b9[A-Z0-9]{11}\b/); // Store product ids look like 9NBLGGH...
    }
  });
  it("keeps a coming-later line for the guided tuning aid in the Play update note", () => {
    expect(readFileSync(join(root, "en-US", "play.md"), "utf8")).toMatch(/Coming later/);
  });
});
