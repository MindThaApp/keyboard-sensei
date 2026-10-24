/**
 * Authored pieces dropped from batches B, C and D that could be written from
 * sources read by machine or from a legible public-domain scan: two works.
 * Everything lands as a draft.
 *
 * Imported here
 *   - Arrival of the Queen of Sheba (batch C row 45): Colin Hume's ABC
 *     collection (X:48) and The Session (tune 15342, setting 28604) agree in
 *     all 32 bars once the first is moved down a minor third.
 *   - Angels We Have Heard on High (batch D row 27): the Gloria runs and the
 *     verse read note by note from a public-domain 19th-century songbook page
 *     (Wikimedia Commons, "Les Anges dans nos campagnes 1.jpg"), compared with
 *     an independent MIDI transcription of the same tune and, for the Gloria,
 *     with the melody of the LilyPond score on Wikipedia. Only the tune is
 *     used; the harmony is written for this project.
 *
 * Not imported: every other row below needs a human with IMSLP access (IMSLP
 * and Hymnary, CPDL, Cyber Hymnal and abcnotation answer scripted requests with
 * a bot check) or a scan at a resolution that can be read bar by bar. The
 * leads found are listed so the work can be picked up.
 *
 * Hymns and carols
 *   - Jerusalem (Parry, 1916): a CC0 Commons MIDI ("And Did Those Feet In
 *     Ancient Time (Jerusalem).mid", melody on track 1, in C) and a public-domain
 *     page scan of the hymn in D (Commons, "And Did Those Feet In Ancient Time
 *     (Jerusalem).jpg", pages 167-171 of a national hymnal). The pitches of the
 *     two agree wherever the scan can be read, but the scan's bar structure
 *     (a rest-filled first bar, then a bar whose last note is tied across the
 *     system break) cannot be matched to the MIDI's rhythm at that resolution,
 *     so it is skipped.
 *   - Up on the Housetop (Hanby, 1864): Commons has only a horn-part PDF
 *     ("Up on the Housetop (IA imslp-on-the-housetop-hanby-benjamin-russel).pdf");
 *     the IMSLP vocal or piano edition is needed.
 *   - Go Tell It on the Mountain (Work, 1907): no machine-readable source found.
 *     Leads: Commons scans of "Folk songs of the American Negro" and Natalie
 *     Curtis's "Negro Folk-Songs" (djvu), and "The book of American Negro spirituals".
 *
 * Teaching repertoire (batch B rows 3, 5, 31, 32, 42, 43)
 *   - Minuet in D minor BWV Anh. 132, March in D BWV Anh. 122, Sonatina in G
 *     Anh. 5 No. 1, Minuet in F K. 2, Tchaikovsky's Sweet Dream (Op. 39 No. 21)
 *     and Italian Song (Op. 39 No. 15): no machine-readable edition found
 *     (Mutopia has Bach Anh. 120, 121 and 127 and Tchaikovsky Op. 39 Nos. 1, 5
 *     and 16, but not these). Needs IMSLP: BGA and Peters, the NMA and AMA
 *     scans, and Jurgenson 1878.
 *
 * Classical themes (batch C rows 5, 7, 20, 22, 24, 35-44, 46)
 *   - Je te veux (Satie): two public-domain Gallica scans on Commons
 *     (btv1b108446607 and btv1b10844658d) were found but not read.
 *   - Reverie (Debussy): Gallica btv1b10073584v on Commons.
 *   - Rustle of Spring (Sinding): Commons file "Fruhlingsrauschen -
 *     Klavierstuck - op. 32, no. 3 (IA 31761045162534).pdf".
 *   - Salut d'Amour (Elgar): Gallica bpt6k323436f (violin and piano) on Commons.
 *   - Meditation from Thais (Massenet): Gallica btv1b520002284 on Commons.
 *   - Humoresque Op. 101 No. 7 (Dvorak): Wikipedia links a PDF of the set.
 *   - Spring Song (Mendelssohn Op. 62 No. 6), "Lieder ohne Worte" scans on
 *     Commons (BY-NLB); Waltz Op. 64 No. 2 (Chopin), Arietta (Grieg Op. 12 No. 1),
 *     The Swan, Barcarolle (a Commons "Cygne saint saens fa majeur.svg" exists
 *     but is an image of the theme only), Boccherini's Minuet, Nimrod,
 *     Mouret's Rondeau: IMSLP editions needed.
 *   - Rondeau from Abdelazer (Purcell): The Session tune 10911 (fidicen, D
 *     minor) is the one machine-readable source; Commons has only the trombone
 *     part of the Air (IMSLP Z.570), not the Rondeau, so there is no second source.
 *   - Prince of Denmark's March / Trumpet Voluntary (Clarke): Colin Hume's ABC
 *     (Playford 1701 text) is the one machine-readable source; no second found.
 */
import { angelsWeHaveHeardOnHigh } from "../../essentials/authored/angels-we-have-heard-on-high.js";
import { arrivalOfTheQueenOfSheba } from "../../essentials/authored/arrival-of-the-queen-of-sheba.js";
import type { Pack, PackPiece } from "./pack.js";

const PIECES: PackPiece[] = [
  {
    slug: "angels-we-have-heard-on-high", rank: 27, title: "Angels We Have Heard on High", composer: "Traditional (France)",
    genre: "hymn-carol", era: "traditional", level: 2, tags: ["christmas"],
    aliases: [{ alias: "Les anges dans nos campagnes", kind: "translation" }, { alias: "Gloria in excelsis Deo", kind: "title" }],
    primary: {
      kind: "authored",
      basis: "The tune in its French form (\"Les anges dans nos campagnes\", a noel of the Languedoc) read from a public-domain songbook page of the 19th century, with the pitches checked against an independent MIDI transcription and, for the Gloria, the melody of a LilyPond score. Melody only, with a left hand of simple chords written for Midivory. Harmony and bass are original to this project.",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Les_Anges_dans_nos_campagnes_1.jpg",
      score: angelsWeHaveHeardOnHigh,
    },
    second: { kind: "scan", reference: "Commons \"Les anges dans nos campagnes.mid\" and the Wikipedia LilyPond melody", reason: "an independent MIDI transcription of the same tune and the LilyPond melody on Wikipedia agree with the score's pitches bar by bar (the rhythm of the verse differs between them); neither is an ABC file the pipeline can read, so a reviewer compares the opening" },
  },
  {
    slug: "arrival-of-the-queen-of-sheba", rank: 45, title: "Arrival of the Queen of Sheba", composer: "George Frideric Handel", catalogue: "HWV 67",
    genre: "classical", era: "baroque", level: 3, tags: ["wedding"],
    aliases: [{ alias: "The Queen of Sheba", kind: "title" }, { alias: "Solomon, Sinfonia", kind: "title" }, { alias: "HWV 67", kind: "catalogue" }],
    primary: {
      kind: "authored",
      basis: "The theme of the Sinfonia from Solomon (1748) as set in Colin Hume's ABC tune collection (X:48) and in The Session (tune 15342, setting 28604), which agree pitch for pitch in all 32 bars. A left hand of simple chords written for Midivory. Harmony and bass are original to this project.",
      sourceUrl: "https://colinhume.com/ABC.txt",
      score: arrivalOfTheQueenOfSheba,
    },
    second: { kind: "abc", reference: "The Session, setting 28604 (JACKB)", url: "https://thesession.org/tunes/15342#setting28604", transpose: 0,
      abc: "X:1\nT:The Arrival Of The Queen Of Sheba (tune 15342)\nM:4/4\nL:1/8\nK:Gmajor\ngdBd gdBd |gdBd gdBd|Agfe dcBA |BGAB cdef|gdBd gdBd |g^cAc geAe|fede A2^c2 |d2AB ABAB|" },
  },
];

export const BATCH_AUTHORED_SACRED: Pack = {
  id: "batch-authored-sacred",
  name: "Authored carols and classical themes",
  collection: null,
  pieces: PIECES,
};
