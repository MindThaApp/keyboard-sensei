import { describe, expect, it } from "vitest";
import { userScopeFromToken } from "./userScope";
import { tokenFor } from "./testFixtures";

describe("userScopeFromToken", () => {
  it("reads sub from a JWT payload", () => {
    expect(userScopeFromToken(tokenFor("user-123"))).toBe("user-123");
  });
  it("returns null for missing or malformed tokens", () => {
    expect(userScopeFromToken(null)).toBeNull();
    expect(userScopeFromToken("not-a-jwt")).toBeNull();
    expect(userScopeFromToken("a.!!!.c")).toBeNull();
    expect(userScopeFromToken(`a.${btoa("{}")}.c`)).toBeNull();
  });
});
