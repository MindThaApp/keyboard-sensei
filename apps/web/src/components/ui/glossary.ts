/**
 * Plain-language replacements for jargon, plus the "what is this?" text shown by <InfoTip term>.
 * The copy table in the redesign spec (section 5).
 */
export interface GlossaryEntry {
  /** The plain wording to show in place of the technical term. */
  plain: string;
  /** One or two sentences for the InfoTip popover. Omit when the plain wording says it all. */
  tip?: string;
}

/** Plain wording and tooltip text for each technical term. Keys are used by `<InfoTip term>` and by callers that need `plain`. */
export const glossary = {
  keyboard: {
    plain: "Keyboard",
    tip: "A digital piano or keyboard connected by USB or Bluetooth.",
  },
  lookAhead: {
    plain: "How far ahead you see",
    tip: "Seconds of upcoming notes shown. More = easier to read, slightly lower score.",
  },
  scoreBonus: {
    plain: "Difficulty boost",
    tip: "Harder settings boost your score.",
  },
  waitMode: {
    plain: "Wait for me",
    tip: "The song pauses until you press the right key. Great for learning; not scored.",
  },
  bpm: {
    plain: "Speed",
    tip: "Beats per minute.",
  },
  timeSignature: {
    plain: "Beats in each bar",
    tip: "Beats in each bar.",
  },
  xp: {
    plain: "Points",
    tip: "You earn points for practising and passing lessons.",
  },
  streakFreeze: {
    plain: "Day-off pass",
    tip: "Miss a day without losing your streak. Earn one every 7 goal days.",
  },
  combo: { plain: "Notes in a row" },
  strayNotes: {
    plain: "Extra notes",
    tip: "Keys you pressed that weren't in the music.",
  },
  accuracy: { plain: "Notes hit" },
  untimed: { plain: "Take your time" },
  voice: { plain: "Sound" },
  builtInSynth: { plain: "Piano (basic)" },
  skillAssessment: { plain: "Quick check (optional)" },
  autoSpeedUp: { plain: "Speed up when I get it right" },
  loopUntilClean: { plain: "Repeat until I get it right" },
  audioDelay: {
    plain: "Sound timing fix",
    tip: "Use if notes sound late, e.g. with Bluetooth headphones.",
  },
} as const satisfies Record<string, GlossaryEntry>;

/** Click-pattern wording for the metronome: "Click every bar / beat / half-beat". */
export const CLICK_EVERY_LABEL = { bar: "bar", beat: "beat", subdivision: "half-beat" } as const;

/** Learning-path names shown to learners. The API slugs stay as they are. */
export const PATH_NAMES: Record<string, string> = {
  "classical-technical": "Foundations",
  "sightreading-intensive": "Reading & Rhythm",
  "modern-chords": "Chords & Pop",
};

/** Player-level tier names shown to learners (the API's first tier is called Novice). */
const TIER_DISPLAY: Record<string, string> = { Novice: "Beginner" };

/** "Level 1 · Beginner": the player level with its tier name, no tier counter. */
export function levelTitle(level: number, tier: string): string {
  return `Level ${level} · ${TIER_DISPLAY[tier] ?? tier}`;
}

export type GlossaryTerm = keyof typeof glossary;

/** Looks a term up by key. Accepts any string so callers need no cast while the table is empty. */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return (glossary as Record<string, GlossaryEntry>)[term];
}
