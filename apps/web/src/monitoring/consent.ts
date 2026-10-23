import { isNativeApp } from "../native/platform";

/**
 * Crash-reporting choice, stored per device (never on the account).
 * - "ask": not decided yet. Reports nothing; the Android app asks once on first launch.
 * - "always": send anonymous crash reports.
 * - "never": send nothing.
 * The website defaults to "always" (anonymous, disclosed in the privacy policy, with an
 * opt-out in Settings); the Android app defaults to "ask".
 */
export type CrashConsent = "ask" | "always" | "never";

export const CONSENT_STORAGE_KEY = "keyboard-sensei-crash-reporting";

export const defaultConsent = (native: boolean = isNativeApp()): CrashConsent => (native ? "ask" : "always");

export function readConsent(native: boolean = isNativeApp()): CrashConsent {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "ask" || stored === "always" || stored === "never") return stored;
  } catch {
    // Storage blocked: fall through to the default.
  }
  return defaultConsent(native);
}

type Listener = (consent: CrashConsent) => void;
const listeners = new Set<Listener>();

export function writeConsent(consent: CrashConsent): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, consent);
  } catch {
    // Not persisted; still applies for this session.
  }
  listeners.forEach((listener) => listener(consent));
}

/** Calls `listener` whenever the choice changes in this tab. Returns the unsubscribe function. */
export function onConsentChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
