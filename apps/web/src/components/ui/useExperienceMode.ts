import { useExperienceMode as useExperienceFromContext, type Experience } from "../../contexts/ExperienceContext";

export type ExperienceMode = Experience;

/** The Simple/Advanced preference from ExperienceContext (stored value outside the provider). */
export function useExperienceMode(): ExperienceMode {
  return useExperienceFromContext();
}
