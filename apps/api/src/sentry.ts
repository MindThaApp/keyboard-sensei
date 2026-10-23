import * as Sentry from "@sentry/node";
import type { Request } from "express";
import { scrubBreadcrumb, scrubEvent, sentryRelease } from "@keyboard-sensei/shared-types";
import pkg from "../package.json" with { type: "json" };

/**
 * Sentry error monitoring for the API. Off unless SENTRY_DSN is set. Read straight from
 * process.env (not config.ts) because this runs before anything else is imported; see
 * instrument.ts. Privacy rules live in @keyboard-sensei/shared-types (scrubEvent).
 */

let enabled = false;

export const sentryEnabled = (): boolean => enabled;

export function initSentry(environment: NodeJS.ProcessEnv = process.env): void {
  const dsn = environment.SENTRY_DSN?.trim();
  if (!dsn) return;

  const tracesSampleRate = Number(environment.SENTRY_TRACES_SAMPLE_RATE ?? 0) || 0;
  Sentry.init({
    dsn,
    release: environment.SENTRY_RELEASE?.trim() || sentryRelease(pkg.version, environment.GIT_SHA),
    environment:
      environment.SENTRY_ENVIRONMENT?.trim() || (environment.NODE_ENV === "production" ? "production" : "development"),
    sendDefaultPii: false,
    tracesSampleRate,
    // Without tracing there is nothing for OpenTelemetry to do; leave it uninstalled.
    skipOpenTelemetrySetup: tracesSampleRate === 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  enabled = true;
}

/** Report an unexpected (5xx) error, tagged with the route and the internal user id only. */
export function reportServerError(error: unknown, req: Request): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (req.userId) scope.setUser({ id: req.userId });
    scope.setTag("http.method", req.method);
    scope.setTag("http.route", req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.path);
    Sentry.captureException(error);
  });
}

/** Send what is queued before the process exits. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.close(timeoutMs);
}
