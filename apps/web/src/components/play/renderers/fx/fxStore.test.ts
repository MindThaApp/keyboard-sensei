import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FX_CUSTOM_START, FX_PRESET_PARAMS } from "./fxParams";
import { activeFxParams, getFxState, loadFxState, resetFxStateCache, selectFxPreset, subscribeFx, tweakFx } from "./fxStore";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe("fxStore", () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    resetFxStateCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetFxStateCache();
  });

  it("starts on Custom with the red glass look", () => {
    expect(getFxState()).toEqual({ preset: "custom", custom: FX_CUSTOM_START });
  });

  it("remembers the chosen preset", () => {
    selectFxPreset("frost");
    expect(activeFxParams()).toBe(FX_PRESET_PARAMS.frost);
    resetFxStateCache();
    expect(loadFxState().preset).toBe("frost");
  });

  it("a tweak on a preset becomes Custom, starting from that preset, and leaves the preset alone", () => {
    selectFxPreset("glassBlue");
    tweakFx({ sparkCount: 1200 });
    const state = getFxState();
    expect(state.preset).toBe("custom");
    expect(state.custom.sparkCount).toBe(1200);
    expect(state.custom.body).toBe("glass");
    expect(state.custom.hue).toBe(FX_PRESET_PARAMS.glassBlue.hue);
    expect(FX_PRESET_PARAMS.glassBlue.sparkCount).toBe(3000);
  });

  it("Custom keeps the tweaks when another preset is tried and Custom is picked again", () => {
    tweakFx({ hue: 200 });
    selectFxPreset("gold");
    expect(activeFxParams().hue).toBe(FX_PRESET_PARAMS.gold.hue);
    selectFxPreset("custom");
    expect(activeFxParams().hue).toBe(200);
    resetFxStateCache();
    expect(loadFxState().custom.hue).toBe(200);
  });

  it("clamps a tweak into the slider's range", () => {
    tweakFx({ glow: 50 });
    expect(getFxState().custom.glow).toBe(1.5);
  });

  it("tells subscribers, until they leave", () => {
    const seen = vi.fn();
    const off = subscribeFx(seen);
    selectFxPreset("ember");
    off();
    selectFxPreset("gold");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("falls back to defaults on corrupt storage and works without storage", () => {
    storage.data.set("ks-playalong-fx", "{not json");
    expect(loadFxState().preset).toBe("custom");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    resetFxStateCache();
    selectFxPreset("clean");
    expect(getFxState().preset).toBe("clean");
  });
});
