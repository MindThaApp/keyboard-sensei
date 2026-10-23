/**
 * Privacy filter shared by the web app, the Android app and the API for everything they
 * send to Sentry. Every event, breadcrumb and feedback item passes through `scrubEvent`
 * (or `scrubBreadcrumb`) in the SDKs' beforeSend hooks, so nothing identifying leaves a
 * device or the server even when a developer logs something careless.
 *
 * It removes: email addresses, JWTs and bearer/basic credentials, secret-looking query
 * parameters, auth headers and cookies, request bodies, home-directory paths (which
 * contain account names) and host names. The only user field that survives is the
 * internal account id.
 */

export const REDACTED = "[redacted]";

const MAX_DEPTH = 12;
const MAX_ARRAY = 200;

/** Object keys whose value is dropped whatever it contains. */
const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|password|passwd|new_?password|current_?password|secret|token|access_?token|refresh_?token|id_?token|credential|google_credential|api_?key|dsn|email|e-mail|ip_address|username|display_name|server_name|x-forwarded-for|x-real-ip)$/i;

/** Query parameters whose value is dropped. */
const SENSITIVE_PARAM =
  /^(token|access_token|refresh_token|id_token|auth|authorization|key|api_key|apikey|secret|password|code|credential|sig|signature|session|sid|email|state)$/i;

// The domain must end in letters, so a release name like keyboard-sensei@0.1.0 is not an address.
const EMAIL = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const AUTH_SCHEME = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
/** The same secrets written outside a URL: "token=abc", "password: hunter2" in free text. */
const LOOSE_SECRET = /\b(token|access_token|refresh_token|id_token|password|passwd|secret|api_key|apikey)(=|:\s*)(?!\[)[^\s&"'<>;,]+/gi;
const QUERY_PARAM = /([?&;])([^=&#\s"'<>;]+)=([^&#\s"'<>;]*)/g;
/** Home directories carry the account name: /Users/ada, /home/ada, C:\Users\ada. */
const HOME_UNIX = /\/(?:Users|home)\/[^/\s"'<>:]+/g;
const HOME_WIN = /[A-Za-z]:\\Users\\[^\\"'<>:]+/gi;
/** Android app-private storage: /data/user/0/<package>, /data/data/<package>. */
const ANDROID_DATA = /\/data\/(?:user\/\d+|data)\/[A-Za-z0-9._]+/g;

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Scrub one string. */
export function scrubString(value: string): string {
  return value
    .replace(JWT, "[token]")
    .replace(AUTH_SCHEME, (_match, scheme: string) => `${scheme} [token]`)
    .replace(QUERY_PARAM, (match, sep: string, name: string) =>
      SENSITIVE_PARAM.test(safeDecode(name)) ? `${sep}${name}=${REDACTED}` : match,
    )
    .replace(LOOSE_SECRET, (_match, name: string, sep: string) => `${name}${sep}${REDACTED}`)
    .replace(EMAIL, "[email]")
    .replace(HOME_UNIX, "/~")
    .replace(HOME_WIN, "~")
    .replace(ANDROID_DATA, "/data/app");
}

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  // Binary payloads (screenshot attachments) pass through untouched.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : scrubValue(item, depth + 1);
  }
  return out;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * Scrub a Sentry event (error, message or feedback). Returns a new object; the input is
 * not modified. Typed loosely on purpose so it fits every SDK's own event type.
 */
export function scrubEvent<T>(event: T): T {
  if (!isObject(event)) return event;
  const scrubbed = scrubValue(event, 0) as Json;

  // The user is reduced to the internal account id: never an email, name or IP.
  const user = event["user"];
  if (isObject(user) && (typeof user["id"] === "string" || typeof user["id"] === "number")) {
    scrubbed["user"] = { id: String(user["id"]) };
  } else {
    delete scrubbed["user"];
  }

  // Host names identify the machine; request bodies and cookies can hold anything.
  delete scrubbed["server_name"];
  const request = scrubbed["request"];
  if (isObject(request)) {
    delete request["data"];
    delete request["cookies"];
    delete request["env"];
    // A bare query string ("token=abc&x=1") has no "?" for the parameter filter to anchor on.
    if (typeof request["query_string"] === "string") {
      request["query_string"] = scrubString(`?${request["query_string"]}`).slice(1);
    }
    if (isObject(request["headers"])) {
      const headers = request["headers"];
      const kept: Json = {};
      for (const name of ["user-agent", "content-type", "accept", "accept-language"]) {
        const found = Object.keys(headers).find((key) => key.toLowerCase() === name);
        if (found) kept[found] = headers[found];
      }
      request["headers"] = kept;
    }
  }
  // Device names are often the owner's ("Ada's Pixel").
  const contexts = scrubbed["contexts"];
  if (isObject(contexts) && isObject(contexts["device"])) {
    delete contexts["device"]["name"];
    delete contexts["device"]["device_unique_identifier"];
  }
  return scrubbed as T;
}

/** Scrub a breadcrumb the same way. */
export function scrubBreadcrumb<T>(breadcrumb: T): T {
  return scrubValue(breadcrumb, 0) as T;
}

/** `keyboard-sensei@<version>+<git sha>`: identical in the Vite plugin and Sentry.init. */
export function sentryRelease(version: string, gitSha: string | undefined): string {
  return `keyboard-sensei@${version}+${(gitSha ?? "").trim().slice(0, 12) || "dev"}`;
}

export interface ParsedDsn {
  /** "https" or "http" */
  protocol: string;
  publicKey: string;
  host: string;
  projectId: string;
}

/** Parse `https://<key>@<host>/<project id>`; null when it is not one. */
export function parseSentryDsn(dsn: string): ParsedDsn | null {
  // Not `new URL`: this package is compiled without DOM or Node typings.
  const match = /^(https?):\/\/([^:@/\s]+)(?::[^@/\s]*)?@([^/?#\s]+)\/(\d+)\/?$/.exec(dsn.trim());
  if (!match) return null;
  return { protocol: match[1]!, publicKey: match[2]!, host: match[3]!, projectId: match[4]! };
}
