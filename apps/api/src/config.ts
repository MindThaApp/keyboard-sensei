import "dotenv/config";
import { z } from "zod";

const booleanFlag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((value) => value === "true");

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(16),
    ELEVENLABS_API_KEY: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3001),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    // Set to "false" to close self-service sign-up (POST /auth/register -> 403).
    // Admins can still create accounts. Default keeps sign-up open.
    REGISTRATION_OPEN: booleanFlag("true"),
    // Number of reverse-proxy hops in front of the API, for Express's `trust proxy`, so
    // IP-based rate limits see the real client rather than the proxy. 0 = direct
    // connections (local dev). The LAN deploy is Caddy -> nginx -> api, i.e. 2.
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    // Per-user cap on NEW narration characters per UTC day (cache hits are free), so
    // one account cannot drain the shared monthly ElevenLabs pool (TTS_LIMIT).
    TTS_USER_DAILY_LIMIT: z.coerce.number().int().min(0).default(2_500),
    // "true" restricts the shared song catalogue to material that may be published:
    // the Essentials pack and the beginner pack. The ADL-sourced library (which includes
    // copyrighted pop and film covers) is hidden from everyone but admins. Users' own
    // uploads and archive imports stay private to them either way. Default keeps the
    // LAN behaviour (everything visible).
    PUBLIC_CATALOGUE: booleanFlag("false"),
    // "true" makes new self-service accounts confirm their email before they can sign in.
    REQUIRE_EMAIL_VERIFICATION: booleanFlag("false"),
    // Public web origin used to build links in emails (reset password, verify email).
    // Falls back to the first CORS_ORIGIN.
    APP_URL: z.string().url().optional(),
    // Outgoing email. Without SMTP_HOST, mail is written to the API log (console
    // transport) — fine for development, not for a public deployment.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    // "true" for implicit TLS (port 465); otherwise STARTTLS is used when offered.
    SMTP_SECURE: booleanFlag("false"),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("Keyboard Sensei <no-reply@localhost>"),
    // Google sign-in: comma-separated OAuth client IDs whose ID tokens are accepted
    // (the Web client and the Android client). Unset = POST /auth/google answers 503.
    GOOGLE_CLIENT_IDS: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    // Error monitoring (Sentry, EU region). Off without SENTRY_DSN. instrument.ts reads
    // the first group straight from process.env because it runs before this module.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_RELEASE: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    GIT_SHA: z.string().optional(),
    // Comma-separated DSNs of the projects the web and Android apps report to. The only
    // destinations POST /sentry-tunnel will forward to; unset = the tunnel answers 404.
    SENTRY_TUNNEL_DSNS: z.string().optional(),
  })
  // Empty values count as unset, so compose files can pass optional settings as ${VAR:-}.
  .parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));
