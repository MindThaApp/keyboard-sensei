import { Agent, fetch as undiciFetch } from "undici";
import { connect as netConnect, isIPv4, isIPv6 } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { lookup } from "node:dns/promises";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";

export class SsrfBlockedError extends Error {}

/**
 * Blocks private/reserved/loopback/link-local addresses (including the
 * common cloud-metadata address 169.254.169.254) across both IPv4 and the
 * IPv6 forms that alias them (IPv4-mapped, unique-local, link-local).
 * Fails closed on anything it doesn't recognize as a literal IP.
 */
export function isDisallowedIp(address: string): boolean {
  if (isIPv4(address)) {
    const parts = address.split(".").map(Number);
    const a = parts[0]!;
    const b = parts[1]!;
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    // 100.64.0.0/10 (CGNAT / shared address space) -- includes Alibaba
    // Cloud's metadata service at 100.100.100.200.
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (isIPv6(address)) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::") return true;
    if (normalized.startsWith("::ffff:")) {
      const embedded = normalized.slice("::ffff:".length);
      return isIPv4(embedded) ? isDisallowedIp(embedded) : true;
    }
    if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link-local
    if (/^f[cd][0-9a-f]{0,2}:/.test(normalized)) return true; // fc00::/7 unique-local
    return false;
  }
  return true;
}

/**
 * A custom undici connector that resolves the target hostname and validates
 * the resolved IP BEFORE connecting -- and connects directly to that
 * validated IP (not a second hostname lookup), so there's no window between
 * "checked" and "connected" for a DNS answer to change (rebinding), and
 * every redirect hop goes through this same connector since it's the
 * Agent's own connect function, not a one-time pre-flight check.
 *
 * Note: undici's `connector.Options.port`/`protocol` are typed as required
 * `string` (installed version 8.7.0), not the `number`/optional shape one
 * might assume -- `net`/`tls` connect() want a numeric port, hence the
 * `Number(options.port)` conversion below. Critically, `options.port` is an
 * EMPTY STRING when the URL has no explicit port (the overwhelming common
 * case -- `https://example.com/` has no `:443`), and `Number("")` is `0`,
 * not the protocol's default port -- confirmed by direct end-to-end testing
 * (see Task brief's verification note: "verify manually", not just
 * typecheck). Must default to 443/80 by protocol when empty.
 */
type ConnectCallback = (...args: [null, Socket | TLSSocket] | [Error, null]) => void;

function resolvePort(port: string, protocol: string): number {
  if (port !== "") return Number(port);
  return protocol === "https:" ? 443 : 80;
}

function buildSafeAgent(): Agent {
  return new Agent({
    connect: (options: { hostname: string; port: string; protocol: string }, callback: ConnectCallback) => {
      lookup(options.hostname)
        .then((resolved) => {
          if (isDisallowedIp(resolved.address)) {
            callback(new SsrfBlockedError(`Refusing to connect to ${options.hostname} (resolves to a private/reserved address)`), null);
            return;
          }
          const connectOptions = { host: resolved.address, port: resolvePort(options.port, options.protocol), servername: options.hostname };
          const isHttps = options.protocol === "https:";
          const socket = isHttps ? tlsConnect(connectOptions) : netConnect(connectOptions);
          socket.once("error", (err: Error) => callback(err, null));
          // For TLS, "connect" fires after the raw TCP handshake but BEFORE
          // the TLS handshake (cert/hostname validation) completes -- handing
          // the socket to undici at that point lets it start using a socket
          // whose TLS state isn't ready, and a subsequent handshake failure
          // (e.g. hostname/SNI mismatch) arrives as an uncaught crash instead
          // of a catchable error. Must wait for "secureConnect" instead,
          // matching undici's own default connector.
          socket.once(isHttps ? "secureConnect" : "connect", () => callback(null, socket));
        })
        .catch((err: Error) => callback(err, null));
    },
  });
}

/** Fetches a URL server-side with SSRF hardening, a streamed byte-size cap, and a timeout. Throws SsrfBlockedError on any safety violation. */
export async function fetchUrlSafely(url: string, opts: { maxBytes: number; timeoutMs: number }): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("Only http/https URLs are allowed");
  }
  const agent = buildSafeAgent();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    let response;
    try {
      response = await undiciFetch(url, {
        dispatcher: agent,
        signal: controller.signal,
        headers: { "accept-encoding": "identity" },
      });
    } catch (error) {
      // undici wraps connector errors in a generic TypeError("fetch failed")
      // with the real error only on `.cause` -- unwrap it here so callers
      // can reliably `instanceof SsrfBlockedError` without knowing about
      // this wrapping quirk. Confirmed live: a blocked connect otherwise
      // surfaced as an unrecognized TypeError, not SsrfBlockedError.
      if (error instanceof Error && error.cause instanceof SsrfBlockedError) throw error.cause;
      throw error;
    }
    if (!response.ok || !response.body) {
      throw new SsrfBlockedError(`Fetch failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel();
        throw new SsrfBlockedError(`Response exceeds ${opts.maxBytes} byte limit`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timeout);
    await agent.close();
  }
}
