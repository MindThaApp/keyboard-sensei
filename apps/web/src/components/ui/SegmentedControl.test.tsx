// @vitest-environment jsdom
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

const HANDS = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
] as const;

function Controlled({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState<string>("right");
  return (
    <SegmentedControl
      aria-label="Hands"
      options={[...HANDS]}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a named radiogroup of radios with the current value checked", () => {
    render(<Controlled />);
    const group = screen.getByRole("radiogroup", { name: "Hands" });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
  });

  it("has a single tab stop, on the selected radio", () => {
    render(<Controlled />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
  });

  it("moves and selects with the arrow keys, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Right" }));

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("both");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Both" }));

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("left");
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("aria-checked")).toBe("true");

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("both");
  });

  it("jumps with Home and End", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Both" }).getAttribute("aria-checked")).toBe("true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("aria-checked")).toBe("true");
  });

  it("skips disabled options when moving", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        aria-label="Hands"
        value="left"
        onChange={onChange}
        options={[
          { value: "left", label: "Left" },
          { value: "right", label: "Right", disabled: true },
          { value: "both", label: "Both" },
        ]}
      />,
    );
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("both");
  });

  it("does not change a controlled value until the parent does", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Hands" options={[...HANDS]} value="left" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Both" }));
    expect(onChange).toHaveBeenCalledWith("both");
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("aria-checked")).toBe("true");
  });

  it("keeps its own state when uncontrolled", async () => {
    const user = userEvent.setup();
    render(<SegmentedControl aria-label="Hands" options={[...HANDS]} defaultValue="right" />);
    await user.click(screen.getByRole("radio", { name: "Left" }));
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Right" }).getAttribute("aria-checked")).toBe("false");
  });

  it("exposes the full label as a title for ellipsised segments", () => {
    render(<SegmentedControl aria-label="Version" options={[{ value: 1, label: "Just the tune" }]} value={1} />);
    expect(screen.getByRole("radio").getAttribute("title")).toBe("Just the tune");
  });
});
