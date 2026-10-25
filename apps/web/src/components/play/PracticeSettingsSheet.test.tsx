// @vitest-environment jsdom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KeyboardSizing } from "../piano/useKeyboardSizing";
import PracticeSettingsSheet, { type SettingsTab } from "./PracticeSettingsSheet";
import { DEFAULT_SETTINGS, type Settings } from "./practiceSettings";

vi.mock("../midi/MidiStatusBar", () => ({ default: () => <p>Keyboard status</p> }));
vi.mock("../piano/VirtualPiano", () => ({ KeyboardSizingControls: () => <p>Key size</p> }));
vi.mock("./FxLookSettings", () => ({ default: () => <p>FX presets</p> }));

function Harness({ initial = DEFAULT_SETTINGS }: { initial?: Settings }) {
  const [settings, setSettings] = useState<Settings>(initial);
  const [tab, setTab] = useState<SettingsTab>("play");
  return (
    <PracticeSettingsSheet
      open
      onClose={() => undefined}
      onReset={() => undefined}
      settings={settings}
      setSettings={setSettings}
      level="full"
      onLevel={() => undefined}
      hands="both"
      practiceLocked={false}
      settingsLocked={false}
      authoredLevel={false}
      steadyBpm={120}
      clickSafe
      barCount={16}
      loopOn
      onLoopOn={() => undefined}
      loopRange={{ startBar: 0, endBar: 3 }}
      onLoopRange={() => undefined}
      sizing={{} as KeyboardSizing}
      notationFits
      tab={tab}
      onTab={setTab}
    />
  );
}

const openTab = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));

describe("PracticeSettingsSheet", () => {
  it("has no folded-away options: every setting is one tab away", async () => {
    render(<Harness initial={{ ...DEFAULT_SETTINGS, metronome: true, notesStyle: "fx" }} />);
    expect(screen.queryByText("More options")).toBeNull();

    const expected: Record<string, string[]> = {
      Play: ["Version", "Speed", "Wait for me", "Play the other hand for me", "Keyboard status"],
      Loop: ["Loop a few bars", "Repeat until I get it right", "Speed up when I get it right", "Speed-up starts at", "Right means at least"],
      Look: ["Show", "Notes style", "Key highlight", "Note names on the keys", "How far ahead you see", "Seeing further makes", "Key size"],
      Sound: ["Only my notes", "Play my part along with me", "Play the left-out notes quietly", "Sound my key presses", "Metronome", "Click"],
    };
    for (const [tab, titles] of Object.entries(expected)) {
      openTab(tab);
      for (const title of titles) expect(screen.getAllByText(title).length, `${tab}: ${title}`).toBeGreaterThan(0);
    }
    openTab("Look");
    expect(await screen.findByText("FX presets")).toBeTruthy();
  });

  it("offers falling notes, sheet music or both directly", () => {
    render(<Harness />);
    openTab("Look");
    const show = screen.getByRole("radiogroup", { name: /Show/ });
    for (const name of ["Notes", "Sheet", "Both"]) expect(show.querySelector(`[title="${name}"]`)).not.toBeNull();
  });

  it("shows the key highlight choices on the Look tab, whatever the notes style", () => {
    render(<Harness />);
    openTab("Look");
    const group = screen.getByRole("radiogroup", { name: /Key highlight/ });
    for (const name of ["Match look", "Glow", "Flat", "Off"]) expect(group.querySelector(`[title="${name}"]`)).not.toBeNull();
    fireEvent.click(group.querySelector('[title="Glow"]') as HTMLElement);
    expect(screen.getByRole("radiogroup", { name: /Key highlight/ }).querySelector('[aria-checked="true"]')?.getAttribute("title")).toBe("Glow");
  });
});
