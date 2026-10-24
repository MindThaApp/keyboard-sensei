// @vitest-environment jsdom
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_HIDE_DELAY_MS, AUTO_HIDE_IGNORE_ATTRIBUTE, useAutoHide } from "./useAutoHide";

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useAutoHide", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("always shows the controls when hiding is off", () => {
    const { result } = renderHook(() => useAutoHide({ enabled: false, hold: false }));
    advance(AUTO_HIDE_DELAY_MS * 3);
    expect(result.current).toBe(true);
  });

  it("hides after about 3 seconds with no input", () => {
    const { result } = renderHook(() => useAutoHide({ enabled: true, hold: false }));
    advance(AUTO_HIDE_DELAY_MS - 1);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);
  });

  it("comes back on a pointer move, a touch or a key press, and restarts the timer", () => {
    const { result } = renderHook(() => useAutoHide({ enabled: true, hold: false }));
    advance(AUTO_HIDE_DELAY_MS);
    expect(result.current).toBe(false);

    act(() => void fireEvent.pointerMove(window, { pointerType: "mouse" }));
    expect(result.current).toBe(true);
    advance(AUTO_HIDE_DELAY_MS - 500);
    act(() => void fireEvent.keyDown(window, { key: "a" }));
    advance(AUTO_HIDE_DELAY_MS - 500);
    expect(result.current).toBe(true);
    advance(500);
    expect(result.current).toBe(false);

    act(() => {
      fireEvent.pointerDown(window, { pointerType: "touch" });
      fireEvent.pointerUp(window, { pointerType: "touch" });
    });
    expect(result.current).toBe(true);
  });

  it("never hides while a pointer is pressed", () => {
    const { result } = renderHook(() => useAutoHide({ enabled: true, hold: false }));
    act(() => void fireEvent.pointerDown(window, { pointerType: "touch" }));
    advance(AUTO_HIDE_DELAY_MS * 4);
    expect(result.current).toBe(true);
    act(() => void fireEvent.pointerUp(window, { pointerType: "touch" }));
    advance(AUTO_HIDE_DELAY_MS);
    expect(result.current).toBe(false);
  });

  it("never hides while held, and starts a fresh timer when released", () => {
    const { result, rerender } = renderHook((props: { hold: boolean }) => useAutoHide({ enabled: true, hold: props.hold }), {
      initialProps: { hold: true },
    });
    advance(AUTO_HIDE_DELAY_MS * 4);
    expect(result.current).toBe(true);

    rerender({ hold: false });
    advance(AUTO_HIDE_DELAY_MS - 1);
    expect(result.current).toBe(true);
    advance(1);
    expect(result.current).toBe(false);

    rerender({ hold: true });
    expect(result.current).toBe(true);
  });

  it("does not wake for a touch on the keys, which is playing", () => {
    const keys = document.createElement("div");
    keys.setAttribute(AUTO_HIDE_IGNORE_ATTRIBUTE, "");
    const key = document.createElement("button");
    keys.appendChild(key);
    document.body.appendChild(keys);

    const { result } = renderHook(() => useAutoHide({ enabled: true, hold: false }));
    advance(AUTO_HIDE_DELAY_MS);
    act(() => {
      fireEvent.pointerDown(key, { pointerType: "touch" });
      fireEvent.pointerUp(key, { pointerType: "touch" });
    });
    expect(result.current).toBe(false);

    // A mouse moving over the keys still counts.
    act(() => void fireEvent.pointerMove(key, { pointerType: "mouse" }));
    expect(result.current).toBe(true);
  });
});
