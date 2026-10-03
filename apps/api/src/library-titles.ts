/**
 * Title clean-up and de-duplication for the curated song library.
 *
 * The ADL dataset's filenames carry track numbers ("13Mai, cher Mai"),
 * underscores where a comma or slash was ("I Do_ I Do_ I Do"), inconsistent
 * opus numbering ("Op10, no3" vs "Op 10 no 3") and the same piece saved twice
 * under slightly different names ("Color of the Wind" / "Colors of the Wind").
 *
 * Used by both scripts/fetch-midi-library.ts (so a freshly written manifest is
 * clean) and prisma/seed.ts (so a reseed fixes an existing database without
 * re-downloading anything). Everything here is pure and idempotent: running
 * it on an already-clean title or manifest changes nothing.
 *
 * Manifest ids are NEVER changed — they are the stable `seed-<id>` primary keys
 * that users' play-along attempts point at. Only the display title changes.
 */

export interface LibraryEntry {
  id: string;
  title: string;
  artist: string;
}

/**
 * Hand-checked titles for entries the generic rules can't fix (missing
 * apostrophes, accents, mangled filenames). Keyed by manifest id.
 */
export const TITLE_OVERRIDES: Record<string, string> = {
  "ludwig-van-beethoven-beethovens-5th": "Beethoven's 5th",
  "ludwig-van-beethoven-memet-tanc-deutscher-tanz": "Deutscher Tanz",
  "ludwig-van-beethoven-menuett-op-woo-82": "Menuett, WoO 82",
  "ludwig-van-beethoven-piano-concerto-no3": "Piano Concerto No 3 (excerpt)",
  "johann-sebastian-bach-aria-warum-betrubst-du-dich": "Aria: Warum betrübst du dich",
  "claude-debussy-doctors-gradus-ad-parnassum": "Doctor Gradus ad Parnassum",
  "pyotr-ilyich-tchaikovsky-napolitan-dance-swan-lake": "Neapolitan Dance (Swan Lake)",
  "pyotr-ilyich-tchaikovsky-nutcracker-minature-overture": "Nutcracker: Miniature Overture",
  "felix-mendelssohn-inquietude-f-mendelssohn-bartholdy": "Inquiétude",
  "sergei-rachmaninoff-sonata-in-b-flat-minor-op-35-funeral-march-iii-marche-funebr":
    "Sonata in B-flat Minor, Op 35: III. Marche funèbre",
  "modest-mussorgsky-bilder-einer-ausstellung-pictures-at-an-exhibition-der-gnom":
    "Pictures at an Exhibition: The Gnome",
  "modest-mussorgsky-pictures-at-an-exhibition-promenade": "Pictures at an Exhibition: Promenade",
  "edvard-grieg-ases-death": "Åse's Death",
  "scott-joplin-entertainer": "The Entertainer",
  "the-beatles-hard-days-night": "A Hard Day's Night",
  "the-beatles-getting-better-all-the-time": "Getting Better",
  "elton-john-dont-let-the-sun-go-down-on-me": "Don't Let the Sun Go Down on Me",
  "queen-in-the-lap-of-the-godsrevisited": "In the Lap of the Gods… Revisited",
  "coldplay-everythings-not-lost-includes-hidden-track-life-is-for-living": "Everything's Not Lost",
  "stevie-wonder-i-just-called-to-say-i-love-you": "I Just Called to Say I Love You",
  "eagles-i-cant-tell-you-why": "I Can't Tell You Why",
  "pink-floyd-dont-leave-me-now": "Don't Leave Me Now",
  "elvis-presley-i-was-born-about-10-000-years-ago": "I Was Born About 10,000 Years Ago",
  "frank-sinatra-theme-from-new-york-new-york-live-at-the-meadowlands-sports-comple":
    "Theme from New York, New York",
  "randy-newman-disney-pixar-youve-got-a-friend-in-me": "You've Got a Friend in Me",
  "yann-tiersen-comptine-dun-autre-ete": "Comptine d'un autre été",
  "yann-tiersen-la-valse-damelie": "La Valse d'Amélie",
  "yann-tiersen-lautre-valse-damelie": "L'autre valse d'Amélie",
  "vangelis-mythodea-music-for-the-nasa-mission-2001-mars-odysseymovement-6": "Mythodea: Movement 6",
  "ludovico-einaudi-in-unaltra-vita": "In un'altra vita",
};

/**
 * Entries that are the same piece as another entry, mapped to the id that is
 * kept. The dropped entry is not seeded, and its existing row is deleted on
 * reseed — unless a user has play-along attempts on it, in which case it is
 * left alone (see `seedSongs`).
 *
 * Deliberately NOT here: pairs that share a name but are clearly different
 * arrangements a learner would want both of (e.g. Pachelbel "Canon in D" at
 * 1:56 vs the 5:39 "Canon"; Schubert's short "Ave Maria" vs the full
 * "Ellens dritter Gesang"; the concerto excerpt vs the full movement).
 */
export const DUPLICATE_OF: Record<string, string> = {
  "alan-menken-disney-color-of-the-wind": "alan-menken-disney-colors-of-the-wind",
  "erik-satie-gymnopedie-no2": "erik-satie-gymnopedie-no-2",
  "frederic-chopin-etude-op10-no3": "frederic-chopin-etude-op-10-no-3",
  "frederic-chopin-etude-c-moll-opus-10-no-12": "frederic-chopin-etude-op-10-no-12",
  "frederic-chopin-fantaisie-impromptu": "frederic-chopin-fantaisie-impromptu-op-66",
  "frederic-chopin-mazuka-v": "frederic-chopin-mazurka-v",
  "frederic-chopin-marche-funebre": "frederic-chopin-funeral-march",
  "johann-sebastian-bach-6-partitas-clavierubung-part-i-no-2": "johann-sebastian-bach-6-partitas-clavierubung-part-i-no2",
  "claude-debussy-arabesque-n-1": "claude-debussy-premiere-arabesque-l66-no1",
  "pyotr-ilyich-tchaikovsky-in-the-church": "pyotr-ilyich-tchaikovsky-in-church",
  "edvard-grieg-ases-tod": "edvard-grieg-ases-death",
  "scott-joplin-be-thena-a-concert-waltz": "scott-joplin-bethena",
  // The authored beginner-pack arrangement (scripts/generate-beginner-pack.ts)
  // replaces the dataset's one-hand "Ode To Joy".
  "ludwig-van-beethoven-ode-to-joy": "beginner-pack:ode-to-joy",
};

/** English short words that title case leaves lowercase mid-title. "A" is
 *  excluded on purpose: mid-title it is usually a key ("in A Major"). */
const MINOR_WORDS = new Set(["an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "the", "to", "with"]);

/** Recording/edition noise in parentheses that isn't part of the title. */
const JUNK_PARENTHETICAL = /\s*\((?:1 ?hand|as made famous by[^)]*|lp version|includes hidden track[^)]*|[^)]*(?:live|remaster|bootleg|album version|single version)[^)]*)\)\s*/gi;

/** Lowercase capitalised minor words, except the first word of each segment
 *  (start of title, or after ":", ",", " - ", "("). */
const lowercaseMinorWords = (title: string): string => {
  let segmentStart = true;
  return title
    .split(" ")
    .map((word) => {
      const isFirst = segmentStart;
      segmentStart = word === "-" || word.endsWith(":") || word.endsWith(",") || word.endsWith("(");
      if (word.startsWith("(")) return word;
      const lower = word.toLowerCase();
      const capitalised = word.length > 1 && word[0] === word[0]!.toUpperCase() && word.slice(1) === word.slice(1).toLowerCase();
      if (!isFirst && capitalised && MINOR_WORDS.has(lower)) return lower;
      return word;
    })
    .join(" ");
};

/** Generic, rule-based clean-up of a dataset title. Idempotent. */
export function normalizeSongTitle(raw: string): string {
  let title = raw
    .replace(/\.mid$/i, "")
    // "I Do_ I Do_" — an underscore before a space stood in for a comma.
    .replace(/_\s/g, ", ")
    .replace(/_/g, " ")
    // "13Mai, cher Mai" — a 1-2 digit track number glued to the first word.
    // "1812 Overture", "52nd Street" and "6 Partitas" are left alone.
    .replace(/^\d{1,2}(?=\p{Lu})/u, "")
    .replace(JUNK_PARENTHETICAL, " ")
    // "Andante(from" → "Andante (from"; "( Let Me Be )" → "(Let Me Be)".
    .replace(/(\S)\(/g, "$1 (")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    // "No2", "no 2", "N 7", "number 4" → "No 2"; "Op10" → "Op 10".
    .replace(/\b(?:no|number|n)\.?\s*(?=\d)/gi, "No ")
    .replace(/\bop\.?\s*(?=\d)/gi, "Op ")
    .replace(/\s+/g, " ")
    .trim();
  title = lowercaseMinorWords(title);
  return title;
}

/** The title to show for a manifest entry: the override if any, else the normalized title. */
export function libraryTitle(entry: LibraryEntry): string {
  return TITLE_OVERRIDES[entry.id] ?? normalizeSongTitle(entry.title);
}

/**
 * Accent-, case-, punctuation- and plural-insensitive identity for spotting
 * the same piece listed twice under the same artist.
 */
export function duplicateKey(artist: string, title: string): string {
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word))
      .join("");
  return `${fold(artist)}|${fold(title)}`;
}

export interface PreparedLibrary<T extends LibraryEntry> {
  entries: T[];
  renamed: { id: string; from: string; to: string }[];
  dropped: { id: string; title: string; keptId: string }[];
  /** Same-artist entries that still share a duplicateKey — should be empty;
   *  if not, add them to DUPLICATE_OF (or rename one) after listening. */
  unresolvedDuplicates: string[][];
}

/** Apply title clean-up and drop known duplicates. Pure and idempotent. */
export function prepareLibraryManifest<T extends LibraryEntry>(manifest: T[]): PreparedLibrary<T> {
  const renamed: PreparedLibrary<T>["renamed"] = [];
  const dropped: PreparedLibrary<T>["dropped"] = [];
  const entries: T[] = [];
  for (const entry of manifest) {
    const title = libraryTitle(entry);
    const keptId = DUPLICATE_OF[entry.id];
    if (keptId) {
      dropped.push({ id: entry.id, title, keptId });
      continue;
    }
    if (title !== entry.title) renamed.push({ id: entry.id, from: entry.title, to: title });
    entries.push({ ...entry, title });
  }

  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const key = duplicateKey(entry.artist, entry.title);
    groups.set(key, [...(groups.get(key) ?? []), entry.id]);
  }
  const unresolvedDuplicates = [...groups.values()].filter((ids) => ids.length > 1);
  return { entries, renamed, dropped, unresolvedDuplicates };
}
