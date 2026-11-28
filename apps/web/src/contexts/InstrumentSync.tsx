import { useEffect, useRef } from "react";
import * as api from "../services/api";
import { useAuth } from "./AuthContext";
import { useInstrument } from "./InstrumentContext";
import { normalizePlayed, parseActive } from "../utils/playedInstrument";

/**
 * Keeps the played instruments on the account, with no UI of its own. Same rules as
 * ExperienceSync: a choice made here (pending) is saved and wins over the account's
 * value; otherwise the account's value is adopted on this device; offline or failed
 * saves stay pending and retry next time. An account with nothing chosen reads as piano.
 */
export default function InstrumentSync() {
  const { user } = useAuth();
  const { played, active, chosen, pendingSync, adopt, queueSync, markSynced } = useInstrument();
  const userId = user?.id;
  const pendingRef = useRef(pendingSync);
  pendingRef.current = pendingSync;

  // Signing out drops a choice still waiting for the account that made it.
  const previousUserRef = useRef(userId);
  useEffect(() => {
    if (previousUserRef.current && !userId && pendingRef.current) markSynced();
    previousUserRef.current = userId;
  }, [userId, markSynced]);

  useEffect(() => {
    if (!userId || !pendingSync) return;
    let cancelled = false;
    api
      .updateInstruments(played, active)
      .then(() => !cancelled && markSynced())
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, pendingSync, played, active, markSynced]);

  useEffect(() => {
    if (!userId || pendingSync) return;
    let cancelled = false;
    api
      .getCurrentUser()
      .then((profile) => {
        if (cancelled || pendingRef.current) return;
        const accountPlayed = normalizePlayed(profile.played_instruments);
        if (accountPlayed.length > 0 || profile.active_instrument) {
          adopt(accountPlayed, parseActive(profile.active_instrument));
        } else if (chosen) {
          // Chosen on this device before this account had anything.
          queueSync();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Runs on sign-in (and after a save settles), not on every local change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, pendingSync]);

  return null;
}
