/**
 * Generates a graded pack of public-domain beginner tunes as real MIDI files.
 *
 * Why this exists: the library (307 songs, from the ADL dataset) is adult
 * repertoire. It has FIVE songs at difficulty 1 and not a single nursery rhyme,
 * so an actual beginner has nothing to play. These are authored rather than
 * scraped, because web MIDI arrangements of children's tunes are famously bad
 * and the whole point is that they must be recognisable.
 *
 * Run:  pnpm --filter @keyboard-sensei/api exec tsx scripts/generate-beginner-pack.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
// @tonejs/midi ships CJS; a named ESM import breaks under real node (see the
// same note in src/midi-metadata.ts). Go through the default export.
import ToneMidi from "@tonejs/midi";
const { Midi } = ToneMidi;
type MidiDoc = InstanceType<typeof Midi>;
import { PrismaClient } from "@prisma/client";
import { extractSongMetadata } from "../src/midi-metadata.js";
import { MIDI_LIBRARY_DIR } from "../src/songs.js";

const prisma = new PrismaClient();

/** Scale degrees are spelled as absolute MIDI numbers so the melodies are unambiguous. */
const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81;
const G3 = 55, A3 = 57, B3 = 59;
const C3 = 48, D3 = 50, E3 = 52, F3 = 53;

/** [midi, beats] — a melody as (pitch, duration-in-beats) pairs. */
type Mel = [number, number][];

interface Tune {
  slug: string;
  title: string;
  artist: string;
  bpm: number;
  /** [numerator, denominator] — several of these are NOT 4/4, and the app now
   *  honours the denominator, so getting this right matters for barlines. */
  meter: [number, number];
  melody: Mel;
  /** Optional left hand: root notes / simple triads, one entry per bar-ish. */
  bass?: Mel;
}

const q = 1, h = 2, w = 4, e = 0.5, dh = 3; // quarter, half, whole, eighth, dotted half

const TUNES: Tune[] = [
  {
    slug: "twinkle-twinkle-little-star",
    title: "Twinkle Twinkle Little Star",
    artist: "Traditional",
    bpm: 90,
    meter: [4, 4],
    // C C G G A A G | F F E E D D C
    melody: [
      [C4, q], [C4, q], [G4, q], [G4, q], [A4, q], [A4, q], [G4, h],
      [F4, q], [F4, q], [E4, q], [E4, q], [D4, q], [D4, q], [C4, h],
      [G4, q], [G4, q], [F4, q], [F4, q], [E4, q], [E4, q], [D4, h],
      [G4, q], [G4, q], [F4, q], [F4, q], [E4, q], [E4, q], [D4, h],
      [C4, q], [C4, q], [G4, q], [G4, q], [A4, q], [A4, q], [G4, h],
      [F4, q], [F4, q], [E4, q], [E4, q], [D4, q], [D4, q], [C4, h],
    ],
  },
  {
    slug: "mary-had-a-little-lamb",
    title: "Mary Had a Little Lamb",
    artist: "Traditional",
    bpm: 96,
    meter: [4, 4],
    // E D C D E E E | D D D | E G G
    melody: [
      [E4, q], [D4, q], [C4, q], [D4, q], [E4, q], [E4, h],
      [D4, q], [D4, h], [E4, q], [G4, h],
      [E4, q], [D4, q], [C4, q], [D4, q], [E4, q], [E4, q], [E4, q], [E4, q],
      [D4, q], [D4, q], [E4, q], [D4, q], [C4, w],
    ],
  },
  {
    slug: "hot-cross-buns",
    title: "Hot Cross Buns",
    artist: "Traditional",
    bpm: 92,
    meter: [4, 4],
    // E D C | E D C | C C C C  D D D D | E D C
    melody: [
      [E4, q], [D4, q], [C4, h],
      [E4, q], [D4, q], [C4, h],
      [C4, e], [C4, e], [C4, e], [C4, e], [D4, e], [D4, e], [D4, e], [D4, e],
      [E4, q], [D4, q], [C4, h],
    ],
  },
  {
    slug: "merrily-we-roll-along",
    title: "Merrily We Roll Along",
    artist: "Traditional",
    bpm: 100,
    meter: [4, 4],
    melody: [
      [E4, q], [D4, q], [C4, q], [D4, q], [E4, q], [E4, q], [E4, h],
      [D4, q], [D4, q], [D4, h], [E4, q], [G4, q], [G4, h],
      [E4, q], [D4, q], [C4, q], [D4, q], [E4, q], [E4, q], [E4, q], [E4, q],
      [D4, q], [D4, q], [E4, q], [D4, q], [C4, w],
    ],
  },
  {
    slug: "lightly-row",
    title: "Lightly Row",
    artist: "Traditional",
    bpm: 100,
    meter: [4, 4],
    melody: [
      [G4, q], [E4, q], [E4, h], [F4, q], [D4, q], [D4, h],
      [C4, q], [D4, q], [E4, q], [F4, q], [G4, q], [G4, q], [G4, h],
      [G4, q], [E4, q], [E4, q], [E4, q], [F4, q], [D4, q], [D4, h],
      [C4, q], [E4, q], [G4, q], [G4, q], [C4, w],
    ],
  },
  {
    slug: "ode-to-joy",
    title: "Ode to Joy",
    artist: "Ludwig van Beethoven",
    bpm: 100,
    meter: [4, 4],
    // E E F G | G F E D | C C D E | E. D D
    melody: [
      [E4, q], [E4, q], [F4, q], [G4, q],
      [G4, q], [F4, q], [E4, q], [D4, q],
      [C4, q], [C4, q], [D4, q], [E4, q],
      [E4, dh], [D4, q],
      [E4, q], [E4, q], [F4, q], [G4, q],
      [G4, q], [F4, q], [E4, q], [D4, q],
      [C4, q], [C4, q], [D4, q], [E4, q],
      [D4, dh], [C4, q],
    ],
    bass: [
      [C3, w], [C3, w], [F3, w], [G3, w],
      [C3, w], [C3, w], [F3, w], [C3, w],
    ],
  },
  {
    slug: "frere-jacques",
    title: "Frère Jacques",
    artist: "Traditional",
    bpm: 104,
    meter: [4, 4],
    melody: [
      [C4, q], [D4, q], [E4, q], [C4, q],
      [C4, q], [D4, q], [E4, q], [C4, q],
      [E4, q], [F4, q], [G4, h],
      [E4, q], [F4, q], [G4, h],
      [G4, e], [A4, e], [G4, e], [F4, e], [E4, q], [C4, q],
      [G4, e], [A4, e], [G4, e], [F4, e], [E4, q], [C4, q],
      [C4, q], [G3, q], [C4, h],
      [C4, q], [G3, q], [C4, h],
    ],
    bass: [[C3, w], [C3, w], [C3, w], [C3, w], [C3, w], [C3, w], [C3, w], [C3, w]],
  },
  {
    slug: "london-bridge",
    title: "London Bridge Is Falling Down",
    artist: "Traditional",
    bpm: 104,
    meter: [4, 4],
    melody: [
      [G5, e], [A5, e], [G5, q], [F5, e], [E4 + 12, e], [F5, e], [G5, e],
      [D5, q], [E4 + 12, q], [F5, h],
      [E4 + 12, q], [F5, q], [G5, h],
      [D5, q], [G5, q], [E4 + 12, q], [C5, h],
    ],
  },
  {
    slug: "row-row-row-your-boat",
    title: "Row, Row, Row Your Boat",
    artist: "Traditional",
    bpm: 100,
    meter: [6, 8], // genuinely compound — exercises the denominator fix
    melody: [
      [C4, 3 * e], [C4, 3 * e],
      [C4, 2 * e], [D4, e], [E4, 3 * e],
      [E4, 2 * e], [D4, e], [E4, 2 * e], [F4, e],
      [G4, 6 * e],
      [C5, e], [C5, e], [C5, e], [G4, e], [G4, e], [G4, e],
      [E4, e], [E4, e], [E4, e], [C4, e], [C4, e], [C4, e],
      [G4, 2 * e], [F4, e], [E4, 2 * e], [D4, e],
      [C4, 6 * e],
    ],
  },
  {
    slug: "jingle-bells",
    title: "Jingle Bells",
    artist: "Traditional",
    bpm: 120,
    meter: [4, 4],
    melody: [
      [E4, q], [E4, q], [E4, h],
      [E4, q], [E4, q], [E4, h],
      [E4, q], [G4, q], [C4, q], [D4, q],
      [E4, w],
      [F4, q], [F4, q], [F4, q], [F4, e], [F4, e],
      [F4, q], [E4, q], [E4, q], [E4, e], [E4, e],
      [E4, q], [D4, q], [D4, q], [E4, q],
      [D4, h], [G4, h],
    ],
    bass: [[C3, w], [C3, w], [C3, w], [C3, w], [F3, w], [C3, w], [G3, w], [C3, w]],
  },
  {
    slug: "when-the-saints-go-marching-in",
    title: "When the Saints Go Marching In",
    artist: "Traditional",
    bpm: 112,
    meter: [4, 4],
    melody: [
      [C4, q], [E4, q], [F4, q], [G4, w],
      [C4, q], [E4, q], [F4, q], [G4, w],
      [C4, q], [E4, q], [F4, q], [G4, h],
      [E4, h], [C4, h], [E4, h], [D4, w],
      [E4, h], [E4, q], [D4, q], [C4, h], [C4, h], [D4, h],
      [E4, h], [D4, q], [C4, q], [C4, w],
    ],
    bass: [[C3, w], [C3, w], [C3, w], [G3, w], [C3, w], [G3, w], [C3, w]],
  },
  {
    slug: "amazing-grace",
    title: "Amazing Grace",
    artist: "Traditional",
    bpm: 76,
    meter: [3, 4], // 3/4 — barlines must not assume 4
    // Pickup G, then C E C E D C A(low) ... in C major
    melody: [
      [G3, q],
      [C4, h], [E4, e], [C4, e], [E4, q],
      [D4, dh],
      [C4, h], [A3, q],
      [G3, dh],
      [G3, q],
      [C4, h], [E4, e], [C4, e], [E4, q],
      [D4, dh],
      [E4, h], [G4, q],
      [G4, dh],
    ],
    bass: [[C3, dh], [C3, dh], [F3, dh], [C3, dh], [C3, dh], [C3, dh], [F3, dh], [C3, dh]],
  },
  {
    slug: "scarborough-fair",
    title: "Scarborough Fair",
    artist: "Traditional",
    bpm: 92,
    meter: [3, 4],
    // A minor / dorian feel
    melody: [
      [A3, dh],
      [E4, h], [E4, q],
      [E4, h], [B3, q],
      [C4, h], [D4, q],
      [B3, dh],
      [A3, h], [A3, q],
      [G4, h], [G4, q],
      [A4, dh],
    ],
    bass: [[A3 - 12, dh], [A3 - 12, dh], [E3, dh], [F3, dh], [A3 - 12, dh], [A3 - 12, dh], [G3 - 12, dh], [A3 - 12, dh]],
  },
  {
    slug: "greensleeves",
    title: "Greensleeves",
    artist: "Traditional",
    bpm: 96,
    meter: [6, 8], // compound — two dotted-quarter beats per bar
    melody: [
      [A3, 2 * e],
      [C4, 3 * e], [D4, e], [E4, 2 * e], [F4, e],
      [E4, 3 * e], [D4, e], [B3, 2 * e], [G3, e],
      [A3, 3 * e], [B3, e], [C4, 2 * e], [A3, e],
      [A3, 2 * e], [G3, e], [A3, 3 * e],
    ],
  },
  {
    slug: "auld-lang-syne",
    title: "Auld Lang Syne",
    artist: "Traditional",
    bpm: 88,
    meter: [4, 4],
    melody: [
      [G3, q],
      [C4, dh], [C4, q], [C4, h], [E4, q],
      [D4, dh], [C4, q], [D4, h], [E4, q], [D4, q],
      [C4, dh], [C4, q], [E4, h], [G4, q],
      [A4, w],
    ],
    bass: [[C3, w], [C3, w], [G3, w], [C3, w], [F3, w]],
  },
  {
    slug: "silent-night",
    title: "Silent Night",
    artist: "Franz Xaver Gruber",
    bpm: 72,
    meter: [3, 4],
    melody: [
      [G4, q], [A4, e], [G4, e], [E4, dh],
      [G4, q], [A4, e], [G4, e], [E4, dh],
      [D5, h], [D5, q], [B4, dh],
      [C5, h], [C5, q], [G4, dh],
    ],
    bass: [[C3, dh], [C3, dh], [C3, dh], [C3, dh], [G3, dh], [G3, dh], [C3, dh], [C3, dh]],
  },
  {
    slug: "yankee-doodle",
    title: "Yankee Doodle",
    artist: "Traditional",
    bpm: 120,
    meter: [4, 4],
    melody: [
      [C4, q], [C4, q], [D4, q], [E4, q],
      [C4, q], [E4, q], [D4, q], [G3, q],
      [C4, q], [C4, q], [D4, q], [E4, q],
      [C4, h], [B3, h],
      [C4, q], [C4, q], [D4, q], [E4, q],
      [F4, q], [E4, q], [D4, q], [C4, q],
      [B3, q], [G3, q], [A3, q], [B3, q],
      [C4, h], [C4, h],
    ],
    bass: [[C3, w], [C3, w], [C3, w], [G3, w], [C3, w], [C3, w], [G3, w], [C3, w]],
  },
  {
    slug: "oh-susanna",
    title: "Oh! Susanna",
    artist: "Stephen Foster",
    bpm: 116,
    meter: [4, 4],
    melody: [
      [C4, e], [D4, e], [E4, q], [G4, q], [G4, q],
      [A4, q], [G4, q], [E4, q], [C4, q],
      [D4, q], [E4, q], [E4, q], [D4, q],
      [C4, q], [D4, h], [C4, q],
      [C4, e], [D4, e], [E4, q], [G4, q], [G4, q],
      [A4, q], [G4, q], [E4, q], [C4, q],
      [D4, q], [E4, q], [E4, q], [D4, q],
      [C4, q], [C4, dh],
    ],
    bass: [[C3, w], [C3, w], [G3, w], [C3, w], [C3, w], [C3, w], [G3, w], [C3, w]],
  },
  {
    slug: "swing-low-sweet-chariot",
    title: "Swing Low, Sweet Chariot",
    artist: "Traditional",
    bpm: 76,
    meter: [4, 4],
    melody: [
      [E4, q], [C5, dh],
      [A4, q], [C5, q], [B4, h],
      [G4, q], [E4, q], [G4, q], [A4, q],
      [G4, w],
      [E4, q], [C5, dh],
      [A4, q], [C5, q], [B4, h],
      [G4, q], [A4, q], [G4, q], [E4, q],
      [C4, w],
    ],
    bass: [[C3, w], [F3, w], [C3, w], [C3, w], [C3, w], [F3, w], [G3, w], [C3, w]],
  },
  {
    slug: "camptown-races",
    title: "Camptown Races",
    artist: "Stephen Foster",
    bpm: 126,
    meter: [4, 4],
    melody: [
      [G4, q], [G4, q], [E4, q], [G4, q],
      [A4, q], [G4, q], [E4, h],
      [E4, e], [D4, e], [E4, e], [D4, e], [C4, h],
      [G4, q], [G4, q], [E4, q], [G4, q],
      [A4, q], [G4, q], [E4, h],
      [D4, q], [E4, q], [D4, q], [C4, q],
      [C4, w],
    ],
    bass: [[C3, w], [C3, w], [C3, w], [G3, w], [C3, w], [G3, w], [C3, w]],
  },
];

/** The library rejects anything under 20s. These tunes are short by nature, so
 *  repeat them until they clear it — which is how you'd practise them anyway. */
const repeatsFor = (tune: Tune): number => {
  const beats = tune.melody.reduce((sum, [, b]) => sum + b, 0);
  const seconds = (beats * 60) / tune.bpm;
  return Math.max(1, Math.ceil(24 / seconds));
};

const buildMidi = (tune: Tune): MidiDoc => {
  const reps = repeatsFor(tune);
  const midi = new Midi();
  midi.header.setTempo(tune.bpm);
  midi.header.timeSignatures = [
    { ticks: 0, timeSignature: tune.meter, measures: 0 } as never,
  ];

  const secPerBeat = 60 / tune.bpm;
  const melodyTrack = midi.addTrack();
  melodyTrack.name = "Right hand";
  let t = 0;
  for (let r = 0; r < reps; r++) {
    for (const [note, beats] of tune.melody) {
      melodyTrack.addNote({ midi: note, time: t * secPerBeat, duration: beats * secPerBeat * 0.95 });
      t += beats;
    }
  }

  if (tune.bass) {
    const bassTrack = midi.addTrack();
    bassTrack.name = "Left hand";
    const melodyBeats = tune.melody.reduce((sum, [, b]) => sum + b, 0);
    let b = 0;
    for (let r = 0; r < reps; r++) {
      // Re-anchor each repeat to the melody's cycle so the hands can't drift apart
      // if the bass line doesn't sum to exactly the melody's length.
      b = r * melodyBeats;
      for (const [note, beats] of tune.bass) {
        bassTrack.addNote({ midi: note, time: b * secPerBeat, duration: beats * secPerBeat * 0.95 });
        b += beats;
      }
    }
  }
  return midi;
};

async function main(): Promise<void> {
  await mkdir(MIDI_LIBRARY_DIR, { recursive: true });
  let seeded = 0;

  for (const tune of TUNES) {
    const midi = buildMidi(tune);
    const bytes = Buffer.from(midi.toArray());
    const filename = `beginner-${tune.slug}.mid`;
    const filePath = path.join(MIDI_LIBRARY_DIR, filename);
    await writeFile(filePath, bytes);

    const meta = extractSongMetadata(new Uint8Array(bytes));
    const existing = await prisma.song.findFirst({ where: { file_path: filePath } });
    const data = {
      title: tune.title,
      artist: tune.artist,
      genre: "other",
      difficulty: meta.difficulty,
      duration_sec: meta.durationSec,
      note_count: meta.noteCount,
      content_rights: "public-domain",
      file_path: filePath,
      uploader_id: null,
    };
    if (existing) await prisma.song.update({ where: { id: existing.id }, data });
    else await prisma.song.create({ data });

    seeded++;
    console.log(
      `  ${String(meta.difficulty)}  ${tune.title.padEnd(34)} ${tune.meter[0]}/${tune.meter[1]}  ` +
        `${meta.noteCount} notes  ${meta.durationSec.toFixed(0)}s`,
    );
  }

  console.log(`\nSeeded ${seeded} beginner tunes.`);
  await prisma.$disconnect();
}

void main();
