import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settingsToPersist } from "./practiceSettings";

describe("settingsToPersist", () => {
  const saved = { ...DEFAULT_SETTINGS, tempoPct: 100, waitMode: false };
  // Simple mode opened this song at the beginner start.
  const opened = { ...saved, tempoPct: 70, waitMode: true };

  it("keeps a song's own opening tempo and Wait for me out of the shared settings", () => {
    expect(settingsToPersist(opened, opened, saved)).toMatchObject({ tempoPct: 100, waitMode: false });
  });

  it("stores what the user changes", () => {
    expect(settingsToPersist({ ...opened, tempoPct: 85 }, opened, saved)).toMatchObject({ tempoPct: 85, waitMode: false });
    expect(settingsToPersist({ ...opened, waitMode: false, metronome: true }, opened, saved)).toMatchObject({
      tempoPct: 100,
      waitMode: false,
      metronome: true,
    });
  });

  it("is a pass-through when the song opened on the saved settings (Advanced mode)", () => {
    const changed = { ...saved, tempoPct: 120, lookaheadS: 6 };
    expect(settingsToPersist(changed, saved, saved)).toEqual(changed);
  });
});
