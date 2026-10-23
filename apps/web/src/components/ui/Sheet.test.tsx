// @vitest-environment jsdom
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DensityScope } from "./density";
import { Sheet } from "./Sheet";

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Sheet
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Practice settings"
        detents={["medium", "large"]}
        leading={<button>Cancel</button>}
        trailing={<button>Done</button>}
      >
        <button>First action</button>
        <input aria-label="Name" />
        <button>Last action</button>
      </Sheet>
    </>
  );
}

describe("Sheet", () => {
  it("renders nothing while closed", () => {
    render(<Sheet open={false} onClose={() => undefined} title="Hidden" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a modal dialog named by its title", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog", { name: "Practice settings" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("moves focus into the dialog and returns it to the opener on close", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByText("Open");
    await user.click(opener);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab inside the dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog");

    const stops = Array.from(dialog.querySelectorAll<HTMLElement>("button, input"));
    const first = stops[0];
    const last = stops[stops.length - 1];
    expect(stops.length).toBeGreaterThan(3);

    act(() => last.focus());
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);

    // Many tabs never leave the dialog.
    for (let i = 0; i < stops.length * 2 + 1; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape and on a backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByText("Open"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("Open"));
    const backdrop = document.querySelector<HTMLElement>(".ks-sheet-backdrop")!;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when the dialog itself is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByText("Open"));
    await user.click(screen.getByText("First action"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("toggles between its detents with the grabber", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Open"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-detent")).toBe("medium");

    await user.click(screen.getByRole("button", { name: "Expand sheet" }));
    expect(dialog.getAttribute("data-detent")).toBe("large");
    await user.click(screen.getByRole("button", { name: "Shrink sheet" }));
    expect(dialog.getAttribute("data-detent")).toBe("medium");
  });

  it("locks page scroll while open and restores it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText("Open"));
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps scroll locked until the last of several sheets closes, in any order", () => {
    const a = render(<Sheet open onClose={() => undefined} title="A" />);
    const b = render(<Sheet open onClose={() => undefined} title="B" />);
    a.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    b.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("is full height with no resize grabber at compact density", async () => {
    render(
      <DensityScope density="compact">
        <Sheet open onClose={() => undefined} title="Compact" detents={["medium", "large"]}>
          <button>Item</button>
        </Sheet>
      </DensityScope>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-detent")).toBe("large");
    expect(dialog.parentElement?.getAttribute("data-density")).toBe("compact");
    expect(screen.queryByRole("button", { name: "Expand sheet" })).toBeNull();
  });
});
