import { describe, expect, it } from "vitest";
import { styleFallbackToast } from ".";

describe("styleFallbackToast", () => {
  it("names the style shown instead and why", () => {
    expect(styleFallbackToast({ style: "neon3d", fallback: "classic", reason: "unsupported" })).toEqual({
      title: "Showing Classic notes",
      body: "Neon 3D needs WebGL 2, which isn't available on this device.",
    });
    expect(styleFallbackToast({ style: "neon3d", fallback: "neon2d", reason: "performance" }).title).toBe("Showing Neon 2D notes");
    expect(styleFallbackToast({ style: "neon3d", fallback: "classic", reason: "unavailable" }).body).toMatch(/couldn't be loaded/);
  });
});
