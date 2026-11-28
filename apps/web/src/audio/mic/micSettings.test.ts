import { beforeEach, describe, expect, it } from "vitest";
import { TUNER_SETTINGS_KEY, loadA4Hz } from "./micSettings";

beforeEach(() => localStorage.clear());

describe("mic settings", () => {
  it("reads A4 from the tuner settings, within 415-466 Hz", () => {
    expect(loadA4Hz()).toBe(440);
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ a4Hz: 442 }));
    expect(loadA4Hz()).toBe(442);
    localStorage.setItem(TUNER_SETTINGS_KEY, JSON.stringify({ a4Hz: 500 }));
    expect(loadA4Hz()).toBe(440);
    localStorage.setItem(TUNER_SETTINGS_KEY, "{not json");
    expect(loadA4Hz()).toBe(440);
  });
});
