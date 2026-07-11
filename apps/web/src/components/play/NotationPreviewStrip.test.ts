import { describe, expect, it } from "vitest";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { quantizeToBeats } from "./NotationPreviewStrip";

const note = (midi: number, startS: number, durationS: number, hand: "left" | "right" = "right"): PlayAlongNote => ({
  midi,
  startS,
  durationS,
  hand,
});

describe("quantizeToBeats", () => {
  it("snaps note starts/durations to the nearest sixteenth note at the given tempo", () => {
    // 120bpm → 0.5s/beat → 0.125s/sixteenth.
    const notes = [note(60, 0.51, 0.49), note(62, 1.0, 0.24)];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized[0]).toEqual({ id: "0", midi: 60, hand: "right", startBeat: 1, durationBeats: 1 });
    expect(quantized[1]).toEqual({ id: "1", midi: 62, hand: "right", startBeat: 2, durationBeats: 0.5 });
  });

  it("floors very short durations to a sixteenth note so nothing disappears", () => {
    const notes = [note(60, 0, 0.02)];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized[0].durationBeats).toBe(0.25);
  });

  it("preserves hand assignment and assigns stable index-based ids", () => {
    const notes = [note(48, 0, 0.5, "left"), note(72, 0, 0.5, "right")];
    const quantized = quantizeToBeats(notes, 120);
    expect(quantized.map((n) => n.id)).toEqual(["0", "1"]);
    expect(quantized.map((n) => n.hand)).toEqual(["left", "right"]);
  });
});
