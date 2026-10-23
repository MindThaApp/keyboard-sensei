import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Simple / Advanced (§2). Simple hides controls behind "More options"; it never
 * removes them. Stored per device for now; syncing it to the account comes later.
 */
export type Experience = "simple" | "advanced";

export const EXPERIENCE_STORAGE_KEY = "ks-experience";
export const DEFAULT_EXPERIENCE: Experience = "simple";

export function parseExperience(value: string | null): Experience {
  return value === "advanced" || value === "simple" ? value : DEFAULT_EXPERIENCE;
}

function loadExperience(): Experience {
  try {
    return parseExperience(localStorage.getItem(EXPERIENCE_STORAGE_KEY));
  } catch {
    return DEFAULT_EXPERIENCE;
  }
}

interface ExperienceContextValue {
  experience: Experience;
  isAdvanced: boolean;
  setExperience(experience: Experience): void;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [experience, setExperience] = useState<Experience>(loadExperience);

  useEffect(() => {
    document.documentElement.dataset.experience = experience;
    try {
      localStorage.setItem(EXPERIENCE_STORAGE_KEY, experience);
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
  }, [experience]);

  const value = useMemo(
    () => ({ experience, isAdvanced: experience === "advanced", setExperience }),
    [experience],
  );
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience requires ExperienceProvider");
  return value;
}
