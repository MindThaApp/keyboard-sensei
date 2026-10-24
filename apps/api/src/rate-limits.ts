import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

/**
 * Request-rate limits for the abuse-prone routes. In-memory store: the API is a single
 * process, and a restart resetting the counters is acceptable for this threat model
 * (credential stuffing / sign-up spam / disk-filling uploads from one client).
 *
 * IP-keyed limits rely on Express's `trust proxy` (env TRUST_PROXY) being set to the
 * number of proxy hops; otherwise every client behind the proxy shares one bucket.
 *
 * URL imports (songs and instruments) already have their own per-user hourly limit
 * (isFetchRateLimited / isInstrumentFetchRateLimited), so they are not limited again here.
 */

const rateLimitedBody = (message: string) => ({ error: { code: "rate_limited", message } });

const userOrIpKey = (req: Request): string => (req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip ?? ""));

/** Failed logins per client IP. Successful logins don't count, so a household sharing an IP is unaffected. */
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many failed sign-in attempts — try again in a few minutes"),
});

/** New accounts per client IP. */
export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many sign-ups from this network — try again later"),
});

/**
 * MIDI uploads (and recordings, which upload through the same route) per user. Sheet
 * music sent for recognition has its own, tighter limit below and is not counted here.
 */
export const songUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: userOrIpKey,
  skip: (req) => `${req.baseUrl}${req.path}`.startsWith("/songs/upload/omr"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many uploads — try again later"),
});

/**
 * Sheet music to recognise (beta): each one is up to four minutes of the OMR service's CPU.
 * Only accepted jobs count; a refused request (unsupported file, service off, over the
 * limit) costs the service nothing, so it doesn't use up the hour's allowance.
 */
export const omrUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  skipFailedRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("You've sent a lot of sheet music to recognise — try again in an hour"),
});

/** Instrument packs are up to 50 MB each, so far fewer per user. */
export const instrumentUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many instrument uploads — try again later"),
});

/** Forgot-password and resend-verification requests per client IP (each may send an email). */
export const emailRequestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many requests — try again in a few minutes"),
});

/** Token redemptions (reset password, verify email) per client IP. */
export const tokenRedeemRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many attempts — try again in a few minutes"),
});

/** Google sign-ins per client IP. */
export const googleSignInRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many sign-in attempts — try again in a few minutes"),
});

/** Account deletions confirmed with a password (signed-out page and in-app). Failed attempts only. */
export const accountDeletionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many failed attempts — try again in a few minutes"),
});

/**
 * Emails sent per address per hour, on top of the per-IP limit, so one address can't be
 * flooded from many networks. Over the limit the request still answers normally (the
 * response must not reveal whether the address exists); the email is just not sent.
 */
const EMAILS_PER_ADDRESS_PER_HOUR = 3;
const emailsByAddress = slidingWindowLimit(EMAILS_PER_ADDRESS_PER_HOUR, 60 * 60 * 1000);

export function allowEmailTo(address: string, now = Date.now()): boolean {
  return emailsByAddress.allow(address.toLowerCase(), now);
}

/** Sentry envelopes relayed by POST /sentry-tunnel, per client IP. A crash loop must not become a flood. */
export const sentryTunnelRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many reports"),
});

export interface SlidingWindowLimit {
  /** Records a hit for `key` and answers true, or answers false (recording nothing) when over the limit. */
  allow(key: string, now?: number): boolean;
  /** Keys currently held in memory, for tests. */
  size(): number;
}

/**
 * A small per-key limit kept in memory: at most `limit` hits per key in any `windowMs`.
 * Keys whose hits have all expired are dropped (checked at most once a window), so the
 * map holds only recently active keys rather than every user or address ever seen.
 */
export function slidingWindowLimit(limit: number, windowMs: number): SlidingWindowLimit {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  const recentHits = (key: string, now: number): number[] =>
    (hits.get(key) ?? []).filter((at) => now - at < windowMs);

  const sweep = (now: number) => {
    if (now - lastSweep < windowMs) return;
    lastSweep = now;
    for (const key of [...hits.keys()]) {
      const recent = recentHits(key, now);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  };

  return {
    allow(key, now = Date.now()) {
      sweep(now);
      const recent = recentHits(key, now);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
    size: () => hits.size,
  };
}
