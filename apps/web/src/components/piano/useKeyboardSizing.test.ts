import { describe, expect, it } from "vitest";
import {
  clampZoomPx,
  keyCountFor,
  nextFitIndex,
  rangeLabelFor,
  resolveNamedRange,
  snapRangeToWhiteKeys,
  stepsFor,
  ZOOM_MAX_PX,
  ZOOM_MIN_PX,
  type FitStep,
} from "./useKeyboardSizing";
import { DEFAULT_RANGE } from "../../utils/keyboardRange";

describe("stepsFor", () => {
  it("includes the tight-fit step when a tightRange exists", () => {
    expect(stepsFor(true)).toEqual(["default", "tight", "keyboard"]);
  });

  it("skips the tight-fit step when there's no tightRange (Settings, Record)", () => {
    expect(stepsFor(false)).toEqual(["default", "keyboard"]);
  });
});

describe("resolveNamedRange", () => {
  const ctx = {
    defaultRange: { lowestNote: 48, highestNote: 72 },
    tightRange: { lowestNote: 61, highestNote: 63 }, // C#4-D#4, both black keys
    deviceRange: { lowestNote: 36, highestNote: 96 },
    hasDevice: true,
  };

  it("resolves 'default' to the padded default range", () => {
    expect(resolveNamedRange("default", ctx)).toEqual({ lowestNote: 48, highestNote: 72 });
  });

  it("resolves 'tight' to the exact range, snapped outward onto white keys", () => {
    // 61 (C#4) snaps down to 60 (C4); 63 (D#4) snaps up to 64 (E4).
    expect(resolveNamedRange("tight", ctx)).toEqual({ lowestNote: 60, highestNote: 64 });
  });

  it("resolves 'tight' to the default range when no tightRange was supplied", () => {
    expect(resolveNamedRange("tight", { ...ctx, tightRange: undefined })).toEqual({ lowestNote: 48, highestNote: 72 });
  });

  it("resolves 'keyboard' to the connected device's range when one is connected", () => {
    expect(resolveNamedRange("keyboard", ctx)).toEqual({ lowestNote: 36, highestNote: 96 });
  });

  it("resolves 'keyboard' to DEFAULT_RANGE when nothing is connected", () => {
    expect(resolveNamedRange("keyboard", { ...ctx, hasDevice: false })).toEqual(DEFAULT_RANGE);
  });
});

describe("nextFitIndex — cycle sequencing", () => {
  const withTight: FitStep[] = ["default", "tight", "keyboard"];
  const withoutTight: FitStep[] = ["default", "keyboard"];

  it("advances default -> tight -> keyboard -> default when not manual", () => {
    expect(nextFitIndex(0, false, withTight)).toBe(1); // default -> tight
    expect(nextFitIndex(1, false, withTight)).toBe(2); // tight -> keyboard
    expect(nextFitIndex(2, false, withTight)).toBe(0); // keyboard -> default (wraps)
  });

  it("advances default -> keyboard -> default when there's no tight-fit step", () => {
    expect(nextFitIndex(0, false, withoutTight)).toBe(1); // default -> keyboard
    expect(nextFitIndex(1, false, withoutTight)).toBe(0); // keyboard -> default (wraps)
  });

  it("re-enters at tight-fit after a manual change, regardless of the prior position", () => {
    expect(nextFitIndex(0, true, withTight)).toBe(withTight.indexOf("tight"));
    expect(nextFitIndex(1, true, withTight)).toBe(withTight.indexOf("tight"));
    expect(nextFitIndex(2, true, withTight)).toBe(withTight.indexOf("tight"));
  });

  it("re-enters at keyboard after a manual change when there's no tight-fit step", () => {
    expect(nextFitIndex(0, true, withoutTight)).toBe(withoutTight.indexOf("keyboard"));
    expect(nextFitIndex(1, true, withoutTight)).toBe(withoutTight.indexOf("keyboard"));
  });

  it("treats an out-of-bounds current index as 0 (defensive, e.g. tightRange disappearing mid-session)", () => {
    expect(nextFitIndex(5, false, withoutTight)).toBe(1); // clamped to 0, then advances to 1
  });
});

describe("keyCountFor", () => {
  it("counts every key (white and black) in an inclusive range", () => {
    // 25-key option from keyboardRange.ts: C3 (48) - C5 (72).
    expect(keyCountFor({ lowestNote: 48, highestNote: 72 })).toBe(25);
  });

  it("counts a single key as 1", () => {
    expect(keyCountFor({ lowestNote: 60, highestNote: 60 })).toBe(1);
  });
});

describe("rangeLabelFor", () => {
  it("formats as lowest–highest note names", () => {
    expect(rangeLabelFor({ lowestNote: 60, highestNote: 72 })).toBe("C4–C5");
  });
});

describe("snapRangeToWhiteKeys", () => {
  it("leaves an already-white-key range untouched", () => {
    expect(snapRangeToWhiteKeys({ lowestNote: 60, highestNote: 72 })).toEqual({ lowestNote: 60, highestNote: 72 });
  });

  it("snaps a black-key lower bound down and a black-key upper bound up", () => {
    // 61 = C#4 (black), snaps down to 60 = C4. 70 = A#4 (black), snaps up to 71 = B4.
    expect(snapRangeToWhiteKeys({ lowestNote: 61, highestNote: 70 })).toEqual({ lowestNote: 60, highestNote: 71 });
  });
});

describe("clampZoomPx", () => {
  it("passes values already inside the bounds through unchanged", () => {
    expect(clampZoomPx(40)).toBe(40);
  });

  it("clamps below the minimum", () => {
    expect(clampZoomPx(0)).toBe(ZOOM_MIN_PX);
  });

  it("clamps above the maximum", () => {
    expect(clampZoomPx(999)).toBe(ZOOM_MAX_PX);
  });
});
