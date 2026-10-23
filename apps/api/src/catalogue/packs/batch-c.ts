/**
 * Batch C of the library redesign: Romantic and early-20th-century piano
 * pieces, ragtime and light classics (library spec section 6), the 30 pieces
 * of the 49 in the proposal that have a usable Mutopia file.
 *
 * Primary source: the piece's Mutopia Project file, pinned by URL and sha256
 * (checked on every fetch), with the licence and typesetter the Mutopia page
 * prints. Every composition is public domain; a Creative Commons licence on a
 * file covers only the typesetting and is credited in the song's attribution.
 *
 * Second source, for the opening-notes check (see ./incipit.ts): the proposal
 * names a public-domain IMSLP scan for every piece. A scan is not
 * machine-readable, so each piece is ingested unchecked and a reviewer compares
 * the opening against the scan by eye.
 *
 * The other 19 proposal rows are not here:
 * - 17 are "authored" pieces (no Mutopia file exists): Je te veux, Rêverie,
 *   Arietta, Spring Song, Waltz Op. 64 No. 2, Rustle of Spring, Salut d'Amour,
 *   Humoresque, Méditation, The Swan, Barcarolle, Boccherini's Minuet,
 *   Nimrod, Purcell's Rondeau, the Prince of Denmark's March, Queen of Sheba
 *   and Mouret's Rondeau. An authored score is only accepted once its tune is
 *   read from two public-domain scans (see AuthoredSource in
 *   ../../essentials/manifest.ts), and IMSLP answers scripted downloads with a
 *   bot check, so no scan could be read. They are left out rather than
 *   entered unchecked.
 * - La fille aux cheveux de lin: Mutopia 2207 (Debussy Préludes, Book 1) is
 *   published without MIDI and its source archive stops at prelude 3.
 * - Marche Militaire No. 1: Mutopia 1545 is the four-hand duet (four tracks,
 *   F#1 to D7), not a solo reduction. The proposal allows it only as a solo.
 *
 * Everything lands as a draft.
 */
import type { MutopiaLicence, MutopiaPrimarySource, Pack, PackPiece, ScanSecondSource } from "./pack.js";

const FTP = "https://www.mutopiaproject.org/ftp/";
const infoUrl = (id: number): string => `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${id}`;

function mutopia(id: number, file: string, sha256: string, ref: string, licence: MutopiaLicence, maintainer: string): MutopiaPrimarySource {
  return { kind: "mutopia", mutopiaId: String(id), url: `${FTP}${file}`, sha256, mutopiaRef: `Mutopia-${ref}`, licence, maintainer, infoUrl: infoUrl(id) };
}

function scan(reference: string): ScanSecondSource {
  return {
    kind: "scan",
    reference,
    reason: "no machine-readable second edition; IMSLP public-domain scan; the opening is compared by a reviewer",
  };
}

const PD: MutopiaLicence = "Public Domain";
const CC_BY_3: MutopiaLicence = "Creative Commons Attribution 3.0";
const CC_BY_SA_25: MutopiaLicence = "Creative Commons Attribution-ShareAlike 2.5";
const CC_BY_SA_3: MutopiaLicence = "Creative Commons Attribution-ShareAlike 3.0";
const CC_BY_SA_4: MutopiaLicence = "Creative Commons Attribution-ShareAlike 4.0";

const pieces: PackPiece[] = [
  {
    slug: "gymnopedie-2", rank: 1, title: "Gymnopédie No. 2", composer: "Erik Satie",
    genre: "classical", era: "impressionist", level: 2, tags: ["relaxing"], publishedYear: 1888,
    aliases: [{ alias: "Trois Gymnopédies", kind: "title" }, { alias: "Gymnopedie 2", kind: "title" }, { alias: "Gymnopédies", kind: "title" }],
    primary: mutopia(38, "SatieE/gymnopedie_2/gymnopedie_2.mid", "02e8ae8d7e1f6073f12f62a61a63cf07b260a1cf49f4a9008ee4e3f8e1934d30", "2012/12/23-38", PD, "Evin Robertson"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "gymnopedie-3", rank: 2, title: "Gymnopédie No. 3", composer: "Erik Satie",
    genre: "classical", era: "impressionist", level: 2, tags: ["relaxing"], publishedYear: 1888,
    aliases: [{ alias: "Trois Gymnopédies", kind: "title" }, { alias: "Gymnopedie 3", kind: "title" }, { alias: "Gymnopédies", kind: "title" }],
    primary: mutopia(39, "SatieE/gymnopedie_3/gymnopedie_3.mid", "fd1dceff4da08e997b083acc5b571bebe980bc89421b75b052dbb93ecf06ca23", "2012/12/23-39", PD, "Evin Robertson"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "gnossienne-2", rank: 3, title: "Gnossienne No. 2", composer: "Erik Satie",
    genre: "classical", era: "impressionist", level: 2, tags: ["relaxing"], publishedYear: 1893,
    aliases: [{ alias: "Gnossiennes", kind: "title" }, { alias: "Gnossienne 2", kind: "title" }],
    primary: mutopia(2130, "SatieE/Gnossienne/no_2/no_2.mid", "31093d734a6c526cc285f8d9cd06cbf6f69d345355e3e7c29a42dc344511b092", "2016/08/17-2130", CC_BY_SA_4, "Frédéric Duperray"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "gnossienne-3", rank: 4, title: "Gnossienne No. 3", composer: "Erik Satie",
    genre: "classical", era: "impressionist", level: 2, tags: ["relaxing"], publishedYear: 1893,
    aliases: [{ alias: "Gnossiennes", kind: "title" }, { alias: "Gnossienne 3", kind: "title" }],
    primary: mutopia(2131, "SatieE/Gnossienne/no_3/no_3.mid", "0f5f7eee5d30ae6b44aff73e5fdd3181223ddf36151f37369753c8ccbb53bedc", "2016/08/17-2131", CC_BY_SA_4, "Frédéric Duperray"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "debussy-arabesque-2", rank: 6, title: "Arabesque No. 2", composer: "Claude Debussy", catalogue: "L. 66 No. 2",
    genre: "classical", era: "impressionist", level: 4,
    aliases: [{ alias: "Deuxième arabesque", kind: "title" }, { alias: "Deux arabesques", kind: "title" }, { alias: "Second Arabesque", kind: "title" }, { alias: "L. 66 No. 2", kind: "catalogue" }],
    primary: mutopia(1994, "DebussyC/L66/debussy_Arabesque_2/debussy_Arabesque_2.mid", "b7991339535a5436b01f4b0f8fe97304a60a0a7f38d16365692d82f6c6e22d8e", "2014/12/14-1994", CC_BY_SA_4, "Knute Snortum"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "elite-syncopations", rank: 9, title: "Elite Syncopations", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1902,
    primary: mutopia(1540, "JoplinS/EliteSyncopations/EliteSyncopations.mid", "28e41b9b3d0afd3de70c0de56dba9c34e4ff05b21a14939f0fdf0b181d856fc9", "2008/09/19-1540", PD, "Benjamin Bloomfield"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-solace", rank: 10, title: "Solace", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 3, tags: ["relaxing"], publishedYear: 1909,
    aliases: [{ alias: "Solace: A Mexican Serenade", kind: "title" }, { alias: "A Mexican Serenade", kind: "title" }],
    primary: mutopia(482, "JoplinS/solace/solace.mid", "21ef2b529c4cb2bf095cdeda1deed7642f31dfb08b853d6022b0269346367f67", "2015/01/25-482", PD, "Magnus Lewis-Smith"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-bethena", rank: 11, title: "Bethena", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1905,
    aliases: [{ alias: "Bethena: A Concert Waltz", kind: "title" }, { alias: "Bethena Waltz", kind: "nickname" }],
    primary: mutopia(463, "JoplinS/bethena/bethena.mid", "7e4c0b5a9402f112b90a8bf39558bc781f1909e9a023878f850456b9eda3390f", "2015/03/25-463", PD, "Magnus Lewis-Smith"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-easy-winners", rank: 12, title: "The Easy Winners", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1901,
    aliases: [{ alias: "Easy Winners", kind: "title" }, { alias: "The Easy Winners: A Ragtime Two Step", kind: "title" }],
    primary: mutopia(352, "JoplinS/winners/winners.mid", "b4fcdafa0a6929a62e53f4fda0acf6f23f1b1955886d6f68b49c158a7b231c57", "2013/01/08-352", PD, "Tom Harke"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-pineapple-rag", rank: 13, title: "Pineapple Rag", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1908,
    primary: mutopia(1899, "JoplinS/PineappleRag/PineappleRag.mid", "a8ff24b340900baaa53e43ad575bc1857721706f0bd420425446f8b14e252420", "2014/01/12-1899", PD, "Coyau"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-peacherine-rag", rank: 14, title: "Peacherine Rag", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1901,
    primary: mutopia(335, "JoplinS/peacherine/peacherine.mid", "5185a564754c047954039ecfad37f91140675c201cee8e4d4930624bd974aee9", "2007/10/29-335", PD, "Antonio Palamà"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "joplin-sun-flower-slow-drag", rank: 15, title: "Sun Flower Slow Drag", composer: "Scott Joplin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1901,
    aliases: [{ alias: "Sunflower Slow Drag", kind: "title" }, { alias: "Sun-Flower Slow Drag", kind: "title" }],
    primary: mutopia(465, "JoplinS/sun-flower-slow-drag/sun-flower-slow-drag.mid", "5faa1c6ac857d80785b3362d8a968b8a98851ee01d79e51d87e593c17ea03eab", "2013/03/03-465", PD, "Daniel Škarda"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "turpin-st-louis-rag", rank: 16, title: "The St. Louis Rag", composer: "Tom Turpin",
    genre: "ragtime", era: "ragtime", level: 4, publishedYear: 1903,
    aliases: [{ alias: "St. Louis Rag", kind: "title" }, { alias: "Saint Louis Rag", kind: "title" }],
    primary: mutopia(369, "TurpinT/turpin/turpin.mid", "d00a2622f2cc73aa92d336ec737d61cda016a63c8ba77681ea0395cccf4a4ff0", "2015/01/17-369", PD, "Stan Sanderson"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "grieg-wedding-day-at-troldhaugen", rank: 17, title: "Wedding Day at Troldhaugen", composer: "Edvard Grieg", catalogue: "Op. 65 No. 6",
    genre: "classical", era: "romantic", level: 4, tags: ["wedding"],
    aliases: [{ alias: "Bryllupsdag på Troldhaugen", kind: "translation" }, { alias: "Hochzeitstag auf Troldhaugen", kind: "translation" }, { alias: "Lyric Pieces", kind: "title" }, { alias: "Op. 65 No. 6", kind: "catalogue" }],
    primary: mutopia(781, "GriegE/O65/troldhaugen/troldhaugen.mid", "668205876de4597aa3647f0f85bf40f056205512dcb265ca3f549f408e952225", "2006/06/17-781", PD, "David Whipple"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "grieg-march-of-the-dwarfs", rank: 18, title: "March of the Dwarfs", composer: "Edvard Grieg", catalogue: "Op. 54 No. 3",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Troldtog", kind: "translation" }, { alias: "Trolls' March", kind: "nickname" }, { alias: "March of the Trolls", kind: "nickname" }, { alias: "Procession of the Trolls", kind: "nickname" }, { alias: "Lyric Pieces", kind: "title" }, { alias: "Op. 54 No. 3", kind: "catalogue" }],
    primary: mutopia(2014, "GriegE/O54/Troldtog/Troldtog.mid", "9d73618b3ab01976b9138c57ce7e41db3256b0eaad8b9741c909d322c6fb369e", "2015/06/14-2014", PD, "Anonymous"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "grieg-ases-death", rank: 19, title: "Åse's Death", composer: "Edvard Grieg", catalogue: "Op. 46 No. 2",
    genre: "classical", era: "romantic", level: 2,
    aliases: [{ alias: "Ase's Death", kind: "title" }, { alias: "The Death of Åse", kind: "title" }, { alias: "Åses Tod", kind: "translation" }, { alias: "Peer Gynt Suite No. 1", kind: "title" }, { alias: "Op. 46 No. 2", kind: "catalogue" }],
    primary: mutopia(246, "GriegE/O46/02-lamortdase/02-lamortdase.mid", "eb0b5f5b76894fe4140f4ab98616472db87e9501827bc92fec144c6253e8375f", "2013/03/22-246", PD, "Deborah Lowrey"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "mendelssohn-venetian-boat-song", rank: 21, title: "Venetian Boat Song", composer: "Felix Mendelssohn", catalogue: "Op. 19 No. 6",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Venetianisches Gondellied", kind: "translation" }, { alias: "Venetian Gondola Song", kind: "title" }, { alias: "Songs Without Words", kind: "title" }, { alias: "Lieder ohne Worte", kind: "translation" }, { alias: "Op. 19 No. 6", kind: "catalogue" }],
    primary: mutopia(1679, "Mendelssohn-BartholdyF/O19/Lieder-ohne-Worte-Venetianisches-Gondellied-Op19-No6/Lieder-ohne-Worte-Venetianisches-Gondellied-Op19-No6.mid", "5802613dedb30041f5045b3f16bb31e336a7acaedd2d0764121537fa5ab95816", "2009/06/12-1679", CC_BY_3, "Ryan Prince"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "chopin-waltz-69-2", rank: 23, title: "Waltz in B minor, Op. 69 No. 2", composer: "Frédéric Chopin", catalogue: "Op. 69 No. 2",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Waltz in B minor", kind: "title" }, { alias: "Valse in B minor", kind: "title" }, { alias: "Op. 69 No. 2", kind: "catalogue" }],
    primary: mutopia(511, "ChopinFF/O69/w10-h-moll-cfi/w10-h-moll-cfi.mid", "a7a0e2aca89fc9d530fe50e9538948621b8a6e1883c705353e15928d411f1ae2", "2013/03/23-511", PD, "Roland Goretzki"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "chopin-nocturne-72-1", rank: 25, title: "Nocturne in E minor, Op. 72 No. 1", composer: "Frédéric Chopin", catalogue: "Op. 72 No. 1",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Nocturne No. 19", kind: "title" }, { alias: "Nocturne in E minor", kind: "title" }, { alias: "Op. 72 No. 1", kind: "catalogue" }],
    primary: mutopia(509, "ChopinFF/O72/nocturne_in_e_minor/nocturne_in_e_minor.mid", "56d22044a507e735c85bb3b5245d83700c053fdb8d1bb69005a2593fd92b72f6", "2017/01/04-509", CC_BY_SA_4, "Benjamin D. Esham"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "chopin-nocturne-9-1", rank: 26, title: "Nocturne in B-flat minor, Op. 9 No. 1", composer: "Frédéric Chopin", catalogue: "Op. 9 No. 1",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Nocturne No. 1", kind: "title" }, { alias: "Nocturne in B-flat minor", kind: "title" }, { alias: "Op. 9 No. 1", kind: "catalogue" }],
    primary: mutopia(582, "ChopinFF/O9/nocturne_in_b-flat_minor/nocturne_in_b-flat_minor.mid", "97194fec7586ca37280a3a5641db96f09f515c8358ccba9a9dd6a0f427ff9330", "2005/08/08-582", CC_BY_SA_25, "Benjamin D. Esham"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "liszt-consolation-1", rank: 27, title: "Consolation No. 1", composer: "Franz Liszt", catalogue: "S. 172 No. 1",
    genre: "classical", era: "romantic", level: 2, tags: ["relaxing"],
    aliases: [{ alias: "Consolations", kind: "title" }, { alias: "Trostungen", kind: "translation" }, { alias: "Consolation in E major", kind: "title" }, { alias: "S. 172 No. 1", kind: "catalogue" }],
    primary: mutopia(1654, "LisztF/S.172/liszt-consolation-no1/liszt-consolation-no1.mid", "86ac1e1abd23ebcd2d9b62e63298aae9ddb26d0543a16c3e1de04f0192410c9a", "2009/06/03-1654", CC_BY_3, "Ryan Prince"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "brahms-intermezzo-118-2", rank: 28, title: "Intermezzo in A, Op. 118 No. 2", composer: "Johannes Brahms", catalogue: "Op. 118 No. 2",
    genre: "classical", era: "romantic", level: 4, tags: ["relaxing"],
    aliases: [{ alias: "Intermezzo in A major", kind: "title" }, { alias: "Six Pieces for Piano", kind: "title" }, { alias: "Op. 118", kind: "catalogue" }, { alias: "Op. 118 No. 2", kind: "catalogue" }],
    primary: mutopia(535, "BrahmsJ/O118/intermezzo/intermezzo.mid", "70a6fc324bbc38b067267655d4d5e87ab49dc2de2df99d213885277937e1e7a2", "2013/03/23-535", PD, "Aron Fay"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "schubert-hungarian-melody", rank: 30, title: "Hungarian Melody, D. 817", composer: "Franz Schubert", catalogue: "D. 817",
    genre: "classical", era: "romantic", level: 2,
    aliases: [{ alias: "Ungarische Melodie", kind: "translation" }, { alias: "Hungarian Melody in B minor", kind: "title" }, { alias: "D. 817", kind: "catalogue" }],
    primary: mutopia(758, "SchubertF/D817/Ungarische/Ungarische.mid", "41f967af6fa4bf21792e9633114d27dbe8c4a605d805ceef1e07fd4fbe0d5e89", "2006/05/08-758", PD, "Felix Braun"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "field-nocturne-5", rank: 31, title: "Nocturne No. 5 in B-flat, H. 37", composer: "John Field", catalogue: "H. 37",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Nocturne No. 5", kind: "title" }, { alias: "Nocturne in B-flat major", kind: "title" }, { alias: "Field Nocturne", kind: "title" }, { alias: "H. 37", kind: "catalogue" }],
    primary: mutopia(2137, "FieldJ/H37/Field_Nocturne_5/Field_Nocturne_5.mid", "23d3f9f1b477bdbc9e2714361e5785b45f634305a4a798f4a69edde5e88b2eee", "2016/10/06-2137", CC_BY_SA_4, "Alex Schreiber"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "rameau-les-sauvages", rank: 32, title: "Les Sauvages", composer: "Jean-Philippe Rameau",
    genre: "classical", era: "baroque", level: 3,
    aliases: [{ alias: "The Savages", kind: "translation" }, { alias: "Les Indes galantes", kind: "title" }, { alias: "Nouvelles suites de pièces de clavecin", kind: "title" }],
    primary: mutopia(407, "RameauJP/sauvages/sauvages.mid", "2e68b87d0bc57e72baf8681f86f42b72bc16c66b7752851b236d434d65e13157", "2013/02/21-407", PD, "Ludovic Sardain"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "rameau-tambourin", rank: 33, title: "Tambourin", composer: "Jean-Philippe Rameau",
    genre: "classical", era: "baroque", level: 3,
    aliases: [{ alias: "Tambourin in E minor", kind: "title" }, { alias: "Pièces de clavecin", kind: "title" }],
    primary: mutopia(487, "RameauJP/tambourin/tambourin.mid", "873b2934c4daaedae780d6a0adf0b43fb5302ec5499bfe5ff8d4a95d5efad5bf", "2015/01/17-487", PD, "Ludovic Sardain"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "scarlatti-k11", rank: 34, title: "Sonata in C minor, K. 11", composer: "Domenico Scarlatti", catalogue: "K. 11",
    genre: "classical", era: "baroque", level: 3,
    aliases: [{ alias: "Sonata K. 11", kind: "title" }, { alias: "Sonata in C minor", kind: "title" }, { alias: "Essercizi No. 11", kind: "title" }, { alias: "L. 352", kind: "catalogue" }, { alias: "K. 11", kind: "catalogue" }],
    primary: mutopia(141, "ScarlattiD/K11/sonatensatz/sonatensatz.mid", "47d90a716ef613368609db391df9b0bb2086ea5f8ab530013848d4b9a0609b8c", "2013/01/08-141", PD, "Bas Wassink"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "sousa-washington-post", rank: 47, title: "The Washington Post March", composer: "John Philip Sousa",
    genre: "march", era: "romantic", level: 3, publishedYear: 1889,
    aliases: [{ alias: "The Washington Post", kind: "title" }, { alias: "Washington Post March", kind: "title" }],
    primary: mutopia(1321, "SousaJP/sousa_washington_post/sousa_washington_post.mid", "d5b3295e89cea010736b57e8b11962d87ed1bfdb553a841acf84e28fc4552dfa", "2009/03/19-1321", CC_BY_SA_3, "Renato Biolcati Rinaldi"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "sousa-liberty-bell", rank: 48, title: "The Liberty Bell March", composer: "John Philip Sousa",
    genre: "march", era: "romantic", level: 3, publishedYear: 1893,
    aliases: [{ alias: "The Liberty Bell", kind: "title" }, { alias: "Liberty Bell March", kind: "title" }],
    primary: mutopia(625, "SousaJP/TheLibertyBell/TheLibertyBell.mid", "55013a43c5ce0335a3da903750686ad81c8e402d90a142269977a7e5987d299b", "2005/11/09-625", PD, "Benjamin Bloomfield"),
    second: scan("IMSLP PD edition"),
  },
  {
    slug: "strauss-thunder-and-lightning", rank: 49, title: "Thunder and Lightning Polka", composer: "Johann Strauss II", catalogue: "Op. 324",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Unter Donner und Blitz", kind: "translation" }, { alias: "Donner und Blitz", kind: "translation" }, { alias: "Thunder and Lightning", kind: "title" }, { alias: "Op. 324", kind: "catalogue" }],
    primary: mutopia(610, "StraussJJ/O324/blitz/blitz.mid", "7c48c02311de8d2a41c2b7fca818a16256c1d7403de0897ff993650fd3484abb", "2005/10/17-610", PD, "Stan Sanderson"),
    second: scan("IMSLP PD edition"),
  },
];

export const BATCH_C: Pack = {
  id: "batch-c",
  name: "Batch C: Romantic to early 20th century, ragtime, light classics (Mutopia)",
  // These are not Midiano's pieces, so they do not carry the Midiano classics collection tag.
  collection: null,
  pieces,
};
