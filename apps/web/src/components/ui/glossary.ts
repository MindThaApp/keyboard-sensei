import { t } from "../../i18n";
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
  keyboard: { get plain() { return t("glossary.keyboard.plain"); }, get tip() { return t("glossary.keyboard.tip"); } },
  lookAhead: { get plain() { return t("glossary.lookAhead.plain"); }, get tip() { return t("glossary.lookAhead.tip"); } },
  scoreBonus: { get plain() { return t("glossary.scoreBonus.plain"); }, get tip() { return t("glossary.scoreBonus.tip"); } },
  waitMode: { get plain() { return t("glossary.waitMode.plain"); }, get tip() { return t("glossary.waitMode.tip"); } },
  bpm: { get plain() { return t("glossary.bpm.plain"); }, get tip() { return t("glossary.bpm.tip"); } },
  timeSignature: { get plain() { return t("glossary.timeSignature.plain"); }, get tip() { return t("glossary.timeSignature.tip"); } },
  xp: { get plain() { return t("glossary.xp.plain"); }, get tip() { return t("glossary.xp.tip"); } },
  streakFreeze: { get plain() { return t("glossary.streakFreeze.plain"); }, get tip() { return t("glossary.streakFreeze.tip"); } },
  combo: { get plain() { return t("glossary.combo.plain"); } },
  strayNotes: { get plain() { return t("glossary.strayNotes.plain"); }, get tip() { return t("glossary.strayNotes.tip"); } },
  accuracy: { get plain() { return t("glossary.accuracy.plain"); } },
  untimed: { get plain() { return t("glossary.untimed.plain"); } },
  voice: { get plain() { return t("glossary.voice.plain"); } },
  builtInSynth: { get plain() { return t("glossary.builtInSynth.plain"); } },
  skillAssessment: { get plain() { return t("glossary.skillAssessment.plain"); } },
  autoSpeedUp: { get plain() { return t("glossary.autoSpeedUp.plain"); } },
  loopUntilClean: { get plain() { return t("glossary.loopUntilClean.plain"); } },
  audioDelay: { get plain() { return t("glossary.audioDelay.plain"); }, get tip() { return t("glossary.audioDelay.tip"); } },
} as const satisfies Record<string, GlossaryEntry>;

/** Click-pattern wording for the metronome: "Click every bar / beat / half-beat". */
export const CLICK_EVERY_LABEL = {
  get bar() { return t("glossary.clickEvery.bar"); },
  get beat() { return t("glossary.clickEvery.beat"); },
  get subdivision() { return t("glossary.clickEvery.subdivision"); },
};

/** Learning-path names shown to learners. The API slugs stay as they are. */
export const PATH_NAMES: Record<string, string> = {
  get "classical-technical"() { return t("path.foundations"); },
  get "sightreading-intensive"() { return t("path.reading"); },
  get "modern-chords"() { return t("path.chords"); },
  "guitar-foundations": "Guitar basics",
  "guitar-chords-rhythm": "Guitar chords & rhythm",
  "violin-foundations": "Violin foundations",
  "violin-technique": "Violin technique",
};

/** Player-level tier names shown to learners (the API's first tier is called Novice). */
const TIER_DISPLAY: Record<string, string> = { get Novice() { return t("tier.beginner"); } };

/** "Level 1 · Beginner": the player level with its tier name, no tier counter. */
export function levelTitle(level: number, tier: string): string {
  return t("level.title", { level, tier: TIER_DISPLAY[tier] ?? tier });
}

export type GlossaryTerm = keyof typeof glossary;

/** Looks a term up by key. Accepts any string so callers need no cast while the table is empty. */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return (glossary as Record<string, GlossaryEntry>)[term];
}
