// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { id: string } | null = null;
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: currentUser }) }));
const updateTunerA4 = vi.fn((_hz: number) => Promise.resolve({}));
let remote: number | null = null;
vi.mock("../../services/api", () => ({
  updateTunerA4: (hz: number) => updateTunerA4(hz),
  getCurrentUser: vi.fn(() => Promise.resolve({ tuner_a4_hz: remote })),
}));

const { default: TunerSync } = await import("./TunerSync");
const { loadTunerSettings, saveTunerSettings } = await import("./tunerSettings");

describe("TunerSync", () => {
  beforeEach(() => {
    localStorage.clear();
    updateTunerA4.mockClear();
    remote = null;
    vi.useFakeTimers();
  });
  afterEach(() => {
    currentUser = null;
    vi.useRealTimers();
  });

  it("takes the account's A4 on sign-in", async () => {
    remote = 443;
    currentUser = { id: "u" };
    render(<TunerSync />);
    await act(async () => undefined);
    expect(loadTunerSettings()).toMatchObject({ a4Hz: 443, a4PendingSync: false });
    expect(updateTunerA4).not.toHaveBeenCalled();
  });

  it("saves a change made on this device (debounced) and clears the pending flag", async () => {
    currentUser = { id: "u" };
    render(<TunerSync />);
    await act(async () => undefined);
    act(() => {
      saveTunerSettings({ a4Hz: 441 });
      saveTunerSettings({ a4Hz: 442 });
    });
    expect(loadTunerSettings().a4PendingSync).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(updateTunerA4).toHaveBeenCalledTimes(1);
    expect(updateTunerA4).toHaveBeenCalledWith(442);
    expect(loadTunerSettings().a4PendingSync).toBe(false);
  });

  it("a local value from before syncing is pushed when the account has none", async () => {
    saveTunerSettings({ a4Hz: 415, a4PendingSync: false });
    currentUser = { id: "u" };
    render(<TunerSync />);
    await act(async () => undefined);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(updateTunerA4).toHaveBeenCalledWith(415);
  });

  it("signed out: nothing is sent; the local value applies", async () => {
    render(<TunerSync />);
    act(() => {
      saveTunerSettings({ a4Hz: 432 });
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(updateTunerA4).not.toHaveBeenCalled();
    expect(loadTunerSettings().a4Hz).toBe(432);
  });
});
