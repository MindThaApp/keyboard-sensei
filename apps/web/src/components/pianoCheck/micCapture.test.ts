import { describe, expect, it } from "vitest";
import { NoteListener } from "./micCapture";

const SR = 48000;
const chunk = (amp: number, n = 128) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i));

describe("NoteListener", () => {
  it("waits for a key press, then delivers the ringing note with its attack", () => {
    const got: Float32Array[] = [];
    const l = new NoteListener(SR, (s) => got.push(s), 1);
    for (let i = 0; i < 2000; i++) l.push(chunk(0.0005));
    expect(got.length).toBe(0);
    for (let i = 0; i < 450; i++) l.push(chunk(0.2));
    expect(got.length).toBe(1);
    expect(got[0].length).toBeGreaterThan(SR);
    expect(Math.max(...got[0].slice(0, 3000))).toBeGreaterThan(0.1);
  });

  it("ignores the tail of the previous note after a reset", () => {
    const got: Float32Array[] = [];
    const l = new NoteListener(SR, (s) => got.push(s), 0.1);
    l.reset();
    for (let i = 0; i < 100; i++) l.push(chunk(0.2));
    expect(got.length).toBe(0);
    for (let i = 0; i < 50; i++) l.push(chunk(0.001));
    for (let i = 0; i < 100; i++) l.push(chunk(0.2));
    expect(got.length).toBe(1);
  });
});
