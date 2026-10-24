import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "./api";

describe("filenameFromDisposition", () => {
  it("prefers the UTF-8 filename*", () => {
    expect(filenameFromDisposition(`attachment; filename="Fur Elise.mid"; filename*=UTF-8''F%C3%BCr%20Elise.mid`)).toBe("Für Elise.mid");
  });
  it("falls back to the plain filename, and to null", () => {
    expect(filenameFromDisposition(`attachment; filename="a.mei"`)).toBe("a.mei");
    expect(filenameFromDisposition(null)).toBeNull();
    expect(filenameFromDisposition("attachment")).toBeNull();
  });
  it("survives a malformed percent escape", () => {
    expect(filenameFromDisposition(`attachment; filename="a.mid"; filename*=UTF-8''%E0%A4%A`)).toBe("a.mid");
  });
});
