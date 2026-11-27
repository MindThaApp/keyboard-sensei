// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MicInput } from "../../audio/mic/useMicInput";
import MicInputPanel, { MIC_EXPLANATION, MicStatusPill } from "./MicInputPanel";

const mic = (overrides: Partial<MicInput>): MicInput => ({
  status: "off", listenState: "listening", processingOn: false, error: null, source: null,
  start: vi.fn(), confirm: vi.fn(async () => undefined), stop: vi.fn(), ...overrides,
});

describe("MicInputPanel", () => {
  it("explains before asking, and only asks on confirm", async () => {
    const input = mic({ status: "explain" });
    render(<MicInputPanel mic={input} />);
    expect(screen.getByText(MIC_EXPLANATION)).toBeTruthy();
    expect(MIC_EXPLANATION).toMatch(/never recorded or uploaded/);
    await userEvent.click(screen.getByRole("button", { name: "Turn on microphone" }));
    expect(input.confirm).toHaveBeenCalled();
  });
  it("on denial says MIDI still works and offers the keyboard", async () => {
    const onUseKeyboard = vi.fn();
    render(<MicInputPanel mic={mic({ status: "denied" })} onUseKeyboard={onUseKeyboard} />);
    expect(screen.getByRole("alert").textContent).toMatch(/MIDI keyboard or the on-screen piano still works/);
    await userEvent.click(screen.getByRole("button", { name: "Use keyboard instead" }));
    expect(onUseKeyboard).toHaveBeenCalled();
  });
  it("renders nothing while off", () => {
    const { container } = render(<MicInputPanel mic={mic({})} />);
    expect(container.textContent).toBe("");
  });
});

describe("MicStatusPill", () => {
  it("shows the listening states", () => {
    const { rerender } = render(<MicStatusPill mic={mic({ status: "on" })} />);
    expect(screen.getByTestId("mic-status").textContent).toMatch("Listening - mic");
    rerender(<MicStatusPill mic={mic({ status: "on", listenState: "too-noisy" })} />);
    expect(screen.getByTestId("mic-status").textContent).toMatch(/Too noisy/);
  });
});
