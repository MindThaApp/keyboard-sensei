import { scrubBreadcrumb, scrubEvent } from "@keyboard-sensei/shared-types";
import type { CrashConsent } from "./consent";
import { downscaleScreenshot } from "./screenshot";

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
    params: {
      message: string;
      email?: string;
      source?: string;
      url?: string;
      associatedEventId?: string;
      tags?: Record<string, string>;
    },
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
  /** "simple" or "advanced". */
  experienceMode: string;
  /** A contact address the user typed or explicitly chose to include. Never filled in automatically. */
  email?: string;
  /** Only set when the user attached a screenshot. */
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

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object";

function contactEmailOf(event: Record<string, unknown>): string | undefined {
  const feedback = isRecord(event.contexts) ? event.contexts.feedback : undefined;
  return isRecord(feedback) && typeof feedback.contact_email === "string" ? feedback.contact_email : undefined;
}

function restoreContactEmail(event: Record<string, unknown>, email: string): void {
  const feedback = isRecord(event.contexts) ? event.contexts.feedback : undefined;
  if (isRecord(feedback)) feedback.contact_email = email;
}

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
      // The contact address is the one email the user chose to send, so it survives redaction.
      const contactEmail = contactEmailOf(event);
      const clean = scrubEvent(event);
      if (contactEmail) restoreContactEmail(clean, contactEmail);
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
        const screenshot = report.screenshot ? await downscaleScreenshot(report.screenshot) : null;
        const attachments = screenshot
          ? [
              {
                filename: `screenshot.${extensionFor(screenshot.type)}`,
                data: new Uint8Array(await screenshot.arrayBuffer()),
                contentType: screenshot.type || undefined,
              },
            ]
          : undefined;
        sdk.captureFeedback(
          {
            message: report.message,
            ...(report.email ? { email: report.email } : {}),
            source: "in-app form",
            url: report.page,
            associatedEventId,
            tags: {
              feedback_kind: report.category,
              feedback_id: report.feedbackId,
              route: report.page,
              experience_mode: report.experienceMode,
              platform: config.native ? "android" : "web",
              app_version: config.release,
            },
          },
          attachments ? { attachments } : undefined,
        );
      } catch {
        // Feedback is already saved on our server; a monitoring failure must not surface to the user.
      }
    },
  };
}
