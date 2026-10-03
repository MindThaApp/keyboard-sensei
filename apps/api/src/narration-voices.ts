import { z } from "zod";

/**
 * The only ElevenLabs voice ids the API will narrate with. Must match the voices the
 * web client offers in apps/web/src/data/narrationVoices.ts (a test enforces this).
 *
 * The voice id is part of the narration cache key, so accepting arbitrary ids would let
 * a client re-bill the shared monthly character pool for the same text simply by
 * cycling voice ids.
 */
export const NARRATION_VOICE_IDS = [
  "Xb7hH8MSUJpSbSDYk0k2", // Alice
  "hpp4J3VqNfWAUOO0d1Us", // Bella
  "XrExE9yKIg1WjnnlVkGX", // Matilda
  "cjVigY5qzO86Huf0OWal", // Eric
] as const;

export const narrationVoiceIdSchema = z.enum(NARRATION_VOICE_IDS, {
  errorMap: () => ({ message: "Unknown narration voice" }),
});
