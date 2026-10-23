import { useEffect, useRef } from "react";
import * as api from "../services/api";
import { useAuth } from "./AuthContext";
import { DEFAULT_EXPERIENCE, parseExperience, useExperience } from "./ExperienceContext";

/**
 * Keeps the Simple/Advanced choice on the account, without a UI of its own.
 *
 * Signed in, a choice made on this device (pending) is saved to the account. If nothing
 * is pending, the account's value is taken on this device, so a new device or a fresh
 * browser picks up what was chosen elsewhere. Offline, or when a save fails, the local
 * value stays and is retried next time.
 */
export default function ExperienceSync() {
  const { user } = useAuth();
  const { experience, pendingSync, adoptExperience, queueSync, markSynced } = useExperience();
  const userId = user?.id;
  // A choice made while the account's value is still on its way must not be overwritten by it.
  const pendingRef = useRef(pendingSync);
  pendingRef.current = pendingSync;

  // Save a choice made here.
  useEffect(() => {
    if (!userId || !pendingSync) return;
    let cancelled = false;
    api
      .updateExperienceMode(experience)
      .then(() => !cancelled && markSynced())
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, pendingSync, experience, markSynced]);

  // On sign-in: read what the account has.
  useEffect(() => {
    if (!userId || pendingSync) return;
    let cancelled = false;
    api
      .getCurrentUser()
      .then((profile) => {
        if (cancelled || pendingRef.current) return;
        if (profile.experience_mode) {
          adoptExperience(parseExperience(profile.experience_mode));
        } else if (experience !== DEFAULT_EXPERIENCE) {
          // Chosen on this device before syncing existed: the account has nothing yet.
          queueSync();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Only when the signed-in user changes: later local choices are saved by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return null;
}
