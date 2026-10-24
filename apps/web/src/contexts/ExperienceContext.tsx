import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Simple / Advanced. There is no longer a switch in the UI and no screen outside
 * Play-Along hides features by it: it is a stored, non-hiding preference (it still
 * seeds onboarding and is reported with feedback). Kept on the device so it works offline, and synced to the account
 * (see ExperienceSync) so a new device picks it up. A choice made on this device that
 * hasn't reached the account yet is "pending" and wins over the account's value.
 */
export type Experience = "simple" | "advanced";

export const EXPERIENCE_STORAGE_KEY = "ks-experience";
export const DEFAULT_EXPERIENCE: Experience = "simple";
/** Set while a choice made on this device hasn't been saved to the account. */
export const EXPERIENCE_PENDING_KEY = "ks-experience-pending";

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

function loadPending(): boolean {
  try {
    return localStorage.getItem(EXPERIENCE_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

function storePending(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(EXPERIENCE_PENDING_KEY, "1");
    else localStorage.removeItem(EXPERIENCE_PENDING_KEY);
  } catch {
    // Storage unavailable: the choice is still saved this session.
  }
}

interface ExperienceContextValue {
  experience: Experience;
  isAdvanced: boolean;
  /** A choice by the user: kept here and queued for the account. */
  setExperience(experience: Experience): void;
  /** True while the latest choice made on this device hasn't reached the account. */
  pendingSync: boolean;
  /** Takes the account's value on this device without queueing anything back. */
  adoptExperience(experience: Experience): void;
  /** Queues the current value for the account (a choice that predates syncing). */
  queueSync(): void;
  /** The account now holds the current value. */
  markSynced(): void;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [experience, setExperienceState] = useState<Experience>(loadExperience);
  const [pendingSync, setPendingSync] = useState(loadPending);

  const setExperience = useCallback((next: Experience) => {
    setExperienceState(next);
    storePending(true);
    setPendingSync(true);
  }, []);
  const adoptExperience = useCallback((next: Experience) => setExperienceState(next), []);
  const queueSync = useCallback(() => {
    storePending(true);
    setPendingSync(true);
  }, []);
  const markSynced = useCallback(() => {
    storePending(false);
    setPendingSync(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.experience = experience;
    try {
      localStorage.setItem(EXPERIENCE_STORAGE_KEY, experience);
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
  }, [experience]);

  const value = useMemo(
    () => ({
      experience,
      isAdvanced: experience === "advanced",
      setExperience,
      pendingSync,
      adoptExperience,
      queueSync,
      markSynced,
    }),
    [experience, pendingSync, setExperience, adoptExperience, queueSync, markSynced],
  );
  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext);
  if (!value) throw new Error("useExperience requires ExperienceProvider");
  return value;
}

/**
 * The current mode without requiring the provider (falls back to the stored value),
 * for leaf components such as the kit's <Advanced> that also render in isolation.
 */
export function useExperienceMode(): Experience {
  const value = useContext(ExperienceContext);
  return value?.experience ?? loadExperience();
}
