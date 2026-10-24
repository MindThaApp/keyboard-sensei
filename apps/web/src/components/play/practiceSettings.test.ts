// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultSettingsFor, loadSettings, saveSettings, settingsToPersist } from "./practiceSettings";

describe("defaultSettingsFor", () => {
  it("offers sheet music and falling notes together on a tablet or desktop", () => {
    expect(defaultSettingsFor("tablet").viewMode).toBe("both");
    expect(defaultSettingsFor("desktop").viewMode).toBe("both");
  });

  it("starts a phone on falling notes, and changes nothing else", () => {
    expect(defaultSettingsFor("phone")).toEqual({ ...DEFAULT_SETTINGS, viewMode: "falling" });
  });
});

describe("loadSettings", () => {
  afterEach(() => localStorage.clear());

  it("uses the device's defaults when nothing is stored", () => {
    expect(loadSettings("tablet")).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings("phone").viewMode).toBe("falling");
  });

  it("keeps a stored view on every device, sheet music included", () => {
    saveSettings({ ...DEFAULT_SETTINGS, viewMode: "notation" });
    expect(loadSettings("phone").viewMode).toBe("notation");
    expect(loadSettings("tablet").viewMode).toBe("notation");
  });

  it("falls back to the device default for a stored view it does not know", () => {
    localStorage.setItem("ks-playalong-settings", JSON.stringify({ viewMode: "page-turn" }));
    expect(loadSettings("desktop").viewMode).toBe("both");
    expect(loadSettings("phone").viewMode).toBe("falling");
  });
});

describe("settingsToPersist", () => {
  const saved = { ...DEFAULT_SETTINGS, tempoPct: 100, waitMode: false };
  // This song opened on its own remembered rung.
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

  it("is a pass-through when the song opened on the saved settings ", () => {
    const changed = { ...saved, tempoPct: 120, lookaheadS: 6 };
    expect(settingsToPersist(changed, saved, saved)).toEqual(changed);
  });
});
