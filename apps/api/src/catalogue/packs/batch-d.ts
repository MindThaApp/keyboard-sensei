/**
 * Batch D of the library redesign: folk songs, children's songs, carols and
 * hymns (library spec sections 6 and 7, WP6). 26 works from the proposal's
 * 47 rows: 17 are scores arranged here (src/essentials/authored/) from a
 * machine-readable transcription of the tune, and 9 are Mutopia Project hymn
 * tunes imported as they are.
 *
 * Authored pieces: the tune is read from the cited public-domain transcription
 * (The Session, Colin Hume's ABC collection, The Everyday Song Book of 1927,
 * the Essen Folksong Collection) and the left hand is simple chords written
 * for this project. Where a second, independent transcription of the same
 * tune exists its opening is compared with the score's melody by the pipeline
 * (an "abc" second source: only the opening bars, copied from the cited file);
 * where it does not, the piece is ingested unchecked and a reviewer compares
 * the opening with a printed edition. Mutopia hymns are SATB files, imported
 * unchanged; none has a second machine-readable edition except "It Came Upon
 * the Midnight Clear", which has the Everyday Song Book setting.
 *
 * How the 47 rows became 26 works:
 *   - Row 26, Baa, Baa, Black Sheep, is the Twinkle tune and is an alias of the
 *     existing Twinkle, Twinkle, Little Star Work, not a new one (the row asks
 *     for exactly that).
 *   - Row 30, Once in Royal David's City, is not "authored" as the proposal
 *     says: Mutopia has the tune (Irby, no. 1252), so it is imported from there.
 *   - Row 46, Love Divine (Mutopia no. 193), is not imported: the file runs
 *     19.2 s, under the library's 20 s minimum (src/midi-metadata.ts). It needs
 *     bundling with a second verse or another Stainer tune, not a pinned file.
 *   - 19 rows are not imported. They are "authored" in the proposal, and
 *     the pipeline will not ingest a score that cannot be read from something:
 *     a melody typed from memory cannot be checked against two editions, and no
 *     public-domain machine-readable transcription of these could be found.
 *     Arirang, Jasmine Flower (Mo Li Hua), Kalinka, Santa Lucia, Funiculì
 *     Funiculà, La Cucaracha, Skye Boat Song, Molly Malone, Home on the Range,
 *     Oh My Darling Clementine, Au clair de la lune, Sur le pont d'Avignon,
 *     This Old Man, Itsy Bitsy Spider, Early One Morning, Angels We Have Heard
 *     on High, Up on the Housetop, Go Tell It on the Mountain and Jerusalem need
 *     hand authoring against printed editions by someone holding them.
 *
 * Everything lands as a draft. These are not Midiano's pieces, so they do not
 * carry the Midiano classics collection tag.
 */
import type { MutopiaPrimarySource, Pack, PackPiece } from "./pack.js";
import { beThouMyVision } from "../../essentials/authored/be-thou-my-vision.js";
import { bingo } from "../../essentials/authored/bingo.js";
import { coventryCarol } from "../../essentials/authored/coventry-carol.js";
import { dingDongMerrilyOnHigh } from "../../essentials/authored/ding-dong-merrily-on-high.js";
import { hickoryDickoryDock } from "../../essentials/authored/hickory-dickory-dock.js";
import { jollyOldSaintNicholas } from "../../essentials/authored/jolly-old-saint-nicholas.js";
import { korobeiniki } from "../../essentials/authored/korobeiniki.js";
import { lochLomond } from "../../essentials/authored/loch-lomond.js";
import { morningHasBroken } from "../../essentials/authored/morning-has-broken.js";
import { mussIDenn } from "../../essentials/authored/muss-i-denn.js";
import { oChristmasTree } from "../../essentials/authored/o-christmas-tree.js";
import { popGoesTheWeasel } from "../../essentials/authored/pop-goes-the-weasel.js";
import { redRiverValley } from "../../essentials/authored/red-river-valley.js";
import { sakuraSakura } from "../../essentials/authored/sakura-sakura.js";
import { simpleGifts } from "../../essentials/authored/simple-gifts.js";
import { theWaterIsWide } from "../../essentials/authored/the-water-is-wide.js";
import { weThreeKings } from "../../essentials/authored/we-three-kings.js";

const info = (id: number): string => `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${id}`;

/** A pinned Mutopia hymn file (public domain). */
const mutopia = (file: { id: string; path: string; sha256: string; ref: string; maintainer: string }): MutopiaPrimarySource => ({
  kind: "mutopia",
  mutopiaId: file.id,
  url: `https://www.mutopiaproject.org/ftp/${file.path}`,
  sha256: file.sha256,
  infoUrl: info(Number(file.id)),
  mutopiaRef: file.ref,
  licence: "Public Domain",
  maintainer: file.maintainer,
});

const PIECES: PackPiece[] = [
  {
    slug: "sakura-sakura", rank: 1, title: "Sakura Sakura", composer: "Traditional (Japan)",
    genre: "folk", era: "traditional", level: 1,
    aliases: [{ alias: "Sakura", kind: "title" }, { alias: "Cherry Blossoms", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The tune (the Japanese folk song, 1888 school songbook form) as transcribed in the Essen Folksong Collection (test0, no. 5), with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://github.com/cuthbertLab/music21/blob/master/music21/corpus/essenFolksong/test0.abc",
      score: sakuraSakura,
    },
    second: { kind: "scan", reference: "Essen Folksong Collection (test0, no. 5)", reason: "the only other machine-readable edition found, the 1895 koto setting on Mutopia (no. 1971), is ornamented and shares only 11 of the first 16 notes, so it cannot confirm the opening; a reviewer compares it with the 1888 school songbook" },
  },
  {
    slug: "korobeiniki", rank: 4, title: "Korobeiniki", composer: "Traditional (Russia)",
    genre: "folk", era: "traditional", level: 2,
    aliases: [{ alias: "Korobeyniki", kind: "title" }, { alias: "Tetris theme", kind: "nickname" }, { alias: "Коробейники", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The folk tune (Nikolay Nekrasov's 1861 poem set to a traditional air) as transcribed in The Session, setting 24502 by SturdyPete (moved from E minor to A minor), checked against setting 32073 by Erin Hennessy. Played twice, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/13747#setting24502",
      score: korobeiniki,
    },
    second: { kind: "abc", reference: "The Session, setting 32073 (Erin Hennessy)", url: "https://thesession.org/tunes/13747#setting32073", transpose: 7,
      abc: "X:1\nT:Korobeiniki (tune 13747)\nM:2/4\nK:Dminor\nA2 EF|G2 TFE|D2 DF|A2 GF|E3 F|G2 A2|F2 D2|D2 z2||\nG2- GB|d2 cB|A3 F|A2 GF|E2 EF|G2 A2|F2 D2|D2 z2||" },
  },
  {
    slug: "loch-lomond", rank: 9, title: "Loch Lomond", composer: "Traditional (Scotland)",
    genre: "folk", era: "traditional", level: 1,
    aliases: [{ alias: "The Bonnie Banks o' Loch Lomond", kind: "title" }, { alias: "Bonnie Banks of Loch Lomond", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The traditional air as transcribed in The Session, setting 25640 by TomBom (moved from D to G), checked against setting 4952 by GoneAway. One strain, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/4952#setting25640",
      score: lochLomond,
    },
    second: { kind: "abc", reference: "The Session, setting 4952 (GoneAway, moved from D)", url: "https://thesession.org/tunes/4952#setting4952", transpose: 5,
      abc: "X:1\nT:Loch Lomond (tune 4952)\nM:4/4\nK:Gmajor\nA,B,|D2 DE F2 FE|D2 DB, A,2 A,B,|E2 EE E2 FA|B4 A4|\nB2 BA F2 FA|GF ED B,2 A,B,|D2 FA B2 AF|E4 D4||" },
  },
  {
    slug: "the-water-is-wide", rank: 11, title: "The Water Is Wide", composer: "Traditional (England/Scotland)",
    genre: "folk", era: "traditional", level: 1, tags: ["relaxing","wedding"],
    aliases: [{ alias: "O Waly, Waly", kind: "title" }, { alias: "Waly Waly", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The traditional air (Cecil Sharp's 1906 form of \"O Waly, Waly\") as transcribed in The Session, setting 31954 by suskin, checked against setting 31970 by DonaldK. One verse, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/16776#setting31954",
      score: theWaterIsWide,
    },
    second: { kind: "abc", reference: "The Session, setting 31970 (DonaldK, moved from D)", url: "https://thesession.org/tunes/16776#setting31970", transpose: -7,
      abc: "X:1\nT:Water Is Wide, The (tune 16776)\nM:3/4\nK:Dmajor\nA/ d/d/ e|f4-|f3/2 e/ e/d B/|A4-|A2 d c|\nd4-|d e/f/ g f|e4-|e3/2 e/ f g|\na4-|a g/f/ e d|f4-|f e d B|" },
  },
  {
    slug: "red-river-valley", rank: 15, title: "Red River Valley", composer: "Traditional (North America)",
    genre: "folk", era: "traditional", level: 1,
    primary: {
      kind: "authored",
      basis: "The traditional song (published 1896) as transcribed in Colin Hume's ABC tune collection, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://colinhume.com/ABC.txt",
      score: redRiverValley,
    },
    second: { kind: "scan", reference: "Colin Hume's ABC collection", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with a public-domain songbook edition" },
  },
  {
    slug: "simple-gifts", rank: 16, title: "Simple Gifts", composer: "Joseph Brackett",
    genre: "folk", era: "traditional", level: 1,
    aliases: [{ alias: "'Tis the Gift to Be Simple", kind: "title" }, { alias: "Lord of the Dance", kind: "nickname" }],
    primary: {
      kind: "authored",
      basis: "The Shaker song (Elder Joseph Brackett, 1848) as transcribed in Colin Hume's ABC tune collection, checked against The Session, setting 8033 by Joseph Chordmichael. The first two strains, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/8033#setting8033",
      score: simpleGifts,
    },
    second: { kind: "abc", reference: "The Session, setting 8033 (Joseph Chordmichael)", url: "https://thesession.org/tunes/8033#setting8033",
      abc: "X:1\nT:Simple Gifts (tune 8033)\nM:4/4\nK:Gmajor\nD2|G2GA BGBc|d2dc B2AG|A2AG A2AG|ABAF D2D2|\nGFGA BGBc|d2dc B2AG|A2AG AB2A|G2ED G4||" },
  },
  {
    slug: "muss-i-denn", rank: 20, title: "Muss i denn", composer: "Traditional (Germany)",
    genre: "folk", era: "traditional", level: 1,
    aliases: [{ alias: "Muss i denn zum Städtele hinaus", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The folk song (Friedrich Silcher's 1827 setting) as transcribed in the Essen Folksong Collection (Erk, no. E0785), with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://github.com/cuthbertLab/music21/blob/master/music21/corpus/essenFolksong/erk20.abc",
      score: mussIDenn,
    },
    second: { kind: "scan", reference: "Essen Folksong Collection (E0785)", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with Silcher's 1827 edition" },
  },
  {
    slug: "hickory-dickory-dock", rank: 21, title: "Hickory Dickory Dock", composer: "Traditional",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    aliases: [{ alias: "Hickory, Dickory, Dock", kind: "title" }, { alias: "Dickory, Dickory, Dock", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The nursery rhyme as printed in The Everyday Song Book (1927, no. 19), in John Chambers' ABC transcription. Played twice, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/019_Dickory_Dickory_Dock.abc",
      score: hickoryDickoryDock,
    },
    second: { kind: "scan", reference: "The Everyday Song Book (1927), no. 19", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with a second public-domain nursery songbook" },
  },
  {
    slug: "pop-goes-the-weasel", rank: 22, title: "Pop Goes the Weasel", composer: "Traditional",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    primary: {
      kind: "authored",
      basis: "The nursery tune (published in the 1850s as a country dance) as transcribed in The Session, setting 10534 by ceolachan, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/10534#setting10534",
      score: popGoesTheWeasel,
    },
    second: { kind: "scan", reference: "The Session, settings of Pop Goes The Weasel", reason: "the other transcriptions found (The Session setting 42617, Colin Hume's dance tune) differ in the second and third notes, so there is no agreeing second source; a reviewer compares the opening with a public-domain songbook" },
  },
  {
    slug: "bingo", rank: 25, title: "Bingo", composer: "Traditional",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    aliases: [{ alias: "Bingo Was His Name-O", kind: "title" }, { alias: "B-I-N-G-O", kind: "nickname" }],
    primary: {
      kind: "authored",
      basis: "The children's song as printed in The Everyday Song Book (1927, no. 138), in John Chambers' ABC transcription. Played twice, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/138_Bingo.abc",
      score: bingo,
    },
    second: { kind: "scan", reference: "The Everyday Song Book (1927), no. 138", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with a second public-domain songbook" },
  },
  {
    slug: "we-three-kings", rank: 28, title: "We Three Kings", composer: "John Henry Hopkins Jr.",
    genre: "hymn-carol", era: "romantic", level: 2, tags: ["christmas"], publishedYear: 1863,
    aliases: [{ alias: "We Three Kings of Orient Are", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The carol (John Henry Hopkins Jr., 1863) as printed in The Everyday Song Book (1927, no. 154), in John Chambers' ABC transcription, checked against Colin Hume's ABC transcription. Verse and refrain, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/154_We_Three_Kings_of_Orient_Are.abc",
      score: weThreeKings,
    },
    second: { kind: "abc", reference: "Colin Hume's ABC collection, We Three Kings Of Orient Are", url: "https://colinhume.com/ABC.txt",
      abc: "X:1\nT:We Three Kings Of Orient Are\nM:6/8\nL:1/8\nK:Em\n\"Em\"B2A G2E | \"B7\"FGF \"Em\"E3 | \"Em\"B2A G2E | \"B7\"FGF \"Em\"E3 |\\\n\"G\"G2G \"D\"A2A | \"G\"B2B \"Bm\"dcB | \"Am\"ABA \"B7\"G2F | \"Em\"E3 \"D7\"F2A ||" },
  },
  {
    slug: "it-came-upon-the-midnight-clear", rank: 29, title: "It Came Upon the Midnight Clear", composer: "Richard Storrs Willis",
    genre: "hymn-carol", era: "romantic", level: 2, tags: ["christmas"],
    aliases: [{ alias: "Carol", kind: "nickname" }],
    primary: mutopia({ id: "1231", path: "WillisRS/carol/carol.mid", sha256: "0e1f08dd5e6840949cfa700c026643d6d748402d1b83336a9a723e94db1e8104", ref: "Mutopia-2008/01/13-1231", maintainer: "Steve Dunlop" }),
    second: { kind: "abc", reference: "The Everyday Song Book (1927), no. 106 (the tune \"Carol\")", url: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/106_It_Came_Upon_the_Midnight_Clear.abc",
      abc: "X:1\nT: It Came Upon the Midnight Clear\nM: 6/8\nL: 1/8\nK: Bb\nF | d2 A cB G | F2 G F2 G | GA B Bc d | c3- c2 ||\nF | d2 A cB G | F2 G F2 F | G2 G AG F | B3- B2 ||" },
  },
  {
    slug: "once-in-royal-davids-city", rank: 30, title: "Once in Royal David's City", composer: "Henry J. Gauntlett",
    genre: "hymn-carol", era: "romantic", level: 2, tags: ["christmas"],
    aliases: [{ alias: "Irby", kind: "nickname" }],
    primary: mutopia({ id: "1252", path: "GauntlettHJ/irby/irby.mid", sha256: "af605ab811c15903f965868e48f4e9f8de2d3833474bad2c4dccb33d7d8f7123", ref: "Mutopia-2008/01/13-1252", maintainer: "Steve Dunlop" }),
    second: { kind: "scan", reference: "Printed edition of the Once in Royal David's City tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "o-holy-night", rank: 31, title: "O Holy Night (Minuit, Chrétiens)", composer: "Adolphe Adam",
    genre: "hymn-carol", era: "romantic", level: 3, tags: ["christmas"],
    aliases: [{ alias: "O Holy Night", kind: "title" }, { alias: "Minuit, chrétiens", kind: "translation" }, { alias: "Cantique de Noël", kind: "translation" }],
    primary: mutopia({ id: "640", path: "AdamA/minuit_chretiens/minuit_chretiens.mid", sha256: "13ec851eb00ca9aba345cad50f03bdb3b189f566f38d094a1e6b839765b3d678", ref: "Mutopia-2005/12/09-640", maintainer: "Gérard Gréco" }),
    second: { kind: "scan", reference: "Printed edition of the O Holy Night tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "o-christmas-tree", rank: 32, title: "O Christmas Tree (O Tannenbaum)", composer: "Traditional (Germany)",
    genre: "hymn-carol", era: "traditional", level: 1, tags: ["christmas"],
    aliases: [{ alias: "O Tannenbaum", kind: "translation" }, { alias: "O Christmas Tree", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The folk song (Ernst Anschütz's 1824 text set to an older melody) as transcribed in the Essen Folksong Collection (Böhme, no. B0638), with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://github.com/cuthbertLab/music21/blob/master/music21/corpus/essenFolksong/boehme20.abc",
      score: oChristmasTree,
    },
    second: { kind: "scan", reference: "Essen Folksong Collection (B0638)", reason: "the other Essen transcriptions of the title (E0175, Z0263) are different melodies, so there is no second machine-readable source for this tune; a reviewer compares the opening with a public-domain songbook" },
  },
  {
    slug: "jolly-old-saint-nicholas", rank: 34, title: "Jolly Old Saint Nicholas", composer: "Traditional (US)",
    genre: "hymn-carol", era: "traditional", level: 1, tags: ["christmas","kids"],
    aliases: [{ alias: "Jolly Old St. Nicholas", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The children's carol as printed in The Everyday Song Book (1927, no. 21), in John Chambers' ABC transcription (the top line of the printed parts is the tune). One verse, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/021-Jolly_Old_St_Nicholas-V1.abc",
      score: jollyOldSaintNicholas,
    },
    second: { kind: "scan", reference: "The Everyday Song Book (1927), no. 21", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with a second public-domain songbook" },
  },
  {
    slug: "ding-dong-merrily-on-high", rank: 35, title: "Ding Dong Merrily on High", composer: "Traditional (France, 1589 tune)",
    genre: "hymn-carol", era: "traditional", level: 2, tags: ["christmas"],
    aliases: [{ alias: "Ding Dong! Merrily on High", kind: "title" }, { alias: "Branle de l'Officiel", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The tune (Thoinot Arbeau's \"Branle de l'Officiel\", Orchésographie, 1589) as transcribed in The Session, setting 27786 by Javi V, checked against Colin Hume's ABC transcription. One verse and refrain, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/15031#setting27786",
      score: dingDongMerrilyOnHigh,
    },
    second: { kind: "abc", reference: "Colin Hume's ABC collection, Ding Dong Merrily (moved from B-flat)", url: "https://colinhume.com/ABC.txt", transpose: 4,
      abc: "X:1\nT:Ding Dong Merrily\nM:2/2\nL:1/4\nK:Bb\n|: \"Bb\"BB \"C7\"c/B/A/G/ | \"F\"F3F | \"Eb\"GB \"F\"BA | \"Bb\"B2B2 :|\n|: \"Bb\"f>e d/e/f/d/ | \"Cm\"e>d c/d/e/c/ | \"Bb/D\"d>c B/c/d/B/ | \"F\"c>B A/B/c/A/ |" },
  },
  {
    slug: "coventry-carol", rank: 36, title: "Coventry Carol", composer: "Traditional (England)",
    genre: "hymn-carol", era: "traditional", level: 2, tags: ["christmas"],
    aliases: [{ alias: "The Coventry Carol", kind: "title" }, { alias: "Lully, Lulla, Thou Little Tiny Child", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The carol (Coventry Shearmen and Taylors' Pageant, 1534) as transcribed in Colin Hume's ABC tune collection, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://colinhume.com/ABC.txt",
      score: coventryCarol,
    },
    second: { kind: "scan", reference: "Colin Hume's ABC collection", reason: "only one machine-readable transcription was found, and the score was read from it; a reviewer compares the opening with a public-domain hymnal" },
  },
  {
    slug: "angels-from-the-realms-of-glory", rank: 38, title: "Angels from the Realms of Glory (Regent Square)", composer: "Henry Smart",
    genre: "hymn-carol", era: "romantic", level: 2, tags: ["christmas"],
    aliases: [{ alias: "Regent Square", kind: "nickname" }],
    primary: mutopia({ id: "1288", path: "SmartHT/regent_square/regent_square.mid", sha256: "f46a0e5b038792d444f9663d9bffe342e821e41919b0c4fc0937590b01212f18", ref: "Mutopia-2008/02/19-1288", maintainer: "Steve Dunlop" }),
    second: { kind: "scan", reference: "Printed edition of the Angels from the Realms of Glory tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "nearer-my-god-to-thee", rank: 39, title: "Nearer, My God, to Thee", composer: "Lowell Mason",
    genre: "hymn-carol", era: "romantic", level: 2,
    aliases: [{ alias: "Bethany", kind: "nickname" }, { alias: "Nearer My God to Thee", kind: "title" }],
    primary: mutopia({ id: "1034", path: "MasonL/nmgtt/nmgtt.mid", sha256: "c579efd33d5239cf9fc15603f3cb42100e4487e8ad367a13e7ce3eaecf15e692", ref: "Mutopia-2007/09/11-1034", maintainer: "Ross Uber" }),
    second: { kind: "scan", reference: "Printed edition of the Nearer, My God, to Thee tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "rock-of-ages", rank: 40, title: "Rock of Ages (Toplady)", composer: "Thomas Hastings",
    genre: "hymn-carol", era: "romantic", level: 2,
    aliases: [{ alias: "Toplady", kind: "nickname" }, { alias: "Rock of Ages, Cleft for Me", kind: "title" }],
    primary: mutopia({ id: "196", path: "HastingsT/TopLady/TopLady.mid", sha256: "c44d66bf8ad066881b3b832af0b8d0331e8b2cfe9701435e5ce12ac4100198ae", ref: "Mutopia-2004/11/30-196", maintainer: "Peter Chubb" }),
    second: { kind: "scan", reference: "Printed edition of the Rock of Ages tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "guide-me-o-thou-great-redeemer", rank: 41, title: "Guide Me, O Thou Great Redeemer (Cwm Rhondda)", composer: "John Hughes",
    genre: "hymn-carol", era: "early-20th-c", level: 2, publishedYear: 1907,
    aliases: [{ alias: "Cwm Rhondda", kind: "nickname" }, { alias: "Bread of Heaven", kind: "nickname" }, { alias: "Guide Me, O Thou Great Jehovah", kind: "title" }],
    primary: mutopia({ id: "523", path: "HughesJ/CwmRhondda/CwmRhondda.mid", sha256: "4a722cb46c2605fb3b9dec45441942d9b976eb69d8224ccbe6da01f402758ee3", ref: "Mutopia-2005/01/18-523", maintainer: "Peter Chubb" }),
    second: { kind: "scan", reference: "Printed edition of the Guide Me, O Thou Great Redeemer tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "i-vow-to-thee-my-country", rank: 42, title: "I Vow to Thee, My Country (Thaxted)", composer: "Gustav Holst",
    genre: "hymn-carol", era: "early-20th-c", level: 2, tags: ["wedding"], publishedYear: 1921,
    aliases: [{ alias: "Thaxted", kind: "nickname" }, { alias: "Jupiter", kind: "nickname" }, { alias: "Jupiter Theme", kind: "nickname" }],
    primary: mutopia({ id: "527", path: "HolstGT/Thaxted/Thaxted.mid", sha256: "1544d061ea2f50d075ec852996974683ff52af0125dfeef635964ae84e9149f3", ref: "Mutopia-2005/01/18-527", maintainer: "Peter Chubb" }),
    second: { kind: "scan", reference: "Printed edition of the I Vow to Thee, My Country tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
  {
    slug: "be-thou-my-vision", rank: 44, title: "Be Thou My Vision (Slane)", composer: "Traditional (Ireland)",
    genre: "hymn-carol", era: "traditional", level: 1, tags: ["wedding"],
    aliases: [{ alias: "Slane", kind: "nickname" }, { alias: "Be Thou My Vision", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The Irish melody \"Slane\" (melody only; the harmony is original) as transcribed in The Session, setting 6415 by nicholas, checked against setting 54364 by Jim Sime. One verse, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/6415#setting6415",
      score: beThouMyVision,
    },
    second: { kind: "abc", reference: "The Session, setting 54364 (Jim Sime, moved from D)", url: "https://thesession.org/tunes/6415#setting54364", transpose: -7,
      abc: "X:1\nT:Be Thou My Vision (tune 6415)\nM:3/4\nK:Dmajor\nA2|\"D\" d2 d2 ed|\"G\" B2 A2 AB|\"D\" d2 d2 \"A\" e2| \"D\" f4 af|\n \"A\" e2 e2 e2| \"Bm\" e2 f2 a2| \"G\" b2 a2 f2|\"A\" a4 a2|" },
  },
  {
    slug: "morning-has-broken", rank: 45, title: "Morning Has Broken (Bunessan, instrumental)", composer: "Traditional (Scotland)",
    genre: "hymn-carol", era: "traditional", level: 1,
    aliases: [{ alias: "Bunessan", kind: "nickname" }, { alias: "Morning Has Broken", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The Gaelic tune \"Bunessan\" (melody only; the 1931 words are not used) as transcribed in The Session, setting 46149 by JACKB, checked against setting 28658 by Greetings. One verse, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/15358#setting46149",
      score: morningHasBroken,
    },
    second: { kind: "abc", reference: "The Session, setting 28658 (Greetings)", url: "https://thesession.org/tunes/15358#setting28658",
      abc: "X:1\nT:Bunessan (tune 15358)\nM:3/4\nK:Dmajor\n\"D\"D2 F2 A2|d6|\"Em\"e6|\"A\"c2 B2 A2|\"G\"B3 c B2|\"D\"A6|D2 E2 F2|\"F#m\"A6|\n\"G\"B6|\"D\"A2 F2 D2|\"A\"E6-|\"A7\"E6|\"D\"A2 F2 A2|\"G\"d6|B6|\"D\"A2 F2 D2|" },
  },
  {
    slug: "brother-jamess-air", rank: 47, title: "Brother James' Air", composer: "James Leith Macbeth Bain",
    genre: "hymn-carol", era: "early-20th-c", level: 2, tags: ["relaxing"],
    aliases: [{ alias: "Brother James's Air", kind: "title" }, { alias: "The Lord's My Shepherd", kind: "nickname" }],
    primary: mutopia({ id: "1230", path: "BainJLM/brother_james_air/brother_james_air.mid", sha256: "ee3ed14e9ec171e1ed26b660aef11d7b5748f808b0b1bc4d45a97b820430c498", ref: "Mutopia-2008/01/13-1230", maintainer: "Steve Dunlop" }),
    second: { kind: "scan", reference: "Printed edition of the Brother James' Air tune", reason: "no second machine-readable edition exists; a reviewer compares the opening with the public-domain printed edition (IMSLP or a period hymnal)" },
  },
];

export const BATCH_D: Pack = {
  id: "batch-d",
  name: "Batch D: folk songs, children's songs, carols and hymns",
  // These are not Midiano's pieces, so they do not carry the Midiano classics collection tag.
  collection: null,
  pieces: PIECES,
};
