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
  })
  .parse(process.env);
