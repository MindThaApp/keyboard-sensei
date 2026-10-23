import express, { Router } from "express";
import { parseSentryDsn, type ParsedDsn } from "@keyboard-sensei/shared-types";
import { sentryTunnelRateLimit } from "./rate-limits.js";

/**
 * POST /sentry-tunnel: forwards Sentry envelopes from the web and Android apps, so
 * crash reports are not blocked by ad blockers and the user's IP never reaches Sentry
 * (the request comes from this server).
 *
 * This must never become an open proxy. The destination is built only from the DSNs the
 * operator configured (SENTRY_TUNNEL_DSNS); the envelope's own dsn header is just
 * checked against that list (host, project id and public key must all match) and is
 * never used as a URL. Anything else is rejected.
 */

export const TUNNEL_MAX_BYTES = 5 * 1024 * 1024; // screenshot attachments on feedback
const UPSTREAM_TIMEOUT_MS = 10_000;

export function parseAllowedDsns(raw: string | undefined): ParsedDsn[] {
  return (raw ?? "")
    .split(",")
    .map((item) => parseSentryDsn(item))
    .filter((item): item is ParsedDsn => item !== null);
}

/** The DSN string inside the envelope's first line, or null when it is not a valid envelope. */
function envelopeDsn(body: Buffer): string | null {
  const newline = body.indexOf(0x0a);
  const headerBytes = newline === -1 ? body : body.subarray(0, newline);
  if (headerBytes.length === 0 || headerBytes.length > 16 * 1024) return null;
  try {
    const header: unknown = JSON.parse(headerBytes.toString("utf8"));
    const dsn = (header as { dsn?: unknown } | null)?.dsn;
    return typeof dsn === "string" ? dsn : null;
  } catch {
    return null;
  }
}

export function createSentryTunnelRouter(getAllowed: () => ParsedDsn[], fetchImpl: typeof fetch = fetch): Router {
  const router = Router();
  router.post(
    "/sentry-tunnel",
    sentryTunnelRateLimit,
    express.raw({ type: () => true, limit: TUNNEL_MAX_BYTES }),
    async (req, res) => {
      const allowed = getAllowed();
      if (allowed.length === 0) {
        res.status(404).json({ error: { code: "not_found", message: "Not found" } });
        return;
      }
      const body: unknown = req.body;
      const dsn = Buffer.isBuffer(body) ? envelopeDsn(body) : null;
      const parsed = dsn ? parseSentryDsn(dsn) : null;
      const target = parsed
        ? allowed.find(
            (item) =>
              item.host === parsed.host && item.projectId === parsed.projectId && item.publicKey === parsed.publicKey,
          )
        : undefined;
      if (!Buffer.isBuffer(body) || !target) {
        res.status(403).json({ error: { code: "forbidden", message: "Envelope is not for a project of this app" } });
        return;
      }
      try {
        const upstream = await fetchImpl(`${target.protocol}://${target.host}/api/${target.projectId}/envelope/`, {
          method: "POST",
          headers: { "content-type": "application/x-sentry-envelope" },
          body: new Uint8Array(body),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        // Relay only the status: the SDK needs 429 to back off, nothing else.
        res.status(upstream.ok ? 200 : upstream.status === 429 ? 429 : 502).json({});
      } catch {
        res.status(502).json({ error: { code: "bad_gateway", message: "Could not reach the monitoring service" } });
      }
    },
  );
  return router;
}
