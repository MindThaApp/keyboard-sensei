import { describe, expect, it } from "vitest";
import { describeInstrument } from "./instrumentText";

describe("describeInstrument", () => {
  it("drops a leading repeat of the instrument name", () => {
    expect(describeInstrument({ name: "Bright Upright", description: "Bright Upright \u2014 crisper attack, cuts through" })).toBe(
      "crisper attack, cuts through",
    );
  });

  it("keeps descriptions that do not start with the name", () => {
    expect(describeInstrument({ name: "Rhodes", description: "Bell-like electric piano" })).toBe("Bell-like electric piano");
  });

  it("keeps a different leading phrase", () => {
    expect(describeInstrument({ name: "Organ", description: "Church Organ \u2014 big and slow" })).toBe("Church Organ \u2014 big and slow");
  });
});
