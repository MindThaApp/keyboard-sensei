/**
 * Batch A of the library redesign: the most recognisable of Midiano's
 * piano-midi.de pieces (library spec section 6), 41 pieces. The 42nd entry in
 * the proposal, Old MacDonald, is authored in-house and belongs to the
 * authored packs, not here.
 *
 * Primary source: a piano-midi.de file by Bernd Krueger, CC BY-SA 3.0 DE. The
 * site itself answers scripted requests with HTTP 418, so each file is fetched
 * from the copy Midiano serves (the bytes are what is pinned: the sha256 below
 * is checked on every fetch and each file must carry Bernd Krueger's own
 * copyright notice).
 *
 * Second source, for the opening-notes check (see ./incipit.ts): the Mutopia
 * edition where there is one (23 pieces), otherwise a public-domain IMSLP scan
 * that a reviewer compares by eye (18 pieces).
 *
 * Everything lands as a draft. The owner has not yet confirmed the
 * piano-midi.de licence, so none of it is public-eligible.
 */
import type { Pack } from "./pack.js";

const info = (id: number): string => `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${id}`;

export const BATCH_A: Pack = {
  id: "batch-a",
  name: "Batch A: Midiano parity, most recognisable (piano-midi.de)",
  pieces: [
  {
    slug: "moonlight-sonata-2", rank: 1, title: "Moonlight Sonata (2nd Movement)", composer: "Ludwig van Beethoven", catalogue: "Op. 27 No. 2", movement: "2nd movement: Allegretto",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 14", kind: "title" }, { alias: "Moonlight Sonata", kind: "nickname" }, { alias: "Mondscheinsonate", kind: "translation" }, { alias: "Op. 27 No. 2", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "mond_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/mond_2.mid", sha256: "90b3a67073bf9dc01657e6785c27cd8287db5d8fd43a42650c1ac56bdabb0769" },
    second: { kind: "mutopia", mutopiaId: "276", url: "https://www.mutopiaproject.org/ftp/BeethovenLv/O27/moonlight/moonlight-mids.zip", sha256: "94915b176f0b999919a6cd1025a45ec8dd0a454dab33b2b332c5026291ea91f5", member: "moonlight2.mid", infoUrl: info(276) },
  },
  {
    slug: "pathetique-1", rank: 2, title: "Pathétique Sonata (1st Movement)", composer: "Ludwig van Beethoven", catalogue: "Op. 13", movement: "1st movement: Grave, Allegro di molto e con brio",
    genre: "classical", era: "classical-era", level: 5,
    aliases: [{ alias: "Piano Sonata No. 8", kind: "title" }, { alias: "Pathétique Sonata", kind: "nickname" }, { alias: "Pathetique Sonata", kind: "nickname" }, { alias: "Op. 13", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "pathetique_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/pathetique_1.mid", sha256: "a1aceb1bf07db62162fcbf8c56f2989fd121a5930e8e73db7353c5624cea9b63" },
    second: { kind: "mutopia", mutopiaId: "299", url: "https://www.mutopiaproject.org/ftp/BeethovenLv/O13/pathetique-1/pathetique-1.mid", sha256: "cfe2b012227077a304a0ed282a98dceaca6a73bd0fb4d3f2249ac4bacbe30121", infoUrl: info(299) },
  },
  {
    slug: "sonata-facile-2", rank: 3, title: "Sonata Facile K. 545 (2nd Movement)", composer: "Wolfgang Amadeus Mozart", catalogue: "K. 545", movement: "2nd movement: Andante",
    genre: "classical", era: "classical-era", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Piano Sonata No. 16 in C major", kind: "title" }, { alias: "Sonata Facile", kind: "nickname" }, { alias: "K. 545", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "mz_545_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/mz_545_2.mid", sha256: "efe7cef42dde2bed72dc0025053165dbb0c0ae4109a60d51aa3b911d26b54c89" },
    second: { kind: "mutopia", mutopiaId: "1007", url: "https://www.mutopiaproject.org/ftp/MozartWA/KV545/K545-2/K545-2.mid", sha256: "56aec578bd0b18b378407c7926020ad7fb16446cae4ce73c6cfc2b9e33131c29", infoUrl: info(1007) },
  },
  {
    slug: "sonata-facile-3", rank: 4, title: "Sonata Facile K. 545 (3rd Movement)", composer: "Wolfgang Amadeus Mozart", catalogue: "K. 545", movement: "3rd movement: Rondo, Allegretto",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 16 in C major", kind: "title" }, { alias: "Sonata Facile", kind: "nickname" }, { alias: "K. 545", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "mz_545_3.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/mz_545_3.mid", sha256: "50b4520147bd9e8854b2695a3a87037e7f5562ecd81309cb1248423896893e10" },
    second: { kind: "mutopia", mutopiaId: "1027", url: "https://www.mutopiaproject.org/ftp/MozartWA/KV545/K545-3/K545-3.mid", sha256: "37804d835dbf51c2db6196be0bc9f6612283c0b179bab1e102a8bd43baee1fec", infoUrl: info(1027) },
  },
  {
    slug: "k331-menuetto", rank: 5, title: "Sonata K. 331: Menuetto", composer: "Wolfgang Amadeus Mozart", catalogue: "K. 331", movement: "2nd movement: Menuetto",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 11 in A major", kind: "title" }, { alias: "Minuet from the A major sonata", kind: "title" }, { alias: "K. 331", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "mz_331_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/mz_331_2.mid", sha256: "c4810bd25a0885a54c4b9639779b0e300b10e88147791f3559d5bc8a7e1bd021" },
    second: { kind: "mutopia", mutopiaId: "613", url: "https://www.mutopiaproject.org/ftp/MozartWA/KV331/KV331_2_1_menuetto/KV331_2_1_menuetto.mid", sha256: "3ba1912acb167ad527e964ecfaee4acb448baf74589ef6b8b338e8cdb0f5a6c8", infoUrl: info(613) },
  },
  {
    slug: "schubert-impromptu-899-3", rank: 6, title: "Impromptu in G-flat, D. 899 No. 3", composer: "Franz Schubert", catalogue: "D. 899 No. 3",
    genre: "classical", era: "romantic", level: 4, tags: ["relaxing"],
    aliases: [{ alias: "Impromptu in G-flat major", kind: "title" }, { alias: "Impromptu Op. 90 No. 3", kind: "title" }, { alias: "D. 899", kind: "catalogue" }, { alias: "Op. 90 No. 3", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "schuim-3.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/schuim-3.mid", sha256: "d85909810a5fd5228fa88403c87a77a2e88034d9d9a8337a43dde682062b33e2" },
    second: { kind: "mutopia", mutopiaId: "1193", url: "https://www.mutopiaproject.org/ftp/SchubertF/D899/SchubertF-D899-3-Impromptu/SchubertF-D899-3-Impromptu.mid", sha256: "3ae00ab41634cd65c495a0aec41798ff191bd2690f48ec93daa53dd0266edaa2", infoUrl: info(1193) },
  },
  {
    slug: "schubert-impromptu-899-4", rank: 7, title: "Impromptu in A-flat, D. 899 No. 4", composer: "Franz Schubert", catalogue: "D. 899 No. 4",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Impromptu in A-flat major", kind: "title" }, { alias: "Impromptu Op. 90 No. 4", kind: "title" }, { alias: "D. 899", kind: "catalogue" }, { alias: "Op. 90 No. 4", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "schuim-4.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/schuim-4.mid", sha256: "0573877b1a9db6bbb552ab882ca78c1703089218149cf6647e7e800f355e47d9" },
    second: { kind: "mutopia", mutopiaId: "1552", url: "https://www.mutopiaproject.org/ftp/SchubertF/D899/SchubertF-D899-4-Impromptu/SchubertF-D899-4-Impromptu.mid", sha256: "6fe7822926b6ae88045511eb8bacd01f3725c1e38f6d140330d5466fd5a06c98", infoUrl: info(1552) },
  },
  {
    slug: "schubert-impromptu-899-2", rank: 8, title: "Impromptu in E-flat, D. 899 No. 2", composer: "Franz Schubert", catalogue: "D. 899 No. 2",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Impromptu in E-flat major", kind: "title" }, { alias: "Impromptu Op. 90 No. 2", kind: "title" }, { alias: "D. 899", kind: "catalogue" }, { alias: "Op. 90 No. 2", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "schuim-2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/schuim-2.mid", sha256: "69db8100c8cfd376a9f5e7fe141b0b0e8bc01d18324959eb1370c74e6ae96274" },
    second: { kind: "mutopia", mutopiaId: "1551", url: "https://www.mutopiaproject.org/ftp/SchubertF/D899/SchubertF-D899-2-Impromptu/SchubertF-D899-2-Impromptu.mid", sha256: "8e0723800e1cf9e787d496ca5540cac088895dd63566db44f0cad4de2861b786", infoUrl: info(1551) },
  },
  {
    slug: "schubert-impromptu-935-2", rank: 9, title: "Impromptu in A-flat, D. 935 No. 2", composer: "Franz Schubert", catalogue: "D. 935 No. 2",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Impromptu in A-flat major", kind: "title" }, { alias: "Impromptu Op. 142 No. 2", kind: "title" }, { alias: "D. 935", kind: "catalogue" }, { alias: "Op. 142 No. 2", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "schubert_D935_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/schubert_D935_2.mid", sha256: "529436e099daa12a8191ba7b962956ba8e0f36d553e8c919dfdaf3cef49174cb" },
    second: { kind: "mutopia", mutopiaId: "1195", url: "https://www.mutopiaproject.org/ftp/SchubertF/D935/SchubertF-D935-2-Impromptu/SchubertF-D935-2-Impromptu.mid", sha256: "e4d05090dcc84046317f175fc75c85c59f3327f1966e163b0750dfa766fd49e9", infoUrl: info(1195) },
  },
  {
    slug: "schubert-moment-musical-3", rank: 10, title: "Moment Musical No. 3 in F minor", composer: "Franz Schubert", catalogue: "D. 780 No. 3",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Moment musical in F minor", kind: "title" }, { alias: "Air russe", kind: "nickname" }, { alias: "Moments musicaux", kind: "title" }, { alias: "D. 780", kind: "catalogue" }, { alias: "Op. 94 No. 3", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "schumm-3.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/schumm-3.mid", sha256: "96f39252f13b2bce9a97ba8fbe9dd0f887509e66dad27ff52c7549c7ff6fc089" },
    second: { kind: "mutopia", mutopiaId: "1023", url: "https://www.mutopiaproject.org/ftp/SchubertF/D780/MomentsNo3/MomentsNo3.mid", sha256: "77b5ccc3a0f33128f9f4c162743d6a484bbfaa952206b69584a4c14bafc60358", infoUrl: info(1023) },
  },
  {
    slug: "chopin-ballade-1", rank: 11, title: "Ballade No. 1 in G minor, Op. 23", composer: "Frédéric Chopin", catalogue: "Op. 23",
    genre: "classical", era: "romantic", level: 5,
    aliases: [{ alias: "Ballade in G minor", kind: "title" }, { alias: "Op. 23", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op23.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op23.mid", sha256: "8edb6532d13512ea156439d8b07cf8e8292be38a8706617a2bf50165b1a7df03" },
    second: { kind: "mutopia", mutopiaId: "1959", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O23/chopin-op23-ballade-1/chopin-op23-ballade-1.mid", sha256: "b8f93fa0fb1c3a61a4ba13fdc287282d8efe3d3ec76b575ac8f186016e55007f", infoUrl: info(1959) },
  },
  {
    slug: "chopin-black-key-etude", rank: 12, title: "Black Key Étude, Op. 10 No. 5", composer: "Frédéric Chopin", catalogue: "Op. 10 No. 5",
    genre: "teaching", era: "romantic", level: 5,
    aliases: [{ alias: "Black Key Etude", kind: "nickname" }, { alias: "Black Keys Etude", kind: "nickname" }, { alias: "Etude in G-flat major", kind: "title" }, { alias: "Op. 10 No. 5", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op10_e05.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op10_e05.mid", sha256: "feb3bec0606917a92aba0344a4a601f4239a920714cbefd39a8981d6d0b607f5" },
    second: { kind: "mutopia", mutopiaId: "926", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O10/chp-10-05/chp-10-05.mid", sha256: "3b7c267dc6047e881b7404e47259de23dce3cfe8fe74966a1cc28adacf5e3336", infoUrl: info(926) },
  },
  {
    slug: "chopin-etude-10-1", rank: 13, title: "Étude Op. 10 No. 1", composer: "Frédéric Chopin", catalogue: "Op. 10 No. 1",
    genre: "teaching", era: "romantic", level: 5,
    aliases: [{ alias: "Etude in C major", kind: "title" }, { alias: "Waterfall Etude", kind: "nickname" }, { alias: "Op. 10 No. 1", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op10_e01.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op10_e01.mid", sha256: "8cdef7e07be753a3d3147476ad4877b57fe177045c49fa97fba3161f198b691e" },
    second: { kind: "mutopia", mutopiaId: "914", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O10/chp-10-01/chp-10-01.mid", sha256: "42c52ece86795168636b3bbd387393fba9759214498a20b39308c848f8e49f03", infoUrl: info(914) },
  },
  {
    slug: "chopin-aeolian-harp-etude", rank: 14, title: "Aeolian Harp Étude, Op. 25 No. 1", composer: "Frédéric Chopin", catalogue: "Op. 25 No. 1",
    genre: "teaching", era: "romantic", level: 5,
    aliases: [{ alias: "Aeolian Harp", kind: "nickname" }, { alias: "Harp Etude", kind: "nickname" }, { alias: "Etude in A-flat major", kind: "title" }, { alias: "Op. 25 No. 1", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op25_e1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op25_e1.mid", sha256: "f62f240adb7981248ddc31fe2cc165ef9e921b3c6fa990c2613e97d0337f9b63" },
    second: { kind: "mutopia", mutopiaId: "489", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O25/chopin-op-25-01/chopin-op-25-01.mid", sha256: "d694598daa09b697e4ff9b3f58a61df498128a58cc761436c3eecfa65241d06b", infoUrl: info(489) },
  },
  {
    slug: "chopin-winter-wind-etude", rank: 15, title: "Winter Wind Étude, Op. 25 No. 11", composer: "Frédéric Chopin", catalogue: "Op. 25 No. 11",
    genre: "teaching", era: "romantic", level: 5,
    aliases: [{ alias: "Winter Wind", kind: "nickname" }, { alias: "Etude in A minor", kind: "title" }, { alias: "Op. 25 No. 11", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op25_e11.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op25_e11.mid", sha256: "a078dec84990199e91faddece6b21661ed0c9b358923a0648775ad9ec7560d97" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "chopin-heroic-polonaise", rank: 16, title: "Heroic Polonaise, Op. 53", composer: "Frédéric Chopin", catalogue: "Op. 53",
    genre: "classical", era: "romantic", level: 5,
    aliases: [{ alias: "Heroic Polonaise", kind: "nickname" }, { alias: "Polonaise in A-flat major", kind: "title" }, { alias: "Op. 53", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op53.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op53.mid", sha256: "df060f39f82178c0ad8b66baa282a872c23c8be25d33129fe9a87d1b31b9be37" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "chopin-funeral-march", rank: 17, title: "Funeral March (Sonata No. 2, 3rd Movement)", composer: "Frédéric Chopin", catalogue: "Op. 35", movement: "3rd movement: Marche funèbre",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Funeral March", kind: "nickname" }, { alias: "Marche funèbre", kind: "title" }, { alias: "Piano Sonata No. 2 in B-flat minor", kind: "title" }, { alias: "Op. 35", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op35_3.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op35_3.mid", sha256: "697d880487b9533b4a3cef43086a9d6a2ec374557863f79e48eb735b98bc2440" },
    second: { kind: "scan", reference: "IMSLP public-domain edition of the score", reason: "Mutopia 1727 (named as the second source in the proposal) is the sonata's finale; no Mutopia edition of the Marche funèbre exists; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "chopin-grande-valse-brillante", rank: 18, title: "Grande Valse Brillante, Op. 18", composer: "Frédéric Chopin", catalogue: "Op. 18",
    genre: "classical", era: "romantic", level: 4, tags: ["wedding"],
    aliases: [{ alias: "Grande Valse Brillante", kind: "nickname" }, { alias: "Waltz in E-flat major", kind: "title" }, { alias: "Op. 18", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chp_op18.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chp_op18.mid", sha256: "e72bf6a11a21a6a5df78ba9d949339f208b09a89fa99976b8af73b45e19a024c" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "chopin-nocturne-27-2", rank: 19, title: "Nocturne in D-flat, Op. 27 No. 2", composer: "Frédéric Chopin", catalogue: "Op. 27 No. 2",
    genre: "classical", era: "romantic", level: 4, tags: ["relaxing"],
    aliases: [{ alias: "Nocturne in D-flat major", kind: "title" }, { alias: "Op. 27 No. 2", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn_op27_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn_op27_2.mid", sha256: "9ef0d8db6fc33e7c8a69b0abe59e0695ca775ac3655b2f2476f7a34a8bf9c908" },
    second: { kind: "mutopia", mutopiaId: "486", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O27/chopin-nocturne-8/chopin-nocturne-8.mid", sha256: "9725f419ef122a816da97fb2e7186449471db151e5994023e7e0f81849a1a1b0", infoUrl: info(486) },
  },
  {
    slug: "chopin-prelude-20", rank: 20, title: "Prelude in C minor, Op. 28 No. 20", composer: "Frédéric Chopin", catalogue: "Op. 28 No. 20",
    genre: "classical", era: "romantic", level: 2,
    aliases: [{ alias: "Prelude in C minor", kind: "title" }, { alias: "Op. 28 No. 20", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn-p20.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn-p20.mid", sha256: "a062acd4f7ef790125635896c95e33eecac609a5025d0c3cc574dc3f1ae68f2f" },
    second: { kind: "mutopia", mutopiaId: "472", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O28/Chop-28-20/Chop-28-20.mid", sha256: "9cc6c417d4bb261644f6bd3d00033025e675a25694fd172be2f98e93efc1fcfe", infoUrl: info(472) },
  },
  {
    slug: "chopin-prelude-6", rank: 21, title: "Prelude in B minor, Op. 28 No. 6", composer: "Frédéric Chopin", catalogue: "Op. 28 No. 6",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Prelude in B minor", kind: "title" }, { alias: "Op. 28 No. 6", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "chpn-p6.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/chpn-p6.mid", sha256: "ba92da3f5b5290749d5dd5eba548b4e57feb27b065255379fbf47fdf2c05520d" },
    second: { kind: "mutopia", mutopiaId: "469", url: "https://www.mutopiaproject.org/ftp/ChopinFF/O28/Chop-28-6/Chop-28-6.mid", sha256: "b9328cbeaa149c49eab925794e94f3b95f579a41e4d9c781c953aad0b940bf63", infoUrl: info(469) },
  },
  {
    slug: "liszt-liebestraum-3", rank: 22, title: "Liebestraum No. 3", composer: "Franz Liszt", catalogue: "S. 541 No. 3",
    genre: "classical", era: "romantic", level: 5, tags: ["wedding", "relaxing"],
    aliases: [{ alias: "Liebesträume", kind: "title" }, { alias: "Dream of Love", kind: "title" }, { alias: "Love Dream No. 3", kind: "title" }, { alias: "S. 541", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "liz_liebestraum.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/liz_liebestraum.mid", sha256: "4012432ff9712bfb6fad64c37d2ca973ae4ef57181183676d15b618642d990c3" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "liszt-la-campanella", rank: 23, title: "La Campanella", composer: "Franz Liszt", catalogue: "S. 141 No. 3",
    genre: "classical", era: "romantic", level: 5,
    aliases: [{ alias: "Grandes études de Paganini No. 3", kind: "title" }, { alias: "The Little Bell", kind: "translation" }, { alias: "S. 141", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "liz_et3.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/liz_et3.mid", sha256: "4f7e61d9a8c458f831e8b8a59e9553f1bd7965a8669a09e2f073221039740767" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "liszt-hungarian-rhapsody-2", rank: 24, title: "Hungarian Rhapsody No. 2", composer: "Franz Liszt", catalogue: "S. 244 No. 2",
    genre: "classical", era: "romantic", level: 5,
    aliases: [{ alias: "Ungarische Rhapsodie Nr. 2", kind: "translation" }, { alias: "S. 244", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "liz_rhap02.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/liz_rhap02.mid", sha256: "19f62d62836e8df9d760de8cb645e6020a05c444651ad974be62ddef9ef1d654" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "debussy-golliwoggs-cakewalk", rank: 25, title: "Golliwogg's Cakewalk", composer: "Claude Debussy", catalogue: "L. 113 No. 6", movement: "Children's Corner, No. 6",
    genre: "classical", era: "impressionist", level: 4,
    aliases: [{ alias: "Children's Corner", kind: "title" }, { alias: "Golliwog's Cakewalk", kind: "title" }, { alias: "L. 113", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "debussy_cc_6.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/debussy_cc_6.mid", sha256: "4492e0a92f17dd20bbb1d55a27781c5653f8da2459e844b91effe861d0d99780" },
    second: { kind: "scan", reference: "IMSLP Durand 1908", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "debussy-doctor-gradus", rank: 26, title: "Doctor Gradus ad Parnassum", composer: "Claude Debussy", catalogue: "L. 113 No. 1", movement: "Children's Corner, No. 1",
    genre: "teaching", era: "impressionist", level: 4,
    aliases: [{ alias: "Children's Corner", kind: "title" }, { alias: "Doctor Gradus ad Parnassum", kind: "title" }, { alias: "L. 113", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "debussy_cc_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/debussy_cc_1.mid", sha256: "4f8abfa8981f4333f5a452b9dbd63f6fe0786257b92310fa56a71b2727e857eb" },
    second: { kind: "scan", reference: "IMSLP Durand 1908", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "debussy-little-shepherd", rank: 27, title: "The Little Shepherd", composer: "Claude Debussy", catalogue: "L. 113 No. 5", movement: "Children's Corner, No. 5",
    genre: "classical", era: "impressionist", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Children's Corner", kind: "title" }, { alias: "Le petit berger", kind: "translation" }, { alias: "L. 113", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "debussy_cc_5.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/debussy_cc_5.mid", sha256: "f893eb3a55e207198edea3cff019d904e8d3988fe2a31c88283ff124600dba99" },
    second: { kind: "scan", reference: "IMSLP Durand 1908", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "tchaikovsky-seasons-june", rank: 28, title: "The Seasons: June (Barcarolle)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 37a No. 6", movement: "The Seasons: June",
    genre: "classical", era: "romantic", level: 4, tags: ["relaxing"],
    aliases: [{ alias: "The Seasons", kind: "title" }, { alias: "Barcarolle", kind: "nickname" }, { alias: "Juni", kind: "translation" }, { alias: "Op. 37a", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "ty_juni.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/ty_juni.mid", sha256: "77dc5d00e24245e0b62bf735e9076e4e47892a272a773ae716a671245b502dbc" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "tchaikovsky-seasons-january", rank: 29, title: "The Seasons: January (By the Fireside)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 37a No. 1", movement: "The Seasons: January",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "The Seasons", kind: "title" }, { alias: "At the Fireside", kind: "nickname" }, { alias: "Januar", kind: "translation" }, { alias: "Op. 37a", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "ty_januar.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/ty_januar.mid", sha256: "2e8a458db9fef6dd05960b494767e2117797a3788e699e0a80fe9e0d51bc1670" },
    second: { kind: "mutopia", mutopiaId: "1171", url: "https://www.mutopiaproject.org/ftp/TchaikovskyPI/O37/Tschaikowsky-op37.1/Tschaikowsky-op37.1.mid", sha256: "34110e377929c99b8f730cabdde73b11cc5cbb58573be6a1727e893b23fcbdb4", infoUrl: info(1171) },
  },
  {
    slug: "tchaikovsky-seasons-december", rank: 30, title: "The Seasons: December (Christmas)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 37a No. 12", movement: "The Seasons: December",
    genre: "classical", era: "romantic", level: 4, tags: ["christmas"],
    aliases: [{ alias: "The Seasons", kind: "title" }, { alias: "Christmas", kind: "nickname" }, { alias: "Dezember", kind: "translation" }, { alias: "Op. 37a", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "ty_dezember.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/ty_dezember.mid", sha256: "589423e4a27d00e6a6e59bc466bf99b06c0a68fe697f0d0d57e4311cb362797b" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "tchaikovsky-seasons-october", rank: 31, title: "The Seasons: October (Autumn Song)", composer: "Pyotr Ilyich Tchaikovsky", catalogue: "Op. 37a No. 10", movement: "The Seasons: October",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "The Seasons", kind: "title" }, { alias: "Autumn Song", kind: "nickname" }, { alias: "Oktober", kind: "translation" }, { alias: "Op. 37a", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "ty_oktober.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/ty_oktober.mid", sha256: "4d0b91ac3351ef942b6852a0ed27cd1f9e3690960c6a9cffb8a37530e5cec2aa" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "schumann-kinderszenen-1", rank: 32, title: "Of Foreign Lands and Peoples (Kinderszenen No. 1)", composer: "Robert Schumann", catalogue: "Op. 15 No. 1",
    genre: "classical", era: "romantic", level: 2, tags: ["relaxing"],
    aliases: [{ alias: "Kinderszenen", kind: "title" }, { alias: "Scenes from Childhood", kind: "title" }, { alias: "Von fremden Ländern und Menschen", kind: "translation" }, { alias: "Op. 15 No. 1", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "scn15_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/scn15_1.mid", sha256: "5e9640ea84db589e8cbf591730ae88920c6fa5e75684f1a73d8ce0f5802f7bc6" },
    second: { kind: "mutopia", mutopiaId: "354", url: "https://www.mutopiaproject.org/ftp/SchumannR/O15/SchumannOp15No01/SchumannOp15No01.mid", sha256: "e58e708afe8b31c634a0e9f3354a4ed94670e929d82926f7ff49dea3ebe146c2", infoUrl: info(354) },
  },
  {
    slug: "schumann-kinderszenen-6", rank: 33, title: "Important Event (Kinderszenen No. 6)", composer: "Robert Schumann", catalogue: "Op. 15 No. 6",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Kinderszenen", kind: "title" }, { alias: "Scenes from Childhood", kind: "title" }, { alias: "Wichtige Begebenheit", kind: "translation" }, { alias: "Op. 15 No. 6", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "scn15_6.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/scn15_6.mid", sha256: "aab4201a7fc4f87ed1ebc1507ed3af61ebc3a871343acfa1fb0aec198dc70dc5" },
    second: { kind: "mutopia", mutopiaId: "374", url: "https://www.mutopiaproject.org/ftp/SchumannR/O15/SchumannOp15No06/SchumannOp15No06.mid", sha256: "8b93d7117c14e3867ec8364032b7385415634b312ba6b157606bdc04ee029cf3", infoUrl: info(374) },
  },
  {
    slug: "schumann-kinderszenen-9", rank: 34, title: "Knight of the Hobbyhorse (Kinderszenen No. 9)", composer: "Robert Schumann", catalogue: "Op. 15 No. 9",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "Kinderszenen", kind: "title" }, { alias: "Scenes from Childhood", kind: "title" }, { alias: "Ritter vom Steckenpferd", kind: "translation" }, { alias: "Op. 15 No. 9", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "scn15_9.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/scn15_9.mid", sha256: "76b89d27781c57e49f5b457361c0f22c56cad05d49b235a7da8b873fc422ca8f" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "schumann-knecht-ruprecht", rank: 35, title: "Knecht Ruprecht (Album for the Young No. 12)", composer: "Robert Schumann", catalogue: "Op. 68 No. 12",
    genre: "classical", era: "romantic", level: 3, tags: ["christmas"],
    aliases: [{ alias: "Album for the Young", kind: "title" }, { alias: "Album für die Jugend", kind: "translation" }, { alias: "Op. 68 No. 12", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "scn68_12.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/scn68_12.mid", sha256: "1f2b83bc84caf79779914aa06347e7b79a7e55f59ce468b5c52140e5fa45540f" },
    second: { kind: "mutopia", mutopiaId: "784", url: "https://www.mutopiaproject.org/ftp/SchumannR/O68/schumann-op68-12-Pere-Fouettard/schumann-op68-12-Pere-Fouettard.mid", sha256: "e0734d0730a10dd2e048beb9f3b09ab5b6c68f245930497cf05c59a9417b3e16", infoUrl: info(784) },
  },
  {
    slug: "haydn-sonata-8-1", rank: 36, title: "Sonata in G, Hob. XVI:8 (1st Movement)", composer: "Joseph Haydn", catalogue: "Hob. XVI:8", movement: "1st movement: Allegro",
    genre: "classical", era: "classical-era", level: 2,
    aliases: [{ alias: "Piano Sonata in G major", kind: "title" }, { alias: "Hob. XVI:8", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "haydn_8_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/haydn_8_1.mid", sha256: "c5adb1a2f851502b2b4c0555fbbe8a508b343cbf4ef0cea3131fb2f3eb914c3f" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "haydn-sonata-35-1", rank: 37, title: "Sonata in C, Hob. XVI:35 (1st Movement)", composer: "Joseph Haydn", catalogue: "Hob. XVI:35", movement: "1st movement: Allegro con brio",
    genre: "classical", era: "classical-era", level: 4,
    aliases: [{ alias: "Piano Sonata in C major", kind: "title" }, { alias: "Hob. XVI:35", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "haydn_35_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/haydn_35_1.mid", sha256: "389466d0fa1e0cfbbbdf2c449f5d039b3c7e3cfb360717e2cce125c47bf93ee7" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "brahms-intermezzo-117-1", rank: 38, title: "Intermezzo in E-flat, Op. 117 No. 1", composer: "Johannes Brahms", catalogue: "Op. 117 No. 1",
    genre: "classical", era: "romantic", level: 3, tags: ["relaxing"],
    aliases: [{ alias: "Intermezzo in E-flat major", kind: "title" }, { alias: "Op. 117 No. 1", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "brahms_opus117_1.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/brahms_opus117_1.mid", sha256: "4d23f6b79301e2199168efa15e0b8a85dd8fb5ea5c0eb691fa2cf9402e159f8b" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "appassionata-2", rank: 39, title: "Appassionata Sonata (2nd Movement)", composer: "Ludwig van Beethoven", catalogue: "Op. 57", movement: "2nd movement: Andante con moto",
    genre: "classical", era: "classical-era", level: 3,
    aliases: [{ alias: "Piano Sonata No. 23", kind: "title" }, { alias: "Appassionata Sonata", kind: "nickname" }, { alias: "Op. 57", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "appass_2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/appass_2.mid", sha256: "886b80e9e555f7344d6bcfed53be8f6c77d5b4b3d21444e33e5c107f24bc8ab7" },
    second: { kind: "mutopia", mutopiaId: "288", url: "https://www.mutopiaproject.org/ftp/BeethovenLv/O57/LVB_Sonate_57_2/LVB_Sonate_57_2.mid", sha256: "2e96269c006b85a0986c7156cb70bf967a96e9a52d55ad47958d0e6b3c96243f", infoUrl: info(288) },
  },
  {
    slug: "albeniz-asturias", rank: 40, title: "Asturias (Leyenda)", composer: "Isaac Albéniz", catalogue: "Op. 47 No. 5",
    genre: "classical", era: "romantic", level: 4,
    aliases: [{ alias: "Leyenda", kind: "title" }, { alias: "Suite española", kind: "title" }, { alias: "Op. 47", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "alb_se5.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/alb_se5.mid", sha256: "28168a94d566e8e589b05588c4232109613fd3ed1754872e494d9fa627667499" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  {
    slug: "albeniz-tango-165-2", rank: 41, title: "Tango, Op. 165 No. 2", composer: "Isaac Albéniz", catalogue: "Op. 165 No. 2",
    genre: "classical", era: "romantic", level: 3,
    aliases: [{ alias: "España: Six Feuillets d'album", kind: "title" }, { alias: "Op. 165 No. 2", kind: "catalogue" }],
    primary: { kind: "piano-midi-de", file: "alb_esp2.mid", url: "https://app.midiano.com/resources/exampleSongs/piano-midi/alb_esp2.mid", sha256: "e93dd736e6dc9d026bc61035ea45f11770257a20df0dc43ff134a80757aafef0" },
    second: { kind: "scan", reference: "IMSLP PD edition", reason: "no Mutopia edition; IMSLP public-domain scan; not machine-readable, so the opening is compared by a reviewer" },
  },
  ],
};
