import { scrubBreadcrumb, scrubEvent } from "@keyboard-sensei/shared-types";
import type { CrashConsent } from "./consent";

/**
 * Sentry wiring for the web app and the Android app, written against a small slice of
 * the SDK so it can be tested with a fake. Nothing here runs unless a DSN is configured
 * AND the device's crash-reporting choice is "always"; the SDK is loaded lazily, so a
 * device that never opts in never even downloads it.
 */

export interface MonitoringConfig {
  /** Undefined = monitoring is off in this build. */
  dsn: string | undefined;
  release: string;
  environment: string;
  /** Where envelopes are posted (the API's /sentry-tunnel). */
  tunnel: string;
  tracesSampleRate: number;
  native: boolean;
}

/** The parts of @sentry/react (and @sentry/capacitor) this app uses. */
export interface SentryLike {
  init(options: Record<string, unknown>): unknown;
  close(timeout?: number): Promise<boolean>;
  captureException(error: unknown, hint?: Record<string, unknown>): string;
  captureFeedback(
    params: { message: string; source?: string; url?: string; associatedEventId?: string; tags?: Record<string, string> },
    hint?: { attachments?: { filename: string; data: Uint8Array; contentType?: string }[] },
  ): string;
  lastEventId(): string | undefined;
  setUser(user: { id: string } | null): void;
  getClient(): { on(hook: "beforeSendFeedback", callback: (event: Record<string, unknown>) => void): unknown } | undefined;
  browserTracingIntegration?(): unknown;
}

export interface SdkLoader {
  /** The browser SDK; on Android the Capacitor SDK wrapping it. */
  load(native: boolean): Promise<{ sdk: SentryLike; init(options: Record<string, unknown>): void }>;
}

export interface FeedbackReport {
  message: string;
  category: string;
  feedbackId: string;
  page: string;
  screenshot?: Blob | null;
}

/** An error is "recent" for linking to feedback for this long. */
export const RECENT_ERROR_MS = 5 * 60 * 1000;

export interface Monitoring {
  /** Starts or stops the SDK to match the consent. Safe to call repeatedly. */
  apply(consent: CrashConsent): Promise<void>;
  /** True when a DSN is configured, i.e. there is something to consent to. */
  readonly configured: boolean;
  captureException(error: unknown, context?: Record<string, unknown>): void;
  setUser(id: string | null): void;
  reportFeedback(report: FeedbackReport): Promise<void>;
}

const extensionFor = (type: string): string => (type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg");

export function createMonitoring(config: MonitoringConfig, loader: SdkLoader, now: () => number = Date.now): Monitoring {
  let active: SentryLike | null = null;
  let starting: Promise<void> | null = null;
  // Flips off the moment consent is withdrawn, even while the SDK is still shutting down.
  let accepting = false;
  // The latest choice, so a withdrawal that arrives while the SDK is still loading wins.
  let desired = false;
  let userId: string | null = null;
  let lastErrorAt = 0;

  const start = async () => {
    const { sdk, init } = await loader.load(config.native);
    accepting = true;
    init({
      dsn: config.dsn,
      release: config.release,
      environment: config.environment,
      tunnel: config.tunnel,
      sendDefaultPii: false,
      // Tracing is off unless explicitly enabled; there is no session replay.
      tracesSampleRate: config.tracesSampleRate,
      integrations: (defaults: { name: string }[]) => {
        // Crash reports only: no session tracking.
        const kept = defaults.filter((item) => item.name !== "BrowserSession");
        return config.tracesSampleRate > 0 && sdk.browserTracingIntegration
          ? [...kept, sdk.browserTracingIntegration()]
          : kept;
      },
      ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
      beforeSend: (event: unknown) => {
        if (!accepting) return null;
        lastErrorAt = now();
        return scrubEvent(event);
      },
      beforeBreadcrumb: (breadcrumb: unknown) => scrubBreadcrumb(breadcrumb),
    });
    // Feedback events skip beforeSend; this hook is where they are redacted (in place).
    sdk.getClient()?.on("beforeSendFeedback", (event) => {
      const clean = scrubEvent(event);
      for (const key of Object.keys(event)) delete event[key];
      Object.assign(event, clean);
    });
    active = sdk;
    if (userId) sdk.setUser({ id: userId });
    if (!desired) await stop();
  };

  const stop = async () => {
    const sdk = active;
    accepting = false;
    active = null;
    await sdk?.close(2000);
  };

  return {
    configured: Boolean(config.dsn),

    async apply(consent) {
      const wanted = Boolean(config.dsn) && consent === "always";
      desired = wanted;
      if (wanted && !active) {
        starting ??= start().finally(() => {
          starting = null;
        });
        await starting;
      } else if (!wanted && active) {
        await stop();
      }
    },

    captureException(error, context) {
      active?.captureException(error, context ? { extra: context } : undefined);
    },

    setUser(id) {
      userId = id;
      active?.setUser(id ? { id } : null);
    },

    async reportFeedback(report) {
      if (!active) return;
      try {
        const sdk = active;
        const recentError = lastErrorAt > 0 && now() - lastErrorAt < RECENT_ERROR_MS;
        const associatedEventId = recentError ? sdk.lastEventId() : undefined;
        const attachments = report.screenshot
          ? [
              {
                filename: `screenshot.${extensionFor(report.screenshot.type)}`,
                data: new Uint8Array(await report.screenshot.arrayBuffer()),
                contentType: report.screenshot.type || undefined,
              },
            ]
          : undefined;
        sdk.captureFeedback(
          {
            message: report.message,
            source: "in-app form",
            url: report.page,
            associatedEventId,
            tags: { category: report.category, feedback_id: report.feedbackId },
          },
          attachments ? { attachments } : undefined,
        );
      } catch {
        // Feedback is already saved on our server; a monitoring failure must not surface to the user.
      }
    },
  };
}
