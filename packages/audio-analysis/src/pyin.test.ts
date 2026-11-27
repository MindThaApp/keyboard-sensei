import { describe, expect, it } from "vitest";
import { PitchHmm, decodePitchTrack, type PitchObservation } from "./pyin.js";

const OPTIONS = { minFrequency: 70, maxFrequency: 1400 };

function voiced(frequency: number, probability = 0.9, alternative?: number): PitchObservation {
  const candidates = [{ frequency, probability, aperiodicity: 0.05 }];
  if (alternative) candidates.push({ frequency: alternative, probability: probability * 0.2, aperiodicity: 0.2 });
  return { candidates, voicedProbability: probability * (alternative ? 1.2 : 1) };
}
const unvoiced: PitchObservation = { candidates: [], voicedProbability: 0.01 };

describe("pYIN HMM", () => {
  it("smooths away a single-frame octave error", () => {
    const frames = [...Array(10)].map(() => voiced(220, 0.9, 440));
    // Frame 5 prefers the octave above.
    frames[5] = { candidates: [{ frequency: 440, probability: 0.5, aperiodicity: 0.1 }, { frequency: 220, probability: 0.4, aperiodicity: 0.1 }], voicedProbability: 0.9 };
    const track = decodePitchTrack(frames, OPTIONS);
    expect(track.every(t => t.voiced && Math.abs(t.frequency! - 220) < 0.01)).toBe(true);
  });

  it("follows a real note change", () => {
    const frames = [...Array(8)].map(() => voiced(220)).concat([...Array(8)].map(() => voiced(330)));
    const track = decodePitchTrack(frames, OPTIONS);
    expect(track.slice(0, 7).every(t => t.frequency === 220)).toBe(true);
    expect(track.slice(9).every(t => t.frequency === 330)).toBe(true);
  });

  it("allows a large leap when the evidence is sustained", () => {
    const frames = [...Array(10)].map(() => voiced(110)).concat([...Array(10)].map(() => voiced(880)));
    const track = decodePitchTrack(frames, OPTIONS);
    expect(track[15]!.frequency).toBe(880);
    expect(track[3]!.frequency).toBe(110);
  });

  it("marks unvoiced stretches unvoiced", () => {
    const frames = [...Array(6)].map(() => voiced(196)).concat([...Array(6)].map(() => unvoiced), [...Array(6)].map(() => voiced(196)));
    const track = decodePitchTrack(frames, OPTIONS);
    expect(track.slice(7, 11).every(t => !t.voiced)).toBe(true);
    expect(track.slice(13).every(t => t.voiced)).toBe(true);
  });

  it("the live tracker decides `lag` frames late and agrees with the offline pass on clean input", () => {
    const frames = [...Array(6)].map(() => voiced(220)).concat([...Array(6)].map(() => voiced(247)));
    const hmm = new PitchHmm({ ...OPTIONS, lag: 3 });
    const live = frames.map(f => hmm.step(f));
    expect(live.slice(0, 3)).toEqual([null, null, null]);
    const decided = [...live.filter(x => x !== null), ...hmm.flush()];
    expect(decided).toHaveLength(frames.length);
    expect(decided.map(t => t!.frequency)).toEqual(decodePitchTrack(frames, OPTIONS).map(t => t.frequency));
  });

  it("keeps full candidate precision (not the 20-cent bin centre)", () => {
    const track = decodePitchTrack([voiced(441.37), voiced(441.37), voiced(441.37)], OPTIONS);
    expect(track[1]!.frequency).toBe(441.37);
  });
});
