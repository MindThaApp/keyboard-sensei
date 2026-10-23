// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Advanced } from "./Advanced";
import { Button } from "./Button";
import { Card } from "./Card";
import { Badge, Chip } from "./Chip";
import { DensityScope } from "./density";
import { getGlossaryEntry } from "./glossary";
import { getMountedGlassLayers, GlassSurface } from "./GlassSurface";
import { InfoTip } from "./InfoTip";
import { ListGroup, ListRow } from "./List";
import { ProgressRing } from "./ProgressRing";
import { Slider } from "./Slider";
import { Stepper } from "./Stepper";
import { TabBar } from "./TabBar";
import { Toast, ToastProvider, useToast } from "./Toast";
import { Toggle } from "./Toggle";
import { Toolbar } from "./Toolbar";

afterEach(() => {
  vi.useRealTimers();
});

describe("Button", () => {
  it("renders the variant and size classes and fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button variant="filled" size="lg" onClick={onClick}>
        Start
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Start" });
    expect(button.className).toContain("ks-btn--filled");
    expect(button.className).toContain("ks-btn--lg");
    expect(button.getAttribute("type")).toBe("button");
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates from the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("ignores clicks and reports busy while loading", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Toggle", () => {
  it("is a switch that reflects and flips its state", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Toggle label="Wait for me" description="Pauses the song." checked={false} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: /Wait for me/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
    // Controlled: no change until the parent re-renders.
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("toggles with Space and Enter when uncontrolled", async () => {
    const user = userEvent.setup();
    render(<Toggle label="Sound" defaultChecked />);
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.tab();
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("keeps the label as the accessible name when it is visually hidden", () => {
    render(<Toggle hideLabel label="Show advanced controls" />);
    expect(screen.getByRole("switch", { name: "Show advanced controls" })).toBeTruthy();
  });
});

describe("Slider", () => {
  it("has slider semantics with value text", () => {
    render(<Slider aria-label="Speed" min={25} max={200} step={5} value={70} formatValue={(v) => `${v}%`} />);
    const slider = screen.getByRole("slider", { name: "Speed" });
    expect(slider.getAttribute("min")).toBe("25");
    expect(slider.getAttribute("max")).toBe("200");
    expect(slider.getAttribute("aria-valuetext")).toBe("70%");
    expect(screen.getByText("70%")).toBeTruthy();
  });

  it("reports changes as numbers and tracks them when uncontrolled", () => {
    const onChange = vi.fn();
    render(<Slider aria-label="Speed" min={0} max={100} defaultValue={10} onChange={onChange} formatValue={(v) => `${v}`} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith(42);
    expect(slider.value).toBe("42");
  });

  it("drives the fill from the value", () => {
    render(<Slider aria-label="Speed" min={0} max={200} value={50} />);
    expect(screen.getByRole("slider").style.getPropertyValue("--ks-pct")).toBe("25%");
  });
});

describe("Stepper", () => {
  it("steps within bounds and disables at the limits", async () => {
    const user = userEvent.setup();
    function Host() {
      const [n, setN] = useState(2);
      return <Stepper aria-label="loop bars" value={n} onChange={setN} min={1} max={3} formatValue={(v) => `${v} bars`} />;
    }
    render(<Host />);
    const inc = screen.getByRole("button", { name: "Increase loop bars" }) as HTMLButtonElement;
    const dec = screen.getByRole("button", { name: "Decrease loop bars" }) as HTMLButtonElement;
    expect(screen.getByText("2 bars")).toBeTruthy();
    await user.click(inc);
    expect(screen.getByText("3 bars")).toBeTruthy();
    expect(inc.disabled).toBe(true);
    await user.click(dec);
    await user.click(dec);
    expect(screen.getByText("1 bars")).toBeTruthy();
    expect(dec.disabled).toBe(true);
  });

  it("is a labelled group and is keyboard operable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Stepper aria-label="size" defaultValue={5} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "size" })).toBeTruthy();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("avoids floating point noise", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Stepper aria-label="gain" value={0.2} step={0.1} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Increase gain" }));
    expect(onChange).toHaveBeenCalledWith(0.3);
  });
});

describe("Card", () => {
  it("renders as the requested element", () => {
    render(
      <Card as="section" aria-label="Summary" padding="lg">
        Body
      </Card>,
    );
    const card = screen.getByLabelText("Summary");
    expect(card.tagName).toBe("SECTION");
    expect(card.className).toContain("ks-card--pad-lg");
  });

  it("is a real button when interactive", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Card as="button" interactive onClick={onClick}>
        Open
      </Card>,
    );
    const card = screen.getByRole("button", { name: "Open" });
    expect(card.getAttribute("type")).toBe("button");
    await user.click(card);
    expect(onClick).toHaveBeenCalled();
  });
});

describe("ListGroup / ListRow", () => {
  it("renders a list and makes clickable rows buttons", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ListGroup header="Settings">
        <ListRow title="Sound" subtitle="Grand piano" accessory="chevron" onClick={onClick} />
        <ListRow title="Version" accessory="1.0" />
      </ListGroup>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /Sound/ }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Version/ })).toBeNull();
  });

  it("keeps an interactive accessory operable without nesting buttons", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ListGroup>
        <ListRow title="Advanced" accessory={<Toggle hideLabel label="Advanced" onChange={onChange} />} />
      </ListGroup>,
    );
    await user.click(screen.getByRole("switch", { name: "Advanced" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Chip / Badge", () => {
  it("renders chips and caps badge counts", () => {
    render(
      <>
        <Chip tone="tint">Up next</Chip>
        <Badge count={120} />
        <Badge count={0} />
      </>,
    );
    expect(screen.getByText("Up next").className).toContain("ks-chip--tint");
    expect(screen.getByText("99+")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("ProgressRing", () => {
  it("exposes progressbar semantics and clamps the value", () => {
    render(<ProgressRing value={1.5} label="10" sublabel="of 10" aria-label="10 of 10 minutes" />);
    const ring = screen.getByRole("progressbar", { name: "10 of 10 minutes" });
    expect(ring.getAttribute("aria-valuenow")).toBe("100");
  });
});

describe("TabBar", () => {
  it("is a nav landmark and marks the current page", () => {
    render(
      <MemoryRouter initialEntries={["/learn"]}>
        <TabBar
          aria-label="Main"
          items={[
            { to: "/", label: "Today", icon: null, end: true },
            { to: "/learn", label: "Learn", icon: null },
            { to: "/progress", label: "Progress", icon: null, badge: 2 },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Learn" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: /Progress/ })).toBeTruthy();
  });
});

describe("Toolbar", () => {
  const items = [
    <Button key="a">Alpha</Button>,
    <Button key="b">Beta</Button>,
    <Button key="c">Gamma</Button>,
    <Button key="d">Delta</Button>,
  ];

  it("shows every control inline at regular density", () => {
    render(<Toolbar aria-label="Playback">{items}</Toolbar>);
    expect(screen.getByRole("toolbar", { name: "Playback" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
  });

  it("collapses overflow into a More menu at compact density", async () => {
    const user = userEvent.setup();
    render(
      <DensityScope density="compact">
        <Toolbar aria-label="Playback">{items}</Toolbar>
      </DensityScope>,
    );
    expect(screen.queryByRole("button", { name: "Gamma" })).toBeNull();
    const more = screen.getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    await user.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Gamma" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delta" })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Gamma" })).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it("moves between controls with the arrow keys", async () => {
    const user = userEvent.setup();
    render(<Toolbar aria-label="Playback">{items}</Toolbar>);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Alpha" }));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Beta" }));
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delta" }));
  });
});

describe("Toast", () => {
  it("announces politely, and errors as alerts", () => {
    render(
      <>
        <Toast title="Saved" onDismiss={() => undefined} />
        <Toast tone="error" title="Failed" onDismiss={() => undefined} />
      </>,
    );
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("hides itself after 4 seconds", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast title="+45 points" onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses while hovered or focused", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast title="Hold on" onDismiss={onDismiss} />);
    const toast = screen.getByRole("status");
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses from the close button and runs actions", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(<Toast title="Oops" action={{ label: "Retry", onClick: onAction }} onDismiss={onDismiss} duration={0} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it("dismisses on a long swipe", () => {
    const onDismiss = vi.fn();
    render(<Toast title="Swipe me" onDismiss={onDismiss} duration={0} />);
    const toast = screen.getByRole("status");
    fireEvent.pointerDown(toast, { clientX: 10 });
    fireEvent.pointerMove(toast, { clientX: 120 });
    fireEvent.pointerUp(toast);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stacks through the provider", async () => {
    const user = userEvent.setup();
    function Host() {
      const toast = useToast();
      return <button onClick={() => toast.show({ title: "Hello", duration: 0 })}>Show</button>;
    }
    render(
      <ToastProvider>
        <Host />
      </ToastProvider>,
    );
    await user.click(screen.getByText("Show"));
    expect(screen.getByText("Hello")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("Hello")).toBeNull();
  });
});

describe("InfoTip / glossary / Advanced", () => {
  it("shows its text on press and hides it on Escape", async () => {
    const user = userEvent.setup();
    render(<InfoTip>Beats per minute.</InfoTip>);
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(screen.getByRole("button", { name: "More information" }));
    expect(screen.getByRole("tooltip").textContent).toBe("Beats per minute.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders nothing for a term the glossary does not have yet", () => {
    const { container } = render(<InfoTip term="nope" />);
    expect(container.textContent).toBe("");
    expect(getGlossaryEntry("nope")).toBeUndefined();
  });

  it("hides advanced children in Simple mode and shows the fallback", () => {
    const { rerender } = render(
      <Advanced mode="simple" fallback={<span>More options</span>}>
        <span>Loop detail</span>
      </Advanced>,
    );
    expect(screen.queryByText("Loop detail")).toBeNull();
    expect(screen.getByText("More options")).toBeTruthy();
    rerender(
      <Advanced mode="advanced" fallback={<span>More options</span>}>
        <span>Loop detail</span>
      </Advanced>,
    );
    expect(screen.getByText("Loop detail")).toBeTruthy();
  });
});

describe("GlassSurface", () => {
  it("applies the glass class and the on-dark marker", () => {
    render(
      <>
        <GlassSurface data-testid="regular">a</GlassSurface>
        <GlassSurface variant="clear-dark" data-testid="dark">
          b
        </GlassSurface>
      </>,
    );
    expect(screen.getByTestId("regular").className).toContain("glass");
    expect(screen.getByTestId("regular").getAttribute("data-glass")).toBeNull();
    expect(screen.getByTestId("dark").getAttribute("data-glass")).toBe("on-dark");
  });

  it("counts mounted layers, skips nested ones, and warns past the budget", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const before = getMountedGlassLayers();
    const { unmount } = render(
      <>
        <GlassSurface>1</GlassSurface>
        <GlassSurface>2</GlassSurface>
        <GlassSurface>3</GlassSurface>
        <GlassSurface nested>nested</GlassSurface>
      </>,
    );
    expect(getMountedGlassLayers()).toBe(before + 3);
    expect(warn).not.toHaveBeenCalled();
    const extra = render(<GlassSurface>4</GlassSurface>);
    expect(warn).toHaveBeenCalledTimes(1);
    extra.unmount();
    unmount();
    expect(getMountedGlassLayers()).toBe(before);
    warn.mockRestore();
  });
});
