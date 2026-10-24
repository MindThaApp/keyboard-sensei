/**
 * Authored folk, world and children's tunes (library spec section 6, the rows
 * of batches A and D that the pack pipeline could not import as pinned files).
 * Each is a public-domain melody written out in src/essentials/authored/ from
 * machine-readable transcriptions, with a left hand of simple chords written
 * for this project.
 *
 * How a tune was admitted: its melody was read note for note from one
 * transcription and compared, over its whole length, with at least one other
 * transcription made independently of it (see each piece's basis below, and
 * the opening excerpt kept as its second source for the pipeline's own
 * check). Where the sources disagree about the tune itself the piece is left
 * out rather than guessed at.
 *
 * Left out, with the reason:
 *   - Jasmine Flower (Mo Li Hua): the transcriptions found are different forms
 *     of the tune (the ornamented Jiangsu original in the Essen collection;
 *     Chambers' and The Session's modern settings differ from each other in
 *     the fifth to seventh notes), so no one tune is confirmed by two sources.
 *   - Molly Malone (Cockles and Mussels): the 1884 student-songbook setting
 *     (ingeb.org) and the modern setting (Chambers, The Session) differ in the
 *     third phrase.
 *   - La Cucaracha: the Wikipedia score and ingeb.org share only the opening;
 *     the rest of the chorus differs.
 *   - Itsy Bitsy Spider: the Wikipedia score and Chambers' ABC disagree on the
 *     two notes before the last line.
 *   - Funiculi, Funicula: Chambers and The Session agree, but ingeb.org's
 *     setting is a different arrangement of the strains, so only one pair is
 *     confirmed and the choice of strains is left for a reviewer.
 *   - Kalinka, Home on the Range, This Old Man: no second independent
 *     machine-readable transcription of the same tune could be found.
 *   - Early One Morning: the only ABC found (Colin Hume's) is a contra-dance
 *     tune of that name, not the song.
 *
 * Everything lands as a draft.
 */
import type { Pack, PackPiece } from "./pack.js";
import { arirang } from "../../essentials/authored/arirang.js";
import { auClairDeLaLune } from "../../essentials/authored/au-clair-de-la-lune.js";
import { ohMyDarlingClementine } from "../../essentials/authored/oh-my-darling-clementine.js";
import { oldMacdonaldHadAFarm } from "../../essentials/authored/old-macdonald-had-a-farm.js";
import { santaLucia } from "../../essentials/authored/santa-lucia.js";
import { skyeBoatSong } from "../../essentials/authored/skye-boat-song.js";
import { surLePontDavignon } from "../../essentials/authored/sur-le-pont-davignon.js";

const CHAMBERS = "https://trillian.mit.edu/~jc/music/abc/";

const PIECES: PackPiece[] = [
  {
    slug: "arirang", rank: 2, title: "Arirang", composer: "Traditional (Korea)",
    genre: "folk", era: "traditional", level: 1,
    aliases: [{ alias: "Gyeonggi Arirang", kind: "title" }, { alias: "아리랑", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The folk song (Gyeonggi Arirang) as transcribed in John Chambers' ABC collection, checked note for note against the Wikipedia score (moved from F, which writes it in 9/8). Both strains, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: `${CHAMBERS}Korea/Arirang_G.abc`,
      score: arirang,
    },
    second: { kind: "abc", reference: "John Chambers' ABC collection, Korea/Arirang_G.abc", url: `${CHAMBERS}Korea/Arirang_G.abc`,
      abc: "X:1\nT:Arirang\nM:3/4\nL:1/8\nK:G\n[| \"G\"D3 E DE | G3 A GA | B2 (3ABA GE | \"D\"D3 E DE \\\n| \"G\"G3 A GA | \"Em\"BA GE DE | \"C\"G3 A G2 | \"G\"G6 ||" },
  },
  {
    slug: "santa-lucia", rank: 6, title: "Santa Lucia", composer: "Teodoro Cottrau",
    genre: "folk", era: "romantic", level: 2, publishedYear: 1849,
    aliases: [{ alias: "Sul mare luccica", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The Neapolitan boat song (Teodoro Cottrau, 1849) as printed in The Everyday Song Book (1927, no. 144), in John Chambers' ABC transcription, checked note for note against his accordion-book transcription (Italy/SantaLucia.abc) and ingeb.org. Verse and refrain with the first ending, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://trillian.mit.edu/~jc/music/book/EverydaySongBook/144_Santa_Lucia.abc",
      score: santaLucia,
    },
    second: { kind: "abc", reference: "John Chambers' ABC collection, Italy/SantaLucia.abc", url: `${CHAMBERS}Italy/SantaLucia.abc`,
      abc: "X:1\nT:Santa Lucia\nM:3/4\nL:1/8\nK:C\n|: \"C\"G2 G3 c | \"G7\"cB B4 | \"F\"F2 F3 A | \"C\"AG G4 |\n| \"A7\"E2 A2 G2 | \"Dm\"G_GF4 | \"G7\"F2 E2 D2 | \"C\"A2 G4 :|" },
  },
  {
    slug: "skye-boat-song", rank: 10, title: "The Skye Boat Song", composer: "Traditional (Scotland)",
    genre: "folk", era: "traditional", level: 1, tags: ["relaxing"], publishedYear: 1884,
    aliases: [{ alias: "Skye Boat Song", kind: "title" }, { alias: "Over the Sea to Skye", kind: "nickname" }],
    primary: {
      kind: "authored",
      basis: "The air (words by Sir Harold Boulton, 1884, to a Gaelic rowing tune) as transcribed on The Session, tune 3690 by dveith, and in John Chambers' ABC collection, checked against the Wikipedia score and ingeb.org. Twelve bars, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://thesession.org/tunes/3690#setting3690",
      score: skyeBoatSong,
    },
    second: { kind: "abc", reference: "The Session, tune 3690, setting 3690 (dveith)", url: "https://thesession.org/tunes/3690#setting3690",
      abc: "X:1\nT:The Skye Boat Song (tune 3690)\nM:3/4\nK:Gmajor\n\"G\"D>E D \"G\"G2 G|\"D\"A>B A \"D\"d3|\"G\"B>A B \"C\"E2 E|\"D\"D3 \"D\"D3|\n\"G\"D>E D \"G\"G2 G|\"D\"A>B A \"D\"d3|\"G\"B>A B \"C\"E2 E|E>D E \"G\"G3|" },
  },
  {
    slug: "au-clair-de-la-lune", rank: 18, title: "Au clair de la lune", composer: "Traditional (France)",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    aliases: [{ alias: "By the Light of the Moon", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The French folk song as transcribed on ingeb.org (Lieder: Au clair de la lune), checked note for note against the Wikimedia Commons MIDI \"Ly au clair de la lune accords melodie paroles\" (in C). Sixteen bars, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://ingeb.org/songs/auclaird.html",
      score: auClairDeLaLune,
    },
    second: { kind: "abc", reference: "Wikimedia Commons MIDI \"Ly au clair de la lune accords melodie paroles.mid\" (opening notes read from the file, in C)", url: "https://commons.wikimedia.org/wiki/File:Ly_au_clair_de_la_lune_accords_melodie_paroles.mid", transpose: 7,
      abc: "X:1\nT:Au clair de la lune\nM:4/4\nK:C\nC C C D | E2 D2 | C E D D | C4 | C C C D | E2 D2 |" },
  },
  {
    slug: "sur-le-pont-davignon", rank: 19, title: "Sur le pont d'Avignon", composer: "Traditional (France)",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    aliases: [{ alias: "Sur le pont d’Avignon", kind: "title" }, { alias: "On the Bridge of Avignon", kind: "translation" }],
    primary: {
      kind: "authored",
      basis: "The French round as transcribed in John Chambers' ABC collection (moved from F), checked note for note against ingeb.org (Lieder: Sur le pont d'Avignon) and the Wikimedia Commons MIDI \"Sur le pont d'Avignon\". The first strain, the \"Les beaux messieurs\" strain and the first strain again, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: `${CHAMBERS}song/Sur_le_Pont_DAvignon_F.abc`,
      score: surLePontDavignon,
    },
    second: { kind: "abc", reference: "John Chambers' ABC collection, song/Sur_le_Pont_DAvignon_F.abc (moved from F)", url: `${CHAMBERS}song/Sur_le_Pont_DAvignon_F.abc`, transpose: 2,
      abc: "X:1\nT:Sur le pont d'Avignon\nM:2/4\nL:1/8\nK:F\nFF F2 | GG G2 | ABcF | EFGC | FF F2 | GG G2 | ABcF | GE F2 ||" },
  },
  {
    slug: "oh-my-darling-clementine", rank: 17, title: "Oh My Darling, Clementine", composer: "Traditional (US)",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"], publishedYear: 1884,
    aliases: [{ alias: "Clementine", kind: "nickname" }, { alias: "In a Cavern, in a Canyon", kind: "nickname" }],
    primary: {
      kind: "authored",
      basis: "The American folk ballad (published 1884) as set in the MIDI \"O My Darling Clementine\" by Rabanus Flavus on Wikimedia Commons (CC0), checked note for note against the MIDI sequence \"Clementine\" by Rainer Lewalter. Two verses, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:O_My_Darling_Clementine.mid",
      score: ohMyDarlingClementine,
    },
    second: { kind: "abc", reference: "Wikimedia Commons MIDI \"Clementine.MID\" by Rainer Lewalter (opening notes read from the file)", url: "https://commons.wikimedia.org/wiki/File:Clementine.MID",
      abc: "X:1\nT:Clementine\nM:4/4\nK:G\nG G G D | B B B G | G B d d | c B A A B | c c B A B | G G B A D F A G |" },
  },
  {
    slug: "old-macdonald-had-a-farm", rank: 42, title: "Old MacDonald Had a Farm", composer: "Traditional",
    genre: "childrens", era: "traditional", level: 1, tags: ["kids"],
    aliases: [{ alias: "Old Macdonald", kind: "nickname" }, { alias: "E-I-E-I-O", kind: "nickname" }],
    primary: {
      kind: "authored",
      basis: "The children's song as set in the MIDI \"Old MacDonald Had a Farm\" by Nachtbold on Wikimedia Commons (CC0), checked note for note against the MIDI setting by Rabanus Flavus (CC0, in A). One verse, with a left hand of simple chords written for OctaviApp. Harmony and bass are original to this project.",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Old_MacDonald_Had_a_Farm.mid",
      score: oldMacdonaldHadAFarm,
    },
    second: { kind: "abc", reference: "Wikimedia Commons MIDI \"Old MacDonald Had a Farm (pg).mid\" by Rabanus Flavus (opening notes read from the file, in A)", url: "https://commons.wikimedia.org/wiki/File:Old_MacDonald_Had_a_Farm_(pg).mid", transpose: -2,
      abc: "X:1\nT:Old MacDonald Had a Farm\nM:4/4\nK:A\nA A A E | F F E2 | c c B B | A2 E A | A A E F | F E c c |" },
  },
];

export const BATCH_AUTHORED_FOLK: Pack = {
  id: "batch-authored-folk",
  name: "Authored folk, world and children's tunes",
  collection: null,
  pieces: PIECES,
};
