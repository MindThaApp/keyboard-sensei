import { describe, expect, it } from "vitest";
import { MIC_PLAYALONG_LEVEL, silenceForMic } from "./usePlayAlongMic";

describe("melody play-along from the mic", () => {
  it("silences guide notes and accompaniment so they cannot leak into the mic, keeping everything else", () => {
    const settings = { guideAudio: true, accompanimentMute: { removed: false, otherHand: false }, tempoPct: 80, metronome: true };
    expect(silenceForMic(settings)).toEqual({ guideAudio: false, accompanimentMute: { removed: true, otherHand: true }, tempoPct: 80, metronome: true });
    expect(settings.guideAudio).toBe(true);
  });
  it("plays the melody-only reduction", () => {
    expect(MIC_PLAYALONG_LEVEL).toBe("melody");
  });
});
