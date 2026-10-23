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

/** MIDI uploads (and recordings, which upload through the same route) per user. */
export const songUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  keyGenerator: userOrIpKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many uploads — try again later"),
});

/** Sheet music to recognise (beta): each one is up to four minutes of the OMR service's CPU. */
export const omrUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
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
const recentEmailsByAddress = new Map<string, number[]>();

export function allowEmailTo(address: string, now = Date.now()): boolean {
  const key = address.toLowerCase();
  const recent = (recentEmailsByAddress.get(key) ?? []).filter((at) => now - at < 60 * 60 * 1000);
  const allowed = recent.length < EMAILS_PER_ADDRESS_PER_HOUR;
  if (allowed) recent.push(now);
  recentEmailsByAddress.set(key, recent);
  return allowed;
}

/** Sentry envelopes relayed by POST /sentry-tunnel, per client IP. A crash loop must not become a flood. */
export const sentryTunnelRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many reports"),
});
