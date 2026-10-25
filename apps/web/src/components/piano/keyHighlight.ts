/**
 * How the on-screen keys light up. The setting is one of four choices; what "match
 * look" means depends on the notes style, so the keyboard resolves the setting to a
 * mode once and styles itself from that (CSS only, no per-frame work).
 */
export type KeyHighlight = "match" | "glow" | "flat" | "off";

export const KEY_HIGHLIGHTS: { value: KeyHighlight; label: string }[] = [
  { value: "match", label: "Match look" },
  { value: "glow", label: "Glow" },
  { value: "flat", label: "Flat" },
  { value: "off", label: "Off" },
];

export const DEFAULT_KEY_HIGHLIGHT: KeyHighlight = "match";

export function isKeyHighlight(value: unknown): value is KeyHighlight {
  return KEY_HIGHLIGHTS.some((option) => option.value === value);
}

/**
 * What the keys actually do:
 * - off: no lighting
 * - flat: a solid fill in the note colour
 * - soft: fill, bright top edge and a gentle glow (the match-look treatment for classic styles)
 * - glow: fill, bright top edge and light spilling onto the neighbours and the keybed
 */
export type KeyMode = "off" | "flat" | "soft" | "glow";

/** `fx` is true while a style that lights keys in its own colours (FX) is drawing. */
export function resolveKeyMode(setting: KeyHighlight, fx: boolean): KeyMode {
  switch (setting) {
    case "off":
      return "off";
    case "flat":
      return "flat";
    case "glow":
      return "glow";
    default:
      return fx ? "glow" : "soft";
  }
}
