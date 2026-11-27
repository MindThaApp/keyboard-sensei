import { describe, expect, it } from "vitest";
import { renderStrums } from "@keyboard-sensei/audio-analysis/chord";
import { GUITAR_CHORDS, chordMidiNotes } from "@keyboard-sensei/music-theory";
import { scoreChordExercise } from "@keyboard-sensei/midi-engine";
import { StrumSession } from "./strumSession";
import { exercises } from "../../../../api/src/content";

const SR = 48000;

describe("StrumSession", () => {
  it("turns streamed mic blocks into chord detections the scorer grades", () => {
    const exercise = exercises.find((e) => e.exerciseId === "guitar-change-a-d")!;
    const chords = ["A", "D", "A", "D"];
    const beatMs = 60000 / (exercise.tempoBpm * 1);
    const audio = renderStrums(
      chords.map((c, i) => ({ notes: chordMidiNotes(GUITAR_CHORDS[c]!), startSeconds: 0.5 + (i * 4 * beatMs) / 1000 })),
      0.5 + (16 * beatMs) / 1000 + 1, SR, 7,
    );
    const session = new StrumSession(SR, 1000);
    for (let i = 0; i < audio.length; i += 128) session.push(audio.subarray(i, i + 128)); // worklet-sized blocks
    expect(session.seconds).toBeGreaterThan(10);
    const detections = session.finish(20);
    expect(detections.map((d) => d.label)).toEqual(chords);
    expect(detections[0]!.onsetMs).toBeGreaterThan(1400);
    expect(detections[0]!.onsetMs).toBeLessThan(1600);
    const result = scoreChordExercise({ exercise, detections });
    expect(result.chordResults!.map((r) => r.outcome)).toEqual(["right", "right", "right", "right"]);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(session.seconds).toBe(0); // audio dropped
  });

  it("hears nothing in silence, and grades it no-strum", () => {
    const exercise = exercises.find((e) => e.exerciseId === "guitar-strum-em")!;
    const session = new StrumSession(SR);
    session.push(new Float32Array(SR * 3));
    const detections = session.finish();
    expect(detections).toEqual([]);
    expect(scoreChordExercise({ exercise, detections }).chordResults!.every((r) => r.outcome === "no-strum")).toBe(true);
  });
});
