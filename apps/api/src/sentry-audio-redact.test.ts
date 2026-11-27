import { describe, expect, it } from "vitest";
import { AUDIO_REMOVED, scrubBreadcrumb, scrubEvent } from "@keyboard-sensei/shared-types";

// docs/specs/MUSIC-PORTAL.md 4.8: crash reports must never carry microphone audio.
describe("audio redaction", () => {
  it("drops float sample arrays and AudioBuffer-like objects from events", () => {
    const fakeAudioBuffer = { sampleRate: 48_000, numberOfChannels: 1, length: 128, duration: 0.003 };
    const withChannels = { getChannelData: () => new Float32Array(4), sampleRate: 48_000 };
    const event = {
      extra: { frame: new Float32Array([0.1, -0.2]), samples64: new Float64Array(3), buffer: fakeAudioBuffer, block: withChannels, stream: { getAudioTracks: () => [] } },
      breadcrumbs: [{ data: { window: new Float32Array(2048) } }],
    };
    const scrubbed = scrubEvent(event) as typeof event & { extra: Record<string, unknown>; breadcrumbs: { data: Record<string, unknown> }[] };
    expect(scrubbed.extra).toEqual({ frame: AUDIO_REMOVED, samples64: AUDIO_REMOVED, buffer: AUDIO_REMOVED, block: AUDIO_REMOVED, stream: AUDIO_REMOVED });
    expect(scrubbed.breadcrumbs[0]!.data.window).toBe(AUDIO_REMOVED);
  });

  it("keeps derived note data and screenshot bytes", () => {
    const note = { note: 69, centsOffset: -12, pitchConfidence: 0.9, source: "mic" };
    const screenshot = new Uint8Array([137, 80, 78, 71]);
    const scrubbed = scrubBreadcrumb({ data: { note, screenshot } }) as { data: { note: unknown; screenshot: unknown } };
    expect(scrubbed.data.note).toEqual(note);
    expect(scrubbed.data.screenshot).toBe(screenshot);
  });
});
