/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN of the web project. Unset = error monitoring is off. */
  readonly VITE_SENTRY_DSN?: string;
  /** Separate DSN for the Android app's project; falls back to VITE_SENTRY_DSN. */
  readonly VITE_SENTRY_DSN_ANDROID?: string;
  /** 0..1, default 0 (tracing off). */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}
