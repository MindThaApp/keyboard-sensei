/**
 * @deprecated Use `useAppearance()` from AppearanceContext. This adapter keeps the two
 * remaining callers (the old Settings appearance section and Play-Along's waterfall
 * colours) working until their screens adopt the new context; delete it then.
 */
import { useAppearance } from "./AppearanceContext";
import type { TintId } from "../utils/appearance";

export type Theme = "light" | "dark" | "midnight";
export type AccentTheme = "felt" | "ocean" | "forest" | "violet";

const ACCENT_TO_TINT: Record<AccentTheme, TintId> = { felt: "red", ocean: "ocean", forest: "forest", violet: "violet" };

function tintToAccent(tint: TintId): AccentTheme {
  return tint === "ocean" || tint === "forest" || tint === "violet" ? tint : "felt";
}

export function useTheme() {
  const { scheme, settings, update } = useAppearance();
  return {
    /** The painted scheme: never "midnight", which is now plain dark. */
    theme: scheme as Theme,
    setTheme(theme: Theme) {
      update({ theme: theme === "light" ? "light" : "dark" });
    },
    accentTheme: tintToAccent(settings.tint),
    setAccentTheme(accent: AccentTheme) {
      update({ tint: ACCENT_TO_TINT[accent] });
    },
  };
}
