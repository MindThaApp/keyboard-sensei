import { useEffect, useState } from "react";
import { API_URL } from "../services/api";
import { isNativeApp } from "../native/platform";
import { createMonitoring, type SdkLoader, type SentryLike } from "./client";
import { onConsentChange, readConsent, type CrashConsent } from "./consent";

declare const __APP_RELEASE__: string | undefined;

const native = isNativeApp();
const env = import.meta.env;

// Unit tests never send events, whatever a developer's .env contains.
const dsn = env.MODE === "test" ? undefined : (native ? env.VITE_SENTRY_DSN_ANDROID || env.VITE_SENTRY_DSN : env.VITE_SENTRY_DSN) || undefined;

const loader: SdkLoader = {
  async load(isNative) {
    const react = await import("@sentry/react");
    if (!isNative) return { sdk: react as unknown as SentryLike, init: (options) => void react.init(options) };
    // The Android app uses the Capacitor SDK (native crash capture too), wrapping the React one.
    const capacitor = await import("@sentry/capacitor");
    return {
      sdk: react as unknown as SentryLike,
      init: (options) => void capacitor.init({ ...options, enableNative: true } as never, react.init as never),
    };
  },
};

export const monitoring = createMonitoring(
  {
    dsn,
    release: typeof __APP_RELEASE__ === "string" ? __APP_RELEASE__ : "keyboard-sensei@dev",
    environment: native ? "android" : env.PROD ? "production" : "development",
    tunnel: `${API_URL}/sentry-tunnel`,
    tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0) || 0,
    native,
  },
  loader,
);

/** Starts monitoring per the stored choice and follows later changes. Call once at startup. */
export function startMonitoring(): void {
  void monitoring.apply(readConsent()).catch(() => undefined);
  onConsentChange((consent) => void monitoring.apply(consent).catch(() => undefined));
}

/** The stored choice, kept in step with changes made anywhere in the app. */
export function useCrashConsent(): CrashConsent {
  const [consent, setConsent] = useState<CrashConsent>(() => readConsent());
  useEffect(() => onConsentChange(setConsent), []);
  return consent;
}
