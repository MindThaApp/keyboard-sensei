/**
 * Batch B of the library redesign: teaching repertoire from the Mutopia
 * Project (library spec sections 6 and 7, WP6): the Anna Magdalena Notebook
 * minuets, Bach's little preludes and inventions, Burgmüller's Op. 100,
 * Czerny, the Clementi, Kuhlau, Handel, Beethoven and Dussek sonatinas and
 * sonatas, Schumann's and Tchaikovsky's albums for the young, Bartók, and
 * Streabbog. 44 works from 39 of the proposal's 46 rows.
 *
 * Primary source: a Mutopia Project MIDI file, pinned by exact URL and
 * sha256 (the zip itself where the file is a member of one). Each carries the
 * licence its Mutopia page prints; the compositions are all public domain and
 * a CC licence covers the typesetting.
 *
 * Second source for the opening-notes check (see ./incipit.ts): none of these
 * has a second machine-readable edition, so each is imported unchecked and a
 * reviewer compares the opening with the public-domain IMSLP scan.
 *
 * How the 46 rows became 44 works:
 *   - Rows 25 (Czerny Op. 840 Nos. 1-3), 26 (Clementi Op. 36 No. 1, movements
 *     2 and 3) and 27 (Kuhlau Op. 20 No. 1, three movements) are one Mutopia
 *     file per number or movement, so each is its own Work (3 + 2 + 3 = 8
 *     works from 3 rows).
 *   - Rows 3, 5, 31, 32, 42 and 43 have no Mutopia file ("authored" in the
 *     proposal). The pack pipeline ingests pinned files only, and a score typed
 *     from memory cannot be checked against two editions here, so they are
 *     left to the authored packs and not imported.
 *   - Row 44 (Bartok, Romanian Folk Dance No. 2: 13 s) and Czerny Op. 821
 *     Nos. 1-4 (row 24: 12 to 17 s) are single files shorter than the 20 s
 *     minimum the library accepts, so they are not imported; Op. 821 No. 5
 *     (24 s) is. They need bundling, not a pinned file each.
 *   - Row 21 numbers La Babillarde Op. 100 No. 13; No. 13 is Consolation and
 *     La Babillarde is No. 17 (Mutopia's own file number agrees).
 *
 * Everything lands as a draft.
 */
import type { MutopiaLicence, MutopiaPrimarySource, Pack, PackPiece } from "./pack.js";

const FTP = "https://www.mutopiaproject.org/ftp/";

/** A pinned Mutopia file; `file` is its path under the site's /ftp/ tree. */
function mutopia(mutopiaId: string, mutopiaRef: string, licence: MutopiaLicence, maintainer: string, file: string, sha256: string, member?: string): MutopiaPrimarySource {
  return {
    kind: "mutopia",
    mutopiaId,
    mutopiaRef,
    licence,
    maintainer,
    url: `${FTP}${file}`,
    sha256,
    ...(member ? { member } : {}),
    infoUrl: `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${mutopiaId}`,
  };
}

const SCAN: PackPiece["second"] = {
  kind: "scan",
  reference: "IMSLP PD edition",
  reason: "no second machine-readable edition; IMSLP public-domain scan; the opening is compared by a reviewer",
};

export const BATCH_B: Pack = {
  id: "batch-b",
  name: "Batch B: teaching repertoire (Mutopia)",
  pieces: [
  {
    slug: "minuet-in-f-bwv-anh-113", rank: 1, title: "Minuet in F, BWV Anh. 113", composer: "Anonymous", catalogue: "BWV Anh. 113",
    genre: "teaching", era: "baroque", level: 1,
    aliases: [{ alias: "Menuet in F", kind: "title" }, { alias: "Minuet in F major", kind: "title" }, { alias: "Notebook for Anna Magdalena Bach", kind: "title" }, { alias: "BWV Anh. 113", kind: "catalogue" }],
    primary: mutopia("74", "Mutopia-2013/01/06-74", "Public Domain", "Allen Garvin", "BachJS/BWVAnh113/anna-magdalena-03/anna-magdalena-03.mid", "aef4b7f879bec1feb9970df6ac8b8f69314a3ba0ad69512be8d0834acd54c499"),
    second: SCAN,
  },
  {
    slug: "minuet-in-g-bwv-anh-116", rank: 2, title: "Minuet in G, BWV Anh. 116", composer: "Anonymous", catalogue: "BWV Anh. 116",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Menuet in G major", kind: "title" }, { alias: "Notebook for Anna Magdalena Bach", kind: "title" }, { alias: "BWV Anh. 116", kind: "catalogue" }],
    primary: mutopia("77", "Mutopia-2013/01/06-77", "Public Domain", "Allen Garvin", "BachJS/BWVAnh116/anna-magdalena-07/anna-magdalena-07.mid", "d304586f42030116f2996a140022dc4b93eee63f12226a337c6f29117441dc7c"),
    second: SCAN,
  },
  {
    slug: "musette-in-d-bwv-anh-126", rank: 3, title: "Musette in D, BWV Anh. 126", composer: "Anonymous", catalogue: "BWV Anh. 126",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Musette in D major", kind: "title" }, { alias: "Notebook for Anna Magdalena Bach", kind: "title" }, { alias: "BWV Anh. 126", kind: "catalogue" }],
    primary: mutopia("79", "Mutopia-2013/01/06-79", "Public Domain", "Allen Garvin", "BachJS/BWVAnh126/anna-magdalena-22/anna-magdalena-22.mid", "3b03c3939b767a0d46b77eba058d6decc0f191bfb1aa81a1a3bafc9c49098275"),
    second: SCAN,
  },
  {
    slug: "polonaise-in-g-minor-bwv-anh-119", rank: 4, title: "Polonaise in G minor, BWV Anh. 119", composer: "Anonymous", catalogue: "BWV Anh. 119",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Notebook for Anna Magdalena Bach", kind: "title" }, { alias: "BWV Anh. 119", kind: "catalogue" }],
    primary: mutopia("1016", "Mutopia-2007/07/30-1016", "Public Domain", "Steven McDougall", "BachJS/BWVAnh119/BWV-119/BWV-119.mid", "69cfdd1d65d2062aa3326601e1aa5101c62c3932841af4d6de81a513dd8209c9"),
    second: SCAN,
  },
  {
    slug: "minuet-in-a-minor-bwv-anh-120", rank: 5, title: "Minuet in A minor, BWV Anh. 120", composer: "Anonymous", catalogue: "BWV Anh. 120",
    genre: "teaching", era: "baroque", level: 1,
    aliases: [{ alias: "Menuet in A minor", kind: "title" }, { alias: "Notebook for Anna Magdalena Bach", kind: "title" }, { alias: "BWV Anh. 120", kind: "catalogue" }],
    primary: mutopia("1612", "Mutopia-2009/01/06-1612", "Public Domain", "Steven McDougall", "BachJS/BWVAnh120/BWV-120/BWV-120.mid", "0946fa8ab89a3340e53edacb213bbc3e21e45522057b062614ccdfc8e99ffc66"),
    second: SCAN,
  },
  {
    slug: "little-prelude-in-c-bwv-924a", rank: 6, title: "Little Prelude in C, BWV 924a", composer: "Johann Sebastian Bach", catalogue: "BWV 924a",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Prelude in C major, BWV 924a", kind: "title" }, { alias: "Praeludium in C", kind: "title" }, { alias: "BWV 924a", kind: "catalogue" }],
    primary: mutopia("1028", "Mutopia-2007/08/22-1028", "Creative Commons Attribution-ShareAlike 3.0", "jeff covey", "BachJS/BWV924a/bach-prelude-bwv924a/bach-prelude-bwv924a.mid", "4bbb8feb0d00db78ce86a8dc333846d01ea4d7aba5562d993ed0e9ad12f042e3"),
    second: SCAN,
  },
  {
    slug: "little-prelude-in-d-minor-bwv-926", rank: 7, title: "Little Prelude in D minor, BWV 926", composer: "Johann Sebastian Bach", catalogue: "BWV 926",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Praeludium in D minor", kind: "title" }, { alias: "Prelude in D minor, BWV 926", kind: "title" }, { alias: "BWV 926", kind: "catalogue" }],
    primary: mutopia("69", "Mutopia-2009/02/22-69", "Public Domain", "Allen Garvin", "BachJS/BWV926/bach-praeludium-02/bach-praeludium-02.mid", "f054a135b9ca9925938c5c46606e56b8adeffcd88b60094995c7823304435b15"),
    second: SCAN,
  },
  {
    slug: "invention-2", rank: 8, title: "Invention No. 2 in C Minor", composer: "Johann Sebastian Bach", catalogue: "BWV 773",
    genre: "classical", era: "baroque", level: 3,
    aliases: [{ alias: "Two-Part Invention No. 2", kind: "title" }, { alias: "Invention in C minor", kind: "title" }, { alias: "BWV 773", kind: "catalogue" }],
    primary: mutopia("58", "Mutopia-2008/06/15-58", "Public Domain", "Allen Garvin", "BachJS/BWV773/bach-invention-02/bach-invention-02.mid", "b61e1e4d4a42ca70efd0eb8a65de3ed0ca0ee9c31556354608f6caa360e78e98"),
    second: SCAN,
  },
  {
    slug: "invention-14", rank: 9, title: "Invention No. 14 in B-flat Major", composer: "Johann Sebastian Bach", catalogue: "BWV 785",
    genre: "classical", era: "baroque", level: 3,
    aliases: [{ alias: "Two-Part Invention No. 14", kind: "title" }, { alias: "Invention in B-flat major", kind: "title" }, { alias: "BWV 785", kind: "catalogue" }],
    primary: mutopia("72", "Mutopia-2008/06/15-72", "Public Domain", "Allen Garvin", "BachJS/BWV785/bach-invention-14/bach-invention-14.mid", "8ef3606dc2b71c51c7c0e4438080ed641963e1a8e69d7b82aba42a04ebc5e9b9"),
    second: SCAN,
  },
  {
    slug: "burgmuller-la-candeur", rank: 10, title: "La Candeur, Op. 100 No. 1", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 1",
    genre: "teaching", era: "romantic", level: 1,
    aliases: [{ alias: "Op. 100 No. 1", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "La candeur", kind: "title" }, { alias: "Candour", kind: "translation" }],
    primary: mutopia("202", "Mutopia-2013/01/12-202", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-01/25EF-01.mid", "ad185dbf3cb7e3e187cbe6e38c5ead706cf375b9d441f7191429027436b2a8e4"),
    second: SCAN,
  },
  {
    slug: "burgmuller-progres", rank: 11, title: "Progrès, Op. 100 No. 6", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 6",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 6", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Progres", kind: "title" }, { alias: "Progress", kind: "translation" }],
    primary: mutopia("215", "Mutopia-2013/01/12-215", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-06/25EF-06.mid", "d28e280d333d8a97262a4ffeba00fab251d382cd9a17e45a517d6613cb03f722"),
    second: SCAN,
  },
  {
    slug: "burgmuller-innocence", rank: 12, title: "Innocence, Op. 100 No. 5", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 5",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 5", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Innocence", kind: "translation" }],
    primary: mutopia("214", "Mutopia-2013/01/12-214", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-05/25EF-05.mid", "39768b50abb623d24986b0e3993518ca92a6f1340d6154fc092f218cb6b97fee"),
    second: SCAN,
  },
  {
    slug: "burgmuller-la-pastorale", rank: 13, title: "La Pastorale, Op. 100 No. 3", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 3",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 3", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Pastorale", kind: "title" }, { alias: "The Pastoral", kind: "translation" }],
    primary: mutopia("218", "Mutopia-2013/01/12-218", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-03/25EF-03.mid", "192500ee12358537bf92811064ee4ad0b680c78302d5762175a3c32fe573a577"),
    second: SCAN,
  },
  {
    slug: "burgmuller-le-courant-limpide", rank: 14, title: "Le Courant Limpide, Op. 100 No. 7", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 7",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 7", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Le courant limpide", kind: "title" }, { alias: "The Limpid Stream", kind: "translation" }],
    primary: mutopia("216", "Mutopia-2013/01/12-216", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-07/25EF-07.mid", "9547c21afbaa004cd95174752098bf6997a541d97759d2ef34f499432c5ecab5"),
    second: SCAN,
  },
  {
    slug: "burgmuller-la-chasse", rank: 15, title: "La Chasse, Op. 100 No. 9", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 9",
    genre: "teaching", era: "romantic", level: 3,
    aliases: [{ alias: "Op. 100 No. 9", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "The Hunt", kind: "translation" }],
    primary: mutopia("220", "Mutopia-2013/01/12-220", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-09/25EF-09.mid", "eb2d52c7df1681e23b8dc258d6933060984c7013d32c1a140c121fda48801848"),
    second: SCAN,
  },
  {
    slug: "burgmuller-ballade", rank: 16, title: "Ballade, Op. 100 No. 15", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 15",
    genre: "teaching", era: "romantic", level: 3,
    aliases: [{ alias: "Op. 100 No. 15", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }],
    primary: mutopia("227", "Mutopia-2013/01/12-227", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-15/25EF-15.mid", "cfba2544b8049f72bfda038620ff0543e9e1845b6e4d7431e4798f50ce06f716"),
    second: SCAN,
  },
  {
    slug: "burgmuller-la-styrienne", rank: 17, title: "La Styrienne, Op. 100 No. 14", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 14",
    genre: "teaching", era: "romantic", level: 3,
    aliases: [{ alias: "Op. 100 No. 14", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Styrienne", kind: "title" }, { alias: "The Styrian", kind: "translation" }],
    primary: mutopia("225", "Mutopia-2013/01/12-225", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-14/25EF-14.mid", "99052280f7e0895f4850f7691540ad8931b3f0fec3961ee6ad538faace0190fc"),
    second: SCAN,
  },
  {
    slug: "burgmuller-tendre-fleur", rank: 18, title: "Tendre Fleur, Op. 100 No. 10", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 10",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 10", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Tendre fleur", kind: "title" }, { alias: "Tender Flower", kind: "translation" }],
    primary: mutopia("221", "Mutopia-2013/01/12-221", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-10/25EF-10.mid", "58dd9eec57bfcb7fb8a924530e8f6c1e1599a02fc10cc4f79ae6d1ef6e2a0c85"),
    second: SCAN,
  },
  {
    slug: "burgmuller-la-babillarde", rank: 19, title: "La Babillarde, Op. 100 No. 17", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 17",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 17", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Babillarde", kind: "title" }, { alias: "The Chatterbox", kind: "translation" }],
    primary: mutopia("229", "Mutopia-2013/01/12-229", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-17/25EF-17.mid", "5893fa14e84e9c5e19080a365b76db400f861e4197dcf5ee402d9fea79f68e8c"),
    second: SCAN,
  },
  {
    slug: "burgmuller-douce-plainte", rank: 20, title: "Douce Plainte, Op. 100 No. 16", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 16",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Op. 100 No. 16", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Douce plainte", kind: "title" }, { alias: "Gentle Plaint", kind: "translation" }],
    primary: mutopia("228", "Mutopia-2013/01/12-228", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-16/25EF-16.mid", "c2ae841112f76ee00732264d501f9c66df048d7626f61f95883292a8867ece8c"),
    second: SCAN,
  },
  {
    slug: "burgmuller-l-adieu", rank: 21, title: "L'Adieu, Op. 100 No. 12", composer: "Friedrich Burgmüller", catalogue: "Op. 100 No. 12",
    genre: "teaching", era: "romantic", level: 3,
    aliases: [{ alias: "Op. 100 No. 12", kind: "catalogue" }, { alias: "25 Easy and Progressive Studies", kind: "title" }, { alias: "Adieu", kind: "title" }, { alias: "The Farewell", kind: "translation" }],
    primary: mutopia("223", "Mutopia-2013/01/12-223", "Public Domain", "Bas Wassink", "BurgmullerJFF/O100/25EF-12/25EF-12.mid", "4df722747c392323660dc4f9940acbb38af8b9952759d4c5cc7a02cf2e7f5cf8"),
    second: SCAN,
  },
  {
    slug: "czerny-821-5", rank: 22, title: "Eight-Measure Exercise No. 5, Op. 821", composer: "Carl Czerny", catalogue: "Op. 821 No. 5",
    genre: "teaching", era: "classical-era", level: 1,
    aliases: [{ alias: "160 Eight-Measure Exercises", kind: "title" }, { alias: "Op. 821 No. 5", kind: "catalogue" }],
    primary: mutopia("2066", "Mutopia-2015/11/11-2066", "Public Domain", "Manuel Castejon Limas", "CzernyC/Op_821/Czerny_Op_821_No_005/Czerny_Op_821_No_005.mid", "2c3a935fa76c4d860df16af79695ba470d42de2c601400953cec5bd1071574cc"),
    second: SCAN,
  },
  {
    slug: "czerny-840-1", rank: 23, title: "Melodic Study No. 1, Op. 840", composer: "Carl Czerny", catalogue: "Op. 840 No. 1",
    genre: "teaching", era: "classical-era", level: 2,
    aliases: [{ alias: "50 Melodic Studies", kind: "title" }, { alias: "Melodische Übungsstücke", kind: "title" }, { alias: "Op. 840 No. 1", kind: "catalogue" }],
    primary: mutopia("2146", "Mutopia-2016/11/15-2146", "Public Domain", "Manuela", "CzernyC/O840/op840-1/op840-1.mid", "6ee0bf432211a3e3372ea67266a255d99b0cf9db5ad35ba6dd2787e06b087f14"),
    second: SCAN,
  },
  {
    slug: "czerny-840-2", rank: 24, title: "Melodic Study No. 2, Op. 840", composer: "Carl Czerny", catalogue: "Op. 840 No. 2",
    genre: "teaching", era: "classical-era", level: 2,
    aliases: [{ alias: "50 Melodic Studies", kind: "title" }, { alias: "Melodische Übungsstücke", kind: "title" }, { alias: "Op. 840 No. 2", kind: "catalogue" }],
    primary: mutopia("2147", "Mutopia-2016/11/15-2147", "Public Domain", "Manuela", "CzernyC/O840/op840-2/op840-2.mid", "7d8ba07e3836e2a5fac7f7ce3eabc94238b63ed0435b3927f14807677ef64f5a"),
    second: SCAN,
  },
  {
    slug: "czerny-840-3", rank: 25, title: "Melodic Study No. 3, Op. 840", composer: "Carl Czerny", catalogue: "Op. 840 No. 3",
    genre: "teaching", era: "classical-era", level: 2,
    aliases: [{ alias: "50 Melodic Studies", kind: "title" }, { alias: "Melodische Übungsstücke", kind: "title" }, { alias: "Op. 840 No. 3", kind: "catalogue" }],
    primary: mutopia("2148", "Mutopia-2016/11/16-2148", "Public Domain", "Manuela", "CzernyC/O840/op840-3/op840-3.mid", "8bbe2f4e99c5cffc46904c927e326e1ec084f580fe142fb5397131a896fb7399"),
    second: SCAN,
  },
  {
    slug: "clementi-sonatina-op-36-1-2", rank: 26, title: "Sonatina in C, Op. 36 No. 1 (2nd Movement)", composer: "Muzio Clementi", catalogue: "Op. 36 No. 1", movement: "2nd movement: Andante",
    genre: "classical", era: "classical-era", level: 2,
    aliases: [{ alias: "Op. 36 No. 1", kind: "catalogue" }],
    primary: mutopia("804", "Mutopia-2016/11/30-804", "Public Domain", "Brian D. Rude", "ClementiM/O36/sonatina-1/sonatina-1-mids.zip", "d13263b200c89478ac167a97b617fd31747b292df9a8ddbe947c8c8d07d066ae", "sonatina-1-1.mid"),
    second: SCAN,
  },
  {
    slug: "clementi-sonatina-op-36-1-3", rank: 27, title: "Sonatina in C, Op. 36 No. 1 (3rd Movement)", composer: "Muzio Clementi", catalogue: "Op. 36 No. 1", movement: "3rd movement: Vivace",
    genre: "classical", era: "classical-era", level: 2,
    aliases: [{ alias: "Op. 36 No. 1", kind: "catalogue" }],
    primary: mutopia("804", "Mutopia-2016/11/30-804", "Public Domain", "Brian D. Rude", "ClementiM/O36/sonatina-1/sonatina-1-mids.zip", "d13263b200c89478ac167a97b617fd31747b292df9a8ddbe947c8c8d07d066ae", "sonatina-1-2.mid"),
    second: SCAN,
  },
  {
    slug: "kuhlau-sonatina-20-1-1", rank: 28, title: "Sonatina in C, Op. 20 No. 1 (1st Movement)", composer: "Friedrich Kuhlau", catalogue: "Op. 20 No. 1", movement: "1st movement: Allegro",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Sonatine in C major", kind: "title" }, { alias: "Op. 20 No. 1", kind: "catalogue" }],
    primary: mutopia("232", "Mutopia-2013/02/21-232", "Public Domain", "Bas Wassink", "KuhlauF/O20/sonatine-1-allegro/sonatine-1-allegro.mid", "d105169497a3bf92ee134c65c78eef1e5e7192fa53f2e9fedd4115681fa5a692"),
    second: SCAN,
  },
  {
    slug: "kuhlau-sonatina-20-1-2", rank: 29, title: "Sonatina in C, Op. 20 No. 1 (2nd Movement)", composer: "Friedrich Kuhlau", catalogue: "Op. 20 No. 1", movement: "2nd movement: Andante",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Sonatine in C major", kind: "title" }, { alias: "Op. 20 No. 1", kind: "catalogue" }],
    primary: mutopia("233", "Mutopia-2013/02/21-233", "Public Domain", "Bas Wassink", "KuhlauF/O20/sonatine-1-andante/sonatine-1-andante.mid", "40716b2815514fb6d4e642e862677430543508b3cf08dad8f4001058909cca81"),
    second: SCAN,
  },
  {
    slug: "kuhlau-sonatina-20-1-3", rank: 30, title: "Sonatina in C, Op. 20 No. 1 (3rd Movement)", composer: "Friedrich Kuhlau", catalogue: "Op. 20 No. 1", movement: "3rd movement: Rondo, Allegro",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Sonatine in C major", kind: "title" }, { alias: "Op. 20 No. 1", kind: "catalogue" }],
    primary: mutopia("234", "Mutopia-2013/02/21-234", "Public Domain", "Bas Wassink", "KuhlauF/O20/sonatine-1-rondo/sonatine-1-rondo.mid", "7d93b5766f58d7e2f526135d6504eb65bfd1f9922dcf2dd020a01d6022f7329f"),
    second: SCAN,
  },
  {
    slug: "handel-sonatina-hwv-585", rank: 31, title: "Sonatina in B-flat, HWV 585", composer: "George Frideric Handel", catalogue: "HWV 585",
    genre: "teaching", era: "baroque", level: 2,
    aliases: [{ alias: "Sonatina in B-flat major", kind: "title" }, { alias: "HWV 585", kind: "catalogue" }],
    primary: mutopia("98", "Mutopia-2013/03/22-98", "Public Domain", "David Maddock", "HandelGF/HWV585/sonatina-in-b-flat-major/sonatina-in-b-flat-major.mid", "92d59f554dfc5fb6a509a1c7eb5db958c9d51819e7411d06208b7deb140a2811"),
    second: SCAN,
  },
  {
    slug: "beethoven-op-49-2", rank: 32, title: "Sonata Op. 49 No. 2: Tempo di Menuetto", composer: "Ludwig van Beethoven", catalogue: "Op. 49 No. 2", movement: "2nd movement: Tempo di Menuetto",
    genre: "teaching", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 20", kind: "title" }, { alias: "Op. 49 No. 2", kind: "catalogue" }],
    primary: mutopia("777", "Mutopia-2006/06/05-777", "Public Domain", "Stelios Samelis", "BeethovenLv/O49/LVB_Sonate_49no2_2/LVB_Sonate_49no2_2.mid", "bbc781ca46ebd2e22e4fc9976a5fd5647c1da43dc7d545525c4b87d0244e251f"),
    second: SCAN,
  },
  {
    slug: "beethoven-op-49-1-1", rank: 33, title: "Sonata Op. 49 No. 1 (1st Movement)", composer: "Ludwig van Beethoven", catalogue: "Op. 49 No. 1", movement: "1st movement: Andante",
    genre: "teaching", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 19", kind: "title" }, { alias: "Op. 49 No. 1", kind: "catalogue" }],
    primary: mutopia("912", "Mutopia-2017/07/06-912", "Public Domain", "Stelios Samelis", "BeethovenLv/O49/LVB_Sonate_49no1_1/LVB_Sonate_49no1_1.mid", "ba6c0d49597a2d3d7f883448b9a8debce65db19f5e36922286c011bed22783ea"),
    second: SCAN,
  },
  {
    slug: "schumann-album-1-melody", rank: 34, title: "Melody (Album for the Young No. 1)", composer: "Robert Schumann", catalogue: "Op. 68 No. 1",
    genre: "teaching", era: "romantic", level: 1,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Melodie", kind: "translation" }, { alias: "Op. 68 No. 1", kind: "catalogue" }],
    primary: mutopia("647", "Mutopia-2007/02/11-647", "Creative Commons Attribution-ShareAlike 2.5", "Philippe Hézaine", "SchumannR/O68/schumann-op68-01-melodie/schumann-op68-01-melodie.mid", "f05a2e1f1fa397f4617d13d6b7bf679550ad9ae8032ed8c6b0f8446d519f5419"),
    second: SCAN,
  },
  {
    slug: "schumann-album-2-soldiers-march", rank: 35, title: "Soldiers' March (Album for the Young No. 2)", composer: "Robert Schumann", catalogue: "Op. 68 No. 2",
    genre: "teaching", era: "romantic", level: 1, tags: ["kids"],
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Soldatenmarsch", kind: "translation" }, { alias: "Op. 68 No. 2", kind: "catalogue" }],
    primary: mutopia("650", "Mutopia-2007/02/11-650", "Creative Commons Attribution-ShareAlike 2.5", "Philippe Hézaine", "SchumannR/O68/schumann-op68-02-marche-militaire/schumann-op68-02-marche-militaire.mid", "7af6c1c20db09d34963adf9e18d99266e51b6b26c361f0ba8d0d09d001a46bb7"),
    second: SCAN,
  },
  {
    slug: "schumann-album-3-humming-song", rank: 36, title: "Humming Song (Album for the Young No. 3)", composer: "Robert Schumann", catalogue: "Op. 68 No. 3",
    genre: "teaching", era: "romantic", level: 1,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Trällerliedchen", kind: "translation" }, { alias: "Op. 68 No. 3", kind: "catalogue" }],
    primary: mutopia("651", "Mutopia-2011/09/18-651", "Creative Commons Attribution-ShareAlike 3.0", "Philippe Hézaine", "SchumannR/O68/schumann-op68-03-chanson-fredonnee/schumann-op68-03-chanson-fredonnee.mid", "9d8872ff88f556e4426b1c304947e8eb396807d06d593bc3e9a5e29c364c1462"),
    second: SCAN,
  },
  {
    slug: "schumann-album-8-wild-rider", rank: 37, title: "Wild Rider (Album for the Young No. 8)", composer: "Robert Schumann", catalogue: "Op. 68 No. 8",
    genre: "teaching", era: "romantic", level: 2, tags: ["kids"],
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Wilder Reiter", kind: "translation" }, { alias: "Op. 68 No. 8", kind: "catalogue" }],
    primary: mutopia("655", "Mutopia-2007/02/11-655", "Creative Commons Attribution-ShareAlike 2.5", "Philippe Hézaine", "SchumannR/O68/schumann-op68-08-cavalier-sauvage/schumann-op68-08-cavalier-sauvage.mid", "197f870dea372a09c7905b9b02c6ed3b4c6b10b18a3b79c421ca01947dc45991"),
    second: SCAN,
  },
  {
    slug: "schumann-album-7-hunting-song", rank: 38, title: "Hunting Song (Album for the Young No. 7)", composer: "Robert Schumann", catalogue: "Op. 68 No. 7",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Jägerliedchen", kind: "translation" }, { alias: "Op. 68 No. 7", kind: "catalogue" }],
    primary: mutopia("691", "Mutopia-2007/05/20-691", "Creative Commons Attribution-ShareAlike 3.0", "Philippe Hézaine", "SchumannR/O68/schumann-op68-07-chanson-du-chasseur/schumann-op68-07-chanson-du-chasseur.mid", "18e7ae891edeafdc39d46f61864a88d3a52d2604cd213c2bae8cb3d32e523a46"),
    second: SCAN,
  },
  {
    slug: "schumann-album-16-first-loss", rank: 39, title: "First Loss (Album for the Young No. 16)", composer: "Robert Schumann", catalogue: "Op. 68 No. 16",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Erster Verlust", kind: "translation" }, { alias: "Op. 68 No. 16", kind: "catalogue" }],
    primary: mutopia("676", "Mutopia-2007/02/11-676", "Creative Commons Attribution-ShareAlike 2.5", "Philippe Hézaine", "SchumannR/O68/schumann-op68-16-premier-chagrin/schumann-op68-16-premier-chagrin.mid", "55156715e3a34eeebb8cc6e8066b6c77c703ecd6f2a76de2d98928efdc619a9c"),
    second: SCAN,
  },
  {
    slug: "schumann-album-11-sicilienne", rank: 40, title: "Sicilienne (Album for the Young No. 11)", composer: "Robert Schumann", catalogue: "Op. 68 No. 11",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "title" }, { alias: "Sicilianisch", kind: "translation" }, { alias: "Op. 68 No. 11", kind: "catalogue" }],
    primary: mutopia("783", "Mutopia-2007/02/11-783", "Creative Commons Attribution-ShareAlike 2.5", "Philippe Hézaine", "SchumannR/O68/schumann-op68-11-sicilienne/schumann-op68-11-sicilienne.mid", "faa91b513ff620d2f6a07d75b36240f67787dbdf5492fae4b1895a5e716c0ee2"),
    second: SCAN,
  },
  {
    slug: "tchaikovsky-album-39-1", rank: 41, title: "Morning Prayer (Album for the Young, Op. 39 No. 1)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 39 No. 1",
    genre: "teaching", era: "romantic", level: 2, tags: ["relaxing"],
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Children's Album", kind: "title" }, { alias: "Utrenneye razmyshleniye", kind: "translation" }, { alias: "Op. 39 No. 1", kind: "catalogue" }],
    primary: mutopia("2032", "Mutopia-2015/07/09-2032", "Public Domain", "Rem Zolotykh", "TchaikovskyPI/O39/01MorningPrayer/01MorningPrayer.mid", "7ec37d25e8ea12d0b2053a5916140f7d03b4cdf1357c01171fd8a3c1d8c6e50f"),
    second: SCAN,
  },
  {
    slug: "tchaikovsky-album-39-16", rank: 42, title: "Old French Song (Album for the Young, Op. 39 No. 16)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 39 No. 16",
    genre: "teaching", era: "romantic", level: 2,
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Children's Album", kind: "title" }, { alias: "Chanson française antique", kind: "translation" }, { alias: "Op. 39 No. 16", kind: "catalogue" }],
    primary: mutopia("2080", "Mutopia-2015/11/27-2080", "Public Domain", "David McNamara", "TchaikovskyPI/O39/16OldFrenchSong/16OldFrenchSong.mid", "112c3b61dab55f58bc44d9f3522ef21b3479ffa1953097783ff8c4f10e40175d"),
    second: SCAN,
  },
  {
    slug: "streabbog-les-etoiles-d-or-1", rank: 43, title: "Les étoiles d'or: Valse", composer: "Jean-Louis Streabbog",
    genre: "teaching", era: "romantic", level: 1,
    aliases: [{ alias: "Les étoiles d'or No. 1", kind: "title" }, { alias: "Golden Stars: Waltz", kind: "title" }],
    primary: mutopia("2092", "Mutopia-2015/12/27-2092", "Creative Commons Attribution-ShareAlike 4.0", "Masamichi Hosoda", "GobbaertsL/Les_Etoiles_dOr_No1/Les_Etoiles_dOr_No1.mid", "d2dee55c2b4942345aed733377d48cc91768fcd8fdd3dc6d84061eaeb754bee3"),
    second: SCAN,
  },
  {
    slug: "dussek-sonata-46-1", rank: 44, title: "Six Easy Sonatas, Op. 46: No. 1", composer: "Jan Ladislav Dussek", catalogue: "Op. 46 No. 1",
    genre: "teaching", era: "classical-era", level: 2,
    aliases: [{ alias: "Six sonates faciles pour le Piano Forte", kind: "title" }, { alias: "Sonata in C major, Op. 46 No. 1", kind: "title" }, { alias: "Op. 46 No. 1", kind: "catalogue" }],
    primary: mutopia("1605", "Mutopia-2009/01/05-1605", "Creative Commons Attribution-ShareAlike 3.0", "Kris Van Bruwaene", "DussekJL/O46/Dussek_Op46_1/Dussek_Op46_1-mids.zip", "951a63bd4af42e386a37d0177e793e008803ff1707d637266cd858bd865354f1", "Dussek_Op46_1.mid"),
    second: SCAN,
  },
  ],
};
