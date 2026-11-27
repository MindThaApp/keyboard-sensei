import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlayedInstrument } from "@keyboard-sensei/shared-types";
import { normalizePlayed, parseActive } from "../utils/playedInstrument";

/**
 * The instrument the learner plays (piano, guitar, violin), as opposed to the sampled
 * sound (see components/instruments). Kept on the device so it works offline and synced
 * to the account by InstrumentSync, the same way as the Simple/Advanced choice. Nothing
 * stored means piano, so an upgraded install behaves exactly as before.
 */
export const ACTIVE_INSTRUMENT_KEY = "mp-active-instrument";
export const PLAYED_INSTRUMENTS_KEY = "mp-played-instruments";
/** Set while a choice made on this device hasn't been saved to the account. */
export const INSTRUMENT_PENDING_KEY = "mp-instrument-pending";
/** Set once the learner has seen the "What do you play?" card and chosen or skipped. */
export const INSTRUMENT_PROMPT_DONE_KEY = "mp-instrument-prompt-done";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the choice still holds for this session.
  }
}

function loadPlayed(): PlayedInstrument[] {
  try {
    return normalizePlayed(JSON.parse(read(PLAYED_INSTRUMENTS_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

interface InstrumentContextValue {
  /** The instrument that scopes Learn and Today. */
  active: PlayedInstrument;
  /** Every instrument the learner plays (empty until chosen). */
  played: PlayedInstrument[];
  /** False until the learner (or their account) has chosen. */
  chosen: boolean;
  promptDone: boolean;
  /** A choice by the learner: kept here and queued for the account. */
  choose(played: PlayedInstrument[], active: PlayedInstrument): void;
  dismissPrompt(): void;
  pendingSync: boolean;
  /** Takes the account's values on this device without queueing anything back. */
  adopt(played: PlayedInstrument[], active: PlayedInstrument): void;
  queueSync(): void;
  markSynced(): void;
}

const InstrumentContext = createContext<InstrumentContextValue | null>(null);

export function InstrumentProvider({ children }: { children: ReactNode }) {
  const [played, setPlayed] = useState<PlayedInstrument[]>(loadPlayed);
  const [active, setActive] = useState<PlayedInstrument>(() => parseActive(read(ACTIVE_INSTRUMENT_KEY)));
  const [pendingSync, setPendingSync] = useState(() => read(INSTRUMENT_PENDING_KEY) === "1");
  const [promptDone, setPromptDone] = useState(() => read(INSTRUMENT_PROMPT_DONE_KEY) === "1");

  const apply = useCallback((nextPlayed: PlayedInstrument[], nextActive: PlayedInstrument) => {
    const list = normalizePlayed([...nextPlayed, nextActive]);
    setPlayed(list);
    setActive(nextActive);
    write(PLAYED_INSTRUMENTS_KEY, JSON.stringify(list));
    write(ACTIVE_INSTRUMENT_KEY, nextActive);
    write(INSTRUMENT_PROMPT_DONE_KEY, "1");
    setPromptDone(true);
  }, []);
  const choose = useCallback(
    (nextPlayed: PlayedInstrument[], nextActive: PlayedInstrument) => {
      apply(nextPlayed, nextActive);
      write(INSTRUMENT_PENDING_KEY, "1");
      setPendingSync(true);
    },
    [apply],
  );
  const dismissPrompt = useCallback(() => {
    write(INSTRUMENT_PROMPT_DONE_KEY, "1");
    setPromptDone(true);
  }, []);
  const queueSync = useCallback(() => {
    write(INSTRUMENT_PENDING_KEY, "1");
    setPendingSync(true);
  }, []);
  const markSynced = useCallback(() => {
    write(INSTRUMENT_PENDING_KEY, null);
    setPendingSync(false);
  }, []);

  const value = useMemo(
    () => ({ active, played, chosen: played.length > 0, promptDone, choose, dismissPrompt, pendingSync, adopt: apply, queueSync, markSynced }),
    [active, played, promptDone, choose, dismissPrompt, pendingSync, apply, queueSync, markSynced],
  );
  return <InstrumentContext.Provider value={value}>{children}</InstrumentContext.Provider>;
}

export function useInstrument(): InstrumentContextValue {
  const value = useContext(InstrumentContext);
  if (!value) throw new Error("useInstrument requires InstrumentProvider");
  return value;
}

/** The active instrument without requiring the provider (stored value, else piano). */
export function useActiveInstrument(): PlayedInstrument {
  const value = useContext(InstrumentContext);
  return value?.active ?? parseActive(read(ACTIVE_INSTRUMENT_KEY));
}
