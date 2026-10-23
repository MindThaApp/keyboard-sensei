import { describe, expect, it } from "vitest";
import { experienceFor, formatScoresParam, parseDeviceParam, parseScoresParam, parseSourceParam } from "./onboardingParams";

describe("onboarding URL params", () => {
  it("round-trips placement scores", () => {
    expect(parseScoresParam(formatScoresParam([80, 92.4, 0]))).toEqual([80, 92, 0]);
  });

  it("treats a missing or empty scores param as a skipped assessment", () => {
    expect(parseScoresParam(null)).toEqual([]);
    expect(parseScoresParam("")).toEqual([]);
  });

  it("drops values that aren't valid 0–100 scores", () => {
    expect(parseScoresParam("50,abc,-1,101,70")).toEqual([50, 70]);
  });

  it("defaults the device to the on-screen keyboard", () => {
    expect(parseDeviceParam("plugged")).toBe("plugged");
    expect(parseDeviceParam("bluetooth")).toBe("bluetooth");
    expect(parseDeviceParam("nonsense")).toBe("screen");
    expect(parseDeviceParam(null)).toBe("screen");
  });

  it("maps the first answer to the experience mode", () => {
    expect(experienceFor("never")).toBe("simple");
    expect(experienceFor("yes")).toBe("advanced");
  });

  it("only recognises the demo source explicitly", () => {
    expect(parseSourceParam("demo")).toBe("demo");
    expect(parseSourceParam("signup")).toBe("signup");
    expect(parseSourceParam(null)).toBe("signup");
    expect(parseSourceParam("anything")).toBe("signup");
  });
});
