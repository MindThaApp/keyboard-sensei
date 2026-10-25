// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, defaultSettingsFor, isOnlyMyNotes, loadSettings, setOnlyMyNotes, saveSettings, settingsToPersist } from "./practiceSettings";

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

  it("matches the look by default and keeps a stored key highlight", () => {
    expect(loadSettings("tablet").keyHighlight).toBe("match");
    saveSettings({ ...DEFAULT_SETTINGS, keyHighlight: "flat" });
    expect(loadSettings("tablet").keyHighlight).toBe("flat");
  });

  it("falls back to matching the look for a key highlight it does not know", () => {
    localStorage.setItem("ks-playalong-settings", JSON.stringify({ keyHighlight: "disco" }));
    expect(loadSettings("tablet").keyHighlight).toBe("match");
  });

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

describe("Only my notes", () => {
  it("is off by default and on turns all three song-audio sources off", () => {
    expect(isOnlyMyNotes(DEFAULT_SETTINGS)).toBe(false);
    const on = setOnlyMyNotes(DEFAULT_SETTINGS, true);
    expect(isOnlyMyNotes(on)).toBe(true);
    expect(on.guideAudio).toBe(false);
    expect(on.accompanimentMute).toEqual({ removed: true, otherHand: true });
  });

  it("restores the previous values when turned off", () => {
    const before = { ...DEFAULT_SETTINGS, guideAudio: false, accompanimentMute: { removed: false, otherHand: true } };
    const off = setOnlyMyNotes(setOnlyMyNotes(before, true), false);
    expect(off.guideAudio).toBe(false);
    expect(off.accompanimentMute).toEqual({ removed: false, otherHand: true });
    expect(isOnlyMyNotes(off)).toBe(false);
  });

  it("falls back to the defaults when there is nothing to restore", () => {
    const allOff = { ...DEFAULT_SETTINGS, guideAudio: false, accompanimentMute: { removed: true, otherHand: true } };
    expect(isOnlyMyNotes(allOff)).toBe(true);
    const off = setOnlyMyNotes(allOff, false);
    expect(off.guideAudio).toBe(true);
    expect(off.accompanimentMute).toEqual({ removed: false, otherHand: false });
  });

  it("turns itself off when any one source is turned back on", () => {
    const on = setOnlyMyNotes(DEFAULT_SETTINGS, true);
    expect(isOnlyMyNotes({ ...on, guideAudio: true })).toBe(false);
    expect(isOnlyMyNotes({ ...on, accompanimentMute: { ...on.accompanimentMute, removed: false } })).toBe(false);
    expect(isOnlyMyNotes({ ...on, accompanimentMute: { ...on.accompanimentMute, otherHand: false } })).toBe(false);
  });

  it("survives a save and load", () => {
    localStorage.clear();
    saveSettings(setOnlyMyNotes(DEFAULT_SETTINGS, true));
    const loaded = loadSettings("desktop");
    expect(isOnlyMyNotes(loaded)).toBe(true);
    expect(setOnlyMyNotes(loaded, false).guideAudio).toBe(true);
  });
});
