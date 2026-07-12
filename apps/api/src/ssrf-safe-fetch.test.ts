import { describe, expect, it } from "vitest";
import { isDisallowedIp } from "./ssrf-safe-fetch.js";

describe("isDisallowedIp", () => {
  it("blocks standard private IPv4 ranges", () => {
    expect(isDisallowedIp("10.0.0.1")).toBe(true);
    expect(isDisallowedIp("172.16.0.1")).toBe(true);
    expect(isDisallowedIp("172.31.255.255")).toBe(true);
    expect(isDisallowedIp("192.168.1.1")).toBe(true);
  });

  it("blocks loopback, link-local (incl. cloud metadata), and 0.0.0.0", () => {
    expect(isDisallowedIp("127.0.0.1")).toBe(true);
    expect(isDisallowedIp("169.254.169.254")).toBe(true);
    expect(isDisallowedIp("0.0.0.0")).toBe(true);
  });

  it("blocks multicast/reserved IPv4 (>=224)", () => {
    expect(isDisallowedIp("224.0.0.1")).toBe(true);
    expect(isDisallowedIp("240.0.0.1")).toBe(true);
  });

  it("blocks 100.64.0.0/10 (CGNAT, incl. Alibaba Cloud's metadata service)", () => {
    expect(isDisallowedIp("100.64.0.1")).toBe(true);
    expect(isDisallowedIp("100.100.100.200")).toBe(true);
    expect(isDisallowedIp("100.127.255.255")).toBe(true);
    expect(isDisallowedIp("100.63.255.255")).toBe(false);
    expect(isDisallowedIp("100.128.0.0")).toBe(false);
  });

  it("allows ordinary public IPv4 addresses", () => {
    expect(isDisallowedIp("8.8.8.8")).toBe(false);
    expect(isDisallowedIp("93.184.216.34")).toBe(false);
  });

  it("blocks IPv6 loopback, unique-local, and link-local", () => {
    expect(isDisallowedIp("::1")).toBe(true);
    expect(isDisallowedIp("fc00::1")).toBe(true);
    expect(isDisallowedIp("fd12:3456::1")).toBe(true);
    expect(isDisallowedIp("fe80::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses that embed a disallowed IPv4 address", () => {
    expect(isDisallowedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isDisallowedIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows an IPv4-mapped IPv6 address that embeds a public IPv4 address", () => {
    expect(isDisallowedIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on a string that isn't a recognizable IP literal", () => {
    expect(isDisallowedIp("not-an-ip")).toBe(true);
  });
});
