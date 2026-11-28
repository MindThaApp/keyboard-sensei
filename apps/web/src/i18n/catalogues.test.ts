import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import { DEFAULT_LOCALE, localeInfo } from "./locales";

type Messages = Record<string, string>;

const files = import.meta.glob<Messages>("./locales/*.json", { eager: true, import: "default" });
const catalogues = Object.fromEntries(
  Object.entries(files).map(([path, messages]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), messages]),
);
const en = catalogues[DEFAULT_LOCALE]!;
const others = Object.keys(catalogues).filter((code) => code !== DEFAULT_LOCALE);

interface AstNode {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  children?: AstNode[];
}

/** Argument and tag names a message uses, e.g. "{count}" and "<strong>" give ["arg:count", "tag:strong"]. */
function slots(message: string, locale: string): string[] {
  const out = new Set<string>();
  const walk = (nodes: AstNode[]) => {
    for (const node of nodes) {
      // 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural, 8 tag (intl-messageformat's TYPE enum).
      if (node.type >= 1 && node.type <= 6 && node.value) out.add(`arg:${node.value}`);
      if (node.type === 8 && node.value) out.add(`tag:${node.value}`);
      if (node.options) Object.values(node.options).forEach((option) => walk(option.value));
      if (node.children) walk(node.children);
    }
  };
  walk(new IntlMessageFormat(message, locale).getAst() as unknown as AstNode[]);
  return [...out].sort();
}

describe("locale catalogues", () => {
  it("ships more than the default locale, each one a known locale", () => {
    expect(others.length).toBeGreaterThan(0);
    for (const code of others) expect(localeInfo(code).code).toBe(code);
  });

  it.each(others)("%s has exactly the keys of en-US", (code) => {
    const keys = Object.keys(catalogues[code]!);
    const missing = Object.keys(en).filter((key) => !(key in catalogues[code]!));
    const extra = keys.filter((key) => !(key in en));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(Object.keys(catalogues))("%s has no empty messages", (code) => {
    const empty = Object.entries(catalogues[code]!).filter(([, text]) => typeof text !== "string" || text.trim() === "");
    expect(empty.map(([key]) => key)).toEqual([]);
  });

  it.each(others)("%s messages parse and use the same placeholders and tags as en-US", (code) => {
    const mismatched: string[] = [];
    for (const [key, text] of Object.entries(catalogues[code]!)) {
      if (!(key in en)) continue;
      let ok = false;
      try {
        ok = slots(text, code).join() === slots(en[key]!, DEFAULT_LOCALE).join();
      } catch {
        ok = false;
      }
      if (!ok) mismatched.push(key);
    }
    expect(mismatched).toEqual([]);
  });

  it("en-US messages all parse", () => {
    const broken = Object.entries(en).filter(([, text]) => {
      try {
        slots(text, DEFAULT_LOCALE);
        return false;
      } catch {
        return true;
      }
    });
    expect(broken.map(([key]) => key)).toEqual([]);
  });
});
