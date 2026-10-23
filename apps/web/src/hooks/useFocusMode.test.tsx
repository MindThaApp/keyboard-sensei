// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { enterFocusMode, exitFocusMode, useFocusMode } from "./useFocusMode";

function Probe({ hotkey = false }: { hotkey?: boolean }) {
  const focus = useFocusMode({ hotkey });
  return (
    <button type="button" onClick={focus.toggle}>
      {focus.active ? "focused" : "normal"}
    </button>
  );
}

afterEach(() => {
  act(() => exitFocusMode({ fromHistory: true }));
});

describe("useFocusMode", () => {
  it("marks the document and updates every consumer on enter and exit", () => {
    render(<Probe />);
    expect(screen.getByRole("button").textContent).toBe("normal");

    act(() => enterFocusMode());
    expect(screen.getByRole("button").textContent).toBe("focused");
    expect(document.documentElement.hasAttribute("data-focus-mode")).toBe(true);

    act(() => exitFocusMode({ fromHistory: true }));
    expect(screen.getByRole("button").textContent).toBe("normal");
    expect(document.documentElement.hasAttribute("data-focus-mode")).toBe(false);
  });

  it("leaves focus on Escape", () => {
    render(<Probe />);
    act(() => enterFocusMode());
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.getByRole("button").textContent).toBe("normal");
  });

  it("leaves focus when the back gesture pops the history entry", () => {
    render(<Probe />);
    act(() => enterFocusMode());
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("button").textContent).toBe("normal");
  });

  it("toggles with F only when the hotkey is on, and not while typing", () => {
    const { rerender } = render(
      <>
        <Probe />
        <input aria-label="note" />
      </>,
    );
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByRole("button").textContent).toBe("normal");

    rerender(
      <>
        <Probe hotkey />
        <input aria-label="note" />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("note"), { key: "f" });
    expect(screen.getByRole("button").textContent).toBe("normal");

    act(() => {
      fireEvent.keyDown(window, { key: "f" });
    });
    expect(screen.getByRole("button").textContent).toBe("focused");
  });
});
