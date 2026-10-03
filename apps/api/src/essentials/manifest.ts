/**
 * The Essentials pack: the most recognisable public-domain piano pieces and
 * melodies, each in up to three versions (Beginner / Intermediate / Full).
 *
 * Every source is a Mutopia Project file, pinned by exact URL and sha256 so
 * the fetch is reproducible, with its licence and attribution recorded here.
 * Mutopia files are Public Domain or Creative Commons (BY / BY-SA): the
 * compositions are all public domain; a CC licence covers the typesetting.
 *
 * `incipit` is the opening of the tune, written down independently of the
 * source file, and is asserted against the melody extracted from every
 * generated version. `incipitBasis` says how it was established:
 *   - "known-melody": the standard published tune;
 *   - "independent-transcription": matched against a second, unrelated MIDI
 *     transcription of the same work (the ADL dataset copy), not from memory.
 *
 * Ranked by recognisability (1 = most recognisable).
 */

export type EssentialsLevel = "beginner" | "intermediate" | "full";

export interface MutopiaSource {
  /** Exact file fetched. A `.zip` means `member` is extracted from it. */
  url: string;
  sha256: string;
  member?: string;
  licence:
    | "Public Domain"
    | "Creative Commons Attribution 3.0"
    | "Creative Commons Attribution 4.0"
    | "Creative Commons Attribution-ShareAlike 2.5"
    | "Creative Commons Attribution-ShareAlike 3.0"
    | "Creative Commons Attribution-ShareAlike 4.0";
  mutopiaId: string;
  /** Who typeset the edition (the attribution CC licences require). */
  maintainer: string;
  infoUrl: string;
}

export interface EssentialsPiece {
  slug: string;
  rank: number;
  title: string;
  composer: string;
  genre: "classical" | "jazz" | "other";
  source: MutopiaSource;
  /**
   * Which source tracks are which hand, and which carry the tune. Omitted:
   * the lowest-pitched track is the left hand and the rest the right (the
   * same rule the play-along parser uses); a single track splits at middle C.
   */
  tracks?: { right: number[]; left: number[]; melody?: number[] };
  /** Skip an accompaniment-only introduction when finding the tune (quarter-note beats). */
  melodyStartBeat?: number;
  /** Opening notes of the tune in the source's key, scientific pitch (C4 = middle C). */
  incipit: string;
  incipitBasis: "known-melody" | "independent-transcription";
  /** Anything a reviewer should know about this piece's arrangement. */
  note?: string;
}

const MUTOPIA = "https://www.mutopiaproject.org/ftp/";
const info = (id: number): string => `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${id}`;

export const ESSENTIALS: EssentialsPiece[] = [
  {
    slug: "fur-elise", rank: 1, title: "Für Elise", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.mid`, sha256: "1c12c21c7bbf4cf163896732672648a69d497636059837abd153c71abe50215a", licence: "Public Domain", mutopiaId: "Mutopia-2015/08/18-931", maintainer: "Stelios Samelis", infoUrl: info(931) },
    incipit: "E5 D#5 E5 D#5 E5 B4 D5 C5 A4", incipitBasis: "known-melody",
  },
  {
    slug: "moonlight-sonata-1", rank: 2, title: "Moonlight Sonata (1st Movement)", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/O27/moonlight/moonlight-mids.zip`, member: "moonlight1.mid", sha256: "94915b176f0b999919a6cd1025a45ec8dd0a454dab33b2b332c5026291ea91f5", licence: "Creative Commons Attribution-ShareAlike 2.5", mutopiaId: "Mutopia-2007/02/11-276", maintainer: "Stewart Holmes", infoUrl: info(276) },
    melodyStartBeat: 19,
    incipit: "G#4 G#4 G#4 G#4 G#4 G#4 A4 G#4 F#4 B4 E4", incipitBasis: "known-melody",
    note: "The tune enters on the last beat of bar 5; the triplet introduction is accompaniment.",
  },
  {
    slug: "canon-in-d", rank: 3, title: "Canon in D", composer: "Johann Pachelbel", genre: "classical",
    source: { url: `${MUTOPIA}PachelbelJ/Canon_per_3_Violini_e_Basso/Canon_per_3_Violini_e_Basso-mids.zip`, member: "canon_per_3_violini_e_basso.mid", sha256: "d05d47d19130688728d43476ee30d7e6c41dfc5369e40f2a1dd50a69d389b29c", licence: "Creative Commons Attribution 4.0", mutopiaId: "Mutopia-2015/09/02-2047", maintainer: "Michael Fischer v. Mollard", infoUrl: info(2047) },
    tracks: { right: [0, 1, 2], left: [3], melody: [0] },
    incipit: "F#5 E5 D5 C#5 B4 A4 B4 C#5", incipitBasis: "known-melody",
    note: "Source is the original three violins and bass; the Full version plays all four parts on the piano.",
  },
  {
    slug: "ode-to-joy", rank: 4, title: "Ode to Joy", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/ode/ode.mid`, sha256: "fb1604c08c865b275b464d74e5a7c526ff1a8acccdf9853cb92f0778daaed14b", licence: "Public Domain", mutopiaId: "Mutopia-2009/08/05-528", maintainer: "Peter Chubb", infoUrl: info(528) },
    incipit: "B4 B4 C5 D5 D5 C5 B4 A4 G4 G4 A4 B4 B4 A4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "eine-kleine-nachtmusik", rank: 5, title: "Eine kleine Nachtmusik (1st Movement)", composer: "Wolfgang Amadeus Mozart", genre: "classical",
    source: { url: `${MUTOPIA}MozartWA/KV525/eine-kleine-nachtmusik-mvt1/eine-kleine-nachtmusik-mvt1.mid`, sha256: "f8b6dc991df6e90e2e2e11d561ab2cf8fec47beda747c69984c3fef4b539506b", licence: "Public Domain", mutopiaId: "Mutopia-2007/01/01-900", maintainer: "Anonymous", infoUrl: info(900) },
    tracks: { right: [0, 1], left: [2, 3], melody: [0] },
    incipit: "G5 D5 G5 D5 G5 D5 G5 B5 D6", incipitBasis: "known-melody",
    note: "Source is the string quartet; the Full version plays all four parts on the piano.",
  },
  {
    slug: "rondo-alla-turca", rank: 6, title: "Rondo alla Turca", composer: "Wolfgang Amadeus Mozart", genre: "classical",
    source: { url: `${MUTOPIA}MozartWA/KV331/KV331_3_RondoAllaTurca/KV331_3_RondoAllaTurca.mid`, sha256: "c14299cbdd34c8b2081da84dc06519ef8a52a0d589ee53c758d28b8e3d727d1c", licence: "Public Domain", mutopiaId: "Mutopia-2015/08/13-108", maintainer: "Rune Zedeler and Chris Sawer", infoUrl: info(108) },
    incipit: "B4 A4 G#4 A4 C5 D5 C5 B4 C5 E5 F5 E5 D#5 E5", incipitBasis: "known-melody",
  },
  {
    slug: "the-entertainer", rank: 7, title: "The Entertainer", composer: "Scott Joplin", genre: "jazz",
    source: { url: `${MUTOPIA}JoplinS/entertainer/entertainer.mid`, sha256: "33e4e81ee64ffb2edf90d1c6a1ddee7276507296bfb915c2bb775231a467f066", licence: "Public Domain", mutopiaId: "Mutopia-2016/11/25-263", maintainer: "Chris Sawer", infoUrl: info(263) },
    incipit: "D6 E6 C6 A5 B5 G5 D5 E5 C5 A4 B4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "silent-night", rank: 8, title: "Silent Night", composer: "Franz Xaver Gruber", genre: "other",
    source: { url: `${MUTOPIA}GruberFX/stille_nacht/stille_nacht.mid`, sha256: "c5d4e634edb067b7bda02f148f8f43ccfeac7bb9e10bd3add9051057ae6e9f39", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1295", maintainer: "Steve Dunlop", infoUrl: info(1295) },
    incipit: "F4 G4 F4 D4 F4 G4 F4 D4 C5 C5 A4 Bb4 Bb4 F4", incipitBasis: "known-melody",
  },
  {
    slug: "amazing-grace", rank: 9, title: "Amazing Grace", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Anonymous/new_britain/new_britain.mid`, sha256: "5bd1b1afdf9f2a5df31e531955169b90ce07a898f9a4c44e67192ee4350a1993", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1283", maintainer: "Steve Dunlop", infoUrl: info(1283) },
    incipit: "D4 G4 B4 G4 B4 A4 G4 E4 D4", incipitBasis: "known-melody",
  },
  {
    slug: "clair-de-lune", rank: 10, title: "Clair de Lune", composer: "Claude Debussy", genre: "classical",
    source: { url: `${MUTOPIA}DebussyC/L75/debussy_Ste_Bergamesq_Clair/debussy_Ste_Bergamesq_Clair.mid`, sha256: "4eee9a1546ffde1ff74cb9824ba0e57cbc821185a15185bfea9faed97820bf8c", licence: "Public Domain", mutopiaId: "Mutopia-2010/12/21-1778", maintainer: "Keith OHara", infoUrl: info(1778) },
    incipit: "Ab5 F5 Eb5 F5 Eb5 Db5 Eb5 Db5", incipitBasis: "known-melody",
    note: "The tune is the top of a line in thirds; Beginner plays the upper note.",
  },
  {
    slug: "beethoven-5th-symphony", rank: 11, title: "Symphony No. 5 (1st Movement)", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/O67/beethoven_fifth_op67/beethoven_fifth_op67.mid`, sha256: "c7d7c0b8c9facf54cedd77a98dc90fd59899f4c61f8cd9ad92c9e2ad8b56ead9", licence: "Public Domain", mutopiaId: "Mutopia-2015/01/17-497", maintainer: "Magnus Lewis-Smith", infoUrl: info(497) },
    incipit: "G4 G4 G4 Eb4 F4 F4 F4 D4", incipitBasis: "known-melody",
    note: "A published piano reduction.",
  },
  {
    slug: "joy-to-the-world", rank: 12, title: "Joy to the World", composer: "Lowell Mason (after Handel)", genre: "other",
    source: { url: `${MUTOPIA}HandelGF/antioch/antioch.mid`, sha256: "41152c8c7c18750cf2040f215e1db3c5b05ce6f79ffeae1a76a1c18cf7978844", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1223", maintainer: "Steve Dunlop", infoUrl: info(1223) },
    incipit: "D5 C#5 B4 A4 G4 F#4 E4 D4", incipitBasis: "known-melody",
  },
  {
    slug: "gymnopedie-1", rank: 13, title: "Gymnopédie No. 1", composer: "Erik Satie", genre: "classical",
    source: { url: `${MUTOPIA}SatieE/gymnopedie_1/gymnopedie_1.mid`, sha256: "09ce7337b4bf42ba12e1aa64b4c7dc7fcfa6455f1070cb12f8880a755df97384", licence: "Public Domain", mutopiaId: "Mutopia-2014/12/14-37", maintainer: "Evin Robertson", infoUrl: info(37) },
    melodyStartBeat: 12,
    incipit: "F#5 A5 G5 F#5 C#5 B4 C#5 D5 A4", incipitBasis: "known-melody",
    note: "Four bars of chords before the tune; they are accompaniment.",
  },
  {
    slug: "brahms-lullaby", rank: 14, title: "Lullaby (Wiegenlied)", composer: "Johannes Brahms", genre: "classical",
    source: { url: `${MUTOPIA}BrahmsJ/O49/Wiegenlied/Wiegenlied-mids.zip`, member: "Wiegenlied.mid", sha256: "2d2fd42d81dc11ce6d10c6fa0ca9e15b02bd2fea3badf3b1f56da683c6922d41", licence: "Public Domain", mutopiaId: "Mutopia-2007/11/04-1037", maintainer: "森 章吾", infoUrl: info(1037) },
    tracks: { right: [0, 3], left: [4], melody: [0] },
    incipit: "G4 G4 Bb4 G4 G4 Bb4 G4 Bb4 Eb5 D5 C5 C5 Bb4", incipitBasis: "known-melody",
    note: "Song with piano: the voice part is the tune, played by the right hand over the accompaniment.",
  },
  {
    slug: "vivaldi-spring", rank: 15, title: "Spring (The Four Seasons, 1st Movement)", composer: "Antonio Vivaldi", genre: "classical",
    source: { url: `${MUTOPIA}VivaldiA/O8/spring/spring-mids.zip`, member: "spring-score.mid", sha256: "1e3d57ffee2dc77a4d06d777f01633d3726c57221b35661d6093095ca8cef3fd", licence: "Creative Commons Attribution-ShareAlike 3.0", mutopiaId: "Mutopia-2010/02/08-301", maintainer: "Mutopia Project contributors", infoUrl: info(301) },
    tracks: { right: [0, 1, 2], left: [3, 4], melody: [0] },
    incipit: "E5 G#5 G#5 G#5 F#5 E5 B5 B5", incipitBasis: "known-melody",
    note: "Source is the violin concerto score; the Full version plays all string parts on the piano.",
  },
  {
    slug: "toccata-and-fugue", rank: 16, title: "Toccata and Fugue in D Minor", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV565/ToccataFugue/ToccataFugue.mid`, sha256: "1aabd00967aded08d6633482c211af46f679d97f01cfeaca43c83a59dfeeeb6b", licence: "Public Domain", mutopiaId: "Mutopia-2011/09/11-1780", maintainer: "Anonymous", infoUrl: info(1780) },
    tracks: { right: [0], left: [1, 2] },
    incipit: "A5 G5 F5 E5 D5 C#5 D5 A4", incipitBasis: "known-melody",
    note: "Organ work; the pedal line goes to the left hand.",
  },
  {
    slug: "hark-the-herald-angels-sing", rank: 17, title: "Hark! The Herald Angels Sing", composer: "Felix Mendelssohn", genre: "other",
    source: { url: `${MUTOPIA}Mendelssohn-BartholdyF/mendelssohn/mendelssohn.mid`, sha256: "0e8cbffa0a338e1df93110256d8968b2fd807355151c5130733aa15b1365cc61", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1261", maintainer: "Steve Dunlop", infoUrl: info(1261) },
    incipit: "C4 F4 F4 E4 F4 A4 A4 G4 C5 C5 C5 Bb4 A4 G4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "o-come-all-ye-faithful", rank: 18, title: "O Come, All Ye Faithful", composer: "John Francis Wade", genre: "other",
    source: { url: `${MUTOPIA}WadeJF/adeste_fideles/adeste_fideles.mid`, sha256: "d6fe90acc41b3da16a932e636c75219d4accae3bf89105741581825b7a889976", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1220", maintainer: "Steve Dunlop", infoUrl: info(1220) },
    incipit: "G4 G4 D4 G4 A4 D4 B4 A4 B4 C5 B4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "schubert-ave-maria", rank: 19, title: "Ave Maria", composer: "Franz Schubert", genre: "classical",
    source: { url: `${MUTOPIA}SchubertF/D839/SchubertF-D839_AveMaria/SchubertF-D839_AveMaria.mid`, sha256: "289d1d2c8f5a16f1b1732bc1a60652e662f24e09531ebb0d8017b49712724684", licence: "Public Domain", mutopiaId: "Mutopia-2007/10/13-1054", maintainer: "Ph. Raynaud", infoUrl: info(1054) },
    tracks: { right: [0, 1], left: [2], melody: [0] },
    incipit: "Bb4 A4 Bb4 D5 C5 Bb4 C5", incipitBasis: "known-melody",
    note: "Song with piano: the voice part is the tune. Incipit is seven notes: the next notes are an ornamental turn.",
  },
  {
    slug: "nocturne-op-9-no-2", rank: 20, title: "Nocturne in E-flat, Op. 9 No. 2", composer: "Frédéric Chopin", genre: "classical",
    source: { url: `${MUTOPIA}ChopinFF/O9/chopin_nocturne_op9_n2/chopin_nocturne_op9_n2.mid`, sha256: "e202d3941ce5f26397f57f59f0e2e4e3ad9e19061fa3c4dc596c5ee6a6a2548e", licence: "Creative Commons Attribution-ShareAlike 3.0", mutopiaId: "Mutopia-2014/12/18-1590", maintainer: "Renato Biolcati Rinaldi", infoUrl: info(1590) },
    incipit: "Bb4 G5 F5 G5 F5 Eb5 Bb4 G5 C5 C6 G5 Bb5", incipitBasis: "known-melody",
  },
  {
    slug: "minuet-in-g", rank: 21, title: "Minuet in G Major", composer: "Christian Petzold (attr. J. S. Bach)", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.mid`, sha256: "fd87a6673e18104047842a1c858d2c9d8eb9ad845d7a8fa46e3664b17642cb75", licence: "Public Domain", mutopiaId: "Mutopia-2017/01/19-75", maintainer: "Allen Garvin", infoUrl: info(75) },
    incipit: "D5 G4 A4 B4 C5 D5 G4 G4 E5 C5 D5 E5 F#5 G5 G4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "prelude-in-c", rank: 22, title: "Prelude in C Major (Well-Tempered Clavier I)", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV846/wtk1-prelude1/wtk1-prelude1.mid`, sha256: "874e07d0479542971bfceaf420d6117da8d602d89d26eea4610e7dd1ef58bf26", licence: "Public Domain", mutopiaId: "Mutopia-2011/09/12-5", maintainer: "Tobias Erbsland", infoUrl: info(5) },
    incipit: "G4 C5 E5 G4 C5 E5 G4 C5 E5", incipitBasis: "known-melody",
    note: "No tune as such: the 'melody' is the right hand's broken chords.",
  },
  {
    slug: "maple-leaf-rag", rank: 23, title: "Maple Leaf Rag", composer: "Scott Joplin", genre: "jazz",
    source: { url: `${MUTOPIA}JoplinS/maple/maple.mid`, sha256: "3dd712a85fabd267f5a2cee5cb23af4683408c2f29b8814721844498f1ee4f66", licence: "Public Domain", mutopiaId: "Mutopia-2011/11/13-23", maintainer: "Chris Sawer", infoUrl: info(23) },
    incipit: "Ab4 Eb5 Ab4 C5 Eb5 G4 Eb5 G4 Bb4 Eb5", incipitBasis: "known-melody",
  },
  {
    slug: "hall-of-the-mountain-king", rank: 24, title: "In the Hall of the Mountain King", composer: "Edvard Grieg", genre: "classical",
    source: { url: `${MUTOPIA}GriegE/O46/Dans_l_antre_du_roi_de_la_montagne/Dans_l_antre_du_roi_de_la_montagne.mid`, sha256: "0c256a809b5af1faef81b6aad6106088a71d76b12435d5f0775d4ceee60c917e", licence: "Public Domain", mutopiaId: "Mutopia-2013/12/07-1888", maintainer: "Coyau", infoUrl: info(1888) },
    melodyStartBeat: 4,
    incipit: "B1 C#2 D2 E2 F#2 D2 F#2 F2 C#2 F2 E2 C2 E2", incipitBasis: "known-melody",
    note: "The theme starts low in the right hand; Beginner moves it up to the middle of the keyboard.",
  },
  {
    slug: "first-noel", rank: 25, title: "The First Noel", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Traditional/first_noel/first_noel.mid`, sha256: "5529d7e725981d92b5649b820c431e77a08fb71f0db94249d994e67a28546dea", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1243", maintainer: "Steve Dunlop", infoUrl: info(1243) },
    incipit: "F#4 E4 D4 E4 F#4 G4 A4 B4 C#5 D5 C#5 B4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "greensleeves", rank: 26, title: "Greensleeves (What Child Is This)", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Traditional/greensleeves/greensleeves.mid`, sha256: "04a6e03dd6128aa291aa75e4df757bbba40567ef885eca18d14d51d9365cb8e8", licence: "Public Domain", mutopiaId: "Mutopia-2014/03/30-1247", maintainer: "Steve Dunlop", infoUrl: info(1247) },
    incipit: "E4 G4 A4 B4 C5 B4 A4 F#4 D4 E4 F#4 G4 E4 E4 D#4 E4", incipitBasis: "known-melody",
  },
  {
    slug: "minute-waltz", rank: 27, title: "Minute Waltz, Op. 64 No. 1", composer: "Frédéric Chopin", genre: "classical",
    source: { url: `${MUTOPIA}ChopinFF/O64/chopin_valse_op64_no1/chopin_valse_op64_no1.mid`, sha256: "62333ad9f9b22603d009734ab500330a12ac09aeca13d185ac0ba64a7fb9d206", licence: "Public Domain", mutopiaId: "Mutopia-2015/01/17-483", maintainer: "Magnus Lewis-Smith", infoUrl: info(483) },
    incipit: "Ab4 G4 Ab4 C5 Bb4 G4 Ab4 Bb4 Ab4 C5 Bb4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "fantaisie-impromptu", rank: 28, title: "Fantaisie-Impromptu", composer: "Frédéric Chopin", genre: "classical",
    source: { url: `${MUTOPIA}ChopinFF/O66/chopin_fantaisie-impromptu/chopin_fantaisie-impromptu.mid`, sha256: "b29f6add7473b6e931c2e66349e860bf0e884cf68e19e90420a4870aae689f96", licence: "Public Domain", mutopiaId: "Mutopia-2009/09/05-1693", maintainer: "Guy D. Lederfein", infoUrl: info(1693) },
    incipit: "G#4 A4 G#4 G4 G#4 C#5 E5 D#5 C#5 D#5 C#5 C5", incipitBasis: "known-melody",
  },
  {
    slug: "sonata-facile", rank: 29, title: "Sonata Facile, K. 545 (1st Movement)", composer: "Wolfgang Amadeus Mozart", genre: "classical",
    source: { url: `${MUTOPIA}MozartWA/KV545/K545-1/K545-1.mid`, sha256: "54e510ba1e5865aeedc4e96bf70b83c93ecddf5b66660033ef98a5a8204ab02d", licence: "Creative Commons Attribution-ShareAlike 3.0", mutopiaId: "Mutopia-2013/09/01-998", maintainer: "Alejandro Sierra", infoUrl: info(998) },
    incipit: "C5 E5 G5 B4 C5 D5 C5 A5 G5 C6 G5", incipitBasis: "known-melody",
  },
  {
    slug: "blue-danube", rank: 30, title: "The Blue Danube (Main Theme)", composer: "Johann Strauss II", genre: "classical",
    source: { url: `${MUTOPIA}StraussJJ/O314/blue_danube/blue_danube.mid`, sha256: "9de3cb52a3ef8a118369d22d49c33896080afd1113749e4c07c559a1502c4df4", licence: "Creative Commons Attribution-ShareAlike 4.0", mutopiaId: "Mutopia-2014/03/24-519", maintainer: "Nikos Kouremenos", infoUrl: info(519) },
    incipit: "C4 C4 E4 G4 G4 G5 G5 E5 E5 C4 C4 E4 G4 G4 G5 G5", incipitBasis: "known-melody",
  },
  {
    slug: "away-in-a-manger", rank: 31, title: "Away in a Manger", composer: "James R. Murray", genre: "other",
    source: { url: `${MUTOPIA}MurrayJR/mueller/mueller.mid`, sha256: "d3a6632c836fa9190191ae300a249fb61916fb47679af565d72fb551f77ee228", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1264", maintainer: "Steve Dunlop", infoUrl: info(1264) },
    incipit: "C5 C5 Bb4 A4 A4 G4 F4 F4 E4 D4 C4", incipitBasis: "known-melody",
  },
  {
    slug: "o-little-town-of-bethlehem", rank: 32, title: "O Little Town of Bethlehem", composer: "Lewis H. Redner", genre: "other",
    source: { url: `${MUTOPIA}RednerLH/st_louis/st_louis.mid`, sha256: "fdd5a9362ae05bf3b8e667de5ca3c1e73b6832e0da9600b86315ff637589183b", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1292", maintainer: "Steve Dunlop", infoUrl: info(1292) },
    incipit: "A4 A4 A4 G#4 A4 C5 Bb4 D4 G4 F4 E4 F4 G4 C4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "moonlight-sonata-3", rank: 33, title: "Moonlight Sonata (3rd Movement)", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/O27/moonlight/moonlight-mids.zip`, member: "moonlight3.mid", sha256: "94915b176f0b999919a6cd1025a45ec8dd0a454dab33b2b332c5026291ea91f5", licence: "Creative Commons Attribution-ShareAlike 2.5", mutopiaId: "Mutopia-2007/02/11-276", maintainer: "Stewart Holmes", infoUrl: info(276) },
    incipit: "G#2 C#3 E3 G#3 C#3 E3 G#3 C#4 E3 G#3 C#4 E4", incipitBasis: "known-melody",
    note: "Opens with rising arpeggios rather than a tune; simplified versions follow the top of them.",
  },
  {
    slug: "traumerei", rank: 34, title: "Träumerei", composer: "Robert Schumann", genre: "classical",
    source: { url: `${MUTOPIA}SchumannR/O15/SchumannOp15No07/SchumannOp15No07.mid`, sha256: "6e0045d5783ff28dedcf05813074fe407ca3846e5e2a7246f2793ac5614e4851", licence: "Public Domain", mutopiaId: "Mutopia-2005/12/27-504", maintainer: "Ying-Chun Liu", infoUrl: info(504) },
    incipit: "C4 F4 E4 F4 A4 C5 F5 F5", incipitBasis: "known-melody",
  },
  {
    slug: "raindrop-prelude", rank: 35, title: "Raindrop Prelude, Op. 28 No. 15", composer: "Frédéric Chopin", genre: "classical",
    source: { url: `${MUTOPIA}ChopinFF/O28/Chop-28-15/Chop-28-15.mid`, sha256: "bb9532e59bee378a42f0c53b64bf223ba4d6e261e00c1e2efb3ed8e023833bd9", licence: "Public Domain", mutopiaId: "Mutopia-2015/01/16-471", maintainer: "Magnus Lewis-Smith", infoUrl: info(471) },
    incipit: "F5 Db5 Ab4 Bb4 C5 Db5 Eb5 F5 Gb5 F5 F5 Eb5", incipitBasis: "known-melody",
  },
  {
    slug: "pathetique-2", rank: 36, title: "Pathétique Sonata (2nd Movement)", composer: "Ludwig van Beethoven", genre: "classical",
    source: { url: `${MUTOPIA}BeethovenLv/O13/pathetique-2/pathetique-2.mid`, sha256: "92c685ca98001473bcc21fa98110cc125ab489c1bf49be185e062d204a268492", licence: "Public Domain", mutopiaId: "Mutopia-2011/10/25-295", maintainer: "Chris Sawer", infoUrl: info(295) },
    incipit: "C4 Bb3 Eb4 Db4 C4 Eb4 Ab4 Bb4 Eb4 E4 F4", incipitBasis: "independent-transcription",
  },
  {
    slug: "o-come-o-come-emmanuel", rank: 37, title: "O Come, O Come, Emmanuel", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Traditional/veniemma/veniemma.mid`, sha256: "935dfdd5d7fa90b8d78a52990dc6bbe16c818d0be20e710e58ab471a08093224", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1300", maintainer: "Steve Dunlop", infoUrl: info(1300) },
    incipit: "E4 G4 B4 B4 B4 A4 C5 B4 A4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "good-king-wenceslas", rank: 38, title: "Good King Wenceslas", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Anonymous/GoodKingWenceslas/GoodKingWenceslas.mid`, sha256: "f854da74a0790af27192f9b0002348649852dbcfcaa26e490e789517b2dde97a", licence: "Public Domain", mutopiaId: "Mutopia-2007/01/10-905", maintainer: "James Kilfiger", infoUrl: info(905) },
    incipit: "A4 A4 A4 B4 A4 A4 E4 F#4 E4 F#4 G#4 A4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "holy-holy-holy", rank: 39, title: "Holy, Holy, Holy", composer: "John B. Dykes", genre: "other",
    source: { url: `${MUTOPIA}DykesJB/nicaea/nicaea.mid`, sha256: "57184adabcdcd0f4f63d1a4913bc061f5c7df1e44649c376f9c73f4f5c7f00c9", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1284", maintainer: "Steve Dunlop", infoUrl: info(1284) },
    incipit: "D4 D4 F#4 F#4 A4 A4 B4 B4 B4 A4 F#4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "a-mighty-fortress", rank: 40, title: "A Mighty Fortress Is Our God", composer: "Martin Luther", genre: "other",
    source: { url: `${MUTOPIA}LutherM/ein_feste_burg/ein_feste_burg.mid`, sha256: "1f8d5232dc78cf7ebc770a024b981623d108228c53598908c0e001b1c920e577", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1237", maintainer: "Steve Dunlop", infoUrl: info(1237) },
    incipit: "C5 C5 C5 G4 A4 B4 C5 B4 A4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "promenade", rank: 41, title: "Pictures at an Exhibition: Promenade", composer: "Modest Mussorgsky", genre: "classical",
    source: { url: `${MUTOPIA}MussorgskyM/pictures-at-an-exhibition/pictures-at-an-exhibition-mids.zip`, member: "promenade-1.mid", sha256: "e9f7828b1b71fadcde8a5d6b66bf427fc9300572f9cac0684893e31cd25ff6a3", licence: "Creative Commons Attribution-ShareAlike 4.0", mutopiaId: "Mutopia-2016/12/31-475", maintainer: "Knute Snortum", infoUrl: info(475) },
    incipit: "G4 F4 Bb4 C5 F5 D5 C5 F5 D5 Bb4 C5 G4 F4", incipitBasis: "known-melody",
  },
  {
    slug: "prelude-in-e-minor", rank: 42, title: "Prelude in E Minor, Op. 28 No. 4", composer: "Frédéric Chopin", genre: "classical",
    source: { url: `${MUTOPIA}ChopinFF/O28/Chop-28-4/Chop-28-4.mid`, sha256: "c1d7e05aa4e6e2baeec2e9108402a969c16d5df302b82fd66d110634697f2e3b", licence: "Public Domain", mutopiaId: "Mutopia-2016/10/28-468", maintainer: "Magnus Lewis-Smith", infoUrl: info(468) },
    melodyStartBeat: 0.75,
    incipit: "B4 B4 C5 B4 C5 B4 C5 B4 Bb4 A4 B4", incipitBasis: "known-melody",
  },
  {
    slug: "invention-1", rank: 43, title: "Invention No. 1 in C Major", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV772/bach-invention-01/bach-invention-01.mid`, sha256: "9b9a6213941932d5171d9102d85912c3c1c61f8176ce02005cd2198881823c2d", licence: "Creative Commons Attribution-ShareAlike 3.0", mutopiaId: "Mutopia-2008/06/15-40", maintainer: "jeff covey", infoUrl: info(40) },
    incipit: "C4 D4 E4 F4 D4 E4 C4 G4 C5 B4 C5 D5", incipitBasis: "known-melody",
  },
  {
    slug: "mozart-k331-theme", rank: 44, title: "Sonata in A, K. 331: Theme", composer: "Wolfgang Amadeus Mozart", genre: "classical",
    source: { url: `${MUTOPIA}MozartWA/KV331/KV331_1_1_tema/KV331_1_1_tema.mid`, sha256: "028e017fe5030fa982d906b649c578e4e853473b8cb6b987410ed4edfc00c884", licence: "Public Domain", mutopiaId: "Mutopia-2005/10/29-614", maintainer: "Stelios Samelis", infoUrl: info(614) },
    incipit: "C#5 D5 C#5 E5 E5 B4 C#5 B4 D5 D5", incipitBasis: "known-melody",
  },
  {
    slug: "the-holly-and-the-ivy", rank: 45, title: "The Holly and the Ivy", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Traditional/thehollyandtheivy/thehollyandtheivy.mid`, sha256: "103692f749b39bf85c0bef8fba057f74c06d1de130aec01fd38f2eede2b22c4b", licence: "Public Domain", mutopiaId: "Mutopia-2005/12/23-644", maintainer: "Geoffrey Lehr", infoUrl: info(644) },
    incipit: "F4 F4 F4 F4 D5 C5 A4 F4 F4 F4 F4 D5", incipitBasis: "known-melody",
    note: "Melody only in the source, so there is no left hand at any level.",
  },
  {
    slug: "clementi-sonatina-op-36-1", rank: 46, title: "Sonatina in C, Op. 36 No. 1 (1st Movement)", composer: "Muzio Clementi", genre: "classical",
    source: { url: `${MUTOPIA}ClementiM/O36/sonatina-1/sonatina-1-mids.zip`, member: "sonatina-1.mid", sha256: "d13263b200c89478ac167a97b617fd31747b292df9a8ddbe947c8c8d07d066ae", licence: "Public Domain", mutopiaId: "Mutopia-2016/11/30-804", maintainer: "Brian D. Rude", infoUrl: info(804) },
    incipit: "C5 E5 C5 G4 G4 C5 E5 C5", incipitBasis: "known-melody",
  },
  {
    slug: "march-of-the-wooden-soldiers", rank: 47, title: "March of the Wooden Soldiers", composer: "Pyotr Ilyich Tchaikovsky", genre: "classical",
    source: { url: `${MUTOPIA}TchaikovskyPI/O39/05MarchOfTheWoodenSoldiers/05MarchOfTheWoodenSoldiers.mid`, sha256: "a9717d793785c3c702d85e20f99a81de60faedd29fc4e7dcb240fbc99a9b0d2b", licence: "Public Domain", mutopiaId: "Mutopia-2015/01/17-1806", maintainer: "Anonymous", infoUrl: info(1806) },
    incipit: "D5 D5 B4 Bb4 B4 C#5 D5 D5 B4", incipitBasis: "independent-transcription",
  },
  {
    slug: "prelude-in-c-minor", rank: 48, title: "Prelude in C Minor (Well-Tempered Clavier I)", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV847/bwv847a/bwv847a.mid`, sha256: "9e29d5b640d875bcfa93824cc963a4d9419ce2139cfd4e786148d45127e602d8", licence: "Public Domain", mutopiaId: "Mutopia-2006/07/02-550", maintainer: "Davide Castellone", infoUrl: info(550) },
    incipit: "C5 Eb4 D4 Eb4 C4 Eb4 D4 Eb4 C5 Eb4", incipitBasis: "known-melody",
  },
  {
    slug: "christ-the-lord-is-risen-today", rank: 49, title: "Christ the Lord Is Risen Today (Easter Hymn)", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Anonymous/Easter/Easter.mid`, sha256: "1897e74c9ea808e4fd9448572e535b628b451aa663a5ed169667f3391427315b", licence: "Public Domain", mutopiaId: "Mutopia-2015/01/17-442", maintainer: "Peter Chubb", infoUrl: info(442) },
    tracks: { right: [0], left: [1], melody: [0] },
    incipit: "C4 E4 G4 C4 F4 A4 A4 G4", incipitBasis: "known-melody",
    note: "The other track holds the lower voices and a descant that rises above the tune, so the tune is taken from its own track.",
  },
  {
    slug: "praise-to-the-lord", rank: 50, title: "Praise to the Lord, the Almighty", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Anonymous/lobe_den_Herren/lobe_den_Herren.mid`, sha256: "2ceaccb73d5b35b7ea8033426eac6f602113eb3a1bfbd2c722f9e53693e17af6", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1256", maintainer: "Steve Dunlop", infoUrl: info(1256) },
    incipit: "F4 F4 C5 A4 G4 F4 E4 D4 C4", incipitBasis: "known-melody",
  },
  {
    slug: "o-god-our-help", rank: 51, title: "O God, Our Help in Ages Past", composer: "William Croft", genre: "other",
    source: { url: `${MUTOPIA}CroftW/st_anne/st_anne.mid`, sha256: "45908040246ba48da3244679674fcf87fa29cce0fb2cc304dc3fb9bc7444014d", licence: "Public Domain", mutopiaId: "Mutopia-2008/02/19-1290", maintainer: "Steve Dunlop", infoUrl: info(1290) },
    incipit: "G4 E4 A4 G4 C5 C5 B4 C5", incipitBasis: "known-melody",
  },
  {
    slug: "lo-how-a-rose", rank: 52, title: "Lo, How a Rose E'er Blooming", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Anonymous/es_ist_ein_ros/es_ist_ein_ros.mid`, sha256: "eda35d86a88332c62622afe76f2ea0d84a9f5bf3dfb55d6ee67b4f9ff56c6ce9", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1240", maintainer: "Steve Dunlop", infoUrl: info(1240) },
    incipit: "C5 C5 C5 D5 C5 C5 A4 Bb4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "fairest-lord-jesus", rank: 53, title: "Fairest Lord Jesus", composer: "Traditional", genre: "other",
    source: { url: `${MUTOPIA}Traditional/crusaders_hymn/crusaders_hymn.mid`, sha256: "4f0a4d20d66dbe9c65711decd3a5a372bcff8b465aa87a3f3a3851a3c8541d2b", licence: "Public Domain", mutopiaId: "Mutopia-2008/01/13-1234", maintainer: "Steve Dunlop", infoUrl: info(1234) },
    incipit: "F4 F4 F4 G4 E4 F4 A4 A4 A4 A4 Bb4 G4 A4", incipitBasis: "known-melody",
  },
  {
    slug: "consolation-3", rank: 54, title: "Consolation No. 3", composer: "Franz Liszt", genre: "classical",
    source: { url: `${MUTOPIA}LisztF/S.172/liszt-consolation-no3/liszt-consolation-no3.mid`, sha256: "0e5a927f5753e3e7edf7f271efeb0c802d7476bed69c696798a06c780c5a1bb7", licence: "Creative Commons Attribution 3.0", mutopiaId: "Mutopia-2019/06/23-1647", maintainer: "Ryan Prince", infoUrl: info(1647) },
    incipit: "F5 F5 Bb4 C5 Db5 F5 F5 Eb5 F5", incipitBasis: "independent-transcription",
  },
  {
    slug: "burgmuller-arabesque", rank: 55, title: "Arabesque, Op. 100 No. 2", composer: "Friedrich Burgmüller", genre: "classical",
    source: { url: `${MUTOPIA}BurgmullerJFF/O100/25EF-02/25EF-02.mid`, sha256: "9b689a9b3f178e7bb2b5899d0559e223e9d8de7081d83fc087760ac2b4d378e1", licence: "Public Domain", mutopiaId: "Mutopia-2013/01/12-203", maintainer: "Bas Wassink", infoUrl: info(203) },
    incipit: "A4 B4 C5 B4 A4 A4 B4 C5 D5 E5", incipitBasis: "known-melody",
  },
  {
    slug: "invention-8", rank: 56, title: "Invention No. 8 in F Major", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV779/bach-invention-08/bach-invention-08.mid`, sha256: "07238719180171f76283756405ee43a0319226e869283bf29affb9e4c360e6f8", licence: "Public Domain", mutopiaId: "Mutopia-2008/06/15-61", maintainer: "Allen Garvin", infoUrl: info(61) },
    incipit: "F4 A4 F4 C5 F4 F5 E5 D5 C5 D5 C5 Bb4 A4 Bb4 A4 G4", incipitBasis: "known-melody",
  },
  {
    slug: "invention-4", rank: 57, title: "Invention No. 4 in D Minor", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV775/bach-invention-04/bach-invention-04.mid`, sha256: "5ecc06eb04d56ea40bd4db64bfd49ac9bff523e46d134912fa5bd07aea1db1c7", licence: "Public Domain", mutopiaId: "Mutopia-2008/06/15-67", maintainer: "Allen Garvin", infoUrl: info(67) },
    incipit: "D4 E4 F4 G4 A4 Bb4 C#4 Bb4 A4 G4 F4 E4 F4", incipitBasis: "known-melody",
  },
  {
    slug: "invention-13", rank: 58, title: "Invention No. 13 in A Minor", composer: "Johann Sebastian Bach", genre: "classical",
    source: { url: `${MUTOPIA}BachJS/BWV784/bach-invention-13/bach-invention-13.mid`, sha256: "e5b4dd4790ee2f2fdadca75630790a373363e1f6cb4558838e34bbad907364f1", licence: "Public Domain", mutopiaId: "Mutopia-2008/06/15-59", maintainer: "Allen Garvin", infoUrl: info(59) },
    incipit: "E4 A4 C5 B4 E4 B4 D5 C5 E5 G#4 E5 A4", incipitBasis: "known-melody",
  },
];

const NOTE_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" / "E5" → MIDI number (C4 = 60). */
export function parsePitch(name: string): number {
  const match = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`Bad pitch name: ${name}`);
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + NOTE_CLASS[match[1]] + accidental;
}

export const incipitPitches = (piece: EssentialsPiece): number[] => piece.incipit.split(/\s+/).map(parsePitch);

/** Attribution line for a piece's source edition. */
export function attribution(piece: EssentialsPiece): string {
  const { source } = piece;
  const who = source.maintainer && source.maintainer !== "Anonymous" ? ` typeset by ${source.maintainer}` : "";
  return `${piece.title} (${piece.composer}),${who} for the Mutopia Project, ${source.mutopiaId}. ${source.licence}. ${source.infoUrl}`;
}

/** Short licence tag stored in Song.content_rights. */
export function contentRights(piece: EssentialsPiece): string {
  const licence = piece.source.licence;
  if (licence === "Public Domain") return "public-domain";
  const version = /(\d\.\d)$/.exec(licence)?.[1] ?? "";
  return `${licence.includes("ShareAlike") ? "cc-by-sa" : "cc-by"}-${version}`;
}
