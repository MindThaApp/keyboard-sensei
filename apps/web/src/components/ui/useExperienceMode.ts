import { useEffect, useState } from "react";

export type ExperienceMode = "simple" | "advanced";

const STORAGE_KEY = "ks-experience";

function read(): ExperienceMode {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

/**
 * TEMPORARY seam. The Simple/Advanced preference belongs to ExperienceContext (WP0a). Until that
 * lands, <Advanced> reads the same `ks-experience` localStorage key it will use. When the
 * context exists, replace this hook's body with `return useExperience().experience`.
 */
export function useExperienceMode(): ExperienceMode {
  const [mode, setMode] = useState<ExperienceMode>(read);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) setMode(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return mode;
}
