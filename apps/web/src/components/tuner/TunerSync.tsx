import { useEffect, useRef } from "react";
import { REFERENCE_PITCH } from "@keyboard-sensei/music-theory";
import { useAuth } from "../../contexts/AuthContext";
import * as api from "../../services/api";
import { loadTunerSettings, saveTunerSettings, useTunerSettings } from "./tunerSettings";

/**
 * Keeps the tuner's A4 on the account (spec 5.3), the same way ExperienceSync
 * does for Simple/Advanced: a change made here is saved when signed in; with
 * nothing pending, the account's value is taken on sign-in. Signed out or
 * offline, the local value simply applies.
 */
export default function TunerSync() {
  const { user } = useAuth();
  const settings = useTunerSettings();
  const userId = user?.id;
  const pendingRef = useRef(settings.a4PendingSync);
  pendingRef.current = settings.a4PendingSync;

  useEffect(() => {
    if (!userId || !settings.a4PendingSync) return;
    let cancelled = false;
    const value = settings.a4Hz;
    const timer = window.setTimeout(() => {
      api
        .updateTunerA4(value)
        .then(() => {
          if (!cancelled && loadTunerSettings().a4Hz === value) saveTunerSettings({ a4PendingSync: false });
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, settings.a4PendingSync, settings.a4Hz]);

  useEffect(() => {
    if (!userId || pendingRef.current) return;
    let cancelled = false;
    api
      .getCurrentUser()
      .then(profile => {
        if (cancelled || pendingRef.current) return;
        const remote = profile.tuner_a4_hz;
        if (typeof remote === "number") {
          if (remote !== loadTunerSettings().a4Hz) saveTunerSettings({ a4Hz: remote, a4PendingSync: false });
        } else if (loadTunerSettings().a4Hz !== REFERENCE_PITCH.defaultHz) {
          // Set on this device before syncing existed: the account has nothing yet.
          saveTunerSettings({ a4PendingSync: true });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
