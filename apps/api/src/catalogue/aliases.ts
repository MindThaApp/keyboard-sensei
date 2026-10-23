/**
 * Query normalisation and alias handling for the catalogue search.
 *
 * A Work is found through one string, Work.search_text (see ./search-text.ts),
 * so whatever changes a Work's title, aliases, tags or composer must rebuild
 * it: rebuildSearchText does that. On the query side, searchTerms turns what a
 * person typed into the two things the indexed SQL needs.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildSearchText, catalogueTokens } from "./search-text.js";

/** Longest query we search for; anything beyond is noise (and cheap DoS). */
export const MAX_QUERY_LENGTH = 100;

export interface SearchTerms {
  /** The query as typed, trimmed and length-capped. Empty means "no search". */
  text: string;
  /**
   * websearch_to_tsquery input. The typed text, plus each catalogue number in
   * it in its normalised form joined with OR, so "op 27" also matches the
   * indexed token "op27" and "K. 545" the token "k545".
   */
  tsQuery: string;
  /** Normalised catalogue tokens found in the query ("k545", "op27"). */
  catalogue: string[];
}

export function searchTerms(raw: string | undefined | null): SearchTerms {
  const text = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  const catalogue = catalogueTokens(text);
  const tsQuery = [text, ...catalogue].filter(Boolean).join(" or ");
  return { text, tsQuery, catalogue };
}

/** Accent- and case-folded, for comparing a query with an alias in JS. */
export const fold = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The alias a query matched, to tell the person why "Mondscheinsonate" found
 * Moonlight Sonata. Null when the title itself matches or nothing matches
 * closely enough to name. Exact beats prefix beats containing.
 */
export function matchedAlias(
  terms: SearchTerms,
  title: string,
  aliases: readonly string[],
): string | null {
  const query = fold(terms.text);
  if (!query) return null;
  if (fold(title).includes(query)) return null;
  const folded = aliases.map((alias) => [alias, fold(alias)] as const);
  const candidates = [
    folded.find(([, value]) => value === query),
    folded.find(([, value]) => value.startsWith(query)),
    folded.find(([, value]) => value.includes(query)),
    // "k545" typed against an alias written "K. 545".
    ...terms.catalogue.map((token) => folded.find(([alias]) => catalogueTokens(alias).includes(token))),
  ];
  return candidates.find(Boolean)?.[0] ?? null;
}

/**
 * Recompute Work.search_text from what is stored now. For callers that edit a
 * Work, its aliases or tags (admin tooling): the column is not generated, so
 * it goes stale otherwise. Returns whether it changed.
 */
export async function rebuildSearchText(
  prisma: PrismaClient | Prisma.TransactionClient,
  workId: string,
): Promise<boolean> {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      aliases: { orderBy: { alias: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag_id: "asc" } },
      composer: true,
    },
  });
  if (!work) return false;
  const searchText = buildSearchText({
    title: work.title,
    catalogue: work.catalogue,
    movement: work.movement,
    aliases: work.aliases.map((alias) => alias.alias),
    composer: work.composer ? { name: work.composer.name, aliases: work.composer.aliases } : null,
    tags: work.tags.map((link) => link.tag.label),
  });
  if (searchText === work.search_text) return false;
  await prisma.work.update({ where: { id: workId }, data: { search_text: searchText } });
  return true;
}
