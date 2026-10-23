/**
 * Work.search_text: everything a search should match a Work by, in one string.
 * The migration indexes it (full text and trigram, both through ks_unaccent),
 * so accents need no handling here. Prisma cannot model a generated column, so
 * whatever writes a Work, its aliases, tags or composer must rebuild this.
 */

/**
 * Catalogue-number prefixes, each with the spellings that mean it. Matched
 * longest first so "kv" wins over "k" and "woo" over a bare letter.
 */
const CATALOGUE_PREFIXES: [canonical: string, pattern: string][] = [
  ["op", "opus|op"],
  ["bwv", "bwv"],
  ["hwv", "hwv"],
  ["woo", "woo"],
  ["hob", "hob"],
  ["rv", "rv"],
  ["k", "kv|k"],
  ["d", "d"],
  ["l", "l"],
  ["s", "s"],
];

const CATALOGUE_NUMBER = new RegExp(
  `\\b(${CATALOGUE_PREFIXES.map(([, pattern]) => pattern).join("|")})\\.?\\s*(\\d+[a-z]?)\\b`,
  "gi",
);
const CANONICAL = new Map(
  CATALOGUE_PREFIXES.flatMap(([canonical, pattern]) => pattern.split("|").map((spelling) => [spelling, canonical] as const)),
);

/**
 * Normalised catalogue tokens in a text: "K. 545", "KV545" and "k 545" all give
 * "k545"; "Op. 27 No. 2" gives "op27". A query normalised the same way then
 * matches regardless of how either side was written.
 */
export function catalogueTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(CATALOGUE_NUMBER)) {
    tokens.add(`${CANONICAL.get(match[1]!.toLowerCase())}${match[2]!.toLowerCase()}`);
  }
  return [...tokens];
}

export interface SearchTextInput {
  title: string;
  catalogue?: string | null;
  movement?: string | null;
  aliases: string[];
  composer?: { name: string; aliases: string[] } | null;
  tags: string[];
}

/** Deterministic: the same input always gives the same string, so rebuilding it is a no-op when nothing changed. */
export function buildSearchText(input: SearchTextInput): string {
  const parts = [
    input.title,
    input.catalogue,
    input.movement,
    ...input.aliases,
    input.composer?.name,
    ...(input.composer?.aliases ?? []),
    ...input.tags,
  ].filter((part): part is string => Boolean(part && part.trim()));
  const tokens = catalogueTokens(parts.join(" "));
  const seen = new Set<string>();
  const unique = [...parts, ...tokens].filter((part) => {
    const key = part.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(" | ");
}
