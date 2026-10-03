import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NARRATION_VOICE_IDS, narrationVoiceIdSchema } from "./narration-voices.js";

const WEB_VOICES = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/src/data/narrationVoices.ts");

describe("narration voice allow-list", () => {
  it("matches exactly the voices the web client offers", () => {
    const source = readFileSync(WEB_VOICES, "utf8");
    const webIds = [...source.matchAll(/^\s*id:\s*"([^"]+)"/gm)].map((match) => match[1]);
    expect(webIds.length).toBeGreaterThan(0);
    expect([...NARRATION_VOICE_IDS].sort()).toEqual(webIds.sort());
  });

  it("rejects any other voice id, so the cache key can't be cycled", () => {
    expect(narrationVoiceIdSchema.safeParse(NARRATION_VOICE_IDS[0]).success).toBe(true);
    expect(narrationVoiceIdSchema.safeParse("21m00Tcm4TlvDq8ikWAM").success).toBe(false);
    expect(narrationVoiceIdSchema.safeParse("Xb7hH8MSUJpSbSDYk0k2x").success).toBe(false);
  });
});
