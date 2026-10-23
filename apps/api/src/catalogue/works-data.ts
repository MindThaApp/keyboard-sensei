/**
 * Curated catalogue data for the songs that already exist: composers (with the
 * spellings people search for), and per-Work metadata for the Essentials pack
 * and the authored beginner pack. Read by ./backfill.ts.
 *
 * Titles and composer names of Essentials pieces come from
 * src/essentials/manifest.ts; this file adds only what the manifest lacks.
 * A Work's `title` is the display title and may already contain its catalogue
 * number or movement; `catalogue` and `movement` are there for search and
 * filtering.
 */

export type Era = "baroque" | "classical-era" | "romantic" | "impressionist" | "early-20th-c" | "ragtime" | "traditional" | "modern";

export const WORK_GENRES = ["classical", "folk", "hymn-carol", "ragtime", "childrens", "teaching", "march", "other"] as const;
export type WorkGenre = (typeof WORK_GENRES)[number];

export type AliasKind = "title" | "nickname" | "catalogue" | "translation";
export interface AliasSeed {
  alias: string;
  kind: AliasKind;
}

export interface ComposerSeed {
  id: string;
  name: string;
  sort_name: string;
  born: number | null;
  died: number | null;
  aliases: string[];
  /** Default era for this composer's Works. */
  era: Era | null;
}

export const TRADITIONAL = "traditional";

export const COMPOSERS: ComposerSeed[] = [
  { id: TRADITIONAL, name: "Traditional", sort_name: "Traditional", born: null, died: null, aliases: ["Trad.", "Folk song", "Anonymous"], era: "traditional" },
  { id: "antonin-dvorak", name: "Antonín Dvořák", sort_name: "Dvořák, Antonín", born: 1841, died: 1904, aliases: ["Dvorak", "Anton Dvorak"], era: "romantic" },
  { id: "antonio-vivaldi", name: "Antonio Vivaldi", sort_name: "Vivaldi, Antonio", born: 1678, died: 1741, aliases: ["Vivaldi"], era: "baroque" },
  { id: "charles-gounod", name: "Charles Gounod", sort_name: "Gounod, Charles", born: 1818, died: 1893, aliases: ["Gounod"], era: "romantic" },
  { id: "christian-petzold", name: "Christian Petzold", sort_name: "Petzold, Christian", born: 1677, died: 1733, aliases: ["Petzold", "Pezold"], era: "baroque" },
  { id: "claude-debussy", name: "Claude Debussy", sort_name: "Debussy, Claude", born: 1862, died: 1918, aliases: ["Debussy", "Claude-Achille Debussy"], era: "impressionist" },
  { id: "edvard-grieg", name: "Edvard Grieg", sort_name: "Grieg, Edvard", born: 1843, died: 1907, aliases: ["Grieg"], era: "romantic" },
  { id: "edward-elgar", name: "Edward Elgar", sort_name: "Elgar, Edward", born: 1857, died: 1934, aliases: ["Elgar", "Sir Edward Elgar"], era: "early-20th-c" },
  { id: "erik-satie", name: "Erik Satie", sort_name: "Satie, Erik", born: 1866, died: 1925, aliases: ["Satie"], era: "impressionist" },
  { id: "felix-mendelssohn", name: "Felix Mendelssohn", sort_name: "Mendelssohn, Felix", born: 1809, died: 1847, aliases: ["Mendelssohn", "Felix Mendelssohn Bartholdy"], era: "romantic" },
  { id: "franz-liszt", name: "Franz Liszt", sort_name: "Liszt, Franz", born: 1811, died: 1886, aliases: ["Liszt", "Liszt Ferenc"], era: "romantic" },
  { id: "franz-schubert", name: "Franz Schubert", sort_name: "Schubert, Franz", born: 1797, died: 1828, aliases: ["Schubert"], era: "romantic" },
  { id: "franz-xaver-gruber", name: "Franz Xaver Gruber", sort_name: "Gruber, Franz Xaver", born: 1787, died: 1863, aliases: ["Gruber", "Franz Gruber"], era: "romantic" },
  { id: "frederic-chopin", name: "Frédéric Chopin", sort_name: "Chopin, Frédéric", born: 1810, died: 1849, aliases: ["Chopin", "Fryderyk Chopin"], era: "romantic" },
  { id: "friedrich-burgmuller", name: "Friedrich Burgmüller", sort_name: "Burgmüller, Friedrich", born: 1806, died: 1874, aliases: ["Burgmüller", "Burgmueller"], era: "romantic" },
  { id: "george-frideric-handel", name: "George Frideric Handel", sort_name: "Handel, George Frideric", born: 1685, died: 1759, aliases: ["Handel", "Händel", "Haendel", "Georg Friedrich Händel"], era: "baroque" },
  { id: "georges-bizet", name: "Georges Bizet", sort_name: "Bizet, Georges", born: 1838, died: 1875, aliases: ["Bizet"], era: "romantic" },
  { id: "giuseppe-verdi", name: "Giuseppe Verdi", sort_name: "Verdi, Giuseppe", born: 1813, died: 1901, aliases: ["Verdi"], era: "romantic" },
  { id: "gustav-holst", name: "Gustav Holst", sort_name: "Holst, Gustav", born: 1874, died: 1934, aliases: ["Holst"], era: "early-20th-c" },
  { id: "isaac-albeniz", name: "Isaac Albéniz", sort_name: "Albéniz, Isaac", born: 1860, died: 1909, aliases: ["Albeniz", "Isaac Albeniz"], era: "romantic" },
  { id: "jacques-offenbach", name: "Jacques Offenbach", sort_name: "Offenbach, Jacques", born: 1819, died: 1880, aliases: ["Offenbach"], era: "romantic" },
  { id: "joseph-haydn", name: "Joseph Haydn", sort_name: "Haydn, Joseph", born: 1732, died: 1809, aliases: ["Haydn", "Franz Joseph Haydn", "Josef Haydn"], era: "classical-era" },
  { id: "james-lord-pierpont", name: "James Lord Pierpont", sort_name: "Pierpont, James Lord", born: 1822, died: 1893, aliases: ["Pierpont", "James Pierpont"], era: "romantic" },
  { id: "james-r-murray", name: "James R. Murray", sort_name: "Murray, James R.", born: 1841, died: 1905, aliases: ["James Ramsey Murray"], era: "romantic" },
  { id: "johann-pachelbel", name: "Johann Pachelbel", sort_name: "Pachelbel, Johann", born: 1653, died: 1706, aliases: ["Pachelbel"], era: "baroque" },
  { id: "johann-sebastian-bach", name: "Johann Sebastian Bach", sort_name: "Bach, Johann Sebastian", born: 1685, died: 1750, aliases: ["Bach", "J. S. Bach", "JS Bach"], era: "baroque" },
  { id: "johann-strauss-i", name: "Johann Strauss I", sort_name: "Strauss, Johann (I)", born: 1804, died: 1849, aliases: ["Johann Strauss Sr.", "Johann Strauss the Elder", "Strauss"], era: "romantic" },
  { id: "johann-strauss-ii", name: "Johann Strauss II", sort_name: "Strauss, Johann (II)", born: 1825, died: 1899, aliases: ["Johann Strauss Jr.", "Johann Strauss the Younger", "Strauss"], era: "romantic" },
  { id: "johannes-brahms", name: "Johannes Brahms", sort_name: "Brahms, Johannes", born: 1833, died: 1897, aliases: ["Brahms"], era: "romantic" },
  { id: "john-b-dykes", name: "John B. Dykes", sort_name: "Dykes, John B.", born: 1823, died: 1876, aliases: ["John Bacchus Dykes"], era: "romantic" },
  { id: "john-francis-wade", name: "John Francis Wade", sort_name: "Wade, John Francis", born: 1711, died: 1786, aliases: ["J. F. Wade"], era: "classical-era" },
  { id: "john-philip-sousa", name: "John Philip Sousa", sort_name: "Sousa, John Philip", born: 1854, died: 1932, aliases: ["Sousa"], era: "romantic" },
  { id: "lewis-h-redner", name: "Lewis H. Redner", sort_name: "Redner, Lewis H.", born: 1831, died: 1908, aliases: ["Lewis Henry Redner"], era: "romantic" },
  { id: "lowell-mason", name: "Lowell Mason", sort_name: "Mason, Lowell", born: 1792, died: 1872, aliases: [], era: "romantic" },
  { id: "ludwig-van-beethoven", name: "Ludwig van Beethoven", sort_name: "Beethoven, Ludwig van", born: 1770, died: 1827, aliases: ["Beethoven", "L. v. Beethoven"], era: "classical-era" },
  { id: "martin-luther", name: "Martin Luther", sort_name: "Luther, Martin", born: 1483, died: 1546, aliases: ["Luther"], era: null },
  { id: "mildred-and-patty-hill", name: "Mildred J. Hill & Patty Hill", sort_name: "Hill, Mildred J. & Patty", born: 1859, died: 1946, aliases: ["Mildred Hill", "Patty Hill", "Hill sisters"], era: "romantic" },
  { id: "modest-mussorgsky", name: "Modest Mussorgsky", sort_name: "Mussorgsky, Modest", born: 1839, died: 1881, aliases: ["Mussorgsky", "Musorgsky", "Moussorgsky", "Mussorgski"], era: "romantic" },
  { id: "muzio-clementi", name: "Muzio Clementi", sort_name: "Clementi, Muzio", born: 1752, died: 1832, aliases: ["Clementi"], era: "classical-era" },
  { id: "mykola-leontovych", name: "Mykola Leontovych", sort_name: "Leontovych, Mykola", born: 1877, died: 1921, aliases: ["Leontovich", "Mykola Leontovich"], era: "early-20th-c" },
  {
    id: "pyotr-ilyich-tchaikovsky", name: "Pyotr Ilyich Tchaikovsky", sort_name: "Tchaikovsky, Pyotr Ilyich", born: 1840, died: 1893,
    aliases: ["Tchaikovsky", "Tschaikowski", "Tschaikowsky", "Tchaikowsky", "Chaikovsky", "Peter Ilyich Tchaikovsky", "Piotr Ilyich Tchaikovsky"], era: "romantic",
  },
  { id: "richard-wagner", name: "Richard Wagner", sort_name: "Wagner, Richard", born: 1813, died: 1883, aliases: ["Wagner"], era: "romantic" },
  { id: "robert-schumann", name: "Robert Schumann", sort_name: "Schumann, Robert", born: 1810, died: 1856, aliases: ["Schumann"], era: "romantic" },
  { id: "scott-joplin", name: "Scott Joplin", sort_name: "Joplin, Scott", born: 1868, died: 1917, aliases: ["Joplin"], era: "ragtime" },
  { id: "sergei-rachmaninoff", name: "Sergei Rachmaninoff", sort_name: "Rachmaninoff, Sergei", born: 1873, died: 1943, aliases: ["Rachmaninoff", "Rachmaninov", "Rakhmaninov", "Sergei Rachmaninov"], era: "romantic" },
  { id: "stephen-foster", name: "Stephen Foster", sort_name: "Foster, Stephen", born: 1826, died: 1864, aliases: ["Stephen Collins Foster", "Foster"], era: "romantic" },
  { id: "wolfgang-amadeus-mozart", name: "Wolfgang Amadeus Mozart", sort_name: "Mozart, Wolfgang Amadeus", born: 1756, died: 1791, aliases: ["Mozart", "W. A. Mozart"], era: "classical-era" },
  { id: "william-croft", name: "William Croft", sort_name: "Croft, William", born: 1678, died: 1727, aliases: ["Croft"], era: "baroque" },
  { id: "william-h-monk", name: "William H. Monk", sort_name: "Monk, William H.", born: 1823, died: 1889, aliases: ["William Henry Monk"], era: "romantic" },
];

/**
 * Artist strings that are not a composer's plain name (credits naming a source
 * or a co-writer). Everything else is matched on the composer's name.
 */
const ARTIST_COMPOSER: Record<string, string> = {
  "Christian Petzold (attr. J. S. Bach)": "christian-petzold",
  "Lowell Mason (after Handel)": "lowell-mason",
  "Charles Gounod, after J. S. Bach": "charles-gounod",
  "Mildred J. Hill & Patty Hill": "mildred-and-patty-hill",
};

/** The Composer id for a song's artist credit, or null when it is not one we know. */
export function composerIdFor(artist: string): string | null {
  const trimmed = artist.trim();
  if (ARTIST_COMPOSER[trimmed]) return ARTIST_COMPOSER[trimmed];
  // "Traditional (Welsh)" and the like.
  if (/^traditional\b/i.test(trimmed)) return TRADITIONAL;
  return COMPOSERS.find((composer) => composer.name === trimmed)?.id ?? null;
}

export interface WorkMeta {
  genre: WorkGenre;
  catalogue?: string;
  movement?: string;
  /**
   * First publication. Recorded where the public-domain status depends on it
   * (a composer who died 1926-1955 is public domain in the US and EU only if
   * the work was published before 1931).
   */
  published_year?: number;
  aliases?: AliasSeed[];
}

const t = (...titles: string[]): AliasSeed[] => titles.map((alias) => ({ alias, kind: "title" }));
const nick = (...names: string[]): AliasSeed[] => names.map((alias) => ({ alias, kind: "nickname" }));
const cat = (...numbers: string[]): AliasSeed[] => numbers.map((alias) => ({ alias, kind: "catalogue" }));
const tr = (...titles: string[]): AliasSeed[] => titles.map((alias) => ({ alias, kind: "translation" }));

/** Keyed by Essentials slug (= the Work id and the songs' arrangement_group). */
export const ESSENTIALS_WORKS: Record<string, WorkMeta> = {
  "fur-elise": { genre: "classical", catalogue: "WoO 59", aliases: [...t("Bagatelle No. 25 in A minor"), ...tr("Fuer Elise"), ...cat("WoO 59")] },
  "moonlight-sonata-1": {
    genre: "classical", catalogue: "Op. 27 No. 2", movement: "1st movement: Adagio sostenuto",
    aliases: [...t("Piano Sonata No. 14", "Sonata No. 14 in C-sharp minor", "Sonata quasi una fantasia"), ...nick("Moonlight Sonata"), ...tr("Mondscheinsonate"), ...cat("Op. 27 No. 2")],
  },
  "canon-in-d": { genre: "classical", catalogue: "P. 37", aliases: [...nick("Pachelbel's Canon"), ...t("Canon and Gigue in D major")] },
  "ode-to-joy": { genre: "classical", catalogue: "Op. 125", movement: "Symphony No. 9, 4th movement (theme)", aliases: [...t("Symphony No. 9", "Choral Symphony"), ...tr("An die Freude"), ...cat("Op. 125")] },
  "eine-kleine-nachtmusik": { genre: "classical", catalogue: "K. 525", movement: "1st movement: Allegro", aliases: [...t("Serenade No. 13 in G major"), ...tr("A Little Night Music"), ...cat("K. 525")] },
  "rondo-alla-turca": { genre: "classical", catalogue: "K. 331", movement: "3rd movement", aliases: [...nick("Turkish March", "Alla Turca"), ...t("Piano Sonata No. 11 in A major"), ...cat("K. 331")] },
  "the-entertainer": { genre: "ragtime", aliases: t("The Entertainer: A Rag Time Two Step") },
  "silent-night": { genre: "hymn-carol", aliases: tr("Stille Nacht", "Stille Nacht, heilige Nacht") },
  "amazing-grace": { genre: "hymn-carol", aliases: t("New Britain") },
  "clair-de-lune": { genre: "classical", catalogue: "L. 75", movement: "Suite bergamasque, 3rd movement", aliases: [...t("Suite bergamasque"), ...cat("L. 75", "L. 82")] },
  "beethoven-5th-symphony": {
    genre: "classical", catalogue: "Op. 67", movement: "1st movement: Allegro con brio",
    aliases: [...t("Symphony No. 5 in C minor"), ...nick("Beethoven's 5th", "Fate Symphony"), ...cat("Op. 67")],
  },
  "joy-to-the-world": { genre: "hymn-carol", aliases: t("Antioch") },
  "gymnopedie-1": { genre: "classical", aliases: t("Gymnopédies") },
  "brahms-lullaby": { genre: "classical", catalogue: "Op. 49 No. 4", aliases: [...nick("Brahms' Lullaby", "Cradle Song"), ...tr("Wiegenlied", "Guten Abend, gut' Nacht"), ...cat("Op. 49 No. 4")] },
  "vivaldi-spring": { genre: "classical", catalogue: "RV 269", movement: "1st movement: Allegro", aliases: [...t("The Four Seasons", "Violin Concerto Op. 8 No. 1"), ...tr("La primavera"), ...cat("RV 269")] },
  "toccata-and-fugue": { genre: "classical", catalogue: "BWV 565", aliases: cat("BWV 565") },
  "hark-the-herald-angels-sing": { genre: "hymn-carol", aliases: t("Mendelssohn (hymn tune)") },
  "o-come-all-ye-faithful": { genre: "hymn-carol", aliases: tr("Adeste Fideles") },
  "schubert-ave-maria": { genre: "classical", catalogue: "D. 839", aliases: [...tr("Ellens dritter Gesang", "Ellen's Third Song"), ...cat("D. 839")] },
  "nocturne-op-9-no-2": { genre: "classical", catalogue: "Op. 9 No. 2", aliases: [...t("Nocturne in E-flat major"), ...cat("Op. 9 No. 2")] },
  "minuet-in-g": { genre: "classical", catalogue: "BWV Anh. 114", aliases: [...t("Anna Magdalena Notebook"), ...cat("BWV Anh. 114")] },
  "prelude-in-c": { genre: "classical", catalogue: "BWV 846", aliases: [...t("Well-Tempered Clavier Book I: Prelude No. 1"), ...cat("BWV 846")] },
  "maple-leaf-rag": { genre: "ragtime" },
  "hall-of-the-mountain-king": { genre: "classical", catalogue: "Op. 46 No. 4", aliases: [...t("Peer Gynt Suite No. 1"), ...tr("I Dovregubbens hall"), ...cat("Op. 46 No. 4")] },
  "first-noel": { genre: "hymn-carol", aliases: t("The First Nowell") },
  greensleeves: { genre: "folk", aliases: t("What Child Is This") },
  "minute-waltz": { genre: "classical", catalogue: "Op. 64 No. 1", aliases: [...t("Waltz in D-flat major"), ...tr("Valse du petit chien"), ...cat("Op. 64 No. 1")] },
  "fantaisie-impromptu": { genre: "classical", catalogue: "Op. 66", aliases: [...t("Fantasie-Impromptu", "Impromptu No. 4 in C-sharp minor"), ...cat("Op. 66")] },
  "sonata-facile": {
    genre: "classical", catalogue: "K. 545", movement: "1st movement: Allegro",
    aliases: [...t("Piano Sonata No. 16 in C major", "Sonata semplice"), ...cat("K. 545")],
  },
  "blue-danube": { genre: "classical", catalogue: "Op. 314", aliases: [...t("Blue Danube Waltz"), ...tr("An der schönen blauen Donau"), ...cat("Op. 314")] },
  "away-in-a-manger": { genre: "hymn-carol", aliases: t("Mueller") },
  "o-little-town-of-bethlehem": { genre: "hymn-carol", aliases: t("St. Louis") },
  "moonlight-sonata-3": {
    genre: "classical", catalogue: "Op. 27 No. 2", movement: "3rd movement: Presto agitato",
    aliases: [...t("Piano Sonata No. 14", "Sonata No. 14 in C-sharp minor", "Sonata quasi una fantasia"), ...nick("Moonlight Sonata"), ...tr("Mondscheinsonate"), ...cat("Op. 27 No. 2")],
  },
  traumerei: { genre: "classical", catalogue: "Op. 15 No. 7", aliases: [...t("Kinderszenen", "Scenes from Childhood"), ...tr("Traeumerei", "Dreaming"), ...cat("Op. 15 No. 7")] },
  "raindrop-prelude": { genre: "classical", catalogue: "Op. 28 No. 15", aliases: [...t("Prelude in D-flat major"), ...cat("Op. 28 No. 15")] },
  "pathetique-2": {
    genre: "classical", catalogue: "Op. 13", movement: "2nd movement: Adagio cantabile",
    aliases: [...t("Piano Sonata No. 8 in C minor", "Grande sonate pathétique"), ...nick("Pathétique"), ...cat("Op. 13")],
  },
  "o-come-o-come-emmanuel": { genre: "hymn-carol", aliases: tr("Veni, veni, Emmanuel") },
  "good-king-wenceslas": { genre: "hymn-carol", aliases: t("Tempus adest floridum") },
  "holy-holy-holy": { genre: "hymn-carol", aliases: t("Nicaea") },
  "a-mighty-fortress": { genre: "hymn-carol", aliases: tr("Ein feste Burg ist unser Gott") },
  promenade: { genre: "classical", aliases: [...t("Pictures at an Exhibition"), ...tr("Bilder einer Ausstellung")] },
  "prelude-in-e-minor": { genre: "classical", catalogue: "Op. 28 No. 4", aliases: cat("Op. 28 No. 4") },
  "invention-1": { genre: "classical", catalogue: "BWV 772", aliases: [...t("Two-Part Invention No. 1"), ...cat("BWV 772")] },
  "mozart-k331-theme": { genre: "classical", catalogue: "K. 331", movement: "1st movement: Andante grazioso (theme)", aliases: [...t("Piano Sonata No. 11 in A major"), ...cat("K. 331")] },
  "the-holly-and-the-ivy": { genre: "hymn-carol" },
  "clementi-sonatina-op-36-1": { genre: "classical", catalogue: "Op. 36 No. 1", movement: "1st movement", aliases: cat("Op. 36 No. 1") },
  "march-of-the-wooden-soldiers": { genre: "classical", catalogue: "Op. 39 No. 5", aliases: [...t("Album for the Young"), ...cat("Op. 39 No. 5")] },
  "prelude-in-c-minor": { genre: "classical", catalogue: "BWV 847", aliases: [...t("Well-Tempered Clavier Book I: Prelude No. 2"), ...cat("BWV 847")] },
  "christ-the-lord-is-risen-today": { genre: "hymn-carol", aliases: t("Easter Hymn", "Lyra Davidica") },
  "praise-to-the-lord": { genre: "hymn-carol", aliases: tr("Lobe den Herren") },
  "o-god-our-help": { genre: "hymn-carol", aliases: t("St. Anne") },
  "lo-how-a-rose": { genre: "hymn-carol", aliases: tr("Es ist ein Ros entsprungen") },
  "fairest-lord-jesus": { genre: "hymn-carol", aliases: [...t("Crusaders' Hymn"), ...tr("Schönster Herr Jesu")] },
  "consolation-3": { genre: "classical", catalogue: "S. 172 No. 3", aliases: [...t("Consolation in D-flat major"), ...cat("S. 172 No. 3")] },
  "burgmuller-arabesque": { genre: "classical", catalogue: "Op. 100 No. 2", aliases: [...t("25 Easy and Progressive Studies"), ...tr("L'arabesque"), ...cat("Op. 100 No. 2")] },
  "invention-8": { genre: "classical", catalogue: "BWV 779", aliases: [...t("Two-Part Invention No. 8"), ...cat("BWV 779")] },
  "invention-4": { genre: "classical", catalogue: "BWV 775", aliases: [...t("Two-Part Invention No. 4"), ...cat("BWV 775")] },
  "invention-13": { genre: "classical", catalogue: "BWV 784", aliases: [...t("Two-Part Invention No. 13"), ...cat("BWV 784")] },
  "happy-birthday": { genre: "childrens", published_year: 1893, aliases: t("Good Morning to All") },
  "jingle-bells": { genre: "hymn-carol", aliases: t("One Horse Open Sleigh") },
  "twinkle-twinkle-little-star": { genre: "childrens", aliases: tr("Ah! vous dirai-je, maman") },
  "wedding-march": { genre: "classical", catalogue: "Op. 61 No. 9", aliases: [...t("A Midsummer Night's Dream"), ...cat("Op. 61 No. 9")] },
  "bridal-chorus": { genre: "classical", aliases: [...nick("Here Comes the Bride"), ...t("Lohengrin"), ...tr("Treulich geführt")] },
  "hallelujah-chorus": { genre: "classical", catalogue: "HWV 56", aliases: [...t("Messiah"), ...cat("HWV 56")] },
  "swan-lake-theme": { genre: "classical", catalogue: "Op. 20", aliases: [...t("Swan Lake"), ...cat("Op. 20")] },
  "can-can": { genre: "classical", aliases: [...t("Galop infernal", "Orpheus in the Underworld"), ...tr("Orphée aux enfers")] },
  habanera: { genre: "classical", aliases: [...t("Carmen"), ...tr("L'amour est un oiseau rebelle")] },
  "air-on-the-g-string": { genre: "classical", catalogue: "BWV 1068", aliases: [...t("Orchestral Suite No. 3: Air", "Air on G"), ...cat("BWV 1068")] },
  "gounod-ave-maria": { genre: "classical", aliases: t("Bach-Gounod Ave Maria", "Meditation on Bach's Prelude No. 1") },
  "pomp-and-circumstance-1": {
    genre: "march", catalogue: "Op. 39 No. 1", published_year: 1901,
    aliases: [...nick("Land of Hope and Glory", "Graduation March"), ...cat("Op. 39 No. 1")],
  },
  "jesu-joy-of-mans-desiring": { genre: "classical", catalogue: "BWV 147", aliases: [...tr("Jesus bleibet meine Freude"), ...t("Herz und Mund und Tat und Leben"), ...cat("BWV 147")] },
  "la-donna-e-mobile": { genre: "classical", aliases: t("Rigoletto") },
  brindisi: { genre: "classical", aliases: [...t("La traviata", "Libiamo"), ...tr("Drinking Song")] },
  "carmen-prelude": { genre: "classical", aliases: t("Carmen", "Carmen Overture") },
  "morning-mood": { genre: "classical", catalogue: "Op. 46 No. 1", aliases: [...t("Peer Gynt Suite No. 1", "Morning"), ...tr("Morgenstemning"), ...cat("Op. 46 No. 1")] },
  "hungarian-dance-5": { genre: "classical", catalogue: "WoO 1 No. 5", aliases: [...tr("Ungarische Tänze"), ...cat("WoO 1 No. 5")] },
  "sugar-plum-fairy": { genre: "classical", catalogue: "Op. 71", aliases: [...t("The Nutcracker"), ...tr("Danse de la Fée Dragée"), ...cat("Op. 71")] },
  "we-wish-you-a-merry-christmas": { genre: "hymn-carol" },
  "deck-the-halls": { genre: "hymn-carol", aliases: tr("Nos Galan") },
  "auld-lang-syne": { genre: "folk" },
  "radetzky-march": { genre: "march", catalogue: "Op. 228", aliases: cat("Op. 228") },
  "new-world-largo": {
    genre: "classical", catalogue: "Op. 95", movement: "2nd movement: Largo",
    aliases: [...t("Symphony No. 9 From the New World", "Goin' Home"), ...nick("New World Symphony"), ...cat("Op. 95")],
  },
  "rachmaninoff-prelude-c-sharp-minor": {
    genre: "classical", catalogue: "Op. 3 No. 2", published_year: 1893,
    aliases: [...nick("The Bells of Moscow"), ...cat("Op. 3 No. 2")],
  },
  // The Work is Leontovych's Shchedryk. Wilhousky's English lyrics (1936) are
  // still in copyright and are not part of it.
  "carol-of-the-bells": { genre: "hymn-carol", aliases: tr("Shchedryk") },
  "danny-boy": { genre: "folk", aliases: t("Londonderry Air") },
  "god-rest-ye-merry-gentlemen": { genre: "hymn-carol" },
  "when-the-saints-go-marching-in": { genre: "folk", aliases: nick("The Saints") },
  "stars-and-stripes-forever": { genre: "march", published_year: 1897 },
  "scarborough-fair": { genre: "folk" },
  "revolutionary-etude": { genre: "classical", catalogue: "Op. 10 No. 12", aliases: [...t("Etude in C minor"), ...cat("Op. 10 No. 12")] },
  "gnossienne-1": { genre: "classical", aliases: t("Gnossiennes") },
  "debussy-arabesque-1": { genre: "classical", catalogue: "L. 66 No. 1", aliases: [...t("Deux arabesques"), ...tr("Première arabesque"), ...cat("L. 66 No. 1")] },
  "pathetique-3": {
    genre: "classical", catalogue: "Op. 13", movement: "3rd movement: Rondo. Allegro",
    aliases: [...t("Piano Sonata No. 8 in C minor", "Grande sonate pathétique"), ...nick("Pathétique"), ...cat("Op. 13")],
  },
  "prelude-in-a-major": { genre: "classical", catalogue: "Op. 28 No. 7", aliases: cat("Op. 28 No. 7") },
  "brahms-waltz-op-39-15": { genre: "classical", catalogue: "Op. 39 No. 15", aliases: [...t("Waltz in A-flat major"), ...cat("Op. 39 No. 15")] },
  "minuet-in-g-minor": { genre: "classical", catalogue: "BWV Anh. 115", aliases: [...t("Anna Magdalena Notebook"), ...cat("BWV Anh. 115")] },
  "in-the-bleak-midwinter": { genre: "hymn-carol", published_year: 1906, aliases: t("Cranham") },
  "abide-with-me": { genre: "hymn-carol", aliases: t("Eventide") },
  shenandoah: { genre: "folk" },
  "happy-farmer": { genre: "classical", catalogue: "Op. 68 No. 10", aliases: [...t("Album for the Young"), ...tr("Fröhlicher Landmann"), ...cat("Op. 68 No. 10")] },
};

/**
 * The authored beginner pack (scripts/generate-beginner-pack.ts), keyed by the
 * slug in its `beginner-<slug>.mid` file name. Tunes the Essentials pack also
 * has are listed in ESSENTIALS_REPLACES and join that Work instead.
 */
export const BEGINNER_WORKS: Record<string, WorkMeta> = {
  "mary-had-a-little-lamb": { genre: "childrens" },
  "hot-cross-buns": { genre: "childrens" },
  "merrily-we-roll-along": { genre: "childrens" },
  "lightly-row": { genre: "childrens", aliases: tr("Hänschen klein") },
  "frere-jacques": { genre: "childrens", aliases: tr("Are You Sleeping", "Brother John") },
  "london-bridge": { genre: "childrens", aliases: t("London Bridge") },
  "row-row-row-your-boat": { genre: "childrens" },
  "yankee-doodle": { genre: "folk" },
  "oh-susanna": { genre: "folk" },
  "swing-low-sweet-chariot": { genre: "folk" },
  "camptown-races": { genre: "folk" },
};

export const COLLECTION_TAGS = {
  essentials: { id: "essentials", label: "Essentials", kind: "collection" },
  beginner: { id: "beginner-pack", label: "Beginner pack", kind: "collection" },
  midiano: { id: "midiano-classics", label: "Midiano classics", kind: "collection" },
} as const;

/**
 * Essentials versions whose measured signals miss the automatic Verified bar
 * for a reason the measurement cannot see, approved here by hand. Applied once
 * as `tier_override` (with a CatalogueEvent), never over an admin's own override.
 */
export const CURATED_TIER_OVERRIDES: Record<string, { tier: "verified"; reason: string }> = {
  "essentials-carmen-prelude-full": {
    tier: "verified",
    reason:
      "Essentials version (passed the pack's incipit and level checks). Quantisation measures 0.78 because about 400 onsets sit exactly 50 ticks after a grid position (a fixed offset from the typeset source, consistent with grace notes), not performance timing.",
  },
  "essentials-carmen-prelude-intermediate": {
    tier: "verified",
    reason:
      "Essentials version (passed the pack's incipit and level checks). Quantisation measures 0.80 from the same fixed 50-tick offset as the Full version (about 230 onsets), not performance timing.",
  },
  "essentials-the-holly-and-the-ivy-full": {
    tier: "verified",
    reason:
      "Essentials version (passed the pack's incipit and level checks). The Full version is the hymn tune alone, one track of 59 notes (24 s) all on the eighth-note grid, so it has no hand split by design.",
  },
};

/** Mood and occasion tags (library spec 3.1). The shelves on the Songs screen read these. */
export const MOOD_TAGS = {
  christmas: { id: "christmas", label: "Christmas", kind: "mood" },
  relaxing: { id: "relaxing", label: "Relaxing", kind: "mood" },
  wedding: { id: "wedding", label: "Wedding", kind: "mood" },
  kids: { id: "kids", label: "Kids", kind: "mood" },
  easter: { id: "easter", label: "Easter", kind: "mood" },
} as const;

export type MoodTagId = keyof typeof MOOD_TAGS;

/**
 * Mood tags per Work id (an Essentials slug, or a beginner-pack slug for tunes
 * that have a Work of their own). Applied only to a Work that has no mood tag
 * yet, so an admin who retags a Work is not overruled by the next run.
 */
export const WORK_MOOD_TAGS: Record<string, MoodTagId[]> = {
  // Carols and winter pieces.
  "silent-night": ["christmas", "relaxing"],
  "joy-to-the-world": ["christmas"],
  "hark-the-herald-angels-sing": ["christmas"],
  "o-come-all-ye-faithful": ["christmas"],
  "first-noel": ["christmas"],
  "away-in-a-manger": ["christmas", "kids", "relaxing"],
  "o-little-town-of-bethlehem": ["christmas", "relaxing"],
  "o-come-o-come-emmanuel": ["christmas"],
  "good-king-wenceslas": ["christmas"],
  "the-holly-and-the-ivy": ["christmas"],
  "jingle-bells": ["christmas", "kids"],
  "we-wish-you-a-merry-christmas": ["christmas", "kids"],
  "deck-the-halls": ["christmas"],
  "carol-of-the-bells": ["christmas"],
  "god-rest-ye-merry-gentlemen": ["christmas"],
  "in-the-bleak-midwinter": ["christmas", "relaxing"],
  "lo-how-a-rose": ["christmas", "relaxing"],
  greensleeves: ["christmas", "relaxing"],
  "sugar-plum-fairy": ["christmas"],
  "hallelujah-chorus": ["christmas", "easter", "wedding"],
  "christ-the-lord-is-risen-today": ["easter"],
  // Slow, quiet pieces.
  "clair-de-lune": ["relaxing"],
  "gymnopedie-1": ["relaxing"],
  "gnossienne-1": ["relaxing"],
  "brahms-lullaby": ["relaxing", "kids"],
  traumerei: ["relaxing"],
  "nocturne-op-9-no-2": ["relaxing"],
  "moonlight-sonata-1": ["relaxing"],
  "raindrop-prelude": ["relaxing"],
  "prelude-in-c": ["relaxing"],
  "consolation-3": ["relaxing"],
  "morning-mood": ["relaxing"],
  "new-world-largo": ["relaxing"],
  "amazing-grace": ["relaxing"],
  "danny-boy": ["relaxing"],
  "abide-with-me": ["relaxing"],
  // Weddings: the processional and recessional, and the usual ceremony music.
  "wedding-march": ["wedding"],
  "bridal-chorus": ["wedding"],
  "canon-in-d": ["wedding", "relaxing"],
  "air-on-the-g-string": ["wedding", "relaxing"],
  "jesu-joy-of-mans-desiring": ["wedding", "relaxing"],
  "schubert-ave-maria": ["wedding", "relaxing"],
  "gounod-ave-maria": ["wedding", "relaxing"],
  "ode-to-joy": ["wedding"],
  // Children's tunes.
  "twinkle-twinkle-little-star": ["kids"],
  "happy-birthday": ["kids"],
  "mary-had-a-little-lamb": ["kids"],
  "hot-cross-buns": ["kids"],
  "row-row-row-your-boat": ["kids"],
  "frere-jacques": ["kids"],
  "london-bridge": ["kids"],
  "lightly-row": ["kids"],
  "merrily-we-roll-along": ["kids"],
};

/**
 * `Work.featured_rank` (1 = first on the Featured and Beginner favourites
 * shelves): strong, widely known pieces a beginner can play, in the order a
 * new player should meet them. Filled only where a Work has no rank, so an
 * editor's ranking is never overwritten (an editor who clears a rank to null
 * gets it back on the next run unless the entry is removed here).
 */
export const FEATURED_RANK: Record<string, number> = {
  "twinkle-twinkle-little-star": 1,
  "ode-to-joy": 2,
  "happy-birthday": 3,
  "mary-had-a-little-lamb": 4,
  "row-row-row-your-boat": 5,
  "jingle-bells": 6,
  "silent-night": 7,
  "minuet-in-g": 8,
  "fur-elise": 9,
  "canon-in-d": 10,
  "amazing-grace": 11,
  greensleeves: 12,
  "brahms-lullaby": 13,
  "prelude-in-c": 14,
  "joy-to-the-world": 15,
  "when-the-saints-go-marching-in": 16,
  "auld-lang-syne": 17,
  "scarborough-fair": 18,
  "the-entertainer": 19,
  "gymnopedie-1": 20,
  "we-wish-you-a-merry-christmas": 21,
  "moonlight-sonata-1": 22,
};

/**
 * Approximate grade band from the 1-5 difficulty level (library spec 3.1):
 * 1 = Initial-Grade 1, 2 = 2-3, 3 = 4-5, 4 = 6-7, 5 = 8+. The levels come from
 * the same heuristic as `Song.difficulty`. Only curated (Essentials and
 * beginner-pack) versions get a band: their level was checked when the pack
 * was built, while an ADL or uploaded file's heuristic level says little about
 * how hard it is to read. Marked approximate because these are not exam grades.
 */
export const GRADE_BANDS: Record<number, string> = {
  1: "≈ Initial–Grade 1",
  2: "≈ Grades 2–3",
  3: "≈ Grades 4–5",
  4: "≈ Grades 6–7",
  5: "≈ Grade 8+",
};

export const gradeBandFor = (difficulty: number): string | null => GRADE_BANDS[difficulty] ?? null;
