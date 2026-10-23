import type { ReactNode } from "react";
import { useExperienceMode, type ExperienceMode } from "./useExperienceMode";

export interface AdvancedProps {
  children: ReactNode;
  /**
   * Shown in Simple mode instead of the children, typically a "More options" row that
   * opens them. Simple mode hides controls; it never removes them.
   */
  fallback?: ReactNode;
  /** Force a mode, e.g. in tests or previews. Defaults to the user's preference. */
  mode?: ExperienceMode;
}

/** Renders its children only in Advanced mode. */
export function Advanced({ children, fallback = null, mode }: AdvancedProps) {
  const preference = useExperienceMode();
  return <>{(mode ?? preference) === "advanced" ? children : fallback}</>;
}
