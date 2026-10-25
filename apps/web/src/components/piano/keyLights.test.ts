import { afterAll, afterEach, describe, expect, it } from "vitest";
import { getKeyLights, KeyLightWriter, keyLightRgb, packKeyLight, subscribeKeyLights, type KeyLightState } from "./keyLights";

describe("packKeyLight", () => {
  it("packs a colour that unpacks to css channels, never 0", () => {
    const packed = packKeyLight(1, 0.5, 0);
    expect(packed).not.toBe(0);
    expect(keyLightRgb(packed)).toBe("255 128 0");
    expect(packKeyLight(0, 0, 0)).not.toBe(0);
  });

  it("clamps out-of-range channels", () => {
    expect(keyLightRgb(packKeyLight(2, -1, 0.2))).toBe("255 0 51");
  });
});

describe("KeyLightWriter", () => {
  let writer: KeyLightWriter;
  const seen: KeyLightState[] = [];
  const stop = subscribeKeyLights((state) => seen.push(state));

  afterAll(stop);
  afterEach(() => {
    writer?.setActive(false);
    seen.length = 0;
  });

  it("publishes when a style starts and stops lighting keys", () => {
    writer = new KeyLightWriter();
    writer.setActive(true);
    expect(seen.at(-1)?.active).toBe(true);
    writer.setActive(false);
    expect(seen.at(-1)?.active).toBe(false);
    expect(getKeyLights().active).toBe(false);
  });

  it("publishes a frame's lit keys only when they change", () => {
    writer = new KeyLightWriter();
    writer.setActive(true);
    seen.length = 0;

    writer.begin();
    writer.light(60, 1, 0, 0);
    expect(writer.commit()).toBe(true);
    expect(seen).toHaveLength(1);
    expect(keyLightRgb(seen[0]!.lit[60]!)).toBe("255 0 0");
    expect(seen[0]!.lit[61]).toBe(0);

    // Same keys, same colours: nothing to tell the keyboard.
    writer.begin();
    writer.light(60, 1, 0, 0);
    expect(writer.commit()).toBe(false);
    expect(seen).toHaveLength(1);

    // The note ends.
    writer.begin();
    expect(writer.commit()).toBe(true);
    expect(seen.at(-1)!.lit[60]).toBe(0);
  });

  it("clears every light when the style goes away", () => {
    writer = new KeyLightWriter();
    writer.setActive(true);
    writer.begin();
    writer.light(48, 0, 0, 1);
    writer.commit();
    writer.setActive(false);
    expect(getKeyLights().lit.every((value) => value === 0)).toBe(true);
  });

  it("a replaced writer neither clears nor overwrites the new one's lights", () => {
    const old = new KeyLightWriter();
    old.setActive(true);
    writer = new KeyLightWriter();
    writer.setActive(true);
    writer.begin();
    writer.light(60, 1, 1, 1);
    writer.commit();
    old.begin();
    expect(old.commit()).toBe(false);
    old.setActive(false);
    expect(getKeyLights().active).toBe(true);
    expect(getKeyLights().lit[60]).not.toBe(0);
  });

  it("ignores keys outside MIDI and publishes nothing while inactive", () => {
    writer = new KeyLightWriter();
    writer.begin();
    writer.light(-1, 1, 1, 1);
    writer.light(200, 1, 1, 1);
    expect(writer.commit()).toBe(false);
    expect(seen).toHaveLength(0);
  });
});
