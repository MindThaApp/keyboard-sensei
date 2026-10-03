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

/** Instrument packs are up to 50 MB each, so far fewer per user. */
export const instrumentUploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: userOrIpKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: rateLimitedBody("Too many instrument uploads — try again later"),
});
